# Game Design Document — Idle RPG (inspirado em OSRS / Tibia / Pokémon / Diablo)

> **Para o agente de IA:** este documento descreve o que um jogo idle RPG precisa ter para **atrair** jogadores, **reter** jogadores por meses e **monetizar** de forma justa. Use-o como referência sempre que for sugerir features, escrever código, balancear números, criar textos de UI ou planejar o roadmap. Quando houver dúvida entre "mais lucro agora" e "jogador feliz por mais tempo", priorize o segundo — no gênero idle, retenção longa é o que gera receita.

---

## 0. Regras inegociáveis para o agente

1. **Não usar propriedade intelectual de terceiros.** Nada de nomes de monstros/itens/NPCs de Tibia, Pokémon, RuneScape, Diablo etc. A _sensação_ pode ser parecida (gêneros e mecânicas não têm dono); os _nomes_ precisam ser originais.
2. **Servidor autoritativo.** Toda progressão, loot, moeda e compra é calculada/validada no backend. O cliente só exibe. (Idle é muito fácil de trapacear mexendo no relógio ou no localStorage.)
3. **Nunca pay-to-win puro.** Dinheiro pode comprar tempo, conforto, estética e conteúdo extra — não pode comprar o topo do ranking competitivo.
4. **Respeitar o jogador.** Sem dark patterns (timers falsos de "oferta acaba em 2 min" a cada login, preços escondidos em moedas confusas, cancelamento difícil de assinatura).
5. **Tudo configurável por dados.** Monstros, itens, drop rates, XP curves, preços da loja e eventos devem vir de arquivos/coleções de configuração (JSON/Mongo), nunca hardcoded — para balancear sem deploy.

---

## 1. Identidade e pilares do jogo

### 1.1 Proposta em uma frase

Um RPG idle onde o personagem caça, coleta e evolui sozinho em um mundo vivo na tela, e o jogador toma as decisões importantes: onde caçar, o que equipar, quais skills treinar e quando resetar para ficar mais forte.

### 1.2 Pilares (toda feature deve servir a pelo menos um)

- **Progresso constante e visível** — sempre tem um número subindo, uma barra enchendo, um próximo objetivo a poucos minutos.
- **Decisões significativas** — builds, rotas de caça, escolha de skills; o jogador sente que _jogou bem_, não só que _esperou_.
- **Caça ao loot** — a emoção do drop raro (o "ding" do item lendário).
- **Coleção** — completar bestiário, coleções de itens, pets, conquistas.
- **Nostalgia com identidade própria** — lembra os clássicos (pixel art, sons, skills estilo OSRS, caça estilo Tibia, captura/coleção estilo Pokémon), mas com mundo e lore originais.

### 1.3 O que diferencia jogos idle de sucesso (TibiaIdle, PokeIdle e similares)

- O personagem **se move na tela** em um mapa (não só números numa planilha). Ver o boneco andando e lutando dá vida.
- Sessões **curtas e frequentes** (2–5 min várias vezes ao dia) + sessões **longas opcionais** para quem quer otimizar.
- **Progresso offline** generoso.
- Comunidade forte (Discord, ranking, guildas, mercado).

---

## 2. Core loop (o ciclo principal)

```
Escolher área de caça → personagem caça automaticamente → ganha XP, gold e loot
      ↑                                                            ↓
Desbloqueia áreas novas ← fica mais forte ← equipa / crafta / treina skills
```

### 2.1 Loops em camadas

| Camada | Duração    | Exemplo                                                         |
| ------ | ---------- | --------------------------------------------------------------- |
| Micro  | segundos   | matar monstro, ver dano, coletar drop                           |
| Curto  | minutos    | subir de nível, equipar item novo, completar uma task           |
| Médio  | horas/dias | derrotar boss da área, desbloquear novo mapa, completar coleção |
| Longo  | semanas    | prestígio/reset, temporada, topo do ranking, conquistas raras   |

**Regra:** em qualquer momento o jogador deve conseguir dizer "meu próximo objetivo é X e falta pouco".

---

## 3. Sistemas de progressão

### 3.1 Níveis e atributos

- Nível de combate com curva de XP exponencial suave (ex.: `xp(n) = base * n^1.5 * fator^n` com fator ~1.05–1.1). Os primeiros níveis devem vir **muito rápido** (nível 10 em ~10 min).
- Atributos (Força, Destreza, Inteligência, Vitalidade ou equivalentes) com pontos distribuíveis — permite builds.
- Classes/vocações (ex.: guerreiro, arqueiro, mago, invocador) com árvores de talentos distintas.

### 3.2 Skills estilo OSRS (forte gancho de retenção)

- **Skills de combate:** ataque, defesa, força, à distância, magia, vida.
- **Skills de coleta:** mineração, lenhador, pesca, coleta de ervas.
- **Skills de produção:** forja, culinária, alquimia/poções, criação de equipamentos, encantamento.
- Cada skill vai até um nível alto (ex.: 99 ou 120), com marcos que desbloqueiam algo (recurso novo, receita, título, cosmético).
- Skills de coleta alimentam produção, que alimenta combate → economia interligada.
- Permitir treinar uma skill não-combate **em paralelo** ao combate (ou como alternativa offline) aumenta muito o engajamento.

### 3.3 Equipamento e loot (estilo Diablo/Tibia)

- **Slots:** cabeça, peito, pernas, botas, luvas, arma, escudo/off-hand, colar, anéis (2), amuleto, capa, pet.
- **Raridades** com cor fixa e som próprio: Comum (branco) → Incomum (verde) → Raro (azul) → Épico (roxo) → Lendário (laranja) → Mítico/Único (vermelho/dourado).
- **Afixos aleatórios** (ex.: +% dano crítico, +% XP, roubo de vida) — faz cada drop ser uma "loteria" interessante.
- **Sets** com bônus de 2/4/6 peças — objetivo de médio prazo.
- **Upgrade/refino** (+1 a +15) com custo crescente; chance de falha só em níveis altos e com proteção (pity) para não frustrar.
- **Drops raros anunciados** no chat global ("Fulano dropou [Espada X]!") — prova social e desejo.
- **Bad luck protection (pity):** chance de drop raro aumenta a cada kill sem drop. Fundamental para não perder jogadores.
- **Filtro de loot** e venda automática de itens comuns (qualidade de vida essencial).

### 3.4 Coleção (estilo Pokémon)

- **Bestiário/compêndio:** cada monstro tem entradas que desbloqueiam com X kills (ex.: 10 / 100 / 1000), dando bônus permanentes (+% dano contra aquele tipo, +% drop).
- **Pets/criaturas capturáveis:** chance de capturar ou obter como drop; pets lutam junto, dão bônus passivos, evoluem.
- **Coleções de itens:** "registrar" um item na coleção dá bônus permanente pequeno — dá valor até para itens antigos.
- Interface mostrando silhuetas do que falta (o "???" gera curiosidade).

### 3.5 Prestígio / Reset (essencial em idle)

- Ao atingir certo ponto, o jogador pode **resetar** nível/área em troca de uma moeda de prestígio (ex.: "Almas", "Essência").
- Essa moeda compra **bônus permanentes** (árvore de prestígio): +% XP, +% gold, slots extras, automações.
- O segundo ciclo deve ser **visivelmente mais rápido** que o primeiro (o jogador sente o poder).
- Camadas de prestígio (reset → ascensão → renascimento) para o late game.
- Nunca forçar o reset; mostrar claramente "se resetar agora você ganha X".

### 3.6 Mundo e áreas

- Mapas por tema (floresta, deserto, pântano, gelo, vulcão, masmorras, mundo inferior) com nível recomendado.
- Cada área: monstros comuns, elite/raros (com spawn ocasional), **boss** com timer/cooldown, recursos de coleta.
- **Dungeons** com andares crescentes (torre infinita) — ótimo para conteúdo sem fim e ranking.
- **Mundo boss global:** aparece em horários fixos, todos atacam juntos, recompensa por participação + ranking de dano.

---

## 4. Mecânicas idle e offline

- **Progresso offline:** calcular no servidor ao reabrir (tempo ausente × taxa da área), com limite base (ex.: 8–12 h). Exibir tela de "Enquanto você esteve fora..." com tudo que ganhou — é um dos momentos mais prazerosos do gênero.
- **Automações desbloqueáveis:** auto-poção, auto-venda, auto-equipar melhor item, auto-mudar de área, auto-reset. Começam bloqueadas e são desbloqueadas pelo progresso (sensação de "evoluir o próprio jogo").
- **Velocidade de jogo ativa vs passiva:** jogar com a aba aberta pode dar um pequeno bônus (ex.: +10–20%) e clicar em habilidades ativas dá burst. Não deixe o jogo ativo ser obrigatório.
- **Notificações (mobile/desktop):** "Seu inventário está cheio", "Boss disponível", "Recompensa diária pronta" — com opção de desativar cada uma.

---

## 5. Onboarding (primeiros 30 minutos decidem tudo)

- **0–30 s:** personagem já está lutando. Nada de tela longa de criação ou texto.
- **1–5 min:** primeiro level up, primeiro item verde, primeira skill. Recompensas MUITO frequentes.
- **5–15 min:** desbloqueia segunda área, primeiro boss fácil, primeiro item raro garantido (drop "roteirizado").
- **15–30 min:** apresenta skills de coleta, primeira task diária, mostra a árvore de prestígio (bloqueada) como objetivo distante.
- Tutorial **contextual** (setas e balões quando a feature aparece), nunca uma parede de texto.
- Liberar features **aos poucos** (feature gating) para não sobrecarregar.
- Primeiro dia: dar um gosto de premium (ex.: 24 h de VIP grátis ou 1 pet temporário) para o jogador sentir o valor.

---

## 6. Retenção (por que o jogador volta)

### 6.1 Diário

- **Login diário** com calendário de 7 e 28 dias (recompensa maior no dia 7/28; não zerar a sequência inteira se perder 1 dia — usar "dias acumulados").
- **Tasks/missões diárias** (3–5, rápidas: "mate 200 monstros", "minere 50 minérios").
- **Masmorra diária / boss diário** com entradas limitadas.
- Reset diário em horário fixo e visível (ex.: 00:00 de Brasília).

### 6.2 Semanal

- Missões semanais maiores, ranking semanal com recompensas, boss de guilda semanal.

### 6.3 Eventos e temporadas

- **Eventos temáticos** (Halloween, Natal, Carnaval, Festa Junina — ótimo diferencial para público BR) com monstros, moeda e cosméticos exclusivos por tempo limitado.
- **Temporadas (3–8 semanas)** com servidor/ladder sazonal, reset opcional e recompensas cosméticas permanentes. Dão "recomeço justo" para novos jogadores.
- **Eventos de fim de semana:** XP em dobro, drop em dobro.

### 6.4 Metas de longo prazo

- **Conquistas** (centenas, de fáceis a absurdas), com pontos e títulos.
- **Títulos e molduras de perfil** exibidos no chat e ranking.
- **Hall da fama**: primeiros a atingir nível máximo, primeiro a matar boss X (eternizado).

### 6.5 Social (maior fator de retenção de longo prazo)

- **Chat global e de guilda** (com moderação, filtro e bloqueio).
- **Guildas/clãs:** nível da guilda, banco, bônus coletivos, boss de guilda, guerra de guildas.
- **Ranking:** por nível, por skill, por andar da torre, por dano no mundo boss, por coleção — muitos rankings = mais gente "no topo de algo".
- **Mercado/trade entre jogadores** (casa de leilão) — cria economia viva. Cuidar de taxas (sink de ouro) e anti-RMT.
- **PvP opcional** (arena assíncrona contra snapshots de outros jogadores) com matchmaking por poder.
- **Inspecionar perfil** de outros jogadores (equipamento, pets) — gera desejo.
- **Discord oficial** integrado (anúncios, eventos, feedback). Comunidade é parte do produto.

---

## 7. Economia do jogo

- **Moedas:**
  - **Gold** (soft currency): ganho jogando, gasto em upgrades, poções, reparo, taxas.
  - **Moeda premium** (ex.: "Gemas", "Diamantes"): obtida com dinheiro real e, em pequena quantidade, jogando (conquistas, eventos, login) — importante para jogadores free sentirem que podem acessar a loja.
  - **Moedas de evento/prestígio/guilda**: específicas, não se misturam.
- **Faucets (entradas) vs Sinks (saídas):** toda fonte de gold precisa de um ralo proporcional (upgrade, refino, taxa de mercado, reparo, crafting, cosméticos com gold) para evitar inflação.
- **Valores visíveis:** sempre mostrar quanto a moeda premium vale em reais na loja ("1.000 Gemas = R$ 19,90").
- Logar **todas** as transações de moeda para auditoria e balanceamento.

---

## 8. Monetização — o que os jogadores realmente pagam

### 8.1 Princípios

- Jogadores de idle pagam principalmente por: **tempo** (acelerar), **conveniência** (menos atrito), **estética/status** (ser visto), **conteúdo** (mais coisas para fazer) e **apoiar o dev** que eles gostam.
- Os pagantes são minoria (tipicamente 2–5% dos jogadores). O jogo precisa ser ótimo para os 95% free — eles são a comunidade, o ranking, o mercado e a divulgação que fazem os 5% pagarem.
- Comece com poucos produtos claros; adicione conforme dados.

### 8.2 Produtos que mais vendem no gênero (em ordem aproximada de importância)

**1. Assinatura VIP / Premium (o principal motor de receita recorrente)**

- Preço de referência no Brasil: R$ 9,90 – R$ 24,90/mês.
- Benefícios típicos: +% XP e gold (ex.: +25–50%), progresso offline estendido (ex.: 12 h → 24 h), slots extras de inventário/banco, auto-venda/auto-loot, fila de crafting maior, tag/cor de nome VIP no chat, moeda premium diária, 1 área ou dungeon exclusiva _de farm_ (não de poder exclusivo).
- Deve ser o produto com melhor custo-benefício e ser comunicado assim.

**2. Battle Pass / Passe de Temporada**

- Trilha grátis + trilha paga (R$ 19,90–R$ 39,90 por temporada); opção premium+ que pula alguns níveis.
- Recompensas: cosméticos, pets, moeda premium (devolver parte do valor incentiva comprar o próximo), recursos.
- Progride jogando normalmente (missões da temporada) — monetização que **aumenta** o engajamento.

**3. Starter Pack / Pacote de iniciante**

- Oferta única, muito barata (R$ 4,90–R$ 9,90), valor percebido altíssimo (pet inicial, bolsa extra, VIP 7 dias, moeda premium).
- Objetivo: converter o jogador em pagante pela primeira vez (depois disso ele compra muito mais fácil).
- Aparece após o jogador estar engajado (ex.: nível 15 ou dia 2), não no primeiro minuto.

**4. Cosméticos (status, zero impacto em poder — o mais "saudável")**

- Skins de personagem e de armas, auras, efeitos de ataque, trilhas de movimento, molduras de perfil, títulos, emotes, cores de nome, skins de pets, montarias visuais, temas da interface.
- Cosméticos limitados de evento/temporada criam urgência legítima.
- Mostrar cosméticos em lugares visíveis (mapa, chat, ranking, perfil) — cosmético que ninguém vê não vende.

**5. Conveniência / Qualidade de vida**

- Slots extras: inventário, banco, personagens, presets de build, pets ativos.
- Fila de crafting/automação extra.
- Respec (redistribuir pontos/talentos).
- Troca de nome, troca de classe.
- Teletransporte/troca rápida de área.
- Cuidado: não deixar o jogo free _irritante_ de propósito para vender o conforto.

**6. Aceleradores (boosts) temporários**

- Poções de XP/drop/gold ×2 por 1 h, 4 h, 24 h.
- Pular tempo ("ganhe 4 h de progresso offline agora").
- Ganháveis também jogando (em menor quantidade).

**7. Pets e companheiros**

- Pets com bônus pequenos de utilidade (coletar loot, +% gold) ou exclusivamente estéticos. Pets de _poder_ forte só via gameplay.

**8. Pacotes e ofertas**

- Pacotes de moeda premium em degraus (R$ 4,90 / 9,90 / 19,90 / 49,90 / 99,90 / 199,90) com bônus crescente (+10%, +20%... no maior).
- **Primeira compra em dobro** de moeda premium.
- Ofertas por marco de progresso ("Chegou ao nível 50! Pacote de equipamento por R$ 14,90") — relevantes, no momento certo.
- Ofertas de evento (Black Friday, aniversário do jogo).

**9. Anúncios recompensados (rewarded ads) — principalmente mobile/web**

- Jogador escolhe assistir para ganhar: dobrar recompensa offline, 30 min de boost, baú extra diário, reviver no boss.
- Limite diário (ex.: 5–10). Assinantes VIP não veem anúncios ou ganham a recompensa automaticamente.
- **Nunca** anúncio intersticial forçado em idle de nicho — mata retenção.

**10. Expansões / DLC (principalmente Steam)**

- Novas classes, regiões, histórias. Modelo comum: jogo base barato ou grátis + DLCs + pacote "Supporter" (trilha sonora, artbook, cosmético exclusivo).

**11. Apoio / Supporter**

- Pacote "Apoie o desenvolvedor" com cosmético exclusivo e nome nos créditos. Comunidades nostálgicas pagam por isso com gosto.

### 8.3 O que NÃO fazer (afasta jogadores e gera reviews negativas)

- Vender equipamento de poder máximo ou stats diretos que decidam ranking/PvP.
- Loot boxes pagas com chances escondidas (se usar caixas, mostrar as porcentagens; atenção à legislação de cada país e às regras das lojas).
- Energia/estamina que trava o jogo e só libera pagando.
- Paywall no conteúdo principal da história.
- Pop-ups de compra a cada login.
- Moedas premium com valores "quebrados" para sobrar saldo sempre.
- Mudar regras/benefícios do VIP depois de vendido.

### 8.4 Plataformas e pagamento

- **Web (navegador):** mais simples de lançar; pagamento via Stripe, Mercado Pago, PIX (muito importante no Brasil), PayPal.
- **Steam:** grande vitrine para idle (o gênero vende bem lá); compras devem usar a Steam Wallet; considerar preço regional.
- **Mobile (Google Play / App Store):** obrigatório usar o sistema de pagamento da loja (taxa de 15–30%); combina bem com rewarded ads.
- **Cross-progress** (mesma conta em web, PC e celular) é um diferencial forte para idle.

### 8.5 Métricas de monetização para acompanhar

- Conversão para pagante (% que comprou algo), ARPU, ARPPU, LTV, receita por produto, taxa de renovação do VIP, conversão do starter pack, views de rewarded ads por DAU.

---

## 9. UX, UI e "game feel"

- **Feedback visual e sonoro em tudo:** números de dano flutuando, críticos maiores e coloridos, brilho/feixe de luz no drop raro, som característico por raridade, partículas no level up, tremida de tela em boss.
- **Pixel art consistente** (uma paleta definida, mesmo tamanho de tile, mesma direção de luz). Paleta e layout devem ter identidade própria — definir 1 cor principal, 1 secundária e cores de raridade fixas.
- **HUD limpo:** barra de vida/XP, área atual, DPS, gold/h e XP/h visíveis (jogadores de idle AMAM ver taxas por hora).
- **Tooltips comparativos** ao passar o mouse em item (verde = melhor, vermelho = pior que o equipado).
- **Estatísticas detalhadas:** kills totais, drops raros, tempo jogado, gráficos de XP/h — o público "planilheiro" de OSRS adora.
- **Responsivo** (desktop e celular) e com **modo compacto** para deixar aberto num canto da tela.
- **Funciona em segundo plano** (aba inativa) sem travar — cálculo pelo servidor/timestamps, não pelo loop do navegador.
- **Acessibilidade:** tamanho de fonte ajustável, opção de reduzir efeitos/tremidas, daltonismo (não depender só da cor para raridade — usar borda/ícone também).
- **Idioma:** português e inglês desde o início amplia muito o público.

---

## 10. Conteúdo e lore

- Mundo original com regiões, facções e alguns NPCs carismáticos (missões curtas com humor e referências nostálgicas sutis, sem copiar).
- Quests com história leve (texto curto, opcional de ler).
- Easter eggs e segredos (monstros super raros, itens secretos, áreas escondidas) geram conversa na comunidade.
- Roadmap público de conteúdo: jogadores ficam quando sabem que o jogo vai continuar crescendo.

---

## 11. Técnico (stack sugerida: Angular + FastAPI + MongoDB + Docker)

- **Backend autoritativo** calcula combate/progresso por ticks ou por simulação baseada em tempo decorrido (`last_update` + fórmula) — evita carga de rodar todo jogador o tempo todo.
- **WebSocket** para chat, eventos globais, mundo boss e anúncios de drop; REST para o resto.
- **Anti-cheat:** validar timestamps no servidor (nunca confiar no relógio do cliente), rate limit, detecção de taxas impossíveis (XP/h acima do teórico), logs de transações, banimento de multi-contas no ranking.
- **Configuração de jogo em dados** (coleções de monstros, itens, drop tables, curvas, loja, eventos) com painel admin para editar e agendar eventos.
- **Telemetria/analytics:** eventos de funil (tutorial, nível 5/10/25, primeira compra), DAU/MAU, retenção D1/D7/D30, onde os jogadores param de jogar.
- **Feature flags** e **A/B testing** para preços, ofertas e balanceamento.
- **Backups** do Mongo e versionamento de migrações de saves.
- **Contas:** login com e-mail, Google, Discord e Steam; modo convidado que vira conta depois.
- **LGPD:** política de privacidade, exclusão de conta, consentimento para dados.

---

## 12. Métricas de sucesso (metas de referência para idle)

| Métrica                | Meta saudável |
| ---------------------- | ------------- |
| Retenção D1            | 35–45%+       |
| Retenção D7            | 15–20%+       |
| Retenção D30           | 6–10%+        |
| Sessões por dia        | 4+            |
| Conversão para pagante | 2–5%          |
| Conclusão do tutorial  | 80%+          |

Se a retenção estiver ruim, **não mexer na monetização** — corrigir onboarding, ritmo de recompensas e objetivos de curto prazo primeiro.

---

## 13. Roadmap sugerido

1. **MVP (jogável):** 1 classe, 3 áreas, combate idle com movimento na tela, loot com raridades, inventário/equipamento, level up, progresso offline, salvamento no servidor.
2. **Alpha fechada (Discord):** skills de coleta/produção, bestiário, 1 boss por área, tasks diárias, ranking, chat.
3. **Beta aberta:** prestígio, pets, guildas, conquistas, loja com VIP + starter pack + cosméticos, rewarded ads (se mobile/web), analytics.
4. **Lançamento:** battle pass/temporadas, mercado entre jogadores, evento de lançamento, página na Steam/lojas.
5. **Live ops:** evento a cada 2–4 semanas, nova área/classe a cada 1–3 meses, temporada a cada 6–8 semanas, patch notes públicos.

---

## 14. Checklist rápido para avaliar qualquer feature nova

- [ ] Serve a qual pilar? (progresso, decisão, loot, coleção, nostalgia/identidade)
- [ ] Dá ao jogador um objetivo novo de curto, médio ou longo prazo?
- [ ] Funciona para quem joga 5 min/dia **e** para quem otimiza 5 h/dia?
- [ ] É calculada/validada no servidor?
- [ ] Tem feedback visual/sonoro satisfatório?
- [ ] Se envolve dinheiro: o jogador free ainda consegue competir e se divertir?
- [ ] Os números estão em configuração editável?
- [ ] Usa só assets e nomes originais?
