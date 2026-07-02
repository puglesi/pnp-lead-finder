# PNP Lead Finder

Monorepo do projeto de prospecção B2B e campanhas de email.

## Aplicação web (Next.js)

Todo o código deployável está em **`web/`**.

### Deploy online (Vercel — gratuito)

👉 **[Guia completo passo a passo](web/DEPLOY-VERCEL.md)** — GitHub, variáveis de ambiente, Redis, checklist

Resumo:

1. `cd web && npm run build`
2. `git init` na raiz → push para GitHub
3. [vercel.com/new](https://vercel.com/new) → importar [puglesi/pnp-lead-finder](https://github.com/puglesi/pnp-lead-finder) → **Root Directory = `web`**
4. Variáveis: `NEXT_PUBLIC_APP_URL`, `SERPAPI_KEY`, Upstash Redis
5. Deploy → atualizar URL → Redeploy

### Desenvolvimento local

```bash
cd web
npm install
npm run dev
```

### PC ligado 24h (produção local)

Duplo clique em `web/Iniciar-Modo-24h.bat` ou veja **[Modo Local 24h](web/README.md#modo-local-24h-pc-ligado-o-tempo-todo)**.