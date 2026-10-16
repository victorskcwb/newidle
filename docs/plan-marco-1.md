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

## Próximas tarefas (ordem)

1. **Save local** — IndexedDB (`idb-keyval`), `GameState` versionado e validado por Zod, `bigint` como texto, migrações por versão, exportar/importar em texto. Instante salvo para o offline ao abrir o jogo. Testes: ida e volta idêntica, migração de save antigo. ⚠️ Formato aguarda aprovação (ver `decisions.md`).
2. **Painel "Enquanto você estava fora"** ao abrir o jogo (o `OfflineReport` já existe) + e2e "fechar → avançar o relógio 2 h → resumo".
3. **Criação de herói** — nome, cabelo, roupa, classe (só Guerreiro). Hoje o herói nasce como "Aventureiro".
4. **Personagem** — 10 espaços, atributos, distribuição manual e perfil automático; taxas previstas mudam ao equipar (o engine já recalcula).
5. **Árvore de habilidades do Guerreiro** — 4 ativas (faltam grito de guerra/buff e investida) e 8 passivas em conteúdo, pré-requisitos, 10 níveis por nó, prioridade das 4 ativas, redistribuição com custo crescente. Engine: buffs e passivas.
6. **Filtro de loot (tela)** — o engine já aplica "a partir de raridade X" e "sempre manter afixo Y".
7. **Ferreiro: refino +1 a +15** — tabela de chances da seção 7.5, custo crescente em ouro e materiais, volta 1 nível a partir de +10, item de proteção, nunca destrói. Desmanche em massa. Testes de propriedade.
8. **Reset e loja de reset** — nível 100, custo 100.000 × n, o que zera e o que fica, pontos de reset, itens inativos acima do nível (o engine já marca), 7 melhorias. Comando de depuração para chegar ao 100.
9. **Mapa de hunts** — regiões, cadeados com motivo, taxas previstas por hunt.
10. **Conteúdo do marco 1** — Cinzarra completa (Bosque Pálido, Cripta Rachada, Lorde Vharok), Pântano de Morvel e Cidadela Queimada (3 hunts cada); itens-base em 4 tiers (iLvl 1, 20, 45, 70); ~20 afixos; um mapa do Tiled por hunt. A vila como cena própria.
11. **Primeiros 10 minutos** — ancião, primeiro item mágico garantido no 5º abate, tutoriais (baú, equipar, desmanchar, refino, offline, altar).
12. **Configurações** — som, modo econômico (30 fps, sem partículas), limite de poção, fonte maior, reduzir movimento.
13. **Cena: polimento** — monstros ambientes nas áreas de spawn, barra grande de chefe, efeitos de habilidade, sons, animação de tiles além da água.
14. **Simulador (seção 12.2)** — perfis casual/ativo com sessões e offline, CSV por dia, metas de balanceamento; ajustar números.
15. **Desempenho** — medir 60 fps com 4 monstros em perfil de celular; mover a ficha de taxas para um Web Worker se pesar.
16. **Relatório do marco** (`docs/report-marco-1.md`).

## Riscos

- **Encenação × engine:** a cena segura eventos até o herói chegar. Mapas com rotas longas entre grupos podem gerar atraso frequente. Mitigação já feita: aceleração até 3× e salto após 10 s. A medir com mapas reais.
- **Custo da ficha de taxas** (~85 ms a frio no thread principal) a cada mudança de equipamento. Se crescer com mais conteúdo, mover para Worker.
- **Balanceamento:** o XP sobe rápido demais numa hunt só (ver perguntas em `decisions.md`). Precisa do simulador completo antes do conteúdo final.
- **Formato do save** é difícil de mudar depois: precisa de aprovação antes da tarefa 1.

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

**Testes:** 39 no engine, 8 no conteúdo, 1 e2e, todos passando. O teste offline × tick a tick (±5%) passa.

**Ainda não feito no marco 1:** tudo da lista "Próximas tarefas". Em particular, o jogo **ainda não salva**: recarregar a página começa um herói novo.
