# Inventário de persistência

Snapshot executado antes da implementação em 2026-08-15: git status,
git diff --stat e git diff --check -- web. Nenhuma alteração existente foi
restaurada ou descartada.

| Store/repository | Classe | Conteúdo e destino |
| --- | --- | --- |
| pnp-lead-finder | B, browser cache | Leads salvos/importados, histórico e setores; SQLite oficial |
| pnp-campaigns | B, browser cache | Campanhas, recipients, estados e providerMessageIds; SQLite oficial |
| pnp-email-templates | B, browser cache | Templates separados por operação; SQLite oficial |
| pnp-operation-signatures | B/D, browser cache | Cache legacy das assinaturas; SQLite oficial |
| pnp-email-blocklist | B, browser cache | Supressões globais/por operação; SQLite oficial |
| pnp-lifetime-stats | A/B derivado, browser cache | Totais derivados; snapshot SQLite sem substituir entidades |
| pnp-agent-one | B/E operacional, browser cache | Fila/checkpoint de enriquecimento; SQLite oficial |
| pnp-agent-two | B/E operacional, browser cache | Fila/checkpoint de validação; SQLite oficial |
| pnp-agent-three | B/E operacional, browser cache | Filas, envios e IDs do provedor; SQLite oficial |
| pnp-batch-pipeline | B, browser cache | Batches e estágios; SQLite oficial |
| pnp-settings | A/B/C misto | Apenas preferências não secretas no SQLite; API/SMTP secrets são excluídos |
| pnp-usage | A/B derivado, browser cache | Quota/uso de UI; snapshot não secreto no SQLite |
| pnp-theme | A | Somente UI; permanece no browser |
| pnp-lead-finder-searches | B/D | IndexedDB search-batches e search-leads; cache/recovery secundário |
| pnp-lead-finder-operation-signatures | B/D | IndexedDB operation-signatures; cache/recovery secundário |
| estado de collapse/session | A | UI transitória; browser apenas |
| SMTP/API keys/tokens/passwords | C | .env.local/memória do cliente; nunca enviados à bridge nem gravados no SQLite |

Não foram encontrados outros object stores IndexedDB no código da aplicação.
