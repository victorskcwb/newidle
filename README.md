# Valdren Idle

RPG idle de fantasia medieval para navegador. A especificação completa está em `Valdren Idle — Prompt de desenvolvimento.md`; o plano atual, em [docs/plan-marco-1.md](docs/plan-marco-1.md), e as decisões, em [docs/decisions.md](docs/decisions.md).

## Requisitos

- Node.js 22+ (desenvolvido com 24 LTS)
- pnpm 10 (`npm i -g pnpm@10`)
- Docker é opcional: sem ele, `pnpm dev` e os testes usam um Postgres embutido (binários oficiais via npm)

## Comandos

```sh
pnpm install
pnpm dev                # Postgres embutido (:5433) + servidor (:3000) + cliente (http://localhost:5173, API em /api)
pnpm dev:infra          # alternativa: Postgres + Redis via Docker Compose (defina DATABASE_URL no .env)
pnpm --filter @valdren/server exec drizzle-kit generate   # nova migração após mudar o esquema

pnpm test               # testes unitários (Vitest) de todos os pacotes
pnpm --filter @valdren/client test:e2e   # Playwright com a stack completa (instale antes: pnpm --filter @valdren/client exec playwright install chromium)
pnpm lint
pnpm typecheck
pnpm format:check
pnpm content:build      # valida o conteúdo e gera tools/content-build/dist/content.<hash>.json
pnpm --filter @valdren/simulator start   # XP/h por ação vs. metas de balanceamento (CSV)
```

## Jogar

`pnpm dev` e abra http://localhost:5173: crie uma conta e um herói, escolha **Começar** em "Minerar cobre". O servidor simula; o navegador espelha a simulação e desenha a cena. Feche a aba e volte depois para ver o painel "Enquanto você estava fora".

## Página do engine sem servidor

http://localhost:5173/?local roda o engine **só no navegador**:

- **Começar** em “Minerar cobre”: o herói caminha até o Vale Verde e minera; a cada 3 s, lascas, minério voando para a bolsa e “+2,5 XP”.
- Minere estanho, depois funda bronze e forje a adaga na aba Forja.
- **Simular 2 h fora** abre o painel “Enquanto você estava fora”. Fechar a aba e voltar depois faz o mesmo de verdade (o estado fica no `localStorage`).
- **Recomeçar** apaga o progresso local.

`/determinism.html` roda o cenário de determinismo de 100.000 ticks no navegador; o teste e2e compara o resultado com o hash golden do Node.

## Estrutura

```text
apps/client          Vite + React (UI) + PixiJS (cena)
apps/server          Fastify + WebSocket: auth, personagem, banco, loja, resolução dos espaços; Drizzle + Postgres
tools/dev-db         Postgres embutido para dev e testes
packages/engine      regras puras e determinísticas: RNG, XP, step, resolveOffline, hash
packages/content     esquemas Zod + JSON de conteúdo
packages/protocol    mensagens cliente–servidor (Zod)
packages/i18n        textos (pt-BR)
tools/content-build  validação e empacotamento do conteúdo
tools/simulator      balanceamento
```
