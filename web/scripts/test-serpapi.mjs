const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function main() {
  console.log("=== SerpAPI integration test ===\n");

  const statusRes = await fetch(`${BASE}/api/search/status`);
  const status = await statusRes.json();
  console.log("Status:", JSON.stringify(status, null, 2));

  if (!status.serpapiConfigured) {
    console.log(
      "\n⚠️  SERPAPI_KEY não configurada. Adicione sua chave em web/.env.local e reinicie o servidor."
    );
    process.exit(1);
  }

  console.log("\n--- Busca pequena (1 setor, 5 leads) ---");
  const searchRes = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyword: "Estate Agents",
      location: "London",
      provider: "serpapi",
      searchProfile: "serpapi",
      maxResults: 5,
      useMaxLeads: false,
      delayMs: 500,
      sectorIndex: 0,
    }),
  });

  const search = await searchRes.json();
  if (!searchRes.ok) {
    console.error("Erro na busca:", search);
    process.exit(1);
  }

  console.log("Source:", search.source);
  console.log("Live:", search.isLive);
  console.log("Leads:", search.resultsCount);
  console.log("Provider ativo:", search.activeProvider);
  if (search.leads?.[0]) {
    console.log("Exemplo:", search.leads[0].company);
  }

  console.log("\n✓ Teste concluído");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});