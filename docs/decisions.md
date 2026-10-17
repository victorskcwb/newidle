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

21. **Ficha de taxas = simulação de 4 h de jogo** (144.000 ticks, ~150 ms) com a semente atual e o nível congelado. Abates totais, ouro, poções e mortes vêm da simulação. **A mistura de monstros e os drops vêm do cálculo exato** (pesos de surgimento, tamanho do grupo, chance de elite, tabelas de loot), para que itens raros não dependam de uma amostra de sorte. Com 2 h, o ruído da amostra sozinho chegava a ~5% nas poções.
22. **Offline aplica as taxas da configuração com que o herói saiu** (seção 9.2, passo 4): abates, ouro e poções não mudam com os níveis ganhos fora. **O XP, porém, é aplicado em 48 fatias de tempo** com o XP de cada abate recalculado no nível do momento, para a penalidade de nível (seção 5.1) valer offline também. Sem isso, 3 h fora levavam do nível 2 ao 39 no Cemitério. Contagens fracionárias usam arredondamento aleatório sem viés; os drops usam binomial por raridade e tipo de monstro.
23. **Limite de poções no offline:** com compra automática, cada moeda ganha pode virar poção na próxima ida à cidade. A caçada só para quando a renda de ouro não paga as poções bebidas, descontadas as que caem dos monstros. Sem compra automática, para quando o estoque acaba.
24. **Mortes offline com qualquer taxa:** cada morte prevista custa 10% do XP do nível, mesmo abaixo de 1 morte/h (a especificação dizia "maior que 1 por hora"; aplicar sempre deixa o offline coerente com o jogo). Se a simulação da ficha parou sozinha (4 mortes seguidas), o offline também para nesse tempo.
25. **No offline, itens vão direto para o baú;** a mochila não muda. Itens além do limite de 200 viram material.
26. **Teste offline × tick a tick:** um herói nível 30 (penalidade de XP já no piso, então o nível congelado da referência vale) e limite de poção em 99% (para o uso de poções ser mensurável). São 1.000 resoluções de 2 h contra a média de 120 simulações completas de 2 h. Erros medidos: abates 1,5%, XP 1,4%, ouro 0,3%, poções 2,8%, itens 2,6%. Tolerância de ±5% para abates, XP, ouro, poções e total de itens. Por raridade, a tolerância é ±5% ou 4 erros-padrão da referência, o que for maior: a referência tem poucos épicos e lendários para medir 5% com precisão.

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

## Save, criação de herói e offline ao abrir (2026-10-16)

37. **Formato do save aprovado:** IndexedDB (`idb-keyval`), uma chave, um herói. Texto JSON `{ version, savedAt, state }` com `bigint` como `{ "$bigint": "…" }`. O objeto marcado evita confundir com um nome de herói como "123n". Ao carregar: migrações versão a versão, depois Zod (`gameStateSchema`, tipado contra `GameState`), depois checagem de que todo item, afixo, hunt e monstro ainda existe no conteúdo. O codec fica no engine (puro), pronto para o servidor do marco 4.
38. **Quando salva:** a cada 5 s, ao esconder ou fechar a página e 300 ms depois de qualquer mudança (equipar, desmanchar…). As gravações são enfileiradas e o estado é codificado no momento do pedido, então uma gravação antiga nunca sobrescreve uma nova.
39. **Save quebrado não é apagado sozinho:** a tela mostra o motivo e o texto do save para copiar, e só então oferece "Começar de novo". _Pilar 2: o progresso do jogador vale mais que a conveniência._
40. **Importar save** valida antes de gravar e desliga o autosave até recarregar a página, para o save atual não sobrescrever o importado.
41. **Tempo fora ao abrir o jogo** = agora − `savedAt` (relógio que voltou conta como 0). Até 5 min, os ticks são reproduzidos; acima disso, `resolveOffline` e o painel "Enquanto você estava fora".
42. **Nome do herói:** 3 a 16 caracteres, letras (com acento), números, espaço, "-" e "_", sem espaços duplos. Aparência: 4 cores de cabelo e 4 de roupa. Caçadora e Feiticeiro aparecem com cadeado e o motivo ("Libera no reset 5").
43. **Respostas às perguntas da primeira tarefa** (o Victor pediu para seguir as recomendações): penalidade de XP como na especificação (10+ e 20+ níveis), com o ajuste vindo do conteúdo e do simulador; elite continua sendo o primeiro monstro do grupo; mortes offline com qualquer taxa (item 24); o commit `b4a593b` sem o arquivo pt-BR fica como está.

## Restante do marco 1 (2026-10-16, trabalho autônomo)

O Victor saiu e pediu para seguir sozinho com o que eu recomendasse. Tudo abaixo foi decidido sem consulta; as perguntas abertas estão no fim.

### Habilidades, refino e reset

44. **Árvore do Guerreiro em conteúdo** (`skills.json`): 4 ativas (Golpe pesado, Grito de guerra, Golpe giratório, Investida) e 8 passivas, em 4 linhas × 3 colunas, com pré-requisitos por nível. O `content-build` recusa pré-requisito desconhecido, ciclo e posição repetida.
45. **Grito de guerra** gasta o golpe do herói e dá +20% de dano (+4% por nível) por 8 s; não é relançado enquanto dura. **Investida** atordoa o alvo por 1,5 s (adia o próximo ataque dele). A ordem dos espaços é a prioridade; aprender uma ativa nova a coloca no primeiro espaço livre.
46. **Redistribuir habilidades** custa 200 × n² de ouro (n = redistribuições pagas até agora) e é grátis uma vez depois de cada reset. Atributos não são redistribuídos fora do reset (a especificação não pedia).
47. **Refino:** custo da tentativa para +N = 50 × N² de ouro, 3N fragmentos, (N − 5) essências a partir do +6 e (N − 10) cristais a partir do +11. Chances da seção 7.5 (+11 a +15: 40, 35, 30, 25, 20%). A falha só faz voltar um nível em tentativas para +10 ou mais. O **amuleto de proteção** cai de chefes (15%, ou 50% nos chefes de região) e é gasto só quando a falha faria perder nível.
48. **Reset:** pontos = 10 + chefes derrotados pela primeira vez no ciclo × 2. Ao resetar, o herói fica na vila. "Mestre" também paga o ponto na hora em que é comprado (senão só valeria no ciclo seguinte). A loja de reset é conteúdo (`resets.json`). Os marcos 5/10/15/20 aparecem no altar como "em breve".
49. **Automação** libera a regra "sempre manter itens com afixo" do filtro de loot. A compra automática de poções continua disponível desde o início, porque sem ela o jogo offline parava cedo demais.
50. **Poções escalam:** a poção pequena cura 40 + 25% da vida máxima. Com valor fixo, ela ficaria inútil a partir do nível 30. Assim há um tipo só de poção no marco 1.
51. **Primeiro item mágico garantido no 5º abate** de um herói novo, como um drop extra (seção 11.4). Os primeiros 10 minutos são dicas de uma vez só, guardadas nos `flags` do save. Só a do ancião bloqueia a tela.
52. **Save versão 2** (árvore, buffs, reset, flags) com a primeira migração de verdade (v1 → v2). Ela tem teste com um save v1.

### Conteúdo

53. **Números gerados a partir de um herói de referência por nível** (script fora do repositório; o JSON gerado é a fonte e pode ser ajustado à mão). Vida do monstro ≈ 4,5 s do dano esperado do herói; dano ≈ 1,6% da vida do herói por segundo; chefes de caçada ×14 de vida, chefes de região ×22; ouro [N, 3N] no nível N. O Cemitério manteve os números da primeira tarefa.
54. **XP:** 18 × 1,02^(nível − 2) × 0,4 fora do Cemitério (o Cemitério é generoso de propósito: nível 2 em segundos). No simulador, o perfil ativo chega ao primeiro nível 100 entre o dia 3,0 e o 3,5.
55. **Cada chefe libera a caçada seguinte;** o chefe de região libera a primeira caçada da próxima região (uma cadeia só de 9 caçadas).
56. **Itens-base:** 10 espaços × 4 tiers (iLvl 1, 20, 45, 70). Armas pedem Força (10/40/85/130); o resto só nível. Anéis têm vida implícita, amuletos dano % implícito. As tabelas de loot dão o tier atual com peso 10 (arma 14) e o anterior com peso 4.
57. **20 afixos**, cada um com até 4 tiers por iLvl. Não há "+nível de uma habilidade" ainda: exige mostrar níveis bônus na árvore.
58. **Mapas por tema** (cemitério, bosque, cripta, pântano, aldeia, cinzas, lava) com a mesma rota e o mesmo portão em todos, para rotas e spawns serem sempre válidos. Tiles novos: piso de pedra, lama e lava animada.

### Ficha de taxas e offline

59. **Amostra de 8 h** (~300 ms, no Web Worker) em vez de 4 h. Com 4 h, a semente do teste dava 5,2% de erro nas poções; dez outras sementes ficavam entre −6% e +2%. O teste não deve depender de sorte.
60. **Ouro e poções por tipo de grupo:** o ouro por abate é calculado exatamente; as poções são medidas por grupo normal, de elite e de chefe e multiplicadas pelo número exato de grupos de cada tipo por hora.
61. **Turbo não guarda cache de `test` e `typecheck`.** O cache do teste do engine escondeu uma mudança de conteúdo (o engine depende do conteúdo, mas o turbo só olhava os arquivos do engine).

### Interface

62. **Telas a no máximo 2 toques:** Personagem e Mochila direto no canto; o resto via Menu (Habilidades, Mapa de caçadas, Ferreiro, Altar, Filtro de loot, Configurações, Salvar e carregar). Tocar no nome da caçada abre o mapa.
63. **Preferências do aparelho fora do save** (localStorage): modo econômico, reduzir movimento e texto maior. Ficam por aparelho, não por herói. Sons ficam para o marco 2, como diz a especificação.
64. **Depois de uma ação do jogador o HUD mostra o valor novo na hora.** Normalmente ele acompanha o tick que a cena está mostrando (decisão 32), mas equipar, refinar e resetar não podem parecer atrasados.
65. **Depuração só em desenvolvimento** (Configurações): "ir para o nível 100" e "+ouro e materiais". Os testes e2e usam os dois para o reset e o refino.
66. **Desempenho:** 59,6 fps (quadro p99 de 16,8 ms) lutando, com perfil Pixel 7 e CPU 4× mais lenta. O teste de fps é opcional (`PERF=1`): máquinas de CI não têm GPU.
67. **Ficou de fora do marco 1:** a vila como cena própria (segue como sobreposição), monstros ambientes nas áreas de spawn e efeitos de habilidade em sprite (hoje é um anel colorido). Nada disso muda regra; entra com a arte final no marco 2.

## Resets cada vez mais rápidos (2026-10-16)

68. **Pontos de reset crescem:** 10 + 2 × resets já feitos + chefes inéditos × 2 (opção (a), aprovada pelo Victor ao pedir para seguir as recomendações). Muda a fórmula da seção 8.1; a masmorra do marco 3 ainda soma floor(andar ÷ 5).
69. **Sabedoria com custo fixo:** 4 pontos por nível, até o nível 40 (+400% de XP). As melhorias ganharam o campo `costPerLevel` (custo do nível n = baseCost + costPerLevel × (n − 1)); as outras continuam com custo crescente. Só a soma das duas mudanças cumpre a meta: com custo crescente, os ciclos estacionavam em ~1,5 dia.
70. **Resultado no simulador (perfil ativo, 2 sementes):** ciclos de 2,9/3,5 → 1,6 → 1,2–1,5 → 1,1–1,2 → 0,9 dia; mais de 10% mais rápido por reset até o 5º. Daí em diante o piso é o ritmo de sessões (o jogador só reseta quando abre o jogo, ~1 vez por dia), não o jogo.

## Marco 2 — tarefas 1 a 7 (2026-10-16, trabalho autônomo)

71. **Cartas:** uma por monstro; chance base 1/2.000 (comum) e 1/100 (chefe), ×4 para elites (1/500). Até 5 cópias. A proteção contra azar conta os abates do monstro desde a última cópia e dobra a chance depois de 3× o esperado. No offline, a binomial é dividida no abate em que a proteção começa. Bônus de região: Cinzarra +5% de vida, Morvel +5% de dano, Cidadela +5% de XP. Na amostragem da ficha de taxas não se coletam cartas (elas deixavam o herói mais forte no meio da medição e distorciam os abates em 5%); a taxa de cartas é calculada de forma exata.
72. **Elites com afixos:** 1 ou 2 entre Veloz (+50% vel. de ataque), Brutal (+50% de dano), Blindado (+150% de defesa), Vampírico (cura 25% do dano causado) e Gigante (+100% de vida), em conteúdo (`elites.json`). Aparecem no nome, com a cor do primeiro afixo.
73. **Reforja:** só raro ou melhor; custo de 20 × iLvl² de ouro mais materiais por raridade (raro: 5 essências + 3 cristais; épico: 5 cristais + 2 núcleos; lendário: 3 núcleos + 1 alma). O afixo novo nunca repete os outros. O cache de atributos agora inclui os afixos de cada item, porque a reforja muda o item no lugar.
74. **Lendários únicos (adiantados do marco 3):** 8 efeitos genéricos com números em conteúdo (`uniques.json`). Um lendário de um espaço com efeitos sorteia um deles além dos 4 afixos. Os efeitos com condição (execução, primeiro golpe, último fôlego, espinhos, cura no crítico) são aplicados golpe a golpe no engine.
75. **Metas:** 3 diárias e 1 semanal, geradas com um RNG próprio a partir do número do dia local, então o RNG do jogo não muda. O dia vem do cliente (meia-noite local; a semana começa na segunda). Metas de um dia que passou somem sem resgate. As recompensas são materiais e amuletos de proteção.
76. **Sons sintetizados** (Web Audio): sem arquivos, então sem licença. No máximo 4 sons a cada 100 ms. Tremor de tela, pausa curta no golpe e clarões desligam com "reduzir movimento".
77. **PWA:** `vite-plugin-pwa` 1.3.0 (a 2.0.0 tinha menos de duas semanas). O service worker faz pré-cache de tudo, inclusive os mapas `.tmj`; a fonte usa stale-while-revalidate. Os ícones são gerados por código. Só existe no build de produção; a CI agora roda o build.
78. **Avisos** em segundo plano: poções acabando, nível 100 e limite offline, previstos pela ficha de taxas quando a página some e cancelados quando ela volta. "Mochila cheia" ficou de fora: o herói já volta à vila sozinho, não há o que o jogador fazer. Com o jogo fechado, só com push do servidor.
79. **Balanceamento depois do marco 2:** equipamento cai em 6% dos abates (antes 12%) e lendários só em caçadas de iLvl 45 ou mais. Simulador: primeiro lendário com mediana de 1,5 dia (0,9 a 2,4 em 12 sementes) e primeiro nível 100 no dia 3,5. A tabela de raridade da seção 7.2 não mudou.
80. **Formato do save chegou à versão 6** (cartas, afixos de elite, lendários únicos, metas), com migração e teste para cada passo.

## Arte (2026-10-16)

81. **Assets gratuitos CC0 da Kenney** (pedido do Victor: "gratuitos ou autorais"): Tiny Dungeon (herói, monstros, lápide, porta) e Tiny Town (grama, terra, árvore, cogumelos, pedra, muro). CC0 permite uso comercial sem crédito obrigatório; mesmo assim, os créditos estão em `assets/CREDITS.md` e a licença original fica junto dos arquivos em `assets/vendor/`. Descartei packs com licença "share-alike" (CC-BY-SA/GPL), que obrigariam a abrir os assets derivados.
82. **Escala 2×:** os packs são de 16 px e o jogo usa tiles de 32 px. A escala inteira mantém o pixel art nítido. O que os packs não têm (água, lama, lava, ossos, ícones do app) continua autoral, desenhado por código e reduzido à mesma densidade de 16 px.
83. **Tileset montado por script** (`pnpm art`) com os mesmos ids de tile do gerador de mapas, então os mapas do Tiled continuam válidos. Objetos da camada de decoração têm fundo transparente. Ganhamos 2 tiles de chão para a Cidadela (terra escura e entulho).
84. **Monstros com sprite compartilhado:** são 27 monstros para cerca de 12 sprites da Kenney. Os parecidos dividem o sprite, com a cor do conteúdo (`tint`) clareada 45% para não escurecer demais. Chefes ficam maiores (escala do conteúdo).
85. **Uma frente só:** os sprites da Kenney olham para a frente. Esquerda e direita são espelhadas; cima e baixo usam o mesmo quadro. As animações seguem por tweens com o tempo do manifesto. A seção 4.3 pede 4 direções; isso volta quando houver arte com 4 direções.
86. **Clima de fantasia sombria por cima de tiles claros:** a cena escurece o mapa por região (Cinzarra crepuscular, Morvel esverdeado, Cidadela avermelhada) sem alterar os arquivos originais.
87. **Criação de herói:** a escolha de cor de cabelo e roupa virou escolha entre 4 visuais de guerreiro da Kenney (o campo `hair` continua no save, sem uso).

## Terreno com o OpenTibia Sprite Pack (2026-10-16)

88. **Fankit do Tibia descartado; OpenTibia Sprite Pack aceito só para terreno.** Os termos do fankit da CipSoft proíbem uso fora de vídeos e capturas, e a restrição 1 do prompt proíbe sprites de franquias. O OpenTibia Sprite Pack é arte feita pela comunidade, sob CC BY 4.0 (uso comercial permitido, com crédito e indicação de mudanças). Usamos só chão, bordas, água, plantas, árvores e rochas (`otsp_tiles_01` e `otsp_nature_01`). Criaturas, itens e o logotipo do pack ficam de fora, porque parte deles imita o Tibia de perto. As pastas de referência (`TibiaFankit/`, `canary-sprite-pack-main/`, `opentibia_sprite_pack-master/`, `sprites/` e os zips) ficam no `.gitignore` e não entram no repositório.
89. **Bordas automáticas:** a grama é a camada "de cima" e a terra, a lama e a água ficam "embaixo". O gerador de mapas põe em cada tile de baixo as peças de borda dos vizinhos: bordas retas, cantos grandes (dois lados) e cantos pequenos (só na diagonal). Elas ficam em camadas `border1..N` do Tiled. Na água, só bordas retas, senão uma poça pequena some sob a grama. Por isso a água vem em poças de 2×2 ou maiores.
90. **Árvores e rochas de 64 px** viram objetos de tile numa camada `props` (folha própria, `sprites/props.png`). Bloqueiam o tile do tronco, e a copa cobre os tiles de trás. No jogo, ficam ordenadas pela base, como os pés dos personagens, então quem passa atrás da copa some atrás dela. A borda do mapa virou mata fechada ou paredão de pedra, aberta só onde o caminho sai para a vila.
91. **Arte própria onde o pack não tem:** lápides, ossos e lava (4 quadros, padrão contínuo de 2×2 tiles) são desenhados por código no estilo do pack (contorno escuro, luz de cima à esquerda). O Tiny Town da Kenney saiu: nada dele é usado agora.
92. **Desempenho:** bordas, decoração e as árvores longe de onde se anda são desenhadas uma vez numa textura só. Sobram o chão (que tem água e lava animadas), essa textura e as árvores perto da rota. No perfil de celular com CPU 4× mais lenta: 56,8 fps (eram 59,7 antes do terreno novo; o limite é 55).
93. **Créditos no jogo** (Configurações → Créditos) e em `assets/CREDITS.md`, com autores, link da licença, link do pack e a lista das mudanças, como pede a CC BY. As folhas originais, a licença e a lista de autores vão junto do build (`vendor/opentibia-sprite-pack/`), mas ficam fora do pré-cache do PWA.

## Sprites animados, efeitos e interface nova (2026-10-17)

94. **Personagens animados do 16x16 DungeonTileset II, de 0x72 (CC0, conferido na página do itch.io).** O herói tem 4 visuais (cavaleiro, cavaleira, anão e homem-lagarto) e os 27 monstros usam 18 personagens do pack, com a cor do conteúdo clareada 60%. Todos têm ciclo de parado e de corrida (4 quadros cada), e alguns têm um quadro de dano. Os quadros vão para uma folha própria (`sprites/actors.png`, células de 32×36 com os pés embaixo), e `pnpm art` escreve os números no `manifest.json`. O Tiny Dungeon da Kenney saiu do jogo.
95. **O herói segura uma espada** (sprite do mesmo pack) que gira no golpe: recua antes e acerta no quadro de impacto do manifesto. Os sprites olham para a direita; a esquerda é espelhada e cima/baixo mantêm o último lado.
96. **Efeitos de habilidade com o Particle Pack da Kenney (CC0)**, reduzido a 128 px e tingido no jogo: corte no ataque básico, estrela no crítico, golpe pesado em laranja, redemoinho girando no herói, grito de guerra em anel vermelho, investida com rastro e estrelas de atordoamento, fumaça na morte, brilho na poção e luz dourada ao subir de nível. O efeito de cada habilidade vem do campo `effect` do conteúdo.
97. **Ícones do game-icons.net (CC BY 3.0)** para navegação, recursos, atributos, as 12 habilidades e as 40 bases de item. São SVGs coloridos por CSS, gerados em `ui/icons.generated.ts`. A lista de cada ícone com o autor fica em `assets/vendor/game-icons/ICONS.md` e o crédito, em Configurações → Créditos.
98. **Interface sem botão "Menu"** (padrão de idles para celular, com abas embaixo e atalhos de lado): barra inferior com Personagem, Habilidades, Mochila (botão grande no centro, com a ocupação), Ferreiro e Configurações; coluna à esquerda com Metas, Caçadas, Cartas, Altar e Filtro. Cada ícone tem selo quando há algo pendente. "Salvar" fica dentro de Configurações. O retrato do herói é o sprite animado e abre a ficha. As habilidades ativas aparecem com ícone e varredura de recarga.
99. **Visual:** painéis de vidro escuro com cantos arredondados, barras com degradê, recursos em "pílulas" no topo. Tirei o `backdrop-filter` (desfoque), porque custa caro por cima do canvas.
100.  **Desempenho:** neste momento a máquina está mais carregada (o próprio commit anterior mede 46 fps no teste, contra 56,8 antes). Nas mesmas condições, a versão nova mede cerca de 41 a 43 fps: os efeitos custam ~3 fps e as animações, ~1 a 2. O teste de fps (limite 55) precisa ser repetido com a máquina livre.

## Perguntas para revisão

- ~~**Resets cada vez mais rápidos (seção 12.2):** a meta "cada reset chega ao 100 pelo menos 10% mais rápido que o anterior, até o reset 10" não é atingida. No simulador (perfil ativo), os ciclos ficam em 3,0 → 1,9 → 1,8 → 1,6 → 1,7 → 1,8 → 1,4 dias: caem no começo e depois estabilizam. Com 10 pontos por reset (a fórmula da seção 8.1, até a masmorra do marco 3) e a Sabedoria dando +10% de XP por nível com custo linear, o bônus de XP não cresce 10% a cada ciclo. Opções: (a) pontos de reset crescerem com o número do reset (ex.: 10 + 2 × resets); (b) Sabedoria multiplicativa (×1,1 por nível); (c) aceitar até a masmorra existir. Recomendo (a), porque é uma linha de conteúdo/constante e mantém a loja simples.~~ Resolvido: decisões 68–70.
- **Primeiro lendário:** entre 0,5 e 1,8 dia conforme a semente (meta 1–3). Com uma chance de 0,1% por drop, a variação é grande; com 2 sementes não dá para concluir. Proponho medir com 20 sementes no alpha.
