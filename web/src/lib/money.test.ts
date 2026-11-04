import { describe, expect, it } from "vitest";
import { parseAmountToCents } from "./money";

describe("parseAmountToCents", () => {
  it("acepta punto y coma decimal", () => {
    expect(parseAmountToCents("12.50")).toBe(1250);
    expect(parseAmountToCents("12,5")).toBe(1250);
    expect(parseAmountToCents("900")).toBe(90000);
    expect(parseAmountToCents(" 0.05 ")).toBe(5);
  });
  it("rechaza inválidos, cero y negativos", () => {
    for (const bad of ["", "abc", "0", "0.00", "-5", "1.234", "1e3", "12.", "1,000.50"]) {
      expect(parseAmountToCents(bad)).toBeNull();
    }
  });
});
