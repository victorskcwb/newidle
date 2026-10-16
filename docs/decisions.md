# Decisões

Decisões que a especificação não cobria ou deixava ambíguas. Formato: o que foi decidido, por quê e o pilar (seção 1) ou a restrição (seção 2) que justificou. Itens com ⚠️ estão nas perguntas para revisão no fim.

## Primeira tarefa (2026-10-16)

### Repositório e ferramentas

1. **O Abismo Idle substituiu o Valdren Idle no mesmo repositório.** O código antigo continua no histórico do git (até `6717031`). Reaproveitamos só o que não depende do jogo: configuração do monorepo (pnpm, turbo, TS estrito, ESLint, Prettier, CI), o RNG sfc32, o hash de estado e o pacote de i18n. Servidor, protocolo e Postgres saíram (restrição 5: single-player até o marco 3).
2. **A raiz do repositório é a própria pasta** (e não uma subpasta `abismo-idle/`). A estrutura interna segue a seção 3.
3. **TypeScript 6.0.3 em vez do 7.x**: o `typescript-eslint` 8.71 aceita só `<6.1.0`. Voltamos ao 7 quando ele suportar.
4. **Phaser 3.90.0**, a última versão 3.x. O Phaser 4 já é estável, mas a especificação pede o 3; migrar depois é uma tarefa isolada na cena.
5. **Pacotes do workspace são consumidos como fonte TypeScript** (`exports` aponta para `src/index.ts`), sem etapa de build. O Vite e o `tsx` compilam direto.
6. **O ESLint proíbe no engine** `Math.random`, `Math.pow`, `Math.exp`, `Math.log`, `Date`, `performance`, timers, DOM e imports do Node. `pow`, `exp` e `log` podem variar entre motores JS; `+ − × ÷ sqrt` são exatos no IEEE 754. _Restrição 3._

### Números grandes (restrição 10)

7. **`bigint` para os acumuladores sem limite:** ouro, materiais e totais da vida inteira (abates, XP, ouro ganhos). **`number` para valores limitados por design:** XP dentro do nível (no máximo 188.594), vida, dano por golpe, contagens de poções e itens. O save vai serializar `bigint` como texto. Se o design pedir notação científica (dano no late game além de 2⁵³), entra uma biblioteca de números grandes só nesses campos. _Pilar 6: a solução mais simples que cumpre a restrição._

### Engine

8. **Curva de XP com racionais `BigInt`**: 100 × 108^(L−1) / 100^(L−1), sem ponto flutuante. Total até o 100: **2.544.721 XP**. No nível 100 o XP do nível fica em 0; o XP ganho continua contando nos totais.
9. **Valores-base que a especificação não dava** (ficam em `packages/engine/src/constants.ts`): vida = 50 + 10 × Vitalidade + 5 × nível; mana = 10 + 5 × Energia; precisão = (40 + 4 × nível) × (1 + 0,5% × Destreza); esquiva = 10 + 2 × nível; regeneração por segundo = 1 + vida máx./100 e 1 + mana máx./20; sem arma, dano 1–3 a 1 ataque/s.
10. **O herói tem 4 estados de atividade no engine** além da luta: andando entre grupos, indo e voltando da cidade, na cidade (5 s para guardar e comprar) e morto (5 s). Cada um termina num tick conhecido, então `step(n)` é idêntico a `n × step(1)` (há teste).
11. **O grupo é sorteado no início da caminhada** e sai no evento `GroupSpawned` com o tick do confronto. Assim a cena mostra os monstros à frente na rota antes da luta. _Pilar 3._
12. **Elite = o primeiro monstro de um grupo de elite** (chance por grupo, como na seção 6.2). Ele tem +100% de vida e +50% de dano e dá 2× XP e ouro, 3× chance de equipamento e +100% de chance de item mágico ("loot melhor" não tinha número).
13. **Chefe da hunt:** depois de N abates (sem contar o chefe), o próximo grupo é só o chefe. Se o herói morrer, o chefe volta no grupo seguinte. A primeira vitória libera a hunt de `unlocks`. O Cemitério ainda não tem `unlocks`, porque o Bosque Pálido não existe; o teste usa um conteúdo com uma segunda hunt.
14. **Mochila cheia no meio da luta:** itens que não cabem são desmanchados na hora, e o herói volta à cidade ao fim da luta. _Pilar 1: nada se perde, vira material._
15. **Poções:** abaixo do limite (padrão 50%), com recarga de 5 s. Na cidade, compra até a meta (padrão 10) se houver ouro. A poção de mana só é usada se o herói tiver habilidade ativa.
16. **Morte:** perde 10% do XP do nível atual (nunca o nível nem itens) e renasce na cidade. A volta automática vale 3 vezes seguidas; na 4ª morte seguida a caçada para. Limpar um grupo zera a contagem.
17. **Habilidades ativas já funcionam no engine** (Golpe pesado e Golpe giratório estão no conteúdo): prioridade, custo de mana, recarga em ticks e área até N alvos. A árvore e os pontos ficam para a próxima tarefa; o herói inicial não tem nenhuma.
18. **Distribuição automática de atributos ligada por padrão** (perfil "equilibrado": 2 de Força, 1 de Destreza e 2 de Vitalidade por nível), enquanto não existe a tela de Personagem.
19. **Raridade:** a chance de item mágico tem retorno decrescente `ef = mf × 100 ÷ (mf + 100)` e multiplica todas as raridades acima de Comum por (1 + ef). Épicos e lendários sorteiam os valores na metade de cima de cada faixa. O tier do afixo é o mais alto permitido pelo iLvl. O número de afixos é limitado pelos afixos que o espaço aceita: um peitoral raro pode sair com 2 se só houver 2 possíveis.
20. **Lendário ainda sem efeito único:** sai com 4 afixos altos. Os efeitos únicos entram com o conteúdo de lendários (marco 3), como diz a seção 13.

### Taxas e offline (seção 9)

21. **Ficha de taxas = simulação de 2 h de jogo** (72.000 ticks, ~85 ms) com a semente atual e o nível congelado. Abates, XP, ouro, poções e mortes vêm da simulação. **Os drops vêm do cálculo exato** (abates por tipo de monstro × chance da tabela de loot), para que itens raros não dependam de uma amostra de sorte.
22. **Offline aplica as taxas da configuração com que o herói saiu**, sem reavaliar a cada nível ganho (seção 9.2, passo 4). Contagens fracionárias usam arredondamento aleatório sem viés; os drops usam binomial por raridade e tipo de monstro.
23. **Limite de poções no offline:** com compra automática, cada moeda ganha pode virar poção na próxima ida à cidade. A caçada só para quando a renda de ouro não paga as poções bebidas, descontadas as que caem dos monstros. Sem compra automática, para quando o estoque acaba.
24. **Mortes offline:** a regra da especificação foi aplicada ao pé da letra (perdas só se a taxa passar de 1 por hora). Se a simulação da ficha parou sozinha (4 mortes seguidas), o offline também para nesse tempo.
25. **No offline, itens vão direto para o baú;** a mochila não muda. Itens além do limite de 200 viram material.
26. **Teste offline × tick a tick:** 1.000 resoluções de 2 h contra a média de 30 simulações completas de 2 h, com ±5% para abates, XP, ouro, poções e total de itens. Por raridade, a tolerância é ±5% ou 4 erros-padrão da referência, o que for maior: a referência tem poucos épicos e lendários para medir 5% com precisão.

### Conteúdo e mapas

27. **Campos novos no conteúdo:** `hunt.ilvl` (nível dos drops), `hunt.levelRange`, `hunt.travelSeconds` (ida à cidade), `hunt.startUnlocked`, `lootTable.rolls` e `lootTable.minRarity` (chefes), `monster.boss`, `monster.sprite.tint` e `scale` (arte provisória), `consumables.json` com as poções e `materials` com o material de cada raridade.
28. **Os números do Cemitério foram ajustados para o nível 1** (andarilho de ossos nível 2 com 32 de vida; espada inicial 4–8). O exemplo da seção 10.1 tinha um monstro de 60 de vida, lento demais para "nível 2 em menos de 30 s". ⚠️ Ver balanceamento.
29. **O mapa de teste e o tileset são gerados por script** (`pnpm maps:gen`) como um mapa comum do Tiled (`.tmj` com as camadas da seção 4.1), que pode ser aberto e editado no Tiled. O `content-build` valida camadas, numeração `wp_1…wp_n` e se rotas, saída e áreas de spawn são alcançáveis no grid.
30. **Manifesto de sprites** (`assets/sprites/manifest.json`) com quadros, duração e `impactFrame` por animação. A arte provisória é desenhada por código com as mesmas chaves, então trocar por um atlas não muda a cena.

### Cliente e cena

31. **O cliente roda o engine em tempo real** (1 tick a cada 100 ms do relógio). Com a aba em segundo plano a simulação pausa. Ao voltar: até 5 min, os ticks são reproduzidos sem eventos; acima disso, `resolveOffline`. Em ambos os casos a cena se reconstrói a partir do estado.
32. **A cena tem um tick de apresentação próprio.** Ela segura os eventos de luta até o herói alcançar o grupo, acelera até 3× para tirar o atraso e, com mais de 10 s de atraso, pula para o estado atual (seção 4.2). O HUD mostra o estado no tick que a cena está mostrando, não o último do engine, para a vida bater com os números de dano.
33. **Números de dano recebido pelo herói em vermelho-claro.** A seção 4.3 define branco para dano, mas branco nos dois lados confunde quem bateu em quem.
34. **A cidade é uma tela de sobreposição** ("Vila de Cinzarra"). O herói anda até a saída do mapa, há um fade e a vila aparece. A vila com baú, ferreiro e altar entra quando essas telas existirem.
35. **`?speed=N` só em builds de desenvolvimento** acelera o jogo, para testes e2e e depuração. Em produção é ignorado. _Restrição 6: nenhuma interação do jogador acelera nada._
36. **Fonte Pixelify Sans** (Google Fonts, licença OFL) nos títulos e números; fonte do sistema no texto corrido.

## Perguntas para revisão

- **Formato do save (difícil de desfazer):** proposta é IndexedDB com o `GameState` inteiro em JSON, `bigint` como texto, campo `version` e migrações por versão, validado por Zod ao carregar. Mais o instante salvo para calcular o offline. Posso seguir assim?
- **Balanceamento (item 28):** no simulador, o herói chega ao nível 23 em 1 h só no Cemitério, porque a penalidade de XP só começa 10 níveis acima do monstro. Com as outras hunts, o jogador vai mudar de hunt antes. Mas quer uma penalidade mais cedo (ex.: a partir de 5 níveis) ou deixo para o ajuste com o simulador?
- **Elite (item 12):** "5% dos grupos são elite" virou "o primeiro monstro do grupo é elite". Prefere o grupo inteiro elite?
- **Mortes offline (item 24):** aplicar perdas mesmo com taxa abaixo de 1 morte/h não seria mais coerente? A regra atual ignora, por exemplo, 0,9 morte/h durante 12 h.
