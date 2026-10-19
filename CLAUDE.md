# Abismo Idle — guia para o agente

## Documentos de referência

Leia antes de propor ou implementar qualquer feature:

1. [Idle de loot — Prompt de desenvolvimento.md](Idle%20de%20loot%20—%20Prompt%20de%20desenvolvimento.md): a especificação do jogo (regras, fórmulas, marcos, restrições inegociáveis da seção 2).
2. [docs/decisions.md](docs/decisions.md): decisões tomadas depois da especificação. Elas valem sobre a especificação.
3. [game-design-idle-rpg.md](game-design-idle-rpg.md): o GDD de visão de produto (retenção, social, monetização). Ele guia o que vem depois dos marcos já especificados.
4. [docs/gdd-comparacao.md](docs/gdd-comparacao.md): o que do GDD já existe, o que falta e onde ele conflita com a especificação.

**Precedência:** decisões > especificação > GDD. Onde o GDD conflita com a especificação, vale a especificação até o Victor decidir; os conflitos abertos estão em `docs/gdd-comparacao.md`. O que o GDD pede e a especificação não cobre pode ser feito seguindo o GDD.

Antes de cada feature nova, passe pelo checklist da seção 14 do GDD. Em dúvida entre lucro agora e jogador feliz por mais tempo, escolha o segundo.

## Forma de trabalho (seção 14.1 da especificação)

- Engine e testes primeiro, depois interface, por último a cena. Regras só em `packages/engine` (puro e determinístico); conteúdo só em `packages/content/data/*.json`; textos só em `packages/i18n`, sempre em pt-BR e en (há teste de paridade).
- Toda decisão que a especificação não cobre entra numerada em `docs/decisions.md`: o que, por quê e o pilar ou restrição.
- Mudança no estado do jogo = nova versão do save, com migração e teste.
- Depois de mexer em balanceamento, rode o simulador e registre o resultado.
- Commits pequenos (`feat(engine): ...`), com lint, tipos e testes passando.
- Arte e sons só com licença que permita uso comercial; créditos em `assets/CREDITS.md` e na tela de créditos.

## Comandos

```sh
pnpm dev            # http://localhost:5173 (?speed=N só em desenvolvimento)
pnpm test
pnpm content:build
pnpm --filter @abismo/client test:e2e
pnpm sim active 20  # simulador de balanceamento
```
