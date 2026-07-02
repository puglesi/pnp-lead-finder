# Deploy na Vercel (gratuito) — guia completo

Este guia leva do zero até o app online em **https://seu-projeto.vercel.app**.

---

## Visão geral

| Etapa | O que você faz | Tempo |
|-------|----------------|-------|
| 1 | Preparar Git local | 5 min |
| 2 | Criar repositório no GitHub | 3 min |
| 3 | Conectar GitHub → Vercel | 5 min |
| 4 | Configurar variáveis de ambiente | 5 min |
| 5 | Deploy + verificação | 5 min |

**Plano Vercel:** Hobby (gratuito) — suficiente para este projeto.

---

## Etapa 1 — Preparar o projeto

### 1.1 Verificar que o build passa

No PowerShell ou terminal:

```powershell
cd C:\Users\Pugliese\Documents\pnp_lead_finder\web
npm install
npm run build
```

Se aparecer `✓ Compiled successfully`, o projeto está pronto para deploy.

### 1.2 Inicializar Git (na raiz do monorepo)

```powershell
cd C:\Users\Pugliese\Documents\pnp_lead_finder
git init
git add .
git status
```

Confirme que **não** aparecem na lista:

- `web/.env.local` (suas chaves secretas)
- `web/node_modules/`
- `web/.next/`
- `web/.data/`
- `web/.logs/`

### 1.3 Primeiro commit

```powershell
git commit -m "PNP Lead Finder — pronto para deploy Vercel"
```

---

## Etapa 2 — Conectar ao GitHub

### 2.1 Criar repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. **Repository name:** `pnp-lead-finder` (ou outro nome)
3. **Visibility:** Public ou Private (ambos funcionam na Vercel)
4. **Não** marque "Add a README" (você já tem código local)
5. Clique em **Create repository**

### 2.2 Enviar o código

```powershell
cd C:\Users\Pugliese\Documents\pnp_lead_finder
git branch -M main
git remote add origin https://github.com/puglesi/pnp-lead-finder.git
git push -u origin main
```

Repositório: **https://github.com/puglesi/pnp-lead-finder**

**Autenticação:** o GitHub pode pedir login via navegador (Git Credential Manager) ou um **Personal Access Token** em vez de senha.

### 2.3 Estrutura do repositório

```
pnp_lead_finder/          ← raiz do Git
├── README.md
├── .gitignore
└── web/                  ← app Next.js (Root Directory na Vercel)
    ├── package.json
    ├── vercel.json
    ├── .env.example
    └── src/
```

---

## Etapa 3 — Conectar GitHub à Vercel

### 3.1 Criar conta Vercel

1. Acesse [vercel.com/signup](https://vercel.com/signup)
2. Clique em **Continue with GitHub**
3. Autorize a Vercel a acessar seus repositórios

### 3.2 Importar o projeto

1. Acesse [vercel.com/new](https://vercel.com/new)
2. Em **Import Git Repository**, encontre `pnp-lead-finder`
3. Clique em **Import**

### 3.3 Configurar o projeto (IMPORTANTE)

Na tela **Configure Project**:

| Campo | Valor |
|-------|-------|
| **Project Name** | `pnp-lead-finder` (ou o que preferir) |
| **Framework Preset** | Next.js (detectado automaticamente) |
| **Root Directory** | `web` ← **clique Edit e selecione a pasta `web`** |
| **Build Command** | `npm run build` |
| **Install Command** | `npm install` |
| **Output Directory** | *(deixe padrão — Next.js)* |

> Se não definir **Root Directory = web**, o deploy falha porque o `package.json` está dentro de `web/`.

### 3.4 Região

O arquivo `vercel.json` já define **`lhr1` (London)** — ideal para UK/Europa. Não precisa alterar.

---

## Etapa 4 — Variáveis de ambiente

Na mesma tela de import (ou depois em **Settings → Environment Variables**), adicione:

### Obrigatória para produção

| Variável | Valor | Ambientes |
|----------|-------|-----------|
| `NEXT_PUBLIC_APP_URL` | `https://SEU-PROJETO.vercel.app` | Production, Preview, Development |

> Na **primeira** importação use um placeholder (ex. `https://pnp-lead-finder.vercel.app`). Depois do primeiro deploy, atualize com a URL real e faça **Redeploy**.

### Recomendadas

| Variável | Onde obter | Ambientes |
|----------|------------|-----------|
| `SERPAPI_KEY` | [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) | Production, Preview |
| `KV_REST_API_URL` | Vercel → Storage → Upstash Redis | Production |
| `KV_REST_API_TOKEN` | Vercel → Storage → Upstash Redis | Production |

### Opcionais

| Variável | Descrição |
|----------|-----------|
| `GOOGLE_CSE_API_KEY` | Google Custom Search |
| `GOOGLE_CSE_ID` | ID do motor de busca customizado |

### Como adicionar na Vercel (passo a passo)

1. No projeto Vercel → **Settings**
2. Menu lateral → **Environment Variables**
3. Campo **Key:** `SERPAPI_KEY`
4. Campo **Value:** cole sua chave
5. Marque **Production** e **Preview**
6. Clique **Save**
7. Repita para cada variável

### Email (Mailgun, Resend, SMTP, etc.)

Credenciais de email são configuradas **na interface do app** (Configurações → provedor). **Não** precisam de variáveis na Vercel para o deploy inicial.

### Criar Upstash Redis (tracking persistente)

1. No dashboard Vercel → aba **Storage**
2. **Create Database** → **Upstash Redis** → plano **Free**
3. Nome: `pnp-tracking` → **Create**
4. **Connect to Project** → selecione `pnp-lead-finder`
5. A Vercel injeta automaticamente `KV_REST_API_URL` e `KV_REST_API_TOKEN`

Sem Redis, o tracking de aberturas/cliques funciona mas pode resetar em cold starts do serverless.

---

## Etapa 5 — Deploy

### 5.1 Primeiro deploy

1. Com as variáveis configuradas, clique **Deploy**
2. Aguarde ~2–3 minutos
3. Ao concluir, copie a URL: `https://pnp-lead-finder-xxxxx.vercel.app`

### 5.2 Atualizar URL pública

1. **Settings → Environment Variables**
2. Edite `NEXT_PUBLIC_APP_URL` com a URL real de produção
3. Vá em **Deployments** → último deploy → menu **⋯** → **Redeploy**

Isso garante que pixels e links de tracking nos emails usem a URL correta.

### 5.3 Deploys automáticos

A partir daí, cada `git push` na branch `main` gera um novo deploy de produção automaticamente.

---

## Verificação pós-deploy

Abra no navegador:

| URL | Esperado |
|-----|----------|
| `https://seu-projeto.vercel.app` | Dashboard carrega |
| `https://seu-projeto.vercel.app/api/health` | JSON `{ "ok": true }` |
| `https://seu-projeto.vercel.app/api/search/status` | Status da SerpAPI |

Checklist na interface:

- [ ] Busca de leads funciona (SerpAPI ou modo autônomo)
- [ ] Criar campanha em `/campanhas/nova`
- [ ] Envio simulado ou real
- [ ] Métricas em **Relatório** após abrir email de teste

---

## Deploy via CLI (alternativo)

```powershell
npm i -g vercel
cd C:\Users\Pugliese\Documents\pnp_lead_finder\web
vercel login
vercel link
vercel env pull .env.local
vercel --prod
```

---

## Problemas comuns

### Build falha: "Cannot find package.json"

→ **Root Directory** não está como `web`. Corrija em Settings → General → Root Directory.

### SerpAPI não funciona online

→ Adicione `SERPAPI_KEY` em Environment Variables e faça Redeploy.

### Tracking de email não registra aberturas

→ Confirme `NEXT_PUBLIC_APP_URL` = URL de produção exata (com `https://`, sem barra no final).

### Tracking some após alguns dias

→ Conecte **Upstash Redis** ao projeto (Etapa 4).

### Erro 500 em APIs

→ Vercel → Deployments → clique no deploy → **Functions** / **Runtime Logs** para ver o erro.

---

## Links úteis

- [Vercel — Deploy Next.js](https://vercel.com/docs/frameworks/nextjs)
- [Vercel — Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Upstash Redis na Vercel](https://vercel.com/marketplace/upstash)
- [SerpAPI](https://serpapi.com/docs)