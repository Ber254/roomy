import { describe, expect, it } from "vitest";
import { isNearAccount, mapSwapStatus } from "./payments";

describe("mapSwapStatus", () => {
  it("mapea los estados de 1Click", () => {
    expect(mapSwapStatus("SUCCESS")).toBe("settled");
    expect(mapSwapStatus("REFUNDED")).toBe("refunded");
    expect(mapSwapStatus("FAILED")).toBe("failed");
    expect(mapSwapStatus("PROCESSING")).toBe("processing");
    expect(mapSwapStatus("KNOWN_DEPOSIT_TX")).toBe("processing");
    expect(mapSwapStatus("PENDING_DEPOSIT")).toBe("pending");
    expect(mapSwapStatus("INCOMPLETE_DEPOSIT")).toBe("pending");
  });
});

describe("isNearAccount", () => {
  it("acepta cuentas válidas", () => {
    for (const ok of ["hakaroomy.near", "ana.near", "a1-b_2.testnet", "0123456789abcdef".repeat(4)]) {
      expect(isNearAccount(ok)).toBe(true);
    }
  });
  it("rechaza inválidas", () => {
    for (const bad of ["", "a", "Ana.near", "ana..near", ".near", "ana near", "a".repeat(65), "ana@near"]) {
      expect(isNearAccount(bad)).toBe(false);
    }
  });
});
