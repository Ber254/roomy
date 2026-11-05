//! Roomy escrow: garantías de alquiler en NEAR.
//!
//! Modelo tomado de Safexy (Stellar/Soroban), reescrito para NEAR durante el hackathon.
//! El dinero es NEAR nativo (yoctoNEAR). Los roles pertenecen a cada garantía:
//! el *garante* (inquilino) la fondea y el *arrendador* (hospedante) es el beneficiario.
//!
//! Estados:  Pending -> Active -> Closed      (Active sigue Active mientras locked > 0)
//!           Pending -> Cancelled
//!
//! Salida de fondos (no hay retiro unilateral del garante):
//!   - una parte propone un reparto (`propose_settlement`) y la OTRA lo acepta;
//!   - `execute_settlement` paga el acuerdo congelado (lo puede llamar cualquiera);
//!   - el arrendador puede devolver al garante sin negociar (`return_to_guarantor`).
//! Un reparto puede sumar menos que `locked`: el resto sigue bloqueado (devoluciones parciales).
//! El fee (bps, tope 5%) se cobra solo sobre lo que vuelve al garante, redondeado hacia arriba.
//!
//! Limitación conocida: si una cuenta destino no existe, la transferencia falla y esos
//! fondos quedan en el contrato sin saldo asignado. Mitigación futura: callback con reintento.

use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
};

pub const MAX_FEE_BPS: u16 = 500; // 5%
const BPS_DENOM: u128 = 10_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Guarantees,
    Settlements,
    Agreements,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Pending,
    Active,
    Closed,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Guarantee {
    pub guarantor: AccountId,
    pub landlord: AccountId,
    /// monto acordado a depositar
    pub amount: U128,
    /// saldo aún bloqueado en el contrato
    pub locked: U128,
    /// total depositado alguna vez
    pub funded: U128,
    /// fin del período (ns desde epoch); informativo
    pub end_date_ns: Option<u64>,
    pub status: Status,
}

/// Propuesta abierta de reparto del saldo bloqueado.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Settlement {
    pub proposer: AccountId,
    pub to_guarantor: U128,
    pub to_landlord: U128,
}

/// Reparto aceptado por ambas partes (congelado, listo para ejecutar).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Agreement {
    pub to_guarantor: U128,
    pub to_landlord: U128,
}

#[near(serializers = [json])]
pub struct Config {
    pub admin: AccountId,
    pub treasury: AccountId,
    pub fee_bps: u16,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Escrow {
    admin: AccountId,
    treasury: AccountId,
    fee_bps: u16,
    guarantees: LookupMap<String, Guarantee>,
    settlements: LookupMap<String, Settlement>,
    agreements: LookupMap<String, Agreement>,
}

/// Fee redondeado hacia arriba: ceil(amount * bps / 10_000).
pub fn fee_for(amount: u128, bps: u16) -> u128 {
    let num = amount
        .checked_mul(bps as u128)
        .expect("overflow calculando el fee");
    num / BPS_DENOM + u128::from(num % BPS_DENOM != 0)
}

#[near]
impl Escrow {
    #[init]
    pub fn new(admin: AccountId, treasury: AccountId, fee_bps: u16) -> Self {
        require!(fee_bps <= MAX_FEE_BPS, "Fee mayor al 5%");
        Self {
            admin,
            treasury,
            fee_bps,
            guarantees: LookupMap::new(StorageKey::Guarantees),
            settlements: LookupMap::new(StorageKey::Settlements),
            agreements: LookupMap::new(StorageKey::Agreements),
        }
    }

    // ---------- ciclo de vida ----------

    /// El garante registra la garantía. Queda `Pending` hasta que la fondea.
    pub fn create_guarantee(
        &mut self,
        id: String,
        landlord: AccountId,
        amount: U128,
        end_date_ns: Option<u64>,
    ) {
        require!(!id.is_empty() && id.len() <= 128, "id inválido");
        require!(!self.guarantees.contains_key(&id), "La garantía ya existe");
        require!(amount.0 > 0, "El monto debe ser mayor a 0");
        let guarantor = env::predecessor_account_id();
        require!(guarantor != landlord, "Garante y arrendador no pueden ser la misma cuenta");
        self.guarantees.insert(
            id,
            Guarantee {
                guarantor,
                landlord,
                amount,
                locked: U128(0),
                funded: U128(0),
                end_date_ns,
                status: Status::Pending,
            },
        );
    }

    /// Solo el garante, adjuntando exactamente `amount`. Pasa a `Active`.
    #[payable]
    pub fn fund_guarantee(&mut self, id: String) {
        let mut g = self.must_get(&id);
        require!(env::predecessor_account_id() == g.guarantor, "Solo el garante puede fondear");
        require!(g.status == Status::Pending, "Solo se fondea una garantía Pending");
        require!(
            env::attached_deposit().as_yoctonear() == g.amount.0,
            "El depósito adjunto debe ser exactamente el monto de la garantía"
        );
        g.locked = g.amount;
        g.funded = g.amount;
        g.status = Status::Active;
        self.guarantees.insert(id, g);
    }

    /// Cualquiera de las partes, solo mientras está `Pending`.
    pub fn cancel_guarantee(&mut self, id: String) {
        let mut g = self.must_get(&id);
        self.assert_party(&g);
        require!(g.status == Status::Pending, "Solo se cancela una garantía Pending");
        g.status = Status::Cancelled;
        self.guarantees.insert(id, g);
    }

    // ---------- negociación ----------

    /// Una parte propone cuánto va a cada lado. Reemplaza la propuesta abierta (contraoferta).
    pub fn propose_settlement(&mut self, id: String, to_guarantor: U128, to_landlord: U128) {
        let g = self.must_get(&id);
        self.assert_party(&g);
        self.assert_active(&g);
        require!(!self.agreements.contains_key(&id), "Ya hay un acuerdo pendiente de ejecución");
        Self::assert_fits(&g, to_guarantor.0, to_landlord.0);
        self.settlements.insert(
            id,
            Settlement { proposer: env::predecessor_account_id(), to_guarantor, to_landlord },
        );
    }

    /// Solo la OTRA parte puede aceptar. Congela el acuerdo.
    pub fn accept_settlement(&mut self, id: String) {
        let g = self.must_get(&id);
        self.assert_party(&g);
        self.assert_active(&g);
        let s = self.settlements.get(&id).cloned().expect("No hay propuesta abierta");
        require!(
            env::predecessor_account_id() != s.proposer,
            "No podés aceptar tu propia propuesta"
        );
        Self::assert_fits(&g, s.to_guarantor.0, s.to_landlord.0);
        self.settlements.remove(&id);
        self.agreements
            .insert(id, Agreement { to_guarantor: s.to_guarantor, to_landlord: s.to_landlord });
    }

    pub fn reject_settlement(&mut self, id: String) {
        let g = self.must_get(&id);
        self.assert_party(&g);
        require!(self.settlements.contains_key(&id), "No hay propuesta abierta");
        self.settlements.remove(&id);
    }

    /// Sin firma a propósito: ambas partes ya autorizaron los montos exactos.
    pub fn execute_settlement(&mut self, id: String) {
        let mut g = self.must_get(&id);
        self.assert_active(&g);
        let a = self.agreements.get(&id).cloned().expect("No hay acuerdo para ejecutar");
        Self::assert_fits(&g, a.to_guarantor.0, a.to_landlord.0);
        // Estado primero, transferencias después: la doble ejecución es imposible.
        self.agreements.remove(&id);
        let total = a.to_guarantor.0 + a.to_landlord.0;
        g.locked = U128(g.locked.0 - total);
        if g.locked.0 == 0 {
            g.status = Status::Closed;
        }
        let (guarantor, landlord) = (g.guarantor.clone(), g.landlord.clone());
        self.guarantees.insert(id, g);
        self.pay_out(guarantor, a.to_guarantor.0, landlord, a.to_landlord.0)
    }

    /// Solo el arrendador: devuelve al garante sin negociar (solo puede beneficiar al garante).
    pub fn return_to_guarantor(&mut self, id: String, amount: U128) {
        let mut g = self.must_get(&id);
        require!(env::predecessor_account_id() == g.landlord, "Solo el arrendador");
        self.assert_active(&g);
        require!(amount.0 > 0, "El monto debe ser mayor a 0");
        require!(amount.0 <= g.locked.0, "El monto excede el saldo bloqueado");
        // una devolución unilateral invalida cualquier propuesta abierta
        self.settlements.remove(&id);
        g.locked = U128(g.locked.0 - amount.0);
        if g.locked.0 == 0 {
            g.status = Status::Closed;
            self.agreements.remove(&id);
        }
        let (guarantor, landlord) = (g.guarantor.clone(), g.landlord.clone());
        self.guarantees.insert(id.clone(), g);
        self.pay_out(guarantor, amount.0, landlord, 0)
    }

    // ---------- administración ----------

    pub fn set_treasury(&mut self, treasury: AccountId) {
        self.assert_admin();
        self.treasury = treasury;
    }

    pub fn set_fee_bps(&mut self, fee_bps: u16) {
        self.assert_admin();
        require!(fee_bps <= MAX_FEE_BPS, "Fee mayor al 5%");
        self.fee_bps = fee_bps;
    }

    // ---------- vistas ----------

    pub fn get_guarantee(&self, id: String) -> Option<Guarantee> {
        self.guarantees.get(&id).cloned()
    }
    pub fn get_settlement(&self, id: String) -> Option<Settlement> {
        self.settlements.get(&id).cloned()
    }
    pub fn get_agreement(&self, id: String) -> Option<Agreement> {
        self.agreements.get(&id).cloned()
    }
    pub fn get_config(&self) -> Config {
        Config { admin: self.admin.clone(), treasury: self.treasury.clone(), fee_bps: self.fee_bps }
    }
    pub fn quote_fee(&self, amount: U128) -> U128 {
        U128(fee_for(amount.0, self.fee_bps))
    }

    // ---------- internos ----------

    fn must_get(&self, id: &str) -> Guarantee {
        self.guarantees.get(&id.to_string()).cloned().expect("La garantía no existe")
    }

    fn assert_party(&self, g: &Guarantee) {
        let c = env::predecessor_account_id();
        require!(c == g.guarantor || c == g.landlord, "Solo las partes de la garantía");
    }

    fn assert_active(&self, g: &Guarantee) {
        require!(g.status == Status::Active, "La garantía no está Active");
    }

    fn assert_admin(&self) {
        require!(env::predecessor_account_id() == self.admin, "Solo el admin");
    }

    fn assert_fits(g: &Guarantee, to_guarantor: u128, to_landlord: u128) {
        let total = to_guarantor
            .checked_add(to_landlord)
            .unwrap_or_else(|| env::panic_str("overflow en el reparto"));
        require!(total > 0, "El reparto debe mover algún monto");
        require!(total <= g.locked.0, "El reparto excede el saldo bloqueado");
    }

    /// Paga al garante (neto de fee) y al arrendador; el fee va al treasury.
    /// Son transferencias independientes: el runtime de NEAR prohíbe devolver una promesa unida (`.and`),
    /// así que ninguna se devuelve. Al soltarse cada `Promise` queda programada.
    fn pay_out(&self, guarantor: AccountId, to_guarantor: u128, landlord: AccountId, to_landlord: u128) {
        let fee = fee_for(to_guarantor, self.fee_bps).min(to_guarantor);
        let net = to_guarantor - fee;
        for (acc, amt) in [(guarantor, net), (landlord, to_landlord), (self.treasury.clone(), fee)] {
            if amt > 0 {
                Promise::new(acc).transfer(NearToken::from_yoctonear(amt)).detach();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::testing_env;

    const ONE: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR
    const ID: &str = "casa1:ana";

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }
    fn ctx(caller: &str, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(acc(caller))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build());
    }

    /// Contrato con fee de 5 bps y una garantía de 10 NEAR fondeada (ana -> host).
    fn active() -> Escrow {
        ctx("admin.near", 0);
        let mut c = Escrow::new(acc("admin.near"), acc("treasury.near"), 5);
        ctx("ana.near", 0);
        c.create_guarantee(ID.into(), acc("host.near"), U128(10 * ONE), None);
        ctx("ana.near", 10 * ONE);
        c.fund_guarantee(ID.into());
        c
    }

    /// Suma lo transferido a cada receptor en el último llamado.
    fn paid(to: &str) -> u128 {
        get_created_receipts()
            .iter()
            .filter(|r| r.receiver_id.as_str() == to)
            .flat_map(|r| r.actions.iter())
            .map(|a| match a {
                near_sdk::mock::MockAction::Transfer { deposit, .. } => deposit.as_yoctonear(),
                _ => 0,
            })
            .sum()
    }

    fn locked(c: &Escrow) -> u128 {
        c.get_guarantee(ID.into()).unwrap().locked.0
    }

    #[test]
    fn crea_y_fondea() {
        let c = active();
        let g = c.get_guarantee(ID.into()).unwrap();
        assert_eq!(g.status, Status::Active);
        assert_eq!(g.locked.0, 10 * ONE);
        assert_eq!(g.funded.0, 10 * ONE);
    }

    #[test]
    #[should_panic(expected = "ya existe")]
    fn no_duplica_ids() {
        let mut c = active();
        ctx("ana.near", 0);
        c.create_guarantee(ID.into(), acc("host.near"), U128(ONE), None);
    }

    #[test]
    #[should_panic(expected = "misma cuenta")]
    fn no_auto_trato() {
        ctx("admin.near", 0);
        let mut c = Escrow::new(acc("admin.near"), acc("t.near"), 5);
        ctx("ana.near", 0);
        c.create_guarantee("x".into(), acc("ana.near"), U128(ONE), None);
    }

    #[test]
    #[should_panic(expected = "Solo el garante puede fondear")]
    fn solo_el_garante_fondea() {
        ctx("admin.near", 0);
        let mut c = Escrow::new(acc("admin.near"), acc("t.near"), 5);
        ctx("ana.near", 0);
        c.create_guarantee(ID.into(), acc("host.near"), U128(ONE), None);
        ctx("host.near", ONE);
        c.fund_guarantee(ID.into());
    }

    #[test]
    #[should_panic(expected = "exactamente")]
    fn deposito_exacto() {
        ctx("admin.near", 0);
        let mut c = Escrow::new(acc("admin.near"), acc("t.near"), 5);
        ctx("ana.near", 0);
        c.create_guarantee(ID.into(), acc("host.near"), U128(ONE), None);
        ctx("ana.near", ONE - 1);
        c.fund_guarantee(ID.into());
    }

    #[test]
    #[should_panic(expected = "Pending")]
    fn no_se_fondea_dos_veces() {
        let mut c = active();
        ctx("ana.near", 10 * ONE);
        c.fund_guarantee(ID.into());
    }

    #[test]
    fn cancela_solo_si_pending() {
        ctx("admin.near", 0);
        let mut c = Escrow::new(acc("admin.near"), acc("t.near"), 5);
        ctx("ana.near", 0);
        c.create_guarantee(ID.into(), acc("host.near"), U128(ONE), None);
        c.cancel_guarantee(ID.into());
        assert_eq!(c.get_guarantee(ID.into()).unwrap().status, Status::Cancelled);
    }

    #[test]
    #[should_panic(expected = "Pending")]
    fn fondeada_no_se_cancela() {
        let mut c = active();
        ctx("host.near", 0);
        c.cancel_guarantee(ID.into());
    }

    #[test]
    #[should_panic(expected = "Solo las partes")]
    fn ajenos_no_actuan() {
        let mut c = active();
        ctx("eve.near", 0);
        c.propose_settlement(ID.into(), U128(ONE), U128(0));
    }

    #[test]
    fn devolucion_total_acordada_cobra_fee_al_garante() {
        let mut c = active();
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(10 * ONE), U128(0));
        ctx("host.near", 0);
        c.accept_settlement(ID.into());
        ctx("eve.near", 0); // cualquiera ejecuta
        let _ = c.execute_settlement(ID.into());
        let fee = fee_for(10 * ONE, 5);
        assert_eq!(fee, 5 * ONE / 1000); // 0.05%
        assert_eq!(paid("ana.near"), 10 * ONE - fee);
        assert_eq!(paid("treasury.near"), fee);
        assert_eq!(paid("host.near"), 0);
        let g = c.get_guarantee(ID.into()).unwrap();
        assert_eq!(g.status, Status::Closed);
        assert_eq!(g.locked.0, 0);
    }

    #[test]
    fn reparto_dividido_cobra_fee_solo_sobre_lo_devuelto() {
        let mut c = active();
        ctx("host.near", 0);
        c.propose_settlement(ID.into(), U128(7 * ONE), U128(3 * ONE));
        ctx("ana.near", 0);
        c.accept_settlement(ID.into());
        let _ = c.execute_settlement(ID.into());
        let fee = fee_for(7 * ONE, 5);
        assert_eq!(paid("host.near"), 3 * ONE); // sin fee
        assert_eq!(paid("ana.near"), 7 * ONE - fee);
        assert_eq!(paid("treasury.near"), fee);
    }

    #[test]
    fn devoluciones_parciales_sucesivas() {
        let mut c = active();
        for part in [3 * ONE, 2 * ONE] {
            ctx("ana.near", 0);
            c.propose_settlement(ID.into(), U128(part), U128(0));
            ctx("host.near", 0);
            c.accept_settlement(ID.into());
            let _ = c.execute_settlement(ID.into());
        }
        assert_eq!(locked(&c), 5 * ONE);
        assert_eq!(c.get_guarantee(ID.into()).unwrap().status, Status::Active);
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(5 * ONE), U128(0));
        ctx("host.near", 0);
        c.accept_settlement(ID.into());
        let _ = c.execute_settlement(ID.into());
        assert_eq!(c.get_guarantee(ID.into()).unwrap().status, Status::Closed);
    }

    #[test]
    #[should_panic(expected = "propia propuesta")]
    fn no_se_acepta_la_propia_propuesta() {
        let mut c = active();
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(ONE), U128(0));
        c.accept_settlement(ID.into());
    }

    #[test]
    fn contraoferta_reemplaza_y_rechazo_limpia() {
        let mut c = active();
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(9 * ONE), U128(ONE));
        ctx("host.near", 0);
        c.propose_settlement(ID.into(), U128(6 * ONE), U128(4 * ONE));
        let s = c.get_settlement(ID.into()).unwrap();
        assert_eq!(s.proposer, acc("host.near"));
        assert_eq!(s.to_landlord.0, 4 * ONE);
        ctx("ana.near", 0);
        c.reject_settlement(ID.into());
        assert!(c.get_settlement(ID.into()).is_none());
    }

    #[test]
    #[should_panic(expected = "excede el saldo bloqueado")]
    fn reparto_no_excede_lo_bloqueado() {
        let mut c = active();
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(8 * ONE), U128(3 * ONE));
    }

    #[test]
    #[should_panic(expected = "No hay acuerdo")]
    fn sin_acuerdo_no_se_paga() {
        let mut c = active();
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(ONE), U128(0)); // solo propuesta
        let _ = c.execute_settlement(ID.into());
    }

    #[test]
    #[should_panic(expected = "No hay acuerdo")]
    fn no_hay_doble_ejecucion() {
        let mut c = active();
        ctx("ana.near", 0);
        c.propose_settlement(ID.into(), U128(ONE), U128(0));
        ctx("host.near", 0);
        c.accept_settlement(ID.into());
        let _ = c.execute_settlement(ID.into());
        let _ = c.execute_settlement(ID.into());
    }

    #[test]
    fn arrendador_devuelve_sin_negociar() {
        let mut c = active();
        ctx("host.near", 0);
        let _ = c.return_to_guarantor(ID.into(), U128(4 * ONE));
        assert_eq!(locked(&c), 6 * ONE);
        assert_eq!(paid("ana.near"), 4 * ONE - fee_for(4 * ONE, 5));
    }

    #[test]
    #[should_panic(expected = "Solo el arrendador")]
    fn garante_no_se_devuelve_solo() {
        let mut c = active();
        ctx("ana.near", 0);
        let _ = c.return_to_guarantor(ID.into(), U128(ONE));
    }

    #[test]
    #[should_panic(expected = "excede el saldo bloqueado")]
    fn devolucion_no_excede() {
        let mut c = active();
        ctx("host.near", 0);
        let _ = c.return_to_guarantor(ID.into(), U128(11 * ONE));
    }

    #[test]
    fn el_fee_se_redondea_hacia_arriba() {
        assert_eq!(fee_for(1, 5), 1); // 0.0005 -> 1
        assert_eq!(fee_for(10_000, 5), 5);
        assert_eq!(fee_for(10_001, 5), 6);
        assert_eq!(fee_for(0, 5), 0);
    }

    #[test]
    fn fee_solo_lo_cambia_el_admin_y_con_tope() {
        let mut c = active();
        ctx("admin.near", 0);
        c.set_fee_bps(500);
        assert_eq!(c.get_config().fee_bps, 500);
        c.set_treasury(acc("nueva.near"));
        assert_eq!(c.get_config().treasury, acc("nueva.near"));
    }

    #[test]
    #[should_panic(expected = "Solo el admin")]
    fn fee_no_lo_cambia_otro() {
        let mut c = active();
        ctx("host.near", 0);
        c.set_fee_bps(1);
    }

    #[test]
    #[should_panic(expected = "mayor al 5%")]
    fn fee_tiene_tope() {
        let mut c = active();
        ctx("admin.near", 0);
        c.set_fee_bps(501);
    }
}
