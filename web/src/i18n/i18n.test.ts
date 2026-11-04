import { describe, expect, it } from "vitest";
import { DICTS, detectLocale, makeT, translate, intlLocale } from "./index";
import { es } from "./es";
import { en } from "./en";

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("diccionarios", () => {
  it("tienen exactamente las mismas claves", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
  it("ninguna traducción está vacía", () => {
    for (const [l, d] of Object.entries(DICTS)) for (const [k, v] of Object.entries(d)) expect(v.trim(), `${l}:${k}`).not.toBe("");
  });
  it("cada clave usa los mismos {parámetros} en los dos idiomas", () => {
    for (const k of Object.keys(es) as (keyof typeof es)[]) expect(params(en[k]), k).toEqual(params(es[k]));
  });
  it("el título de la landing es el pedido", () => {
    expect(es["landing.title"]).toBe("Compartir un piso sin discutir. ¡Organizate!");
  });
});

describe("translate", () => {
  it("interpola parámetros y deja visible el que falta", () => {
    expect(translate(es, "h.hello", { name: "Ana" })).toBe("Hola, Ana");
    expect(makeT("en")("h.hello", { name: "Ana" })).toBe("Hi, Ana");
    expect(translate(es, "h.hello")).toBe("Hola, {name}");
    expect(translate(es, "h.hello", {})).toBe("Hola, {name}");
  });
});

describe("detectLocale", () => {
  it("prioriza la cookie", () => {
    expect(detectLocale("en", "es-AR,es;q=0.9")).toBe("en");
    expect(detectLocale("es", "en-US")).toBe("es");
  });
  it("sin cookie usa Accept-Language: español -> es, otro idioma -> en", () => {
    expect(detectLocale(undefined, "es-AR,es;q=0.9,en;q=0.8")).toBe("es");
    expect(detectLocale(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(detectLocale(undefined, "pt-BR")).toBe("en");
  });
  it("sin nada (clientes que no son navegadores) usa español; ignora cookies inválidas", () => {
    expect(detectLocale(undefined, null)).toBe("es");
    expect(detectLocale("fr", undefined)).toBe("es");
    expect(detectLocale("fr", "en-US")).toBe("en");
  });
  it("formato regional para Intl", () => {
    expect(intlLocale("es")).toBe("es-AR");
    expect(intlLocale("en")).toBe("en-US");
  });
});
