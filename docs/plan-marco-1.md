# Plano do marco 1 — Protótipo jogável

Ordem de trabalho: engine e testes primeiro, depois interface, por último a cena (seção 14.1).

## Pronto (primeira tarefa)

| #   | Tarefa                                                                                                                                                  | Onde                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | Monorepo: pnpm, turbo, TS estrito, ESLint, Prettier, Vitest, Playwright, CI                                                                             | raiz, `.github/workflows/ci.yml`               |
| 2   | RNG sfc32, curva de XP, atributos derivados, fórmulas de combate                                                                                        | `packages/engine/src/{rng,xp,stats,combat}.ts` |
| 3   | Simulação da hunt em ticks: grupos, elites, chefe, poções, mochila, cidade, morte, habilidades ativas                                                   | `packages/engine/src/hunt.ts`                  |
| 4   | Itens: item-base + raridade + afixos sem repetição, filtro de loot, desmanche                                                                           | `packages/engine/src/items.ts`                 |
| 5   | Ficha de taxas e `resolveOffline`                                                                                                                       | `packages/engine/src/{rates,offline}.ts`       |
| 6   | Esquemas Zod, referências cruzadas, Cemitério Esquecido (2 monstros + chefe, 6 itens-base, 8 afixos, tabela de loot)                                    | `packages/content`                             |
| 7   | Mapa de teste do Tiled, tileset e manifesto de sprites provisórios; `content-build` valida tudo                                                         | `assets/`, `tools/content-build`               |
| 8   | Cena: rota com A*, cavebot, grupos à frente, combate encenado, números no quadro de impacto, loot com cor de raridade voando para a mochila, ida à vila | `apps/client/src/scene`                        |
| 9   | HUD, log de eventos, mochila e baú com afixos e comparação                                                                                              | `apps/client/src/ui`                           |
| 10  | Testes: unidade, propriedade, determinismo (100.000 ticks), offline × tick a tick, conteúdo, e2e                                                        | `*/test`, `apps/client/e2e`                    |

## Concluído no restante do marco 1 (2026-10-16)

Árvore de habilidades, refino, reset e loja de reset, filtro de loot, Personagem, Mapa de caçadas, Ferreiro, Altar, Configurações, primeiros 10 minutos, conteúdo completo (3 regiões, 9 caçadas, 40 itens-base, 20 afixos, 9 mapas), simulador por sessões, barra de chefe, recarga das habilidades, medição de fps. Detalhes em [report-marco-1.md](report-marco-1.md).

## Pendências do marco 1

1. Meta de resets cada vez mais rápidos (pergunta em `decisions.md`).
2. Vila como cena própria, monstros ambientes, efeitos de habilidade em sprite (com a arte do marco 2).

## Riscos

- **Encenação × engine:** a cena segura eventos até o herói chegar. Mapas com rotas longas entre grupos podem gerar atraso frequente. Mitigação já feita: aceleração até 3× e salto após 10 s. A medir com mapas reais.
- **Custo da ficha de taxas:** ~300 ms por cálculo (amostra de 8 h), já fora do thread principal. O Mapa de caçadas calcula as 9 em sequência (~3 s); se o conteúdo crescer, guardar em cache por configuração.
- **Balanceamento:** o XP sobe rápido demais numa hunt só (ver perguntas em `decisions.md`). Precisa do simulador completo antes do conteúdo final.

## Relatório da primeira tarefa

**Como rodar** (Node ≥ 22, pnpm 10):

```sh
pnpm install
pnpm dev                 # cliente em http://localhost:5173 (?speed=5 acelera em dev)
pnpm test                # unidade, propriedade, determinismo, offline, conteúdo
pnpm content:build       # valida conteúdo, mapas, sprites e textos pt-BR
pnpm --filter @abismo/client test:e2e   # Playwright (perfil Pixel 7)
pnpm lint && pnpm typecheck && pnpm format:check
pnpm sim 8               # simulador: 8 h de jogo → tools/simulator/out/progression.csv
pnpm maps:gen            # regenera o mapa de teste e o tileset provisório
```

**O que se vê:** o herói nasce, vai ao Cemitério Esquecido e percorre a rota. Grupos de 1 a 3 monstros surgem à frente, ele sai da rota, luta, e números (branco, amarelo no crítico, verde na cura, cinza no erro) aparecem no quadro de impacto. Monstros morrem e itens saltam com a cor da raridade e voam para a mochila; o lendário tem um feixe de luz. Com a mochila cheia ou sem poções, ele anda até a saída e vai à vila. O HUD mostra vida, mana, XP, ouro, a ficha de taxas ("~349 abates/h · 5.724 XP/h · …") e o log. A mochila e o baú mostram cada item com raridade (cor e ícone), iLvl, atributos-base, afixos e a comparação com o equipado; dá para equipar e desmanchar.

**Testes:** 46 no engine, 8 no conteúdo, 4 e2e, todos passando. O teste offline × tick a tick (±5%) passa com erro máximo de 3,2%.

**Ainda não feito no marco 1:** tudo da lista "Próximas tarefas".
