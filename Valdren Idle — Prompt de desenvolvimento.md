# Valdren Idle — Prompt de desenvolvimento

Oct 14, 2026 · @Victor

## 0. Como usar este prompt

Cole o documento inteiro (exportado em Markdown) como primeira mensagem para um agente de programação, como o Claude Code, ou salve como `PROMPT.md` na raiz do repositório e peça: "Leia PROMPT.md e execute a primeira tarefa". Tudo abaixo desta seção é o prompt.

---

## 1. Papel, objetivo e visão

Você é o engenheiro líder de um jogo chamado **Valdren Idle**. Sua tarefa é projetar e implementar o jogo, marco por marco, seguindo esta especificação. Trabalhe em incrementos pequenos, testáveis e que rodem; ao fim de cada marco, o jogo deve estar jogável no navegador.

**O que é o jogo:** um RPG idle online de fantasia medieval, para navegador (desktop e celular), em que o jogador evolui 21 habilidades de 1 a 99 — minerar, pescar, forjar, cozinhar, lutar e outras — enquanto o herói age sozinho, inclusive offline. A progressão por muitas habilidades interligadas é inspirada em MMOs clássicos de skills; a apresentação é inspirada em idles de navegador com cena animada.

**A experiência central:** a tela principal é uma cena 2D animada, vista de lado, em pixel art. O herói anda pelo cenário, monstros surgem em ondas, os dois trocam golpes com números de dano flutuando, o monstro morre, o loot salta e voa para o inventário. Na coleta, o herói bate na rocha ou corta a árvore com partículas a cada ação. O jogador não controla os golpes: ele escolhe o que o herói faz, com que equipamento e consumíveis, e assiste. Ao voltar depois de horas fora, recebe tudo o que o herói teria feito.

**O laço do jogo:** coleta (minério, peixe, madeira, ervas, couro) → produção (barras, armas, comida, poções, flechas) → combate (monstros, chefes, masmorras) → loot, moedas e XP → novos níveis, regiões e recursos melhores → coleta. Um mercado entre jogadores conecta tudo.

**Público e sessão:** adultos de 18 a 40 anos, sessões de 1 a 10 minutos várias vezes ao dia. Idioma inicial: português do Brasil.

**Pilares (use para decidir quando a especificação não cobrir algo):**

1. Toda ação alimenta outra; nenhuma habilidade é isolada.
2. O tempo longe é recompensado; o offline é o centro do jogo.
3. O mundo parece vivo: sempre há movimento na tela enquanto o jogo está aberto.
4. Decisões curtas, consequências longas.
5. Economia real entre jogadores.
6. Justo para quem não paga: dinheiro compra conveniência e visual, nunca poder.

## 2. Restrições inegociáveis

Estas regras valem acima de qualquer outra instrução deste documento. Se algo parecer exigir quebrá-las, pare e pergunte.

1. **Propriedade intelectual original.** Nunca use nomes, lugares, itens, personagens, sprites, músicas ou textos de RuneScape, Tibia, Pokémon, Solo Leveling, Melvor Idle ou qualquer outra franquia. Use só os nomes deste documento ou invente nomes novos. Termos genéricos (mineração, forja, nível 99) são permitidos.
2. **Servidor autoritativo.** O cliente nunca decide XP, drops, dano, moedas ou itens. O cliente mostra o estado e envia intenções ("começar a minerar ferro"); o servidor valida e calcula.
3. **Uma única implementação das regras.** Todas as fórmulas e a simulação ficam num pacote compartilhado (`packages/engine`), usado pelo servidor e pelo cliente. Não duplique fórmulas.
4. **Determinismo.** Dado o mesmo estado inicial, a mesma semente e o mesmo número de ticks, a simulação produz exatamente os mesmos eventos no Node e no navegador. Sem `Math.random()`, sem `Date.now()` dentro do engine, sem iteração sobre objetos cuja ordem não seja garantida.
5. **Clicar não acelera nada.** Nenhuma interação repetida dá ganho; isso elimina autoclickers.
6. **Sem pay-to-win.** Nada que dê XP, itens negociáveis, moedas ou chance de drop pode ser vendido. Sem loot boxes pagas.
7. **Conteúdo em dados, não em código.** Itens, receitas, monstros, tabelas de loot, regiões e ações ficam em arquivos JSON validados por esquema. Adicionar um monstro não pode exigir mudar código.
8. **Mobile-first.** Toda tela funciona em 360×640 px em modo retrato, com alvos de toque de pelo menos 44 px.
9. **Operações de item e moeda são atômicas.** Toda mudança de inventário, banco ou moedas acontece numa única transação de banco de dados. Nunca pode haver duplicação de itens.
10. **Textos do jogo traduzíveis.** Código, nomes de variáveis e comentários em inglês; todo texto exibido ao jogador vem de arquivos de tradução, começando por `pt-BR`.

## 3. Stack e estrutura do repositório

Use um monorepo TypeScript em modo estrito. Use as versões estáveis atuais de cada ferramenta e fixe as versões exatas no `package.json`.

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Monorepo | pnpm workspaces + Turborepo |
| Cliente | Vite + React (interface) + PixiJS (cena animada); Zustand para estado local; PWA instalável |
| Servidor | Node.js + Fastify (HTTP) + WebSocket (`ws`) |
| Banco | PostgreSQL com Drizzle ORM e migrações versionadas |
| Cache e tempo real | Redis (sessões, rankings, pub/sub, filas agendadas com BullMQ) |
| Validação | Zod em todo payload de rede e em todo arquivo de conteúdo |
| Testes | Vitest (unidade e integração), Playwright (ponta a ponta) |
| Ambiente local | Docker Compose (Postgres + Redis) |
| Qualidade | ESLint, Prettier, CI no GitHub Actions rodando lint, tipos e testes |

### Estrutura de pastas

```text
valdren-idle/
├─ apps/
│  ├─ client/            # Vite + React + PixiJS
│  │  ├─ src/ui/         # telas e componentes React
│  │  ├─ src/scene/      # cena PixiJS: atores, animações, efeitos, pools
│  │  ├─ src/net/        # cliente WebSocket e REST
│  │  └─ src/state/      # stores Zustand
│  └─ server/            # Fastify + WebSocket
│     ├─ src/routes/     # REST
│     ├─ src/ws/         # mensagens em tempo real
│     ├─ src/services/   # ações, combate, banco, mercado
│     ├─ src/db/         # esquema Drizzle e migrações
│     └─ src/jobs/       # tarefas agendadas (fim de fila, rankings)
├─ packages/
│  ├─ engine/            # REGRAS DO JOGO: fórmulas, RNG, simulação por ticks, offline
│  ├─ content/           # JSON de itens, monstros, ações, regiões + esquemas Zod
│  ├─ protocol/          # tipos e esquemas das mensagens cliente–servidor
│  └─ i18n/              # textos pt-BR (e depois en, es)
├─ tools/
│  ├─ simulator/         # simula milhares de jogadores para balanceamento
│  └─ content-build/     # valida e empacota o conteúdo
└─ docker-compose.yml
```

O pacote `engine` não pode importar nada de DOM, Node, banco ou rede: só lógica pura, para rodar igual nos dois lados.

## 4. Regras: habilidades, XP, ações, filas e offline

Implemente estas regras em `packages/engine`. Os números são o ponto de partida do balanceamento e devem ficar em constantes ou em conteúdo, nunca espalhados pelo código.

### 4.1 Habilidades

21 habilidades, cada uma de nível 1 a 99; nível total máximo 2.079. Use estes ids:

| id | Nome (pt-BR) | Grupo |
| --- | --- | --- |
| attack | Ataque | combate |
| strength | Força | combate |
| defence | Defesa | combate |
| vitality | Vitalidade | combate (10 PV por nível; começa no 10) |
| archery | Arquearia | combate |
| arcana | Arcanismo | combate |
| devotion | Devoção | combate |
| mining | Mineração | coleta |
| woodcutting | Lenhadoria | coleta |
| fishing | Pesca | coleta |
| farming | Cultivo | coleta (lotes com timer real) |
| hunting | Caça | coleta |
| smithing | Forja | produção |
| cooking | Culinária | produção |
| alchemy | Alquimia | produção |
| crafting | Artesania | produção |
| fletching | Marcenaria | produção |
| glyphcraft | Glifaria | produção |
| thieving | Furtividade | suporte |
| agility | Agilidade | suporte (bônus passivo de até −10% no tempo de ação) |
| summoning | Invocação | suporte |

### 4.2 Curva de XP

XP necessário para ir do nível L ao L+1 = floor(75 × 1,1^(L−1)). Gere a tabela acumulada uma vez (níveis 1 a 99) e exponha `levelForXp(xp)` e `xpForLevel(level)`. O total até o 99 fica perto de 8,5 milhões; o XP continua contando após o 99 (até 2^31 − 1). Guarde XP como inteiro em décimos (XP × 10) para evitar ponto flutuante.

### 4.3 Ações

Toda atividade de coleta e produção é uma **ação** definida em conteúdo com: id, habilidade, nível exigido, duração base em ms, XP, entradas (itens consumidos), saídas (itens produzidos, com chance), ferramenta exigida (opcional) e região.

- Duração efetiva = duração base × (1 − soma dos bônus de velocidade), com soma limitada a 0,6.
- Uma ação só começa se houver todas as entradas; ao terminar, consome entradas, dá saídas e XP e se repete.
- Exemplo de valores (Mineração): cobre nível 1, 3.000 ms, 2,5 XP; ferro nível 15, 3.000 ms, 7 XP; carvão nível 30, 3.600 ms, 13 XP. Siga a mesma lógica nas outras habilidades: ações de nível mais alto são mais lentas e dão mais XP por hora.
- Meta de XP por hora da ação padrão: 3.000 (níveis 1–20), 9.000 (20–40), 25.000 (40–60), 60.000 (60–80), 120.000 (80–99).

### 4.4 Maestria

Cada par (personagem, ação) tem XP de maestria próprio, níveis 1 a 50, ganhando 1 ponto por execução e usando a mesma curva com base 10 em vez de 75. Bônus: +1% de chance de saída dupla a cada 5 níveis; −5% de duração no nível 25; nunca falhar no 40 (para ações com chance de falha); no 50, um item "essência de maestria" a cada 1.200 execuções.

### 4.5 Espaços de ação e filas

- **Espaço principal:** qualquer ação ou combate.
- **Espaço secundário:** liberado com nível total 50; só coleta ou produção. Nunca dois combates ao mesmo tempo.
- **Cultivo:** lotes independentes com timer real (30 min a 24 h).
- **Fila:** cada espaço tem uma fila de até 3 itens (+1 a cada 500 de nível total). Cada item da fila tem uma condição de parada: quantidade, até acabar o material ou até um nível. Quando um item termina, o próximo começa.
- O inventário de ação tem 28 espaços e esvazia no banco automaticamente a cada 5 minutos de jogo; itens iguais empilham sem limite no banco.

### 4.6 Progresso offline

O servidor não simula jogadores continuamente. Cada espaço guarda: ação atual, fila, instante de início, contador de ticks já resolvidos e semente de RNG. Quando o jogador volta (ou um job agendado precisa), o servidor resolve o período:

1. Tempo decorrido = agora − último instante resolvido, limitado a 12 h (24 h para assinantes).
2. Para coleta e produção: execuções = min(tempo ÷ duração efetiva, execuções possíveis com o material). Saídas com chance usam um sorteio binomial único com o RNG do espaço, não um sorteio por execução.
3. Para combate: calcule por médias (seção 5.6) quantos monstros morrem, quanto dano o herói recebe e quanta comida gasta; pare no momento em que a comida acaba. O herói nunca morre offline.
4. Avance a fila conforme as condições de parada, na ordem.
5. Aplique tudo numa única transação e devolva um resumo: tempo resolvido, XP por habilidade, níveis ganhos, itens ganhos e gastos, destaques (drop raro, nível novo).

Com o jogo aberto, o mesmo resultado é obtido tick a tick pela simulação completa (seção 7), e a cena mostra cada ação.

## 5. Regras: combate, monstros e loot

O combate roda em ticks de 600 ms. O jogador escolhe área, estilo, equipamento, comida, poções e limite para comer; o herói luta sozinho até o jogador parar, a comida acabar ou o inventário encher.

### 5.1 Estilos e triângulo

| Estilo | Habilidades | Vence | Perde para | Munição |
| --- | --- | --- | --- | --- |
| melee | Ataque, Força, Defesa | archery | arcana | nenhuma |
| archery | Arquearia, Defesa | arcana | melee | flechas |
| arcana | Arcanismo, Defesa | melee | archery | pedras de glifo |

Vantagem de triângulo: +25% de precisão. Desvantagem: −25%.

### 5.2 Fórmulas

- Precisão = (nível do estilo + 8) × (bônus de precisão do equipamento + 64) × modificador de triângulo
- Evasão = (Defesa + 8) × (bônus de defesa contra o estilo atacante + 64)
- Chance de acerto = Precisão ÷ (Precisão + Evasão), limitada a \[0,05; 0,95\]
- Dano máximo = floor(1 + (nível de força do estilo + 8) × (bônus de força + 64) ÷ 640); para melee o nível de força é Força, para os outros é o próprio nível do estilo
- Dano de um golpe que acerta = inteiro uniforme em \[1, dano máximo\]; crítico de 5% dobra o dano
- Velocidade = intervalo da arma em ticks (4 rápida, 5 média, 6 lenta, 7 muito lenta)
- Monstros usam as mesmas fórmulas com seus próprios níveis e bônus

### 5.3 XP de combate

Cada ponto de dano causado dá 4 XP na habilidade de treino escolhida (Ataque, Força, Defesa ou dividido em partes iguais para melee; Arquearia ou Arcanismo nos outros estilos) e 1,33 XP em Vitalidade. Devoção sobe enterrando ossos (ação comum de coleta).

### 5.4 Sobrevivência e morte

- O herói come automaticamente quando a vida cai abaixo do limite escolhido (padrão 50%). Comer gasta 3 ticks sem atacar.
- Poções duram 5 minutos de combate e são renovadas sozinhas se houver estoque.
- Morte (só online): o herói volta para a cidade, perde o loot ainda não depositado e 10% do XP ganho naquela sessão de combate; equipamento nunca se perde.

### 5.5 Monstros, ondas e loot

- Cada área de caça define: lista de monstros com peso de surgimento, tamanho de onda (1 a 3), intervalo entre ondas (1.000 a 3.000 ms) e distância de caminhada.
- Cada monstro define: id, nível de combate, estilo, fraqueza, PV, níveis e bônus, velocidade, tabela de loot e chance de pet.
- Tabela de loot: entradas sempre garantidas (ossos), entradas com peso (uma sorteada por abate) e entradas raras com chance independente (ex.: 1/5.000).
- Proteção contra azar: se o jogador passar de 3× o número esperado de abates sem um item épico ou lendário de chefe, a chance desse item dobra até ele cair.
- Raridades: comum, incomum, raro, épico, lendário.
- Bestiário: conte abates por monstro; 100 abates dão +2% de dano contra ele, 1.000 dão +5% de chance de loot raro.

### 5.6 Combate por médias (offline)

Para o offline, calcule o dano esperado por tick dos dois lados (chance de acerto × dano médio ÷ intervalo, contando crítico), o tempo médio por abate (PV do monstro ÷ dano por tick + intervalo de onda + caminhada) e o dano recebido por abate. Disso saem abates, XP, comida gasta e o instante em que a comida acaba. O loot desses abates é sorteado com binomial por entrada da tabela. Teste que o resultado médio offline fique dentro de ±3% do resultado tick a tick em 10.000 simulações.

### 5.7 Chefes e masmorras (marco 3 em diante)

Chefes têm fases definidas em conteúdo (gatilho por % de vida; efeito: imunidade a um estilo, ataque especial com aviso de 2 ticks, aumento de velocidade). Masmorras são sequências de 5 a 10 salas com um chefe no fim, sem troca de equipamento no meio.

## 6. Cena viva: renderização e animações

Enquanto o jogo está aberto, sempre há movimento na tela: o herói anda, monstros surgem, golpes acontecem, loot voa. A cena é só apresentação: ela desenha os eventos que o engine produz e nunca decide nada.

### 6.1 Tela e câmera

- PixiJS num `<canvas>` ocupando a faixa superior da tela inicial (no celular, cerca de 45% da altura; no desktop, painel central).
- Resolução virtual de 480×270 px, escalada por fator inteiro com filtro *nearest* (pixel art nítido); sobras viram barras com a cor do céu da região.
- Vista lateral. O herói fica fixo em x ≈ 30% da largura; o cenário rola quando ele anda.
- Camadas, de trás para frente: céu, fundo distante (parallax 0,1), fundo médio (0,3), fundo próximo (0,6), chão (1,0), atores, efeitos, números flutuantes, interface da cena.

### 6.2 Atores e máquina de estados

Todo ator (herói, monstro, fantasma de outro jogador) tem uma máquina de estados de animação: `idle`, `walk`, `attack`, `hurt`, `block`, `eat`, `gather`, `die`, `spawn`, `celebrate`. Transições são disparadas por eventos do engine, nunca por timers soltos.

- **Herói modular:** sprite montado em camadas sincronizadas (corpo, cabeça, pernas, torso, arma, escudo, capa). Trocar equipamento troca a camada correspondente na hora.
- **Animações mínimas do herói:** idle (4 quadros), walk (6), 3 ataques por estilo (4 a 6 cada), hurt (2), block (2), eat (4), die (6), celebrate (6), e uma animação de coleta por habilidade (mine, chop, fish, smith, cook, craft) de 4 quadros em loop.
- **Monstros:** spawn (entrada própria: sair do chão, descer voando, pular), walk, attack, hurt, die. Elites têm aura; chefes têm animações por fase.

### 6.3 Coreografia do combate

A cena consome a fila de eventos do engine com timestamps em ticks e os agenda no tempo real (1 tick = 600 ms):

1. `WaveSpawned`: monstros entram pela direita com a animação de spawn e caminham até a posição de luta.
2. `HeroWalk`: entre ondas, o herói anda e o cenário rola pela distância definida na área.
3. `Attack` (herói ou monstro): a animação de ataque começa de modo que o quadro de impacto caia exatamente no tick do evento; projéteis (flecha, glifo) saem antes e chegam no tick.
4. `Hit` / `Miss` / `Crit` / `Block`: número flutuante (branco para dano, amarelo e 1,5× maior para crítico, cinza "errou", azul "bloqueou"), animação hurt, piscar branco de 80 ms, barra de vida atualizada; crítico ou golpe acima de 20% da vida dá tremor de tela de 2 px por 120 ms.
5. `MonsterDied`: animação die, fade de 300 ms; `LootDropped`: ícones saltam em arco e voam até o ícone do inventário na interface; raros têm brilho e som próprios; `XpGained`: texto "+48 XP" subindo.
6. `Ate` / `PotionUsed`: animação curta com o ícone do item sobre a cabeça.
7. `LevelUp`: animação celebrate, partículas e faixa "Ataque nível 42!"; nível 99 vira animação em tela cheia.
8. `HeroDied` / `ReturnToTown`: animação die ou caminhada de volta, transição com fade para a cidade.

Chefes: evento `BossIntro` (2 s, tremor, nome em destaque, barra grande no topo); `BossTelegraph` mostra um aviso visual 2 ticks antes do ataque especial; `BossPhase` muda cor de fundo ou cenário.

### 6.4 Coleta e produção na cena

O herói fica diante do objeto da ação (rocha, árvore, ponto de pesca, bigorna, fogão, bancada) com a animação em loop. Cada `ActionCompleted` gera partículas (lascas, folhas, respingos, faíscas), o item produzido voando ao inventário e o XP subindo. A cada 10 ações o recurso se esgota visualmente e reaparece após 1 s (só cosmético).

### 6.5 Outros elementos

- **Fantasmas:** até 5 heróis de outros jogadores na mesma área, desenhados no fundo médio a 50% de opacidade, lutando monstros simulados localmente só para aparência. O servidor envia aparência, nome e alvo a cada 10 s.
- **Segundo espaço:** mini-cena de 160×90 no canto, mostrando o espaço secundário; um toque troca com a cena principal.
- **Volta do offline:** o herói entra caminhando com um saco de loot, e o painel "Enquanto você estava fora" abre sobre a cena.
- **Aba em segundo plano:** pause o render (`visibilitychange`) e, ao voltar, peça ao servidor o estado resolvido em vez de reproduzir o tempo perdido.

### 6.6 Desempenho

- 60 fps em celulares de entrada (referência: 3 GB de RAM); máximo 100 draw calls por quadro.
- Spritesheets em atlas por região (formato JSON do Aseprite), carregadas sob demanda; atlas comum (herói, interface, efeitos) sempre carregado.
- Pools de objetos para monstros, números flutuantes, partículas e ícones de loot; zero alocação por quadro no caminho quente.
- Modo econômico nas configurações: 30 fps, sem parallax, sem partículas, sem fantasmas. Modo lista: cena minimizada.

### 6.7 Arte provisória

Até a arte final existir, gere placeholders programáticos (formas simples coloridas com contorno de 1 px, animações por squash/stretch e deslocamento) com os mesmos nomes de animação e quadros de impacto, para que trocar pela arte final seja só substituir o atlas. Nunca use sprites de outros jogos, nem como teste.

## 7. Simulação determinística e protocolo cliente–servidor

O mesmo engine roda nos dois lados. O servidor é a autoridade; o cliente reproduz a mesma simulação só para desenhar a cena, e os dois são conferidos periodicamente por hash.

### 7.1 API do engine

```ts
// packages/engine — lógica pura, sem I/O
export function step(
  state: SlotState,
  ticks: number,
  content: ContentDb,
): { state: SlotState; events: GameEvent[] };

export function resolveOffline(
  state: SlotState,
  ticks: number,
  content: ContentDb,
): { state: SlotState; summary: OfflineSummary };

export function hashState(state: SlotState): string; // hash estável (ex.: FNV-1a 64 sobre serialização canônica)
```

- `SlotState` inclui: ação ou combate atual, fila, tick atual, progresso da ação em ticks, inventário de ação, PV, monstros vivos, buffs, estado do RNG.
- `GameEvent` é uma união discriminada com `tick` em cada evento: `ActionCompleted`, `XpGained`, `LevelUp`, `ItemsGained`, `ItemsConsumed`, `WaveSpawned`, `HeroWalk`, `Attack`, `Hit`, `Miss`, `Crit`, `Block`, `MonsterDied`, `LootDropped`, `Ate`, `PotionUsed`, `HeroDied`, `ReturnToTown`, `QueueAdvanced`, `SlotStopped`, `BossIntro`, `BossTelegraph`, `BossPhase`.
- Toda duração é convertida em ticks inteiros de 600 ms (ação de 3.000 ms = 5 ticks; arredonde para cima).

### 7.2 Regras de determinismo

- PRNG próprio de 32 bits (sfc32 ou xoshiro128\*\*) usando `Math.imul` e operações inteiras; estado do RNG faz parte do `SlotState`.
- Semente de cada espaço derivada no servidor de (id do personagem, id do espaço, contador de reinícios) com um hash; o cliente nunca escolhe semente.
- Nada de ponto flutuante em resultados que afetam estado: use inteiros (XP em décimos, chances em partes por milhão). Ponto flutuante só na cena.
- Ordem determinística: arrays ordenados por id; nunca dependa da ordem de chaves de objeto.
- Teste obrigatório: o mesmo cenário rodado no Node e num navegador (Playwright) por 100.000 ticks gera o mesmo `hashState` e a mesma lista de eventos.

### 7.3 Tempo e resolução preguiçosa

- Tick global = floor((agora do servidor − época do jogo) ÷ 600 ms). O cliente estima o relógio do servidor com pings (média de 5 amostras) e renderiza 1 tick atrasado para absorver latência.
- O servidor não roda laço contínuo por jogador. Ele resolve um espaço quando precisa: chegada de intenção, checkpoint, job de fim de fila ou leitura do estado por outro sistema (ex.: mercado).
- Lacuna de até 15 minutos (1.500 ticks): resolva com `step` tick a tick. Lacuna maior: `resolveOffline` por médias.
- Após resolver, grave o novo estado e os efeitos (XP, itens, moedas) na mesma transação.

### 7.4 Mensagens WebSocket

Todas as mensagens são JSON validadas com Zod em `packages/protocol`, com campo `type` e `seq` (número crescente por conexão).

| Direção | type | Conteúdo |
| --- | --- | --- |
| C→S | `hello` | token de sessão, versão do cliente e do conteúdo |
| S→C | `welcome` | tick atual do servidor, personagem, estado de cada espaço, resumo offline (se houver) |
| C→S | `intent.startAction` | espaço, id da ação, condição de parada |
| C→S | `intent.startCombat` | área, estilo, habilidade de treino, comida, poções, limite para comer |
| C→S | `intent.setQueue` | espaço, lista de itens da fila |
| C→S | `intent.stop` | espaço |
| C→S | `intent.equip` | espaço de equipamento, item (só com o espaço principal fora de combate ativo ou entre ondas) |
| S→C | `slot.started` | espaço, estado inicial, tick de início (o cliente começa a simular a partir dele) |
| S→C | `slot.checkpoint` | espaço, tick, hash do estado, deltas persistidos (níveis, banco) — a cada 50 ticks (30 s) e em eventos importantes |
| S→C | `slot.resync` | espaço, estado completo (quando o hash do cliente diverge) |
| S→C | `world.ghosts` | até 5 fantasmas da área (aparência, nome, alvo) a cada 10 s |
| S→C | `notice` | anúncios (nível 99, pet, drop raro de membro do clã) |
| S→C | `error` | código e mensagem traduzível |

No `slot.checkpoint`, o cliente compara o hash com o do próprio estado naquele tick. Se diferir, pede `slot.resync` e a cena faz uma transição suave (fade de 200 ms) para o estado correto. Toda divergência é registrada no servidor como bug.

Reconexão: backoff exponencial (1 s, 2 s, 4 s até 30 s); ao reconectar, `hello` de novo e o servidor devolve o estado resolvido.

## 8. Modelo de dados e API

Use PostgreSQL com Drizzle. Ids são UUID v7; datas em `timestamptz`; quantidades e moedas em `bigint`. Toda escrita de item ou moeda passa por um serviço único (`InventoryService`) dentro de transação com `SELECT … FOR UPDATE` nas linhas afetadas.

### 8.1 Tabelas

| Tabela | Colunas principais |
| --- | --- |
| accounts | id, email (único), password\_hash (argon2id), mode (`normal`, `self_sufficient`, `hardcore`), subscription\_until, created\_at, banned\_at |
| sessions | id, account\_id, token\_hash, expires\_at, ip, user\_agent |
| characters | id, account\_id (1 por conta no início), name (único, 3–12 caracteres), region\_id, hp, appearance (jsonb), coins, created\_at |
| skills | character\_id, skill\_id, xp\_tenths, echo\_stars — PK (character\_id, skill\_id) |
| mastery | character\_id, action\_id, xp — PK (character\_id, action\_id) |
| slots | character\_id, slot (`main`, `secondary`), state (jsonb = SlotState), resolved\_tick, seed, restarts — PK (character\_id, slot) |
| farm\_plots | character\_id, plot\_index, seed\_item\_id, planted\_at, ready\_at |
| bank\_items | character\_id, item\_id, qty, tab — PK (character\_id, item\_id) |
| equipment | character\_id, slot (12 espaços), item\_id |
| bestiary | character\_id, monster\_id, kills |
| quests | character\_id, quest\_id, stage, completed\_at |
| market\_orders | id, character\_id, item\_id, side (`buy`, `sell`), price, qty, remaining, status, created\_at, expires\_at |
| market\_trades | id, buy\_order\_id, sell\_order\_id, item\_id, price, qty, created\_at |
| item\_ledger | id, character\_id, item\_id, delta, reason (`action`, `combat`, `market`, `shop`, `admin`…), ref\_id, created\_at — auditoria de todo movimento de item e moeda |
| clans, clan\_members, clan\_projects | estrutura de clã (marco 4) |
| event\_log | id, character\_id, type, data (jsonb), created\_at — eventos de jogo para analytics e anti-cheat |

Todo item ganho ou perdido gera uma linha em `item_ledger`. A soma do ledger por personagem e item deve sempre bater com `bank_items` (teste de consistência noturno).

### 8.2 Endpoints REST

| Método e rota | Função |
| --- | --- |
| POST /auth/register | cria conta (email, senha, modo) |
| POST /auth/login | devolve token de sessão |
| POST /auth/logout | encerra sessão |
| POST /characters | cria personagem (nome, aparência) |
| GET /me | conta, personagem, habilidades, equipamento |
| GET /bank | itens do banco |
| POST /bank/sell-to-shop | vende para loja NPC (40% do valor base) |
| GET /content/version | versão e hash do conteúdo (o cliente baixa o JSON pela CDN) |
| GET /market/items/:id | livro de ofertas e histórico de preço |
| POST /market/orders | cria oferta |
| DELETE /market/orders/:id | cancela oferta e devolve itens ou moedas |
| GET /leaderboards/:kind | rankings |
| GET /health | saúde do serviço |

Ações e combate só vêm pelo WebSocket (seção 7). Toda rota valida entrada com Zod, aplica limite de requisições (60 por minuto por conta, 120 por IP) e devolve erros como `{ code, messageKey }`.

## 9. Conteúdo orientado a dados

Todo conteúdo vive em `packages/content/data/*.json`, validado por esquemas Zod em `packages/content/schema.ts`. O build (`tools/content-build`) valida referências cruzadas (todo `itemId` existe, toda ação aponta para uma habilidade válida), gera um único `content.<hash>.json` e falha o CI se algo estiver errado. Os nomes exibidos vêm de chaves de tradução.

### 9.1 Exemplos de formato

```json
{
  "items": [
    { "id": "ore_copper", "nameKey": "item.ore_copper", "type": "resource", "rarity": "common", "baseValue": 4, "tradeable": true, "icon": "items/ore_copper" },
    { "id": "bar_bronze", "nameKey": "item.bar_bronze", "type": "resource", "rarity": "common", "baseValue": 12, "tradeable": true, "icon": "items/bar_bronze" },
    { "id": "sword_bronze", "nameKey": "item.sword_bronze", "type": "equipment", "rarity": "common", "baseValue": 40, "tradeable": true, "icon": "items/sword_bronze",
      "equip": { "slot": "weapon", "style": "melee", "speedTicks": 4, "requires": { "attack": 1 },
                 "bonuses": { "accuracy": 6, "strength": 5, "defMelee": 0, "defArchery": 0, "defArcana": 0 },
                 "sprite": "hero/weapon/sword_bronze" } },
    { "id": "food_sardine", "nameKey": "item.food_sardine", "type": "food", "rarity": "common", "baseValue": 6, "tradeable": true, "icon": "items/food_sardine", "food": { "heal": 30 } }
  ],
  "actions": [
    { "id": "mine_copper", "skill": "mining", "level": 1, "durationMs": 3000, "xpTenths": 25,
      "inputs": [], "outputs": [{ "itemId": "ore_copper", "qty": 1, "chancePpm": 1000000 }],
      "tool": "pickaxe", "regionId": "vale_verde", "scene": { "prop": "props/rock_copper", "anim": "mine", "particles": "chips_orange" } },
    { "id": "smelt_bronze", "skill": "smithing", "level": 1, "durationMs": 2400, "xpTenths": 30,
      "inputs": [{ "itemId": "ore_copper", "qty": 1 }, { "itemId": "ore_tin", "qty": 1 }],
      "outputs": [{ "itemId": "bar_bronze", "qty": 1, "chancePpm": 1000000 }],
      "regionId": "brumaporto", "scene": { "prop": "props/furnace", "anim": "smith", "particles": "sparks" } }
  ],
  "monsters": [
    { "id": "giant_rat", "nameKey": "monster.giant_rat", "combatLevel": 3, "style": "melee", "weakness": "archery", "hp": 50,
      "levels": { "attack": 2, "strength": 2, "defence": 1 }, "bonuses": { "accuracy": 0, "strength": 0, "defMelee": 0, "defArchery": 0, "defArcana": 0 },
      "speedTicks": 4, "lootTableId": "loot_giant_rat", "petChancePpm": 50,
      "sprite": { "atlas": "region_vale_verde", "key": "giant_rat", "spawnAnim": "burrow_up", "impactFrame": { "attack": 2 } } }
  ],
  "lootTables": [
    { "id": "loot_giant_rat",
      "always": [{ "itemId": "bones", "qty": 1 }],
      "weighted": [{ "itemId": "coins", "min": 1, "max": 8, "weight": 60 }, { "itemId": "raw_meat", "min": 1, "max": 1, "weight": 30 }, { "nothing": true, "weight": 10 }],
      "rare": [{ "itemId": "seed_mystic_herb", "qty": 1, "chancePpm": 2000 }] }
  ],
  "huntingAreas": [
    { "id": "sewers_brumaporto", "regionId": "brumaporto", "nameKey": "area.sewers_brumaporto", "recommendedLevel": 3,
      "spawns": [{ "monsterId": "giant_rat", "weight": 80 }, { "monsterId": "sewer_slime", "weight": 20 }],
      "waveSize": { "min": 1, "max": 2 }, "waveIntervalTicks": { "min": 2, "max": 5 }, "walkTicks": 3,
      "background": "bg/sewers" }
  ]
}
```

### 9.2 Conteúdo inicial (marcos 1 e 2)

Crie conteúdo original para estas áreas, seguindo os exemplos:

- **Regiões:** Brumaporto (cidade portuária inicial, com banco, fornalha, bigorna e fogão) e Vale Verde (campos e bosque ao redor).
- **Mineração:** cobre (1), estanho (1), ferro (15), carvão (30).
- **Lenhadoria:** árvore comum (1), carvalho (15), salgueiro (30).
- **Pesca:** sardinha (1), truta (20), salmão (30).
- **Forja:** bronze e ferro (barras, adaga, espada, escudo, elmo, peitoral); aço a partir do marco 2.
- **Culinária:** cozinhar os peixes e a carne crua; chance de queimar que cai com o nível.
- **Caça (combate):** Esgotos de Brumaporto (rato gigante, gosma do esgoto), Campos do Vale (javali, lobo jovem), Bosque Sussurrante (goblin batedor, aranha da mata, com o chefe Grimtusk, o Javali Rei, no marco 3).

### 9.3 Arquivos de animação

Cada atlas tem o JSON do Aseprite e um manifesto com, por animação: lista de quadros, duração por quadro em ms e `impactFrame` (quadro em que o golpe acerta). A cena usa o `impactFrame` para alinhar o impacto ao tick do evento.

## 10. Mercado, social e monetização

Estes sistemas entram nos marcos 2 a 5. Projete o banco de dados desde o início pensando neles, mas só implemente quando o marco pedir.

### 10.1 Mercado (marco 2)

- Livro de ofertas por item. Ao criar uma oferta de venda, os itens saem do banco e ficam reservados; numa oferta de compra, as moedas ficam reservadas.
- Casamento automático na criação: compra casa com a venda de menor preço ≤ preço de compra; o negócio sai pelo preço da oferta que já estava no livro; empates por ordem de chegada. Casamento parcial permitido.
- Execute o casamento numa transação serializável por item (ou com trava por item no Redis) para evitar corrida.
- Taxa de 2% sobre o valor da venda, paga pelo vendedor e destruída (sumidouro); vendas abaixo de 100 moedas não pagam taxa.
- Até 8 ofertas abertas por jogador (12 para assinantes); expiram em 7 dias e devolvem o reservado.
- Contas com menos de 20 h de jogo ou nível total abaixo de 100 não podem vender.
- Itens com `tradeable: false` nunca entram no mercado.
- Histórico: preço médio e volume por dia, mantidos por 90 dias.

### 10.2 Social (marco 4)

- Clãs de 20 membros (até 50 com melhorias), cargos (líder, oficial, membro, recruta), chat do clã, mural automático de conquistas.
- Projetos semanais coletivos (ex.: entregar 10.000 toras) e chefe de clã com vida compartilhada atacado durante a semana.
- Amigos, mensagens privadas, rankings por nível total, XP por habilidade e abates de chefe, atualizados a cada 15 min a partir de sorted sets no Redis.
- Moderação: filtro de palavras, denunciar, silenciar, bloquear; chat global só após 10 h de jogo.

### 10.3 Monetização (marco 5)

- Assinatura "Patrono": offline de 24 h (em vez de 12 h), +2 itens na fila, +4 ofertas no mercado, +200 espaços de banco, moldura de perfil.
- Passe de temporada e loja só de cosméticos (visuais de equipamento, animações, temas, cenários). Os cosméticos usam o sistema de camadas do herói.
- Pagamentos: gateway com Pix e cartão na web; Google Play Billing e App Store quando houver app. Toda compra só é creditada após webhook verificado, de forma idempotente (id da transação único).
- Proibido: vender XP, itens negociáveis, moedas do jogo ou chance de drop; loot boxes pagas.

## 11. Interface e telas

A interface é React sobre (e ao redor) do canvas da cena. Toda ação importante fica a no máximo 2 toques da tela inicial.

### 11.1 Layout

- **Celular (retrato):** barra superior fixa (moedas, nível total, sino de notificações), cena animada (\~45% da altura), painel de conteúdo rolável, barra inferior com 6 abas: Início, Habilidades, Combate, Banco, Mercado, Clã.
- **Desktop:** navegação lateral à esquerda, cena no centro em cima, painel de conteúdo embaixo, coluna direita com espaços de ação, fila e chat.
- Tema escuro por padrão, com moldura de interface em estilo pixel (bordas de 2 px, cantos recortados) e fonte pixel legível para títulos; texto corrido em fonte sem serifa para leitura.

### 11.2 Telas

| Tela | Conteúdo | Marco |
| --- | --- | --- |
| Cadastro e criação de herói | email, senha, nome, aparência (tom de pele, cabelo, cor da roupa) com prévia animada | 1 |
| Início | cena, cartão de cada espaço de ação (ação atual, barra de progresso, XP/h, tempo até o próximo nível, botão parar), fila | 1 |
| Habilidades | grade das 21 habilidades com nível e barra; ao tocar, lista de ações com requisito, XP/h, itens/h, materiais e botão Começar | 1 |
| Combate | região → área → monstros (com fraqueza após 1º abate), estilo, habilidade de treino, comida, poções, limite para comer; prévia: abates/h, XP/h e "a comida dura \~2 h 10 min" | 1 |
| Equipamento | boneco com os 12 espaços, atributos totais, comparar item ao tocar | 1 |
| Banco | grade de ícones com quantidade, busca, filtros por tipo, abas, valor total; tocar abre detalhes (atributos, onde obter, usos, preço) | 1 |
| Enquanto você estava fora | tempo resolvido, XP e níveis por habilidade, itens ganhos e gastos, destaques | 1 |
| Mercado | busca, livro de ofertas, gráfico de 90 dias, minhas ofertas | 2 |
| Missões e contratos | lista, requisitos, recompensas, diálogos | 3 |
| Bestiário e coleção | monstros, drops vistos, % de conclusão | 3 |
| Clã | membros, projetos, chefe, chat | 4 |
| Perfil e rankings | níveis, capas, conquistas, posição | 4 |
| Configurações | som, modo econômico, modo lista, notificações, idioma, conta | 1 |

### 11.3 Regras de UX

- Mostre sempre taxas (XP/h, itens/h) e previsões ("termina em 1 h 20 min") calculadas pelo engine, nunca estimadas na interface.
- Toda ação bloqueada explica o motivo ("Requer Mineração 15", "Falta estanho").
- Celebração proporcional: nível comum = som curto e faixa; nível 99, pet ou lendário = tela cheia.
- Acessibilidade: fonte ajustável, raridade indicada por cor e por ícone, opção de reduzir movimento (desliga tremor de tela e flashes).
- Notificações push (PWA, opt-in por tipo): fila terminou, comida acabou, lote de cultivo pronto, oferta executada, limite offline atingido. Máximo de 4 por dia por padrão.

### 11.4 Onboarding (primeiros 15 minutos)

1. O herói chega de barco a Brumaporto (cena curta). Um NPC pede peixe: tutorial de Pesca, primeiro nível em \~30 s.
2. Cozinhar a sardinha no fogão.
3. Esgotos de Brumaporto: primeiro combate contra ratos, comendo a sardinha.
4. Minerar cobre e estanho, fundir bronze, forjar uma adaga e equipá-la (a adaga aparece no sprite).
5. Explicar o offline e avisar que o segundo espaço de ação abre no nível total 50: "seu herói continua trabalhando enquanto você está fora".

## 12. Segurança, testes e qualidade

### 12.1 Segurança e anti-cheat

- Senhas com argon2id; tokens de sessão aleatórios de 256 bits, guardados só como hash; cookies `HttpOnly`, `Secure`, `SameSite=Lax`.
- Toda intenção é validada no servidor: nível exigido, região liberada, materiais, ferramenta, equipamento permitido, limites de fila.
- Limite de requisições por conta e IP em REST e WebSocket (no WS: 10 intenções por segundo; acima disso, desconecta).
- Detecção de abuso a partir de `event_log` e `item_ledger`: muitas contas novas no mesmo IP, transferências em cadeia para uma conta, vendas muito abaixo do preço médio, divergências de hash repetidas.
- Painel administrativo (rota protegida por papel): buscar jogador, ver ledger e eventos, devolver itens (com motivo no ledger), banir.
- Segredos só em variáveis de ambiente; nada sensível no cliente.

### 12.2 Testes obrigatórios

| Tipo | O que cobre |
| --- | --- |
| Unidade (engine) | curva de XP (valores conhecidos nos níveis 2, 50, 92 e 99), fórmulas de combate, triângulo, maestria, filas, condições de parada, tabelas de loot |
| Determinismo | mesma semente e estado → mesmos eventos e hash após 100.000 ticks, no Node e no navegador |
| Offline vs tick a tick | média de 10.000 resoluções offline dentro de ±3% da simulação tick a tick (XP, abates, itens, comida) |
| Propriedade (fast-check) | nunca há quantidade negativa; itens consumidos ≤ itens disponíveis; XP nunca diminui fora da regra de morte |
| Integração (servidor + Postgres) | ledger bate com banco; duas requisições simultâneas não duplicam item; mercado sem corrida |
| Conteúdo | todo JSON válido; referências cruzadas existem; toda ação e monstro têm sprite e animações declaradas |
| Ponta a ponta (Playwright) | cadastro → tutorial → minerar → forjar → equipar → lutar → fechar → voltar e ver o resumo offline |
| Desempenho | cena com 3 monstros, partículas e 5 fantasmas mantém 60 fps em perfil de celular médio no Chrome DevTools |

### 12.3 Simulador de balanceamento

`tools/simulator` roda N jogadores sintéticos (perfis: casual 4 sessões/dia, ativo 8 sessões/dia) por X dias usando o engine, e gera CSV com: nível por habilidade ao longo do tempo, XP/h por ação, lucro/h por atividade e moedas em circulação. Use para verificar as metas da seção 4.3 e que nenhuma atividade dê lucro/h acima de 130% da média da faixa.

### 12.4 Definição de pronto

Uma tarefa só está pronta quando: compila sem erro de tipo, passa lint e todos os testes, tem testes novos para a lógica nova, não adiciona textos fixos fora do i18n, e roda localmente com `pnpm dev` a partir de um clone limpo.

## 13. Marcos de entrega

Implemente na ordem. Não comece um marco antes de todos os critérios do anterior passarem.

### Marco 1 — Protótipo jogável (cena viva + offline)

Escopo: monorepo, engine, conteúdo de Brumaporto e Vale Verde, habilidades Mineração, Forja, Pesca, Culinária, Ataque, Força, Defesa e Vitalidade, um espaço de ação com fila de 3, combate nos Esgotos de Brumaporto, banco, equipamento, offline, cena animada com arte provisória, telas do marco 1.

Critérios de aceite:

- [ ] `pnpm dev` sobe Postgres, Redis, servidor e cliente; cadastro e criação de herói funcionam.
- [ ] Ao escolher "Minerar cobre", o herói aparece batendo na rocha, partículas saem a cada ação e o minério voa para o inventário no ritmo de 3 s.
- [ ] Ao lutar nos esgotos, o herói anda, ratos e gosmas surgem em ondas pela direita, os golpes acertam no quadro de impacto, números de dano aparecem, monstros morrem e o loot voa.
- [ ] O herói come sozinho abaixo do limite e volta para a cidade quando a comida acaba.
- [ ] Equipar a adaga de bronze muda o sprite na hora.
- [ ] Fechar o navegador por 2 h e voltar mostra o resumo offline com valores dentro de ±3% do esperado.
- [ ] Checkpoints a cada 30 s sem nenhuma divergência de hash numa sessão de 1 h.
- [ ] Todos os testes da seção 12.2 aplicáveis passam no CI.

### Marco 2 — Alpha fechado

Escopo: espaço secundário, Lenhadoria, Marcenaria, Arquearia, Alquimia, Cultivo, regiões 2 e 3, 25 monstros, mercado, maestria, contratos diários, PWA instalável, notificações, arte final das regiões 1–3.

Critérios: mercado sem duplicação sob teste de carga (100 ordens simultâneas no mesmo item); mini-cena do segundo espaço funcionando; simulador mostra metas de XP/h dentro de ±15%; 50 testadores por 4 semanas com retenção de 7 dias ≥ 15%.

### Marco 3 — Conteúdo e chefes

Escopo: todas as 21 habilidades, regiões 4 e 5, chefes com fases e animações de entrada, masmorras, missões (10), Bestiário, coleção, pets, fantasmas de outros jogadores.

Critérios: cada chefe derrotável com equipamento do tier recomendado em 70% a 90% das simulações; fantasmas não derrubam o fps abaixo de 55 no celular de referência.

### Marco 4 — Beta aberto

Escopo: clãs, chat, rankings, amigos, moderação, painel administrativo completo, região 6, eventos (fim de semana de XP, invasão), observabilidade (logs, métricas, alertas).

Critérios: servidor aguenta 10× a carga do alpha em teste de carga; retenção de 30 dias ≥ 10%.

### Marco 5 — Lançamento

Escopo: monetização (assinatura, loja de cosméticos, passe), app Android via Capacitor, tradução em inglês, termos de uso e política de privacidade (LGPD: exportar e apagar dados da conta).

Critérios: compra creditada só após webhook verificado e idempotente; inflação de moedas ≤ 5% ao mês no beta.

## 14. Como trabalhar e primeira tarefa

### 14.1 Forma de trabalho

- Antes de codar cada marco, escreva um plano curto em `docs/plan-marco-N.md`: tarefas na ordem, arquivos a criar, riscos. Depois execute tarefa por tarefa.
- Faça mudanças pequenas e coesas, com commits de mensagem clara (`feat(engine): combat accuracy formula`). Rode lint, tipos e testes antes de cada commit.
- Comece cada sistema pelo engine e pelos testes; só depois servidor e, por último, cena e interface.
- Mantenha `docs/decisions.md` com cada decisão que esta especificação não cobria: o que decidiu, por quê e qual pilar da seção 1 justificou.
- Quando a especificação for ambígua, escolha a opção mais simples que respeite as restrições da seção 2, registre em `decisions.md` e siga. Pare e pergunte só se a decisão for difícil de desfazer (esquema do banco, protocolo, fórmulas centrais) ou se tocar nas restrições.
- Não invente conteúdo de franquias existentes; em dúvida sobre um nome, crie outro.
- Ao fim de cada marco, escreva `docs/report-marco-N.md`: o que foi feito, como testar, critérios atendidos, pendências e próximos passos.

### 14.2 Primeira tarefa

Execute o início do marco 1 nesta ordem e pare ao final para eu revisar:

1. Crie o monorepo com a estrutura da seção 3, TypeScript estrito, ESLint, Prettier, Vitest, Docker Compose (Postgres + Redis) e CI.
2. Em `packages/engine`: PRNG determinístico, curva de XP, tipos `SlotState` e `GameEvent`, a função `step` para ações de coleta e produção (sem combate ainda), `resolveOffline` para coleta e produção, e `hashState`.
3. Em `packages/content`: esquemas Zod e o conteúdo de Mineração (cobre, estanho) e Forja (barra de bronze, adaga de bronze) da seção 9.
4. Testes de unidade, de determinismo (Node) e de offline vs tick a tick para essas ações.
5. Em `apps/client`: uma página de teste que roda o engine localmente (sem servidor ainda) e mostra a cena PixiJS com o herói provisório minerando cobre, partículas, ícone voando e XP subindo, sincronizado aos eventos do engine.
6. Escreva `docs/plan-marco-1.md` com o restante do marco 1 e um relatório curto do que ficou pronto e de como rodar.

Quando terminar a primeira tarefa, mostre: a árvore de pastas, os comandos para rodar e testar, o resultado dos testes e qualquer decisão registrada em `decisions.md`.
