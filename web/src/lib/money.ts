/** Convierte "12.50" o "12,5" a centavos. Devuelve null si es inválido o <= 0. */
export function parseAmountToCents(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(
    cents / 100,
  );
}
