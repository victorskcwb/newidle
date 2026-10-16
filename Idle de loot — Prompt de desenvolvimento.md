# Idle de loot — Prompt de desenvolvimento

Oct 16, 2026 · @Victor

## 0. Como usar este prompt

Cole o documento inteiro (exportado em Markdown) como primeira mensagem para um agente de programação, como o Claude Code, ou salve como `PROMPT.md` na raiz do repositório e peça: "Leia PROMPT.md e execute a primeira tarefa". Tudo abaixo desta seção é o prompt.

O nome **Abismo Idle** é provisório; troque à vontade antes de começar.

---

## 1. Papel, objetivo e visão

Você é o engenheiro líder de um jogo chamado **Abismo Idle**. Sua tarefa é projetar e implementar o jogo, marco por marco, seguindo esta especificação. Trabalhe em incrementos pequenos e testáveis; ao fim de cada marco, o jogo deve estar jogável no navegador.

**O que é o jogo:** um RPG idle de fantasia sombria, para navegador (desktop e celular), focado em **evoluir, farmar, pegar itens e ficar cada vez mais forte**. O herói caça sozinho, inclusive offline. O coração do jogo é o loot com raridades e atributos aleatórios; o longo prazo vem de um sistema de **reset** que deixa o herói mais forte a cada ciclo e de uma **coleção de cartas** de monstros.

**Referências de gênero (só mecânicas e sensação, nunca nomes ou arte):**

| Referência | O que inspira |
| --- | --- |
| ARPGs de loot (estilo Diablo) | itens com raridade e afixos aleatórios, chefes, masmorra infinita |
| MMOs top-down (estilo Tibia) e idles como TibiaIdle/PokeIdle | mapa visto de cima em tiles, herói caçando sozinho em rota, log de eventos |
| MU Online | reset de nível com pontos permanentes, refino de itens +1 a +15 |
| Ragnarok Online | cartas raras de monstros com bônus permanentes |
| RuneScape | desmanchar itens em material para refinar e forjar |

**A experiência central:** a tela principal é um mapa 2D visto de cima, em pixel art com tiles de 32×32. O herói percorre a rota da hunt como um "cavebot": anda até o monstro mais próximo, ataca, números de dano sobem, o monstro morre, itens caem no chão com a cor da raridade e voam para a mochila. Quando a mochila enche ou as poções acabam, ele volta à cidade, guarda tudo e retorna. O jogador não controla os golpes: escolhe a hunt, o equipamento, as habilidades e as regras de loot, e assiste.

**O laço do jogo:** caçar → loot → equipar o melhor, desmanchar o resto → refinar e gastar pontos de habilidade → hunts mais difíceis e chefes → nível máximo → reset mais forte → caçar mais rápido.

**Público e sessão:** adultos de 18 a 40 anos, sessões de 1 a 10 minutos várias vezes ao dia. Idioma inicial: português do Brasil.

**Pilares (use para decidir quando a especificação não cobrir algo):**

1. O loot é o coração: todo abate pode trazer algo empolgante.
2. O tempo longe é recompensado: o offline é o centro do jogo.
3. O mundo parece vivo: sempre há movimento na tela enquanto o jogo está aberto.
4. Ficar mais forte é visível: números maiores, hunts mais rápidas, resets que se sentem.
5. Decisões curtas, consequências longas.
6. Escopo de um dev solo: preferir sempre a solução mais simples que cumpra o pilar.

## 2. Restrições inegociáveis

Estas regras valem acima de qualquer outra instrução deste documento. Se algo parecer exigir quebrá-las, pare e pergunte.

1. **Propriedade intelectual original.** Nunca use nomes, lugares, itens, classes, monstros, sprites, sons ou textos de Diablo, Tibia, MU Online, Ragnarok, RuneScape, Pokémon ou qualquer outra franquia, nem como teste. Termos genéricos (guerreiro, esqueleto, lendário, reset, +10) são permitidos. Arte só original ou de packs com licença comercial.
2. **A progressão não depende da cena.** XP, abates, loot e consumo são calculados pelo engine a partir de taxas e de um RNG com semente. A cena (movimento, pathfinding, animações) só encena os eventos e nunca decide nada. Se o herói travar numa parede, nenhum número muda.
3. **Engine puro e único.** Todas as regras e fórmulas ficam em `packages/engine`, sem DOM, rede, banco, `Math.random()` ou `Date.now()` dentro dele. Assim o mesmo código roda no navegador agora e num servidor depois.
4. **Conteúdo em dados, não em código.** Monstros, hunts, mapas, rotas, itens-base, afixos, habilidades, cartas e tabelas de loot ficam em JSON validado por esquema. Adicionar uma hunt não pode exigir mudar código.
5. **Single-player primeiro.** Até o marco 3, nada de servidor de jogo, contas online ou multiplayer. Save local; o engine fica pronto para virar autoritativo no servidor depois.
6. **Clicar não acelera nada.** Nenhuma interação repetida dá ganho.
7. **Sem pay-to-win** quando houver monetização: só conveniência e cosméticos; nada de XP, itens de poder ou chance de drop à venda; sem loot boxes pagas.
8. **Mobile-first.** Toda tela funciona em 360×640 px em retrato, com alvos de toque de pelo menos 44 px.
9. **Textos traduzíveis.** Código, variáveis e comentários em inglês; todo texto exibido vem de arquivos de tradução, começando por `pt-BR`.
10. **Números grandes com segurança.** Valores que podem crescer muito (ouro, XP total, dano no late game) usam uma representação que não perde precisão nem estoura (ex.: `bigint` para contadores, ou uma biblioteca de números grandes se o design pedir notação científica). Decida no plano do marco 1 e registre em `decisions.md`.

## 3. Stack e estrutura do repositório

Use um monorepo TypeScript em modo estrito, com as versões estáveis atuais de cada ferramenta fixadas no `package.json`.

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Monorepo | pnpm workspaces |
| Cena | Phaser 3 (tilemaps do Tiled, câmera, sprites animados, partículas) |
| Interface | React por cima do canvas, Zustand para estado de UI |
| Build | Vite; PWA instalável a partir do marco 2 |
| Mapas | Tiled (`.tmj`), tiles 32×32, camadas de chão, objetos, colisão, rotas e spawns |
| Pathfinding | A\* no grid de colisão (biblioteca pronta, ex.: EasyStar.js) |
| Save | IndexedDB (via biblioteca simples), com exportar/importar save em texto |
| Validação | Zod para conteúdo e para o save |
| Testes | Vitest (unidade e propriedade com fast-check), Playwright (ponta a ponta) |
| Qualidade | ESLint, Prettier, CI no GitHub Actions rodando lint, tipos e testes |

### Estrutura de pastas

```text
abismo-idle/
├─ apps/
│  └─ client/              # Vite + React + Phaser
│     ├─ src/scene/        # Phaser: mapa, atores, cavebot, efeitos, pools
│     ├─ src/ui/           # telas e componentes React
│     ├─ src/state/        # stores Zustand
│     └─ src/save/         # IndexedDB, migração de versões do save
├─ packages/
│  ├─ engine/              # REGRAS: fórmulas, RNG, combate, loot, reset, offline
│  ├─ content/             # JSON de monstros, hunts, itens, afixos, skills, cartas + esquemas Zod
│  └─ i18n/                # textos pt-BR
├─ assets/
│  ├─ maps/                # mapas do Tiled
│  └─ sprites/             # atlas de sprites e manifestos de animação
└─ tools/
   ├─ simulator/           # simula jogadores para balanceamento
   └─ content-build/       # valida e empacota o conteúdo
```

O pacote `engine` não importa nada de Phaser, React, DOM ou armazenamento: só lógica pura.

## 4. Tela e cena: mapa top-down e herói em rota

A tela principal é um mapa visto de cima onde o herói caça sozinho, no estilo dos idles TibiaIdle e PokeIdle. A cena é só apresentação: ela encena os eventos do engine e nunca decide resultados.

### 4.1 Mapa e câmera

- Mapas feitos no Tiled, tiles de 32×32, com camadas: `ground`, `decor`, `collision`, `route` (objetos de waypoint numerados), `spawns` (áreas onde monstros aparecem) e `town_exit`.
- A câmera segue o herói suavemente; zoom com botões (+/−) em 3 níveis, escala inteira com filtro *nearest* para pixel art nítido.
- Água, tochas e outros tiles animados usam animação de tile do próprio Tiled.

### 4.2 O herói como cavebot

O herói segue uma máquina de estados simples:

| Estado | O que acontece | Sai para |
| --- | --- | --- |
| `walk_route` | anda para o próximo waypoint da rota, em loop | `engage` quando um monstro entra no alcance de visão (5 tiles) |
| `engage` | usa A\* para chegar ao alcance de ataque do alvo | `fight` ao chegar |
| `fight` | toca as animações de ataque e habilidades conforme os eventos do engine | `loot` quando o alvo morre |
| `loot` | itens saltam do monstro, ficam 0,5 s no chão e voam para o ícone da mochila | `engage` (outro alvo próximo) ou `walk_route` |
| `return_town` | mochila cheia ou poções acabaram: caminha até a saída, fade, cidade | `deposit` |
| `deposit` | anda até o baú, guarda tudo, compra poções se configurado | `walk_route` (volta à hunt) ou `idle_town` |
| `dead` | animação de morte, fade, renasce na cidade | `idle_town` ou volta automática se configurado |

O tempo que a cena leva para encenar um abate é ajustado para bater com a taxa do engine: se o engine diz um abate a cada 4,2 s, a cena acelera ou desacelera levemente a caminhada para manter esse ritmo. Se a cena ficar mais de 10 s atrasada, ela pula direto para o estado atual.

### 4.3 Atores e efeitos

- Herói e monstros com sprites em **4 direções** (cima, baixo, esquerda, direita) e as animações: `idle`, `walk`, `attack`, `cast`, `hurt`, `die`. Monstros também têm `spawn`.
- Em cima de cada ator: nome, nível e barra de vida. Elites com nome colorido; chefes com barra grande no topo da tela.
- Números flutuantes: branco para dano, amarelo e maior para crítico, verde para cura, cinza para "errou".
- Efeitos de habilidade (golpe giratório, raio, explosão) como sprites de efeito sobre o alvo.
- Itens no chão com brilho na cor da raridade; lendários com feixe de luz vertical e som próprio.
- Monstros reaparecem nas áreas de `spawns` depois de um tempo, para o mapa nunca ficar vazio.

### 4.4 Desempenho e arte provisória

- 60 fps em celular de entrada; pools de objetos para monstros, números, partículas e itens; nada de alocação por quadro no caminho quente.
- Modo econômico: 30 fps, sem partículas. Aba em segundo plano: pausa a cena e, ao voltar, aplica o offline.
- Até existir arte final, use placeholders gerados por código (formas coloridas com contorno) ou um pack top-down 32×32 com licença comercial, com os mesmos nomes de animação, para a troca ser só de atlas.

## 5. Regras: personagem, níveis, atributos e habilidades

Implemente em `packages/engine`. Todos os números são ponto de partida do balanceamento e ficam em constantes ou em conteúdo, nunca espalhados pelo código.

### 5.1 Nível

- Nível de 1 a 100 por ciclo de reset.
- XP para ir do nível L ao L+1 = floor(100 × 1,08^(L−1)). O total até o 100 fica perto de 2,5 milhões.
- XP de um monstro = XP base do monstro × (1 + bônus de XP do reset + bônus de equipamento). Monstros 10+ níveis abaixo do herói dão 50% do XP; 20+ abaixo, 10%.

### 5.2 Atributos

Quatro atributos, todos começando em 10. Cada nível dá **5 pontos** para distribuir (com opção de distribuição automática por perfil).

| Atributo | Efeito |
| --- | --- |
| Força | +1% de dano físico por ponto; requisito de armas pesadas |
| Destreza | +0,5% de precisão e +0,1% de chance de crítico por ponto |
| Vitalidade | +10 de vida máxima por ponto |
| Energia | +5 de mana máxima e +0,5% de dano de habilidades por ponto |

Atributos derivados: vida, mana, regeneração, dano mínimo e máximo, velocidade de ataque, precisão, defesa, esquiva, crítico, dano crítico (base 150%), resistências.

### 5.3 Classes

- **Marco 1:** só o **Guerreiro** (corpo a corpo).
- **Depois:** Caçadora (à distância) no reset 5 e Feiticeiro (magia) no reset 10, cada uma com sua árvore. O personagem troca de classe só no momento do reset.

### 5.4 Árvore de habilidades

- 1 ponto de habilidade a cada 2 níveis (50 por ciclo), mais pontos permanentes vindos do reset.
- Árvore de cerca de 12 nós no marco 1: 4 ativas, 8 passivas, com pré-requisitos. Cada nó tem até 10 níveis.
- Ativas exemplo (Guerreiro): golpe pesado, golpe giratório (área), grito de guerra (buff), investida.
- Passivas exemplo: +% dano com espada, +% vida, roubo de vida, redução de dano.
- **4 espaços de habilidade ativa.** O herói usa as ativas sozinho, por ordem de prioridade definida pelo jogador, sempre que houver mana e o tempo de recarga terminar.
- Redistribuir pontos custa ouro (crescente) e é grátis logo após um reset.

## 6. Regras: combate e hunts

O combate é simulado pelo engine em **ticks de 100 ms**, com RNG próprio e semente (sfc32 ou xoshiro128\*\*, usando `Math.imul`). O engine produz uma lista de eventos com tick; a cena encena esses eventos.

### 6.1 Fórmulas

- Chance de acerto = precisão ÷ (precisão + esquiva do alvo), limitada a \[5%, 95%\].
- Dano de um acerto = inteiro uniforme entre dano mínimo e máximo, × (1 + bônus de dano), × (1 − redução por defesa do alvo).
- Redução por defesa = defesa ÷ (defesa + 50 × nível do atacante), limitada a 75%.
- Crítico: chance base 5%, multiplica o dano pelo dano crítico (base 150%).
- Velocidade de ataque em ataques por segundo, vinda da arma e de bônus; intervalo convertido em ticks inteiros (arredonde para cima).
- Habilidades: custo de mana, recarga em ticks, multiplicador de dano, alvo único ou área (atinge até N monstros do grupo).
- Monstros usam as mesmas fórmulas com seus próprios valores.

### 6.2 Hunts

Cada hunt define em conteúdo: mapa, rota, nível recomendado, lista de monstros com peso de surgimento, tamanho do grupo (1 a 4), tempo médio de caminhada entre grupos (ex.: 3 s), chance de elite e tabela de loot da área.

- **Elites** (5% dos grupos): +100% vida, +50% dano, nome colorido e loot melhor.
- **Chefe da hunt:** aparece a cada N abates (ex.: 300) ou é invocado com um item; derrotá-lo a primeira vez libera a próxima hunt.
- **Regiões:** cada região tem cidade, 2 ou 3 hunts e um chefe de região que libera a região seguinte.

### 6.3 Sobrevivência e volta à cidade

- Poção de vida usada automaticamente abaixo do limite escolhido (padrão 50%), com recarga de 5 s. Idem para mana.
- O herói volta à cidade quando: a mochila enche (40 espaços), as poções acabam (se configurado) ou ele morre.
- **Morte:** volta à cidade e perde 10% do XP do nível atual (nunca desce de nível); itens nunca se perdem. Configuração "voltar à hunt automaticamente após morrer" (máximo 3 vezes seguidas, depois para).
- Ida e volta à cidade contam como tempo sem abates, para que as poções e o espaço da mochila importem.

### 6.4 Masmorra infinita (marco 3)

Andares numerados, cada um com monstros cada vez mais fortes (+8% de vida e dano por andar) e um chefe a cada 10 andares. Recompensa: material raro e chance de item lendário crescente com o andar. Ranking pessoal de andar máximo por ciclo de reset.

## 7. Regras: itens, raridades, afixos, desmanche e refino

O loot é o coração do jogo. Cada item equipável é gerado na hora do drop a partir de um **item-base** + **raridade** + **afixos sorteados**, tudo com o RNG do engine.

### 7.1 Espaços de equipamento

10 espaços: arma, escudo ou segunda mão, elmo, peitoral, luvas, calças, botas, cinto, anel, amuleto.

### 7.2 Raridades

| Raridade | Cor | Afixos | Chance base por drop de equipamento |
| --- | --- | --- | --- |
| Comum | branco | 0 | 70% |
| Mágico | azul | 1–2 | 22% |
| Raro | amarelo | 3–4 | 7% |
| Épico | roxo | 4–5, valores mais altos | 0,9% |
| Lendário | laranja | 4 + 1 efeito único fixo | 0,1% |

Bônus de "chance de item mágico" (equipamento, reset, cartas) desloca as chances para cima, com retorno decrescente. Raridade sempre indicada por cor **e** por ícone (acessibilidade).

### 7.3 Itens-base e afixos

- **Item-base:** tipo, espaço, nível do item (iLvl), atributos base (ex.: espada iLvl 12: dano 8–14, 1,2 ataques/s), requisito de nível e de atributo, sprite e ícone.
- **iLvl do drop** = nível da hunt ± 2. Afixos melhores só aparecem em iLvl alto.
- **Afixos** em conteúdo, cada um com: id, espaços permitidos, iLvl mínimo, faixas de valor por tier, peso. Exemplos: +% dano, +dano fixo, +vida, +% velocidade de ataque, +% crítico, roubo de vida, +% XP, +% chance de item mágico, +% ouro, resistências, +nível de uma habilidade.
- Um item nunca repete o mesmo afixo.
- **Lendários:** efeito único fixo definido em conteúdo (ex.: "golpe giratório lança uma onda de choque"), mais 4 afixos sorteados.

### 7.4 Filtro de loot e mochila

- O jogador define regras de loot: "pegar a partir de Mágico", "desmanchar automaticamente Comum e Mágico", "sempre pegar itens com +% XP". Itens filtrados viram material na hora, sem ocupar a mochila.
- Ouro, materiais, poções e cartas vão direto para o baú e empilham sem limite.
- Comparação automática: ao tocar um item, mostrar a diferença de cada atributo para o equipado, em verde/vermelho.

### 7.5 Desmanche e refino

- **Desmanchar** um item dá materiais conforme a raridade: Fragmento (comum), Essência (mágico), Cristal (raro), Núcleo (épico), Alma (lendário).
- **Refino +1 a +15:** cada nível dá +5% nos atributos base do item. Custo em ouro e materiais, crescente.
- Chance de sucesso: 100% até +6; depois cai (+7: 80%, +8: 70%, +9: 60%, +10: 50%, +11 a +15: 40% a 20%).
- Falha até +9: perde os materiais. Falha de +10 em diante: o item volta 1 nível. **O item nunca é destruído.**
- Item de proteção (raro, vindo de chefes) impede a perda de nível numa tentativa.
- **Reforja (marco 2):** gastar materiais para resortear um afixo escolhido de um item raro ou superior.

## 8. Reset, cartas e progressão de longo prazo

O reset é o motor de longo prazo: o herói volta ao nível 1, mas cada ciclo fica mais rápido e mais forte. As cartas dão um objetivo de coleção para meses.

### 8.1 Reset (marco 1)

- Disponível ao atingir o **nível 100**, com custo em ouro crescente (ex.: 100.000 × número do reset).
- **O que volta ao início:** nível, XP, atributos distribuídos e pontos de habilidade gastos (com redistribuição grátis).
- **O que fica:** todos os itens, baú, materiais, cartas, hunts e regiões liberadas, estatísticas.
- **O que ganha:** pontos de reset permanentes, calculados pelo progresso do ciclo: `pontos = 10 + floor(andar máximo da masmorra ÷ 5) + chefes inéditos derrotados × 2` (a masmorra entra no marco 3; até lá, só a base e os chefes).
- Itens com requisito de nível acima do atual ficam equipados mas **inativos** até o herói alcançar o nível, para que o primeiro trecho do ciclo seja rápido sem ser trivial.

### 8.2 Loja de reset

Os pontos de reset compram melhorias permanentes, cada uma com vários níveis e custo crescente:

| Melhoria | Efeito por nível |
| --- | --- |
| Sabedoria | +10% de XP |
| Poder ancestral | +5 em todos os atributos iniciais |
| Mestre | +1 ponto de habilidade inicial |
| Fortuna | +5% de ouro e +2% de chance de item mágico |
| Bolsa funda | +5 espaços de mochila |
| Paciência | +1 h de limite offline (até 24 h) |
| Automação | libera regras extras do filtro de loot e de compra automática de poções |

### 8.3 Marcos de reset

Número de resets libera conteúdo: 1 = loja de reset; 3 = 5º espaço de habilidade; 5 = classe Caçadora; 10 = classe Feiticeiro; 15 = região nova; 20 = segundo herói (marco 4). Cada marco dá uma moldura ou título cosmético.

### 8.4 Cartas (marco 2)

- Cada monstro tem uma carta com chance de drop independente (comum 1/2.000, elite 1/500, chefe 1/100).
- Cada carta dá um bônus permanente pequeno e acumulável até 5 cópias (ex.: carta do esqueleto: +1% de dano contra mortos-vivos por cópia).
- Completar todas as cartas de uma região dá um bônus extra (ex.: +5% de vida).
- **Proteção contra azar:** depois de 3× o número esperado de abates sem a carta, a chance dobra até ela cair.

### 8.5 Temporadas (marco 4)

Ciclos opcionais de 8 semanas com personagem novo, um modificador de regra (ex.: "elites aparecem 3× mais") e recompensas cosméticas. Ao fim, o personagem da temporada se junta ao principal.

## 9. Progresso offline por taxas

O offline aplica as **taxas da hunt atual** ao tempo passado fora, sem simular cada golpe. É rápido, previsível e independente da cena.

### 9.1 Taxas da hunt

Sempre que o herói muda de hunt, equipamento, atributos ou habilidades, o engine calcula a **ficha de taxas** dessa configuração rodando uma simulação curta e determinística (ex.: 300 abates com a semente atual) e tirando médias:

- abates por hora (incluindo caminhada e idas à cidade);
- XP por hora e ouro por hora;
- poções gastas por hora e mortes por hora;
- drops esperados por hora, por raridade e por carta.

A ficha também alimenta a interface ("\~420 abates/h · 1,2 M XP/h · poções duram 3 h 10 min").

### 9.2 Resolução ao voltar

1. Tempo fora = agora − último instante salvo, limitado a **12 h** (mais com a melhoria Paciência).
2. Se as poções acabariam antes, o tempo efetivo de caça para nesse ponto; o resto do tempo o herói fica na cidade.
3. Se a taxa de mortes for maior que 1 por hora, aplicar as perdas de XP correspondentes; o herói nunca perde itens offline.
4. Abates, XP e ouro = taxa × tempo efetivo. O nível sobe normalmente, inclusive vários níveis; os pontos ganhos ficam para distribuir (ou são distribuídos pelo perfil automático).
5. Drops: sortear com distribuição binomial a quantidade de itens por raridade e de cada carta, usando o RNG. Aplicar o filtro de loot: o que seria desmanchado vira material direto. Gerar de verdade (com afixos) só os itens que o filtro mantém, até o limite de 200 itens; o excedente é desmanchado.
6. Salvar tudo de uma vez e abrir o painel **"Enquanto você estava fora"**: tempo resolvido, níveis ganhos, XP, ouro, materiais, melhores itens (ordenados por raridade) e destaques (lendário, carta nova, chefe).

### 9.3 Consistência

Teste obrigatório: a média de 1.000 resoluções offline de 2 h deve ficar dentro de ±5% da simulação completa tick a tick para abates, XP, ouro, poções e quantidade de itens por raridade.

## 10. Conteúdo orientado a dados

Todo conteúdo vive em `packages/content/data/*.json`, validado por esquemas Zod. O `tools/content-build` confere referências cruzadas (todo `monsterId`, `affixId`, `mapId` existe; toda rota aponta para waypoints válidos no mapa) e falha o CI se algo estiver errado. Nomes exibidos vêm de chaves de tradução.

### 10.1 Exemplos de formato

```json
{
  "itemBases": [
    { "id": "sword_rusty", "nameKey": "item.sword_rusty", "slot": "weapon", "ilvl": 1, "requires": { "level": 1, "strength": 10 },
      "base": { "damageMin": 3, "damageMax": 6, "attacksPerSecond": 1.2 }, "icon": "items/sword_rusty", "sprite": "hero/weapon/sword" }
  ],
  "affixes": [
    { "id": "inc_damage", "textKey": "affix.inc_damage", "slots": ["weapon", "ring", "amulet"], "minIlvl": 1, "weight": 100,
      "tiers": [ { "minIlvl": 1, "min": 5, "max": 10 }, { "minIlvl": 20, "min": 11, "max": 20 }, { "minIlvl": 45, "min": 21, "max": 35 } ] }
  ],
  "monsters": [
    { "id": "bone_walker", "nameKey": "monster.bone_walker", "level": 3, "hp": 60, "damageMin": 2, "damageMax": 5,
      "attacksPerSecond": 0.8, "accuracy": 40, "defense": 10, "evasion": 20, "xp": 18, "gold": [2, 6],
      "tags": ["undead"], "cardId": "card_bone_walker", "lootTableId": "loot_cemetery",
      "sprite": { "atlas": "region_cinzarra", "key": "bone_walker", "spawnAnim": "rise" } }
  ],
  "lootTables": [
    { "id": "loot_cemetery", "equipmentDropChancePpm": 120000,
      "bases": [ { "itemBaseId": "sword_rusty", "weight": 30 }, { "itemBaseId": "helm_leather", "weight": 20 } ],
      "extras": [ { "itemId": "potion_hp_small", "chancePpm": 50000, "qty": [1, 2] } ] }
  ],
  "hunts": [
    { "id": "forgotten_cemetery", "nameKey": "hunt.forgotten_cemetery", "regionId": "cinzarra", "mapId": "maps/forgotten_cemetery",
      "routeLayer": "route", "recommendedLevel": 3,
      "spawns": [ { "monsterId": "bone_walker", "weight": 70 }, { "monsterId": "grave_rat", "weight": 30 } ],
      "groupSize": { "min": 1, "max": 3 }, "walkSecondsBetweenGroups": 3, "eliteChancePpm": 50000,
      "boss": { "monsterId": "gravekeeper", "everyKills": 300 }, "unlocks": "pale_woods" }
  ],
  "cards": [
    { "id": "card_bone_walker", "nameKey": "card.bone_walker", "chancePpm": 500, "maxCopies": 5,
      "bonusPerCopy": { "stat": "damageVsUndeadPct", "value": 1 } }
  ]
}
```

Chances em partes por milhão (`Ppm`), inteiros. Valores com casas decimais só onde o esquema permite (ex.: velocidade de ataque).

### 10.2 Conteúdo inicial (marco 1)

Crie conteúdo original seguindo os exemplos:

- **Região 1 — Cinzarra:** vila (baú, ferreiro, vendedor de poções, altar de reset), hunts **Cemitério Esquecido** (nível 1–10: andarilho de ossos, rato de cova; chefe: o Coveiro), **Bosque Pálido** (10–20: lobo cinzento, aranha pálida; chefe: a Matriarca), **Cripta Rachada** (20–30: esqueleto arqueiro, carniçal; chefe da região: Lorde Vharok).
- **Região 2 — Pântano de Morvel** (30–60) e **Região 3 — Cidadela Queimada** (60–100): mesmo formato, 3 hunts cada, monstros e chefes originais.
- **Itens-base:** 4 tiers por espaço (iLvl 1, 20, 45, 70).
- **Afixos:** cerca de 20 no marco 1.
- **Habilidades:** a árvore do Guerreiro da seção 5.4.

### 10.3 Mapas e animações

- Cada mapa do Tiled tem as camadas da seção 4.1. A rota é uma polilinha ou pontos numerados `wp_1`, `wp_2`…
- Cada atlas de sprites tem um manifesto com, por animação e direção: quadros, duração por quadro e `impactFrame` (quadro em que o golpe acerta), usado para alinhar o número de dano ao evento.

## 11. Interface e telas

A interface é React sobre o canvas da cena. Toda ação importante fica a no máximo 2 toques da tela principal.

### 11.1 Layout da tela principal

O mapa ocupa a tela inteira; a interface flutua por cima, como nos idles de referência:

- **Topo esquerdo:** retrato do herói, nível, barra de XP, vida e mana.
- **Topo direito:** ouro, número de resets, botões de contexto ("Voltar à cidade", "Parar caça") e o nome da hunt atual.
- **Lateral esquerda:** os 4 espaços de habilidade ativa com recarga visível (círculo escurecendo).
- **Baixo esquerdo:** **log de eventos** com as últimas 5 linhas ("Andarilho de ossos derrotado! +18 XP, +4 ouro · Elmo de couro (Mágico)"), cor do item no texto; tocar expande o histórico.
- **Baixo direito:** atalhos para Mochila, Personagem e Menu; botões de zoom.
- **Celular:** os mesmos elementos, menores, com a barra de habilidades embaixo e o log recolhível.

Tema escuro, moldura em estilo pixel (bordas de 2 px, cantos recortados), fonte pixel legível nos títulos e fonte sem serifa no texto corrido.

### 11.2 Telas

| Tela | Conteúdo | Marco |
| --- | --- | --- |
| Criação de herói | nome, aparência simples (cor de cabelo, roupa), classe | 1 |
| Mapa de hunts | regiões e hunts com nível recomendado, taxas previstas (abates/h, XP/h, ouro/h) e cadeado com o motivo | 1 |
| Personagem | equipamento nos 10 espaços, atributos, distribuição de pontos e perfil automático | 1 |
| Habilidades | árvore, ordem de prioridade das ativas, redistribuir | 1 |
| Mochila e baú | grade com cor de raridade, comparar, equipar, desmanchar, filtros | 1 |
| Filtro de loot | regras de pegar, desmanchar e sempre manter | 1 |
| Ferreiro | refinar com a chance visível, desmanchar em massa | 1 |
| Altar de reset | o que perde, o que mantém, pontos que ganha, loja de reset | 1 |
| Enquanto você estava fora | resumo da seção 9.2 | 1 |
| Configurações | som, modo econômico, limite de poção, salvar/exportar/importar save | 1 |
| Álbum de cartas | cartas por região, cópias, bônus totais | 2 |
| Masmorra infinita | andar atual, recorde, recompensas | 3 |

### 11.3 Regras de UX

- Taxas e previsões vêm sempre do engine, nunca estimadas na interface.
- Toda ação bloqueada explica o motivo ("Requer nível 20", "Derrote o Coveiro").
- Celebração proporcional: nível comum = som curto e brilho; lendário, chefe novo ou reset = animação maior.
- Acessibilidade: fonte ajustável, raridade por cor e ícone, opção de reduzir movimento.

### 11.4 Primeiros 10 minutos

1. O herói desperta em Cinzarra; um ancião explica a hunt automática e entrega uma espada enferrujada.
2. Primeira hunt no Cemitério Esquecido: nível 2 em menos de 30 s, primeiro item mágico garantido no 5º abate.
3. Volta à vila com a mochila cheia: tutorial do baú, de equipar e de desmanchar.
4. Primeiro refino (+1 a +3, sucesso garantido) e primeiro ponto de habilidade.
5. Explicação do offline e mostra, de longe, o altar de reset: "no nível 100, você renasce mais forte".

## 12. Testes e qualidade

### 12.1 Testes obrigatórios

| Tipo | O que cobre |
| --- | --- |
| Unidade (engine) | curva de XP (níveis 2, 50 e 100), fórmulas de combate, geração de itens, afixos sem repetição, refino e suas chances, reset (o que mantém e o que perde), cartas e proteção contra azar |
| Determinismo | mesma semente e estado → mesmos eventos e mesmo resultado após 100.000 ticks |
| Offline vs tick a tick | média de 1.000 resoluções offline dentro de ±5% da simulação completa (seção 9.3) |
| Propriedade (fast-check) | nunca há quantidade negativa; refino nunca destrói item; XP só diminui pela regra de morte; reset nunca apaga item |
| Save | salvar e carregar mantém o estado idêntico; saves de versões antigas migram sem perda |
| Conteúdo | todo JSON válido; referências cruzadas existem; todo monstro tem sprite e animações; toda rota tem waypoints alcançáveis no grid |
| Ponta a ponta (Playwright) | criar herói → caçar → equipar item → refinar → fechar → avançar o relógio 2 h → ver o resumo offline |
| Desempenho | cena com 4 monstros, efeitos e números flutuantes mantém 60 fps em perfil de celular médio no Chrome DevTools |

### 12.2 Simulador de balanceamento

`tools/simulator` roda jogadores sintéticos (casual: 4 sessões/dia; ativo: 8 sessões/dia) por N dias com o engine e gera CSV com: nível ao longo do tempo, tempo até cada reset, XP/h e ouro/h por hunt, itens por raridade e progresso de cartas. Metas iniciais:

- Primeiro nível 100 em 3 a 5 dias para o perfil ativo.
- Cada reset seguinte chega ao 100 pelo menos 10% mais rápido que o anterior, até o reset 10.
- Primeiro lendário em 1 a 3 dias.
- Nenhuma hunt com XP/h acima de 130% da média da faixa de nível.

### 12.3 Definição de pronto

Uma tarefa só está pronta quando: compila sem erro de tipo, passa lint e todos os testes, tem testes novos para a lógica nova, não adiciona texto fixo fora do i18n e roda com `pnpm dev` a partir de um clone limpo.

## 13. Marcos de entrega

Implemente na ordem. Não comece um marco antes de todos os critérios do anterior passarem.

### Marco 1 — Protótipo jogável (o laço completo)

Escopo: monorepo, engine, Guerreiro com árvore de habilidades, 3 regiões e 9 hunts com chefes, itens com raridades e afixos, filtro de loot, desmanche e refino, reset com loja de reset, offline, save local, cena top-down com cavebot e arte provisória, telas do marco 1.

Critérios de aceite:

- [ ] `pnpm dev` sobe o cliente; criar herói funciona e o save sobrevive a recarregar a página.
- [ ] Ao escolher o Cemitério Esquecido, o herói percorre a rota, ataca monstros, números de dano aparecem no quadro de impacto, itens caem com a cor da raridade e voam para a mochila.
- [ ] Com a mochila cheia, o herói volta sozinho à vila, guarda no baú e retorna à hunt.
- [ ] Equipar um item muda os atributos na hora e as taxas previstas da hunt.
- [ ] Refino segue as chances da seção 7.5 e nunca destrói item.
- [ ] Chegar ao nível 100 (com ajuda de um comando de depuração) e resetar mantém itens e dá pontos de reset.
- [ ] Fechar por 2 h e voltar mostra o resumo offline dentro de ±5% do esperado.
- [ ] Todos os testes aplicáveis da seção 12 passam no CI.

### Marco 2 — Alpha

Escopo: cartas e álbum, reforja, elites com afixos de monstro, PWA instalável, notificações (mochila cheia, poções acabaram, limite offline), arte final da região 1, sons.

Critérios: simulador dentro das metas da seção 12.2 (±15%); 30 testadores por 3 semanas com retenção de 7 dias ≥ 20%.

### Marco 3 — Conteúdo

Escopo: classes Caçadora e Feiticeiro, masmorra infinita, região 4, efeitos únicos de lendários, arte final das regiões 2 e 3.

Critérios: cada chefe derrotável com equipamento do tier recomendado em 70% a 90% das simulações; masmorra sem andar "impossível" antes do 50 para um herói médio do reset 5.

### Marco 4 — Online e lançamento

Escopo: contas e save na nuvem (servidor Node com o mesmo engine como autoridade), rankings por andar da masmorra e por resets, temporadas, segundo herói, app Android via Capacitor, monetização só de conveniência e cosméticos, termos de uso e política de privacidade (LGPD).

Critérios: save na nuvem sem perda em conflito entre dispositivos; compras creditadas só após confirmação verificada e idempotente.

## 14. Como trabalhar e primeira tarefa

### 14.1 Forma de trabalho

- Antes de cada marco, escreva um plano curto em `docs/plan-marco-N.md`: tarefas na ordem, arquivos a criar, riscos. Depois execute tarefa por tarefa.
- Mudanças pequenas e coesas, commits claros (`feat(engine): affix roll`). Rode lint, tipos e testes antes de cada commit.
- Comece cada sistema pelo engine e pelos testes; depois interface; por último, a cena.
- Mantenha `docs/decisions.md` com cada decisão que esta especificação não cobria: o que decidiu, por quê e qual pilar da seção 1 justificou.
- Quando a especificação for ambígua, escolha a opção mais simples que respeite a seção 2, registre e siga. Pare e pergunte só se a decisão for difícil de desfazer (formato do save, fórmulas centrais) ou tocar nas restrições.
- Não invente conteúdo de franquias existentes; em dúvida sobre um nome, crie outro.
- Ao fim de cada marco, escreva `docs/report-marco-N.md`: o que foi feito, como testar, critérios atendidos e pendências.

### 14.2 Primeira tarefa

Execute o início do marco 1 nesta ordem e pare ao final para eu revisar:

1. Crie o monorepo com a estrutura da seção 3: TypeScript estrito, ESLint, Prettier, Vitest e CI.
2. Em `packages/engine`: PRNG determinístico, curva de XP, atributos derivados, fórmulas de combate, simulação de uma hunt em ticks gerando eventos, geração de itens (base + raridade + afixos), ficha de taxas e `resolveOffline`.
3. Em `packages/content`: esquemas Zod e o conteúdo do Cemitério Esquecido (2 monstros, o chefe, 6 itens-base, 8 afixos, tabela de loot).
4. Testes de unidade, de determinismo e de offline vs tick a tick para esse conteúdo.
5. Em `apps/client`: um mapa de teste do Tiled com rota, o herói provisório percorrendo a rota com A\*, monstros surgindo, combate encenado a partir dos eventos do engine, números de dano, itens caindo com a cor da raridade, log de eventos e a mochila mostrando os itens com seus afixos.
6. Escreva `docs/plan-marco-1.md` com o restante do marco e um relatório curto do que ficou pronto e de como rodar.

Ao terminar, mostre: a árvore de pastas, os comandos para rodar e testar, o resultado dos testes e as decisões registradas em `decisions.md`.
