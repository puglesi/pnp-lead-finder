import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveSafeWebsite,
  safeWebsiteHostname,
} from "../src/lib/website-url.ts";

test("website https válido exibe hostname", () => {
  const result = resolveSafeWebsite("https://empresa.com");
  assert.equal(result.displayHostname, "empresa.com");
  assert.equal(result.href, "https://empresa.com/");
});

test("website http com path preserva destino e exibe hostname", () => {
  const result = resolveSafeWebsite("http://empresa.com/path");
  assert.equal(result.displayHostname, "empresa.com");
  assert.equal(result.href, "http://empresa.com/path");
});

test("website sem protocolo recebe https", () => {
  const result = resolveSafeWebsite("empresa.com");
  assert.equal(result.displayHostname, "empresa.com");
  assert.equal(result.href, "https://empresa.com/");
});

test("website com www exibe hostname limpo", () => {
  const result = resolveSafeWebsite("www.empresa.com");
  assert.equal(result.displayHostname, "empresa.com");
  assert.equal(result.href, "https://www.empresa.com/");
});

test("website vazio retorna travessão e não cria link", () => {
  assert.deepEqual(resolveSafeWebsite(""), {
    displayHostname: "—",
    href: null,
  });
});

test("website null retorna travessão e não cria link", () => {
  assert.deepEqual(resolveSafeWebsite(null), {
    displayHostname: "—",
    href: null,
  });
});

test("website undefined retorna travessão e não cria link", () => {
  assert.deepEqual(resolveSafeWebsite(undefined), {
    displayHostname: "—",
    href: null,
  });
});

test("texto inválido usa fallback seguro e não cria link", () => {
  const result = resolveSafeWebsite("texto inválido");
  assert.equal(result.displayHostname, "texto inválido");
  assert.equal(result.href, null);
});

test("website remove espaços antes de validar", () => {
  const result = resolveSafeWebsite("  https://empresa.com/path  ");
  assert.equal(result.displayHostname, "empresa.com");
  assert.equal(result.href, "https://empresa.com/path");
});

test("valor inválido nunca lança durante a exibição da tabela", () => {
  const invalidValues = [
    "https://",
    "::::",
    "site com espaços",
    "\u0000",
    null,
    undefined,
  ];
  for (const value of invalidValues) {
    assert.doesNotThrow(() => safeWebsiteHostname(value));
    assert.equal(typeof safeWebsiteHostname(value), "string");
  }
});

test("tabela de leads usa o resolvedor seguro em vez de construir URL diretamente", () => {
  const source = readFileSync(
    new URL("../src/components/leads/lead-data-table.tsx", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes("new URL(lead.website)"), false);
  assert.equal(source.includes("resolveSafeWebsite(lead.website)"), true);
});
