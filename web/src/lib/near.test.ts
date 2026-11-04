import { afterEach, describe, expect, it, vi } from "vitest";
import { contractCall, guaranteeId, nearToYocto, transferTx, yoctoToNear } from "./near";
import { viewCall } from "./near-rpc";

describe("nearToYocto / yoctoToNear", () => {
  it("convierte sin perder precisión", () => {
    expect(nearToYocto("1")).toBe("1000000000000000000000000");
    expect(nearToYocto("1.5")).toBe("1500000000000000000000000");
    expect(nearToYocto("0,001")).toBe("1000000000000000000000");
    expect(nearToYocto("0.000000000000000000000001")).toBe("1");
  });
  it("rechaza inválidos, cero y exceso de decimales", () => {
    for (const bad of ["", "abc", "0", "0.0", "-1", "1e3", "1.", "0.0000000000000000000000001"]) {
      expect(nearToYocto(bad)).toBeNull();
    }
  });
  it("ida y vuelta", () => {
    for (const v of ["1", "1.5", "0.05", "123.456789"]) {
      expect(yoctoToNear(nearToYocto(v)!)).toBe(v);
    }
    expect(yoctoToNear("0")).toBe("0");
  });
});

describe("contractCall", () => {
  it("arma una FunctionCall con depósito y gas", () => {
    const tx = contractCall("escrow.near", "fund_guarantee", { id: "x" }, { depositYocto: "5" });
    expect(tx.receiverId).toBe("escrow.near");
    expect(tx.actions[0]).toEqual({
      type: "FunctionCall",
      params: { methodName: "fund_guarantee", args: { id: "x" }, gas: "30000000000000", deposit: "5" },
    });
  });
  it("transferencia simple al fondo", () => {
    expect(transferTx("casa.sputnikv2.testnet", "7")).toEqual({
      receiverId: "casa.sputnikv2.testnet",
      actions: [{ type: "Transfer", params: { deposit: "7" } }],
    });
  });
  it("id de garantía determinista", () => {
    expect(guaranteeId("h", "m")).toBe("h:m");
  });
});

describe("viewCall", () => {
  afterEach(() => vi.unstubAllGlobals());
  const rpc = (body: unknown, status = 200) =>
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

  it("decodifica el resultado y envía args en base64", async () => {
    const payload = Array.from(Buffer.from(JSON.stringify({ status: "Active" })));
    const f = rpc({ result: { result: payload } });
    vi.stubGlobal("fetch", f);
    const out = await viewCall<{ status: string }>("escrow.near", "get_guarantee", { id: "a" });
    expect(out).toEqual({ status: "Active" });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.params).toMatchObject({ account_id: "escrow.near", method_name: "get_guarantee" });
    expect(Buffer.from(sent.params.args_base64, "base64").toString()).toBe('{"id":"a"}');
  });
  it("falla si el contrato no existe o el RPC da error", async () => {
    vi.stubGlobal("fetch", rpc({ error: { cause: { name: "UNKNOWN_ACCOUNT" } } }));
    await expect(viewCall("x.near", "m", {})).rejects.toThrow(/UNKNOWN_ACCOUNT/);
    vi.stubGlobal("fetch", rpc({}, 503));
    await expect(viewCall("x.near", "m", {})).rejects.toThrow(/503/);
  });
});
