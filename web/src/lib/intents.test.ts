import { afterEach, describe, expect, it, vi } from "vitest";
import { makeT } from "@/i18n";
import { centsToUsdcUnits, friendlyQuoteError, getStatus, isFinal, requestQuote, USDC_NEAR } from "./intents";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown, status = 201) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("centsToUsdcUnits", () => {
  it("convierte centavos a unidades base de USDC", () => {
    expect(centsToUsdcUnits(100)).toBe("1000000");
    expect(centsToUsdcUnits(1)).toBe("10000");
    expect(centsToUsdcUnits(9_000_000)).toBe("90000000000");
  });
  it("rechaza valores inválidos", () => {
    expect(() => centsToUsdcUnits(0)).toThrow();
    expect(() => centsToUsdcUnits(1.5)).toThrow();
  });
});

describe("requestQuote", () => {
  it("arma un EXACT_OUTPUT hacia USDC en NEAR", async () => {
    const fetchMock = vi.fn(() => ok({ quote: {}, signature: "s", correlationId: "c" }));
    vi.stubGlobal("fetch", fetchMock);
    await requestQuote({
      dry: true,
      originAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      recipient: "ana.near",
      refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D",
      amountOutCents: 30000,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v0\/quote$/);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      dry: true,
      swapType: "EXACT_OUTPUT",
      destinationAsset: USDC_NEAR,
      amount: "300000000",
      recipient: "ana.near",
      recipientType: "DESTINATION_CHAIN",
      depositType: "ORIGIN_CHAIN",
    });
    expect(new Date(body.deadline).getTime()).toBeGreaterThan(Date.now());
  });

  it("propaga el error de la API con su detalle", async () => {
    vi.stubGlobal("fetch", vi.fn(() => ok({ message: "bad asset" }, 400)));
    await expect(
      requestQuote({ dry: true, originAsset: "x", recipient: "a.near", refundTo: "0x1", amountOutCents: 100 }),
    ).rejects.toThrow(/400.*bad asset/);
  });
});

describe("status", () => {
  it("codifica depositAddress y memo", async () => {
    const fetchMock = vi.fn(() => ok({ status: "PROCESSING", updatedAt: "now" }, 200));
    vi.stubGlobal("fetch", fetchMock);
    await getStatus("0xabc", "123");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toMatch(
      /\/v0\/status\?depositAddress=0xabc&depositMemo=123$/,
    );
  });
  it("identifica estados finales", () => {
    expect(isFinal("SUCCESS")).toBe(true);
    expect(isFinal("REFUNDED")).toBe(true);
    expect(isFinal("PROCESSING")).toBe(false);
  });
});

describe("friendlyQuoteError", () => {
  it("traduce el error genérico de 1Click a algo accionable", () => {
    expect(friendlyQuoteError('1Click /v0/quote -> 400: {"message":"Internal server error"}', makeT("es"))).toMatch(/cuenta NEAR del destinatario/);
    expect(friendlyQuoteError("Amount is too low", makeT("es"))).toMatch(/mínimo/);
    expect(friendlyQuoteError('1Click /v0/quote -> 400: {"message":"refundTo is not valid"}', makeT("es"))).toMatch(/dirección de reembolso/);
    expect(friendlyQuoteError("otro error", makeT("es"))).toBe("otro error");
    expect(friendlyQuoteError("Internal server error", makeT("en"))).toMatch(/recipient's NEAR account/);
  });
});

// Prueba real contra la API (cotización `dry`, no mueve fondos).
// Correr con: INTENTS_LIVE=1 npm test
describe.runIf(process.env.INTENTS_LIVE === "1")("1Click en vivo (dry)", () => {
  it("cotiza USDC de Base -> USDC en NEAR", async () => {
    const q = await requestQuote({
      dry: true,
      originAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
      recipient: "hakaroomy.near",
      refundTo: "0x2527D02599Ba641c19FEa793cD0F167589a0f10D",
      amountOutCents: 100,
    });
    expect(q.quote.amountOut).toBe("1000000");
    expect(Number(q.quote.amountIn)).toBeGreaterThanOrEqual(1_000_000);
    expect(q.quote.depositAddress).toBeUndefined();
  });
});
