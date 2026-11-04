import { describe, expect, it } from "vitest";
import { cleanMessage, mergeMessages, MAX_MESSAGE_LENGTH, type ChatMessage } from "./chat";

const m = (id: string, at: string): ChatMessage => ({ id, authorId: "a", body: id, createdAt: at });

describe("mergeMessages", () => {
  it("deduplica y ordena por fecha", () => {
    const out = mergeMessages([m("b", "2026-01-02"), m("a", "2026-01-01")], [m("b", "2026-01-02"), m("c", "2026-01-03")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("no pierde mensajes con la misma fecha", () => {
    expect(mergeMessages([m("x", "t")], [m("y", "t")]).map((x) => x.id)).toEqual(["x", "y"]);
  });
});

describe("cleanMessage", () => {
  it("recorta y valida", () => {
    expect(cleanMessage("  hola  ")).toBe("hola");
    expect(cleanMessage("   ")).toBeNull();
    expect(cleanMessage("x".repeat(MAX_MESSAGE_LENGTH + 1))).toBeNull();
    expect(cleanMessage("x".repeat(MAX_MESSAGE_LENGTH))).not.toBeNull();
    expect(cleanMessage(42)).toBeNull();
  });
});
