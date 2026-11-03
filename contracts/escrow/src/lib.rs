//! Roomy escrow: garantías (depósitos) de inquilinos por casa, en NEAR.
//!
//! Flujo:
//!   1. El hospedante crea la casa:        create_house(house_id)
//!   2. Cada inquilino deposita:           deposit(house_id)          (payable)
//!   3. Al salir, el hospedante libera:    release(house_id, tenant)  -> devuelve todo
//!      o retiene por daños:               slash(house_id, tenant, amount)
//!                                         -> amount al hospedante, resto al inquilino
//!
//! Limitación conocida (MVP): el hospedante decide unilateralmente. Un siguiente
//! paso es exigir aprobación de los inquilinos (votación) antes de un slash.

use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
};

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Hosts,
    Deposits,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Escrow {
    /// house_id -> hospedante
    hosts: LookupMap<String, AccountId>,
    /// "house_id|tenant" -> yoctoNEAR depositados
    deposits: LookupMap<String, u128>,
}

fn key(house_id: &str, tenant: &AccountId) -> String {
    format!("{house_id}|{tenant}")
}

#[near]
impl Escrow {
    #[init]
    pub fn new() -> Self {
        Self {
            hosts: LookupMap::new(StorageKey::Hosts),
            deposits: LookupMap::new(StorageKey::Deposits),
        }
    }

    /// Registra al llamador como hospedante de `house_id`.
    pub fn create_house(&mut self, house_id: String) {
        require!(!house_id.is_empty() && !house_id.contains('|'), "house_id inválido");
        require!(!self.hosts.contains_key(&house_id), "La casa ya existe");
        self.hosts.insert(house_id, env::predecessor_account_id());
    }

    /// El inquilino deposita su garantía adjuntando NEAR. Se acumula si deposita de nuevo.
    #[payable]
    pub fn deposit(&mut self, house_id: String) {
        require!(self.hosts.contains_key(&house_id), "La casa no existe");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Adjuntá un depósito mayor a 0");
        let k = key(&house_id, &env::predecessor_account_id());
        let current = self.deposits.get(&k).copied().unwrap_or(0);
        self.deposits.insert(k, current + amount);
    }

    /// Solo el hospedante. Devuelve toda la garantía al inquilino.
    pub fn release(&mut self, house_id: String, tenant: AccountId) -> Promise {
        self.assert_host(&house_id);
        let amount = self.take(&house_id, &tenant);
        Promise::new(tenant).transfer(NearToken::from_yoctonear(amount))
    }

    /// Solo el hospedante. Retiene `amount` (yoctoNEAR) para sí y devuelve el resto.
    pub fn slash(&mut self, house_id: String, tenant: AccountId, amount: near_sdk::json_types::U128) -> Promise {
        self.assert_host(&house_id);
        let total = self.take(&house_id, &tenant);
        let slash = amount.0;
        require!(slash <= total, "El monto retenido excede la garantía");
        let host = env::predecessor_account_id();
        let mut p = Promise::new(host).transfer(NearToken::from_yoctonear(slash));
        if total > slash {
            p = p.then(Promise::new(tenant).transfer(NearToken::from_yoctonear(total - slash)));
        }
        p
    }

    // ---- views ----

    pub fn get_deposit(&self, house_id: String, tenant: AccountId) -> near_sdk::json_types::U128 {
        near_sdk::json_types::U128(self.deposits.get(&key(&house_id, &tenant)).copied().unwrap_or(0))
    }

    pub fn get_host(&self, house_id: String) -> Option<AccountId> {
        self.hosts.get(&house_id).cloned()
    }

    // ---- internos ----

    fn assert_host(&self, house_id: &str) {
        let host = self.hosts.get(&house_id.to_string()).expect("La casa no existe");
        require!(&env::predecessor_account_id() == host, "Solo el hospedante");
    }

    /// Quita el depósito del mapa (evita doble gasto) y devuelve el monto.
    fn take(&mut self, house_id: &str, tenant: &AccountId) -> u128 {
        let k = key(house_id, tenant);
        let amount = self.deposits.get(&k).copied().unwrap_or(0);
        require!(amount > 0, "El inquilino no tiene garantía depositada");
        self.deposits.remove(&k);
        amount
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn ctx(caller: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(acc(caller))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build());
    }

    fn setup() -> Escrow {
        ctx("host.near", 0);
        let mut c = Escrow::new();
        c.create_house("casa1".into());
        c
    }

    #[test]
    fn deposit_acumula() {
        let mut c = setup();
        ctx("ana.near", 5);
        c.deposit("casa1".into());
        ctx("ana.near", 3);
        c.deposit("casa1".into());
        assert_eq!(c.get_deposit("casa1".into(), acc("ana.near")).0, 8);
    }

    #[test]
    fn release_devuelve_todo() {
        let mut c = setup();
        ctx("ana.near", 10);
        c.deposit("casa1".into());
        ctx("host.near", 0);
        let _ = c.release("casa1".into(), acc("ana.near"));
        assert_eq!(c.get_deposit("casa1".into(), acc("ana.near")).0, 0);
    }

    #[test]
    fn slash_parcial() {
        let mut c = setup();
        ctx("ana.near", 10);
        c.deposit("casa1".into());
        ctx("host.near", 0);
        let _ = c.slash("casa1".into(), acc("ana.near"), 4.into());
        assert_eq!(c.get_deposit("casa1".into(), acc("ana.near")).0, 0);
    }

    #[test]
    #[should_panic(expected = "Solo el hospedante")]
    fn solo_host_libera() {
        let mut c = setup();
        ctx("ana.near", 10);
        c.deposit("casa1".into());
        let _ = c.release("casa1".into(), acc("ana.near"));
    }

    #[test]
    #[should_panic(expected = "excede la garantía")]
    fn slash_no_excede() {
        let mut c = setup();
        ctx("ana.near", 10);
        c.deposit("casa1".into());
        ctx("host.near", 0);
        let _ = c.slash("casa1".into(), acc("ana.near"), 11.into());
    }

    #[test]
    #[should_panic(expected = "no tiene garantía")]
    fn no_doble_release() {
        let mut c = setup();
        ctx("ana.near", 10);
        c.deposit("casa1".into());
        ctx("host.near", 0);
        let _ = c.release("casa1".into(), acc("ana.near"));
        let _ = c.release("casa1".into(), acc("ana.near"));
    }

    #[test]
    #[should_panic(expected = "La casa no existe")]
    fn deposit_en_casa_inexistente() {
        let mut c = setup();
        ctx("ana.near", 10);
        c.deposit("otra".into());
    }
}
