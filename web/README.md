# PNP Lead Finder

Plataforma B2B de prospecção de leads e campanhas de email — **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS**.

Deploy gratuito recomendado: **[Vercel](https://vercel.com)** (Hobby / Free).

---

## Deploy online na Vercel (gratuito)

Guia completo passo a passo: **[DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)**

### Resumo rápido

```
1. npm run build          → confirmar que compila
2. git init + push        → enviar para GitHub
3. vercel.com/new         → importar repo, Root Directory = web
4. variáveis de ambiente  → NEXT_PUBLIC_APP_URL, SERPAPI_KEY, Redis
5. Deploy                 → copiar URL → atualizar NEXT_PUBLIC_APP_URL → Redeploy
```

### Pré-requisitos

- Conta [GitHub](https://github.com)
- Conta [Vercel](https://vercel.com/signup) (login com GitHub)
- Node.js 20+ (só para dev local)

### Passo 1 — Preparar o projeto

```powershell
cd C:\Users\Pugliese\Documents\pnp_lead_finder\web
npm install
npm run build
```

Na **raiz** do monorepo (`pnp_lead_finder`):

```powershell
cd ..
git init
git add .
git commit -m "PNP Lead Finder — deploy Vercel"
```

> O `.gitignore` já exclui `.env.local`, `node_modules`, `.next` e logs.

### Passo 2 — Conectar ao GitHub

1. Crie repo vazio em [github.com/new](https://github.com/new) (sem README)
2. Envie o código:

```powershell
git branch -M main
git remote add origin https://github.com/puglesi/pnp-lead-finder.git
git push -u origin main
```

### Passo 3 — Conectar GitHub à Vercel

1. [vercel.com/new](https://vercel.com/new) → **Continue with GitHub**
2. Importe o repositório `pnp-lead-finder`
3. **Root Directory:** clique **Edit** → selecione **`web`** (obrigatório)
4. Framework: **Next.js** | Build: `npm run build` | Install: `npm install`

### Passo 4 — Variáveis de ambiente

Em **Environment Variables** (antes ou depois do deploy):

| Variável | Obrigatória | Ambientes | Descrição |
|----------|-------------|-----------|-----------|
| `NEXT_PUBLIC_APP_URL` | **Sim** | Production, Preview | URL pública, ex. `https://pnp-lead-finder.vercel.app` |
| `SERPAPI_KEY` | Recomendada | Production, Preview | [SerpAPI](https://serpapi.com/manage-api-key) — busca real |
| `KV_REST_API_URL` | Recomendada* | Production | Upstash Redis (tracking persistente) |
| `KV_REST_API_TOKEN` | Recomendada* | Production | Token do Upstash |
| `GOOGLE_CSE_API_KEY` | Opcional | Production, Preview | Google Custom Search |
| `GOOGLE_CSE_ID` | Opcional | Production, Preview | ID do CSE |

\*Crie em **Vercel → Storage → Upstash Redis (Free)** → **Connect to Project**.

**Email** (Mailgun, Resend, SMTP, etc.): configurado na **UI do app**, não precisa de env na Vercel.

Copie o template de [`.env.example`](./.env.example) — nunca commite `.env.local`.

### Passo 5 — Deploy e pós-deploy

1. Clique **Deploy** → aguarde ~2 min
2. Copie a URL de produção
3. Atualize `NEXT_PUBLIC_APP_URL` com essa URL
4. **Deployments → ⋯ → Redeploy**
5. Teste: `/api/health`, busca de leads, campanha, relatório

Cada `git push` na `main` gera deploy automático.

### URLs de preview

| Tipo | Formato |
|------|---------|
| Produção | `https://<projeto>.vercel.app` |
| Preview (branch) | `https://<projeto>-git-<branch>-<user>.vercel.app` |
| Preview (PR) | Gerado em cada Pull Request |

### CLI (opcional)

```powershell
npm i -g vercel
cd web
vercel login
vercel --prod
```

---

## Desenvolvimento local

```bash
cd web
cp .env.example .env.local
# Edite .env.local com SERPAPI_KEY e NEXT_PUBLIC_APP_URL=http://localhost:3000
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

---

## Modo Local 24h (PC ligado o tempo todo)

Versão otimizada para rodar no seu PC Windows com melhor performance de dia, menos CPU à noite e **auto-save** de leads.

### Início rápido — atalho

1. Na pasta `web`, dê duplo clique em **`Iniciar-Modo-24h.bat`**
2. Aguarde o build e abra [http://localhost:3000](http://localhost:3000)
3. No dashboard, clique em **Ativar Modo 24h Local**

Ou via terminal:

```bash
cd web
npm run local:24h
```

### O que o Modo Local faz

| Recurso | Diurno (07h–22h) | Noturno (22h–07h) |
|---------|------------------|-------------------|
| Workers | 2 (paralelo) | 1 (sequencial) |
| Delay entre buscas | 3500 ms | 5000 ms |
| Enriquecimento de sites | Ligado | Desligado (menos CPU) |
| Auto-save de leads | Sempre ligado | Sempre ligado |
| Poll de métricas | 20 s | 90 s |

O horário noturno é configurável em **Configurações → Modo Local 24h**.

### Variáveis para uso local

Em `.env.local`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
SERPAPI_KEY=sua_chave_opcional
```

O tracking de campanhas grava em `web/.data/` (persistente no PC, sem Redis).

### Rodar como serviço no Windows (iniciar com o sistema)

**Opção A — Agendador de Tarefas (recomendado)**

Abra PowerShell na pasta `web` e execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-startup.ps1
```

Isso cria a tarefa **"PNP Lead Finder - Modo 24h"** que inicia o servidor ao fazer login no Windows. Logs em `web/.logs/`.

Para remover:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-windows-startup.ps1
```

**Opção B — Atalho na pasta Inicializar**

1. Pressione `Win + R`, digite `shell:startup` e Enter
2. Crie um atalho para `web\Iniciar-Modo-24h.bat`
3. Nas propriedades do atalho, em **Executar**, escolha **Minimizado**

### Estabilidade para uso diário

- Use `npm run local:24h` ou o `.bat` (build + `next start`, não `dev`)
- Verifique saúde do servidor: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- Logs diários em `web/.logs/local-24h-AAAA-MM-DD.log`
- A tarefa agendada reinicia automaticamente em caso de falha (até 3 vezes)
- Mantenha o PC em modo **Energia equilibrada** ou **Alto desempenho** se buscas noturnas forem longas

### Atalho na área de trabalho

Clique com o botão direito em `Iniciar-Modo-24h.bat` → **Enviar para** → **Área de trabalho (criar atalho)**.

---

## Estrutura do projeto

```
web/
├── src/app/              # App Router (páginas + API routes)
│   ├── api/search/       # Busca SerpAPI
│   ├── api/email/send/   # Envio real de emails
│   └── api/track/        # Tracking abertura/clique/resposta
├── src/components/       # UI React
├── src/store/            # Zustand (estado local persistido)
├── src/lib/              # Lógica de negócio
├── scripts/              # Início 24h + instalação Windows
├── Iniciar-Modo-24h.bat  # Atalho duplo-clique para modo 24h
├── vercel.json           # Config Vercel
├── next.config.ts        # Headers de segurança + otimizações
└── .env.example          # Template de variáveis
```

---

## Produção — otimizações incluídas

- **App Router** com rotas estáticas onde possível
- **`optimizePackageImports`** para `lucide-react` (bundle menor)
- **Headers de segurança:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- **`poweredByHeader: false`**
- **Tracking** compatível com serverless (Upstash Redis ou `/tmp` + memória)
- **Região Vercel:** `lhr1` (London) — ajuste em `vercel.json` se necessário

---

## Checklist pós-deploy

- [ ] `NEXT_PUBLIC_APP_URL` = URL de produção
- [ ] `SERPAPI_KEY` configurada (busca real)
- [ ] Upstash Redis conectado (tracking persistente)
- [ ] Testar `/campanhas/nova` e envio simulado
- [ ] Testar pixel: abrir email enviado e ver métricas em **Relatório**

---

## Suporte

- [Documentação Vercel — Next.js](https://vercel.com/docs/frameworks/nextjs)
- [SerpAPI](https://serpapi.com/docs)
- [Upstash Redis na Vercel](https://vercel.com/marketplace/upstash)