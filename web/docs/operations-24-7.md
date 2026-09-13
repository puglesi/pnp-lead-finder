# P&P Lead Finder V2.1 — operação Windows 24/7

Requer Node 24 LTS, dependências já instaladas e SQLite local disponível. O
worker reutiliza as filas, renderização, validação DNS, reconciliação e pipeline
SMTP da aplicação. Não depende de Chrome nem do servidor Next.js para trabalhar.

## Iniciar e parar

Em `web`, execute `npm.cmd run worker` ou `scripts\start-worker.cmd`.
O padrão é monitoramento: não busca, não consulta DNS e não envia mensagens.
Para executar filas já marcadas como running, use `npm.cmd run worker -- --execute`.
Isso habilita trabalho real: configure credenciais no ambiente do processo do host
antes de usar essa opção. O worker não lê nem altera `.env.local`.
O Agente 1 usa exclusivamente busca autônoma, sem SerpAPI. O Agente 2 valida DNS.
O Agente 3 exige assinatura oficial, pipeline SMTP autorizado no ambiente e lease.

Use `scripts\stop-worker.cmd` para solicitar shutdown gracioso. Não use taskkill.
A operação em andamento termina e grava seu resultado antes de liberar leases.
Se houver crash após aceitação SMTP, a confirmação oficial será reconciliada.
Envios unknown permanecem pausados e exigem investigação externa; ausência de
messageId no banco não comprova ausência de entrega. Nunca os libere só por TTL.

## Login / reboot

O script `scripts\register-worker-task.ps1` prepara uma tarefa para o usuário atual
após login. Revise e execute manualmente com PowerShell quando desejar instalar a
tarefa. Não foi executado durante o hardening. O padrão inicia somente monitoramento.
A tarefa usa janela oculta, impede instância paralela, reinicia após falhas e não
tem limite de duração. O runner lease SQLite também protege contra execução manual
simultânea. A retomada após reboot acontece no login; execução antes do login exige
uma tarefa de inicialização com conta/permissões configuradas pelo administrador.

Para executar trabalho real na tarefa, passe `-ExecuteQueues` explicitamente.
As variáveis do ambiente devem estar disponíveis ao usuário da tarefa.
O processo aguarda banco disponível, sem criar um novo banco vazio por engano.

## Monitoramento e manutenção

Abra `/operational-health`: controles Iniciar/Pausar, heartbeat, tamanho DB/WAL/SHM, backup, runners, filas,
cooldowns e último erro. O endpoint `/api/operational-health` não retorna secrets,
sender, payloads comerciais ou respostas SMTP. Logs contêm só códigos fixos,
rotacionados em `worker-runtime` (1 MB, três gerações).

`npm.cmd run database:audit` lê tamanhos e contagens sem alterar o banco.
`npm.cmd run restore:drill` faz backup online WAL-safe para cópia temporária,
restaura outro arquivo, aplica schema e compara contagens e SHA-256 dos registros
oficiais. Nunca restaura sobre live; mantém a pasta temporária indicada no relatório
para inspeção. Não aplica retenção nem remove backups existentes. Em execução,
o worker cria backup diário online, em segundo plano, sem remover backups anteriores.

PASSIVE ocorre a cada minuto, não aguarda bloqueios e é dispensado se indisponível.
TRUNCATE/VACUUM são ferramentas offline via `maintainOffline`, com conexão exclusiva,
busy_timeout zero e verificação de runners/buscas/envios pendentes. Feche worker,
servidor e demais conexões antes de solicitar VACUUM. Não há VACUUM automático.
Snapshots de filas sent antigos (90 dias), fora da campanha atual e com confirmação
oficial, são arquivados em `agent_three_archive` antes de sair do snapshot; unknown,
ready, failed e blocked são preservados. Não há limpeza de send_history/dedupe.

SMTP: 535/5.7.x pausa permanentemente; 454/421/4xx usa cooldown persistente por
operação/sender com 30s, 60s, 120s e 300s. `SMTP_BACKOFF_MAX_MS` limita o teto.
Timeout/conexão interrompida exige reconciliação. confirmed nunca reenvia.
Cooldown permanente só deve ser liberado após corrigir e revisar a causa; não há
reset automático. O modo monitor é recomendado para verificar a instalação.
