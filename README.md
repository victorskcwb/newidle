# Abismo Idle

RPG idle de fantasia sombria para navegador: o herói caça sozinho num mapa top-down, inclusive offline; o coração é o loot com raridades e afixos. Especificação: [Idle de loot — Prompt de desenvolvimento.md](Idle%20de%20loot%20—%20Prompt%20de%20desenvolvimento.md).

```text
apps/client          Vite + React (HUD) + Phaser 3 (cena)
packages/engine      regras puras e determinísticas: combate, loot, taxas, offline
packages/content     conteúdo em JSON + esquemas Zod + leitura de mapas do Tiled
packages/i18n        textos pt-BR
assets/              mapas do Tiled e sprites
tools/content-build  valida conteúdo, mapas, sprites e textos (CI); gera o mapa de teste
tools/simulator      simulação de balanceamento
docs/                plano, decisões e relatórios
```

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # testes de unidade, propriedade, determinismo e offline
pnpm content:build  # validação de conteúdo
pnpm --filter @abismo/client test:e2e
```

Veja [docs/plan-marco-1.md](docs/plan-marco-1.md) e [docs/decisions.md](docs/decisions.md).
