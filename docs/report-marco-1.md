# Relatório do marco 1 — Protótipo jogável

16/10/2026. O laço completo roda no navegador: criar herói → caçar → loot → equipar/desmanchar → refinar → habilidades → caçadas mais difíceis e chefes → nível 100 → reset → loja de reset. Tudo salva localmente e o tempo fora é resolvido offline.

## Critérios de aceite (seção 13)

| Critério                                                                                                               | Situação | Como foi verificado                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `pnpm dev` sobe o cliente; criar herói funciona; o save sobrevive a recarregar a página                                | ✅       | e2e `save.spec.ts` (fecha a página e reabre)                              |
| Cemitério: herói percorre a rota, ataca, números no quadro de impacto, itens com a cor da raridade voam para a mochila | ✅       | e2e `hunt.spec.ts` + capturas de tela                                     |
| Mochila cheia: volta à vila, guarda no baú e retorna                                                                   | ✅       | teste do engine `hunt.test.ts`                                            |
| Equipar muda os atributos na hora e as taxas previstas                                                                 | ✅       | tela Personagem; ficha de taxas recalculada no Worker a cada mudança      |
| Refino segue as chances da seção 7.5 e nunca destrói item                                                              | ✅       | testes de tabela, de taxa observada (+10: ~50%) e de propriedade          |
| Nível 100 (comando de depuração) e reset mantêm itens e dão pontos                                                     | ✅       | e2e `progression.spec.ts` + teste de propriedade "reset nunca apaga item" |
| Fechar 2 h e voltar mostra o resumo offline dentro de ±5%                                                              | ✅       | e2e (relógio +2 h) + teste offline × tick a tick (erro máx. 3,9%)         |
| Todos os testes aplicáveis da seção 12 passam                                                                          | ✅       | ver abaixo (o de fps é opcional fora de máquina com GPU)                  |

## Testes

| Tipo                     | Onde                                                | Resultado                                                                                                                       |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unidade, regras          | `packages/engine/test` (65)                         | XP 2/50/100, combate, itens, afixos, refino, reset, habilidades, loja, filtro, poções                                           |
| Determinismo             | `determinism.test.ts`                               | hash idêntico após 100.000 ticks; `step(n)` = n × `step(1)`                                                                     |
| Offline × tick a tick    | `offline.test.ts`                                   | 1.000 resoluções de 2 h × 120 simulações: abates 1,8%, XP 0,2%, ouro 0,2%, poções 2,5%, itens 2,9%                              |
| Propriedade (fast-check) | `property.test.ts`, `progression.test.ts`           | nada negativo; XP só cai por morte; itens só somem por desmanche; refino e reset nunca apagam item                              |
| Save                     | `save.test.ts`, `progression.test.ts`               | ida e volta idêntica; save v1 migra para v2                                                                                     |
| Conteúdo                 | `packages/content/test` (10) + `pnpm content:build` | esquemas, referências, pré-requisitos, 9 mapas com rotas alcançáveis, sprites, textos pt-BR                                     |
| i18n do cliente          | `apps/client/src/i18n.test.ts`                      | toda chave de texto usada existe em pt-BR                                                                                       |
| Ponta a ponta            | `apps/client/e2e` (5)                               | caçar e lootear; criação; salvar → equipar → refinar → +2 h → resumo; exportar/importar; habilidades → nível 100 → reset → loja |
| Desempenho               | `e2e/perf.spec.ts` (`PERF=1`)                       | 59,6 fps, quadro p99 16,8 ms (Pixel 7, CPU 4× mais lenta)                                                                       |

## Balanceamento (simulador, seção 12.2)

`pnpm sim active 20` e `pnpm sim casual 16`:

| Meta                                           | Resultado                                                          | Situação                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Primeiro nível 100 em 3–5 dias (ativo)         | dia 2,9–3,5 (2 sementes); casual: dia 3,9                          | ✅ no limite inferior                                    |
| Primeiro lendário em 1–3 dias                  | dia 0,5–1,8                                                        | ⚠️ varia muito com a semente                             |
| Cada reset ≥10% mais rápido até o 10º          | 2,9 → 1,6 → 1,2 → 1,2 → 0,9 dia; depois ~1 dia (ritmo das sessões) | ✅ após as decisões 68–69                                |
| Nenhuma caçada acima de 130% da média da faixa | uma caçada por faixa; XP/h cresce de caçada em caçada              | ✅ (vale testar de novo quando houver caçadas paralelas) |

## Como testar à mão

```sh
pnpm install
pnpm dev     # http://localhost:5173 ; ?speed=5 acelera (só em desenvolvimento)
```

1. Crie um herói; o ancião dá as boas-vindas. Ele caça o Cemitério sozinho.
2. Mochila (canto inferior direito): toque num item para ver afixos e a comparação; equipe ou desmanche.
3. Menu → Habilidades: aprenda Golpe pesado quando ganhar o primeiro ponto (nível 2).
4. Menu → Ferreiro: refine a espada (+1 a +6 sempre dão certo).
5. Toque no nome da caçada (canto superior direito) para o Mapa de caçadas; derrote O Coveiro (a cada 300 abates) para abrir o Bosque Pálido.
6. Menu → Configurações → Depuração: "Ir para o nível 100" e "+ouro e materiais"; depois Menu → Altar de reset.
7. Feche a aba e volte depois de 5 min ou mais: aparece "Enquanto você estava fora".

## Pendências

- A vila como cena própria, monstros ambientes e efeitos de habilidade em sprite ficam para a arte final (marco 2).
- Tudo ainda é arte provisória feita por código; sons são do marco 2.
