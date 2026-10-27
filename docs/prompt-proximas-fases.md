# Prompt para o agente: próximas fases do Abismo Idle

> Cole no agente: **"Leia `docs/prompt-proximas-fases.md` inteiro e siga as instruções. Comece pela Fase 0."**

---

## 1. Quem você é e como trabalhar aqui

Você é o desenvolvedor principal do **Abismo Idle**, um RPG idle de fantasia sombria para navegador, feito pelo Victor. O objetivo agora é transformar o jogo de um idle single-player com save local num **idle online competitivo**, no nível de dois jogos de referência que analisamos (Arvorn e Ravox Idle), mas com **identidade, conteúdo e números próprios**.

Antes de qualquer coisa, leia nesta ordem:

1. `CLAUDE.md` (forma de trabalho e comandos).
2. `Idle de loot — Prompt de desenvolvimento.md` (especificação e restrições inegociáveis da seção 2).
3. `docs/decisions.md` (decisões 1 a 170; elas valem sobre a especificação).
4. `game-design-idle-rpg.md` (GDD de produto).
5. `docs/gdd-comparacao.md` (o que do GDD já existe e os conflitos C1–C7).

**Precedência:** decisões > especificação > GDD > este documento. Se algo aqui conflitar com uma decisão registrada, pare e pergunte ao Victor.

### Regras de trabalho (valem para todas as fases)

- **Engine primeiro, depois interface, por último a cena.** Regras só em `packages/engine` (puro e determinístico); conteúdo só em `packages/content/data/*.json`; textos só em `packages/i18n`, sempre em pt-BR **e** en (há teste de paridade).
- **Determinismo é sagrado.** Nada de `Date`, `Math.random`, timers ou I/O no engine (o ESLint barra). Toda mudança que altera o comportamento padrão precisa de justificativa; quando a mudança deveria ser neutra, prove comparando o fluxo de eventos de simulações longas antes e depois (`step` + `canonicalJson`, várias sementes).
- **Mudou o estado do jogo → nova versão do save**, com migração e teste de migração.
- **Toda decisão não coberta pela especificação** entra numerada em `docs/decisions.md` (próximo número: **171**), com o que, por quê e o pilar ou restrição do GDD.
- **Mexeu em balanceamento → rode o simulador** (`pnpm sim active 20`, e com `CLASS=huntress` e `CLASS=sorcerer`) e registre o resultado na decisão.
- **Commits pequenos** (`feat(engine): ...`, `feat(server): ...`, `feat(client): ...`), cada um com `pnpm typecheck`, `pnpm lint` e `pnpm test` passando.
- **Antes de cada fase, entre em modo de planejamento**: apresente o plano ao Victor, com as decisões em aberto listadas como perguntas objetivas, e só implemente depois da aprovação.
- **Não avance de fase sem o Victor aprovar** o fechamento da fase anterior.
- **Pergunte antes de** escolher banco de dados, provedor de hospedagem, provedor de pagamento, ou qualquer coisa que custe dinheiro ou seja difícil de desfazer.
- Arte e sons só com licença que permita uso comercial; créditos em `assets/CREDITS.md`.

### Restrições de produto que você não pode quebrar

- **Restrição 6:** clicar não acelera nada. O jogador decide estratégia; o jogo executa.
- **Restrição 7 / conflito C4:** nada de vender XP, poder, chance de drop ou itens de combate. Pode vender: offline maior, conforto (slots, automação), cosméticos, passe com recompensas que não dão poder.
- **Sem propriedade intelectual de terceiros:** nada de nomes, IDs, sprites, magias ou dados do Tibia, do Arvorn, do Ravox ou do Canary (GPL). Os jogos de referência servem **só como inspiração de sistemas**. Mecânicas não têm dono; nomes, arte, textos e números deles, sim.
- **Respeito ao jogador:** sem dark patterns, sem timers falsos de oferta, preços claros em reais.

---

## 2. Estado atual do jogo (o que já existe)

Monorepo TypeScript com pnpm e turbo:

```text
apps/client          Vite + React (HUD) + Phaser 3 (cena), PWA, save local em IndexedDB
packages/engine      regras puras e determinísticas (tick de 100 ms, RNG sfc32 no estado)
packages/content     conteúdo em JSON + esquemas Zod + mapas do Tiled
packages/i18n        textos pt-BR e en
tools/content-build  validação de conteúdo, mapas, sprites e textos
tools/simulator      simulação de balanceamento
```

Sistemas prontos: caçada automática por grupos, 3 classes, árvore de habilidades, loot com raridades e afixos, refino +15, reforja, sets, lendários únicos, cartas com pity, pets, 6 profissões (incluindo pesca), elites, chefe a cada N abates, resets com loja, masmorra infinita (o Abismo), conquistas, bestiário, coleção, metas diárias e semanal, login diário, progresso offline (até 12 h), automações, taxas por hora, 9 caçadas em 3 regiões, 35 monstros.

### O que foi feito por último (decisões 168–170, save v20)

- **168 — Dificuldade por caçada** (Fácil, Normal, Difícil). Arquivos: `packages/engine/src/difficulty.ts`, `HUNT_DIFFICULTY_RULES` em `constants.ts`, `hunt.difficulty` no estado, seletor na ficha da caçada (`apps/client/src/ui/WorldMap.tsx`).
- **169 — Regras para usar cada habilidade** (até 3 condições com "e"/"ou": vida e mana do herói, vida do alvo, número de inimigos, tipo do alvo). Arquivos: `packages/engine/src/skillRules.ts`, `settings.skillRules`, editor em `apps/client/src/ui/SkillRuleEditor.tsx`.
- **170 — Resistências elementais dos monstros** (`resistances` no esquema de monstros, aplicadas em `heroStrike`; nenhum monstro resiste a físico).

Essas mudanças foram feitas num ambiente sem acesso ao npm: os testes rodaram com substitutos simplificados do vitest e do fast-check, a interface foi checada só contra os tipos do engine, e **ninguém viu as telas novas funcionando**. A Fase 0 resolve isso.

---

## 3. O que aprendemos com os jogos de referência

Resumo da análise de tráfego (capturas passivas da conta do Victor) e do código público dos clientes. **Use como inspiração de sistemas, nunca como fonte de dados.**

### Arquitetura dos dois

- **Servidor autoritativo.** A caçada roda inteira no servidor; o cliente só desenha e envia intenções. Uma única WebSocket por conexão, uma conexão ativa por conta.
- **Arvorn:** o cliente manda comandos (`start_hunt`, `set_action_bar`, `sell_items`…) com `id` e recebe `command_ack`; o servidor manda **lotes de eventos** com `seq` e `atMs` (`attack`, `damage`, `loot`, `experience`, `character_progress`) e um **snapshot** completo ao conectar. Relógio virtual + RNG com semente (simulação determinística, offline = avançar o relógio). MessagePack ou JSON.
- **Ravox:** JSON puro; o servidor manda o **estado com só o que mudou** (deltas), cerca de 8 vezes por segundo; o cliente guarda o catálogo em cache por versão.
- **Para o Abismo, o modelo do Arvorn encaixa melhor:** o engine já é determinístico, já tem `GameEvent` e já recebe intents (`intents.ts`).

### Sistemas que eles têm e o Abismo não tem

| Área        | Sistema                                                                                           | Referência |
| ----------- | ------------------------------------------------------------------------------------------------- | ---------- |
| Conta       | Login por e-mail e Google, 2FA, lista de sessões, uma conexão por conta, anti-bot                 | Ambos      |
| Social      | Outros jogadores visíveis andando na cidade                                                       | Ambos      |
| Social      | Chat global com avisos do sistema (chefe caiu, drop raro), mutar, fixar                           | Ambos      |
| Social      | Amigos, party, guilda com cargos                                                                  | Ambos      |
| Social      | Transmissão ao vivo da caçada de outro jogador                                                    | Ravox      |
| Economia    | Mercado entre jogadores com taxa por faixa de preço, histórico, alertas de preço                  | Ambos      |
| Economia    | Correio, troca direta, banco                                                                      | Ambos      |
| Economia    | Gastos de ouro de longo prazo (barras de ouro a partir de 2 bilhões no Arvorn)                    | Arvorn     |
| Competição  | Chefe mundial com horário marcado e fila que abre 10 min antes; o chat anuncia quem deu mais dano | Arvorn     |
| Competição  | Ranking, arena com ondas e duelos                                                                 | Ravox      |
| Retenção    | Comissões diárias por caçada ("mate N de X e entregue 1 material"), troca paga                    | Arvorn     |
| Retenção    | Votação em site de ranking de idles a cada 12 h, com prêmios por sequência de dias                | Ambos      |
| Retenção    | Relatório de caçada: XP/h, ouro/h, gastos, lucro/h                                                | Ravox      |
| Retenção    | Exportar e importar a barra de ações (jogadores trocam builds no Discord)                         | Ravox      |
| Combate     | 4ª dificuldade "hardcore" e níveis "plus" com entrada paga em ouro                                | Arvorn     |
| Combate     | Combate espacial no servidor (posições, alcance, área com formato)                                | Ambos      |
| Monetização | Premium (8 h de offline, conforto)                                                                | Arvorn     |
| Monetização | Moeda paga, loja, passe de temporada de 50 níveis com trilha grátis e paga                        | Ravox      |
| Monetização | Cosméticos: outfits, montarias, auras, títulos                                                    | Ambos      |

### Números de referência (para calibrar a ordem de grandeza, não para copiar)

- Dificuldade no Arvorn: Fácil grupos de 2, −20% raros · Médio grupos de 4, −20% de cura · Difícil grupos de 6, +30% ouro, +17% raros, −40% de cura · Hardcore grupos de 8, +110% ouro, +40% raros, −60% de cura.
- Ravox: ~1.240 jogadores online no momento da captura; passe de 50 níveis × 1.000 pontos, 20 pontos por hora caçando, 2× nos últimos 7 dias da temporada; votação com prêmios nos dias 3, 7, 10 e 20 da sequência.

### O que NÃO copiar

- **Leilão de personagens** e **mercado de moeda paga por ouro**: transformam dinheiro real em poder (viola a restrição 7 / C4).
- **Qualquer dado, nome, ID ou sprite** vindo do Tibia ou dos jogos de referência.

---

## 4. Plano por fases

Cada fase tem entregáveis e critérios de aceite. Ao fim de cada fase: atualize `docs/gdd-comparacao.md`, registre as decisões e apresente ao Victor um resumo do que mudou, do que foi medido e do que ficou em aberto.

### Fase 0 — Fechar o trabalho anterior (pequena)

1. Rode `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm content:build` e corrija o que falhar. Lembre que os testes das decisões 168–170 nunca rodaram no vitest real.
2. Rode `pnpm dev` e confira no navegador: a seção "Quando usar cada habilidade" na tela de Habilidades; o seletor Fácil/Normal/Difícil e as resistências na ficha da caçada; um save antigo (v19) carregando e migrando para v20.
3. Escreva testes e2e (Playwright, em `apps/client/e2e/`) para: criar e salvar uma regra de habilidade; trocar de dificuldade e iniciar a caçada; ver a resistência de um monstro na ficha.
4. **Resistência do herói** (completa a decisão 170): afixos de equipamento "+X% resistência a <elemento>" e redução do dano elemental dos ataques dos monstros (`monster.attack.element`). Valores padrão neutros; teste de que sem afixos nada muda; simulador nas três classes.
5. Atualize `docs/gdd-comparacao.md` com as decisões 168–171.

**Aceite:** tudo verde nos comandos acima, e2e passando, Victor viu as telas.

### Fase 1 — Servidor autoritativo, contas e save na nuvem (grande)

**Objetivo:** o jogo passa a rodar no servidor; o cliente vira uma tela. Resolve o conflito C1 e destrava todas as fases seguintes.

Decisões a levar ao Victor no plano (com uma recomendação sua para cada):

- Banco de dados. O Victor trabalha com MongoDB; avalie Mongo vs Postgres para este caso (estado de jogo por personagem, mercado transacional depois) e recomende.
- Framework do servidor em Node (o servidor **precisa** ser Node/TypeScript para importar `packages/engine` sem reescrever; decisão C2).
- Hospedagem e deploy (o Victor usa Docker).
- Login com Google e e-mail; 2FA agora ou depois.

Entregáveis:

1. **`apps/server`** em Node + TypeScript, importando `@abismo/engine` e `@abismo/content` diretamente.
2. **Contas:** cadastro e login por e-mail e senha (hash forte, ex.: argon2id), login com Google, sessões com expiração e lista de sessões ativas (derrubar uma sessão), recuperação de senha, limite de tentativas. Personagens por conta.
3. **Protocolo** numa WebSocket, documentado em `docs/protocolo.md`:
   - Cliente → servidor: intents com `id` (os mesmos de `intents.ts`, `setSkillRule`, `startHunt` etc.).
   - Servidor → cliente: `ack` por intent (sucesso ou `IntentError` com código), **lotes de `GameEvent` com `seq`**, e um **snapshot** do estado ao conectar ou reconectar.
   - Versão do conteúdo no handshake (o cliente guarda o conteúdo em cache e só baixa de novo quando a versão muda).
   - Uma conexão ativa por conta: a nova derruba a antiga com aviso.
   - Reconexão retoma a partir do último `seq` recebido.
4. **Simulação no servidor:** um laço que avança cada personagem online pelo engine; personagens offline não ocupam CPU e, ao voltar, são resolvidos com `resolveOffline` usando o tempo do **servidor** (nunca o relógio do cliente). Defina e meça quantos personagens um processo aguenta.
5. **Persistência:** o estado salvo com o mesmo formato de save versionado (`encodeSave`/`decodeSave`), gravado a cada N segundos e em eventos importantes (level, drop raro, reset), com escrita atômica.
6. **Cliente:** `GameSim` passa a ter dois modos — local (desenvolvimento e jogo offline sem conta, se o Victor quiser manter) e online (aplica eventos do servidor; a cena e a interface não mudam). As animações seguem vindo dos mesmos `GameEvent`.
7. **Migração do save local:** na primeira entrada com conta, importar o save do navegador **uma única vez**, validado pelo esquema, com limites de sanidade (ex.: ouro, nível e itens coerentes com o tempo de jogo) para não importar save editado. Registre os limites como decisão.
8. **Anti-cheat básico:** o servidor ignora qualquer dado de estado vindo do cliente; limite de taxa por intent; registro de intents recusadas.
9. **LGPD:** política de privacidade, exclusão de conta e exportação dos dados do jogador.
10. **Testes:** protocolo (ack, ordem por `seq`, reconexão), autenticação, determinismo servidor × engine (o mesmo estado e as mesmas intents dão os mesmos eventos), e um teste de carga simples.

**Aceite:** dá para criar conta, jogar, fechar o navegador, voltar em outro aparelho e encontrar o progresso; editar o IndexedDB não muda nada no servidor; os testes e o simulador continuam passando.

### Fase 2 — Social (média)

1. **Jogadores na cidade:** presença dos personagens que estão na vila (posição, aparência, título), com atualização em baixa frequência e limite de jogadores visíveis por instância da cidade.
2. **Chat global** com mensagens do sistema (chefe derrotado, drop lendário, conquista rara), limite de taxa, filtro de palavras, mutar jogador, denunciar mensagem e ferramentas de moderação para o Victor.
3. **Amigos** (pedido, aceitar, ver se está online e onde caça).
4. **Rankings:** nível, resets, andar máximo do Abismo, pontos de conquista. Por temporada e geral.
5. **Perfil público** do personagem (equipamento, conquistas, títulos).

**Aceite:** dois navegadores com contas diferentes se veem na cidade, conversam e aparecem no ranking; spam no chat é contido.

### Fase 3 — Economia entre jogadores (grande, delicada)

1. **Mercado** com ofertas de compra e venda, taxa por faixa de preço (gasto de ouro), duração das ofertas, histórico de preços e alertas de preço. **Transações atômicas** no banco: nenhum item ou ouro pode duplicar ou sumir (teste de concorrência obrigatório).
2. **Correio** (enviar itens e ouro a outro jogador, com taxa) e **troca direta** com confirmação dos dois lados.
3. **Itens vinculados:** decida quais itens não podem ser negociados (recompensas de missão, de conquista, de loja). Registre como decisão.
4. **Gastos de ouro de longo prazo** para segurar a inflação (inspiração: barras de ouro do Arvorn; crie o seu próprio, com nome e progressão próprios).
5. **Simulador de economia:** estenda `tools/simulator` para estimar ouro criado × ouro destruído por dia por perfil de jogador, e registre a meta de inflação na decisão.

**Aceite:** testes de concorrência sem duplicação; o simulador mostra que os gastos de ouro absorvem a produção dentro da meta definida.

### Fase 4 — Conteúdo coletivo e retenção (média)

1. **Chefe mundial** com horário marcado, fila que abre minutos antes, recompensa proporcional ao dano e anúncio no chat. Determinístico no servidor.
2. **Party** (caçar junto, dividir XP e loot) e **guilda** com cargos, banco da guilda e treino de guilda.
3. **Comissões diárias por caçada** ("derrote N de um monstro e entregue um material"), com troca paga em ouro.
4. **Dificuldade Hardcore** e níveis "plus" com entrada paga em ouro (gasto de ouro), estendendo a decisão 168. Simulador antes e depois.
5. **Relatório de caçada** ao parar: tempo, XP/h, ouro/h, gastos com poções, lucro/h e loot por raridade.
6. **Exportar e importar a barra de regras** como um código curto, para os jogadores trocarem builds.
7. **Votação diária** num site de ranking de idles, com recompensas por sequência que **não dão poder** (cosméticos, conforto, recursos de baixo impacto).

### Fase 5 — Monetização justa (média, só depois das fases 1–3)

1. **Premium/VIP:** offline maior, mais slots, automações extras, cosméticos exclusivos. **Sem** bônus de XP, drop ou poder (C4).
2. **Loja de cosméticos** (outfits, montarias, auras, títulos) e **passe de temporada** com trilha grátis e paga, recompensas sem poder, e recuperação nos últimos dias da temporada.
3. **Pagamentos** em reais (PIX e cartão) por um provedor que o Victor escolher; recibos, reembolso e conformidade.
4. **Proibido:** vender moeda que vire ouro no mercado, leilão de personagens, caixas aleatórias pagas.

### Fase 6 — Combate espacial (grande, opcional, decida com o Victor)

Hoje o engine luta com um grupo por vez e o mapa é só encenação (decisão 167). Os dois jogos de referência simulam posições, velocidade, alcance, distância de combate e magias em área com formato. Antes de implementar, apresente ao Victor: o que muda no ritmo por hora, no offline e no custo de CPU do servidor, e uma proposta de transição que preserve o balanceamento.

### Contínuo — conteúdo e alcance

- Mais regiões, caçadas, monstros e uma 4ª classe (o GDD sugere invocador), sempre com nomes e arte próprios.
- Espanhol como terceiro idioma (abre a América Latina).
- Telemetria D1/D7/D30 (tarefa pendente do marco 2), respeitando a LGPD.

---

## 5. Como começar agora

1. Leia os documentos da seção 1.
2. Execute a **Fase 0** inteira.
3. Ao terminar, mostre ao Victor o resultado da Fase 0 e o **plano detalhado da Fase 1** (em modo de planejamento), com as perguntas sobre banco de dados, framework, hospedagem e login. Não escreva código da Fase 1 antes da resposta.
