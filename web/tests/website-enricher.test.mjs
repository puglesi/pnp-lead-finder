import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichWebsiteContacts,
  enrichWebsiteLeadBatch,
  isEnrichableWebsiteUrl,
} from "../src/lib/search/scrapers/website-enricher.ts";

test("encontra e-mail real em contact page e preserva telefone da homepage", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    fetchedUrls.push(value);
    if (value === "https://www.acme.co.uk/") {
      return new Response(
        '<html><body>Call 020 7123 4567 <a href="/contact-us">Contact</a></body></html>',
        { headers: { "content-type": "text/html" } }
      );
    }
    if (value === "https://www.acme.co.uk/contact-us") {
      return new Response(
        "<html><body>info&#64;acme.co.uk</body></html>",
        { headers: { "content-type": "text/html" } }
      );
    }
    return new Response("Not found", { status: 404 });
  };

  try {
    const result = await enrichWebsiteContacts("https://www.acme.co.uk");
    assert.equal(result.email, "info@acme.co.uk");
    assert.equal(result.phone, "020 7123 4567");
    assert.deepEqual(fetchedUrls, [
      "https://www.acme.co.uk/",
      "https://www.acme.co.uk/contact-us",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prioriza e-mail do domínio do website e filtra endereços técnicos", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      [
        "info@unrelated-agency.com",
        "error@sentry.io",
        "sales@bright-builders.co.uk",
      ].join(" "),
      { headers: { "content-type": "text/html" } }
    );

  try {
    const result = await enrichWebsiteContacts(
      "https://bright-builders.co.uk"
    );
    assert.equal(result.email, "sales@bright-builders.co.uk");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bloqueia destinos internos e diretórios que não são websites da empresa", () => {
  assert.equal(isEnrichableWebsiteUrl("http://127.0.0.1:3000"), false);
  assert.equal(isEnrichableWebsiteUrl("http://192.168.1.20"), false);
  assert.equal(isEnrichableWebsiteUrl("http://localhost"), false);
  assert.equal(
    isEnrichableWebsiteUrl("https://www.google.com/maps/search/test"),
    false
  );
  assert.equal(isEnrichableWebsiteUrl("https://real-company.co.uk"), true);
});

test("não segue redirecionamento de website público para endereço interno", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    fetchedUrls.push(String(url));
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1:3000/private" },
    });
  };

  try {
    const result = await enrichWebsiteContacts("https://redirect.co.uk");
    assert.deepEqual(result, { email: null, phone: null });
    assert.deepEqual(fetchedUrls, ["https://redirect.co.uk/"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enriquece lote em paralelo preservando ids e ordem", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const hostname = new URL(String(url)).hostname;
    return new Response(`info@${hostname}`, {
      headers: { "content-type": "text/html" },
    });
  };

  try {
    const results = await enrichWebsiteLeadBatch(
      [
        { id: "first", website: "https://first.co.uk" },
        { id: "second", website: "https://second.co.uk" },
      ],
      { concurrency: 2 }
    );
    assert.deepEqual(
      results.map((result) => [result.id, result.email]),
      [
        ["first", "info@first.co.uk"],
        ["second", "info@second.co.uk"],
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
