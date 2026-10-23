# Fase 1 — Servidor autoritativo, contas e save na nuvem

## Contexto

Hoje o jogo roda inteiro no navegador, com o save no IndexedDB, e qualquer um edita o save em minutos. Sem um servidor que seja a autoridade não dá para ter ranking, mercado nem compra (conflito C1). A Fase 1 de `docs/prompt-proximas-fases.md` coloca o engine no servidor, com contas e save na nuvem.

Decisões do Victor (2026-10-23), que viram decisões numeradas no começo da implementação:

- **172. Adiantar a fase.** O servidor entra antes de o marco 3 fechar; a restrição 5 é dispensada, como já aconteceu com o Abismo. A região 4 e a arte seguem em paralelo.
- **173. Réplica com checagem.** O servidor é a autoridade. O cliente roda o mesmo engine em paralelo só para prever e gerar os eventos da cena. Conferi que o engine usa só aritmética exata entre motores JS: o único `Math.sqrt`, em `rng.ts:73` (`rngBinomial`), roda só no offline, que fica no servidor. A ordenação é estável e a ordem das chaves é a da especificação.
- **174. Postgres.**
- **175. Login:** conta convidado, e-mail com senha (argon2id) e Google. O 2FA entra antes do mercado (Fase 3).

Isto substitui o rascunho `docs/plan-marco-4.md`, que vira `docs/plan-fase-1.md` com este conteúdo. Uma correção ao rascunho: 6.500 eventos por hora dão menos de 2 por segundo, então transmitir eventos seria barato. A réplica foi escolhida porque a interface lê `sim.state` em 91 pontos, não por causa da banda.

## Arquitetura

```
apps/client ──WebSocket (JSON, codec $bigint)──► apps/server (Node 22, Fastify + @fastify/websocket)
  GameSim + Transport                              sessões em memória, laço de ticks, pool de workers (computeRates)
packages/protocol (Zod, compartilhado)                ──► Postgres (postgres.js + migrações SQL versionadas)
```

- **Uma sessão por conta:** um login novo derruba o anterior com `kicked{other_session}`, e o servidor salva antes de entregar o herói. A posse fica numa coluna `heroes.owner_session` com expiração.
- **Relógio e dia do servidor:** o servidor é o dono do tempo. `savedAt` e o tempo fora vêm dele. O dia muda à meia-noite de Brasília (C6), e isso entra como decisão 178. A semente do herói vem de `crypto.randomBytes`.
- **Laço:** a cada 100 ms, o servidor roda `step` (com eventos, que serão usados no chat e nos anúncios da Fase 2) para cada sessão ativa. Um herói offline não ocupa CPU. Na conexão, o servidor resolve o tempo fora com `advanceAway` (ver abaixo).
- **Persistência:** salva 1 s depois de cada intenção (com debounce), a cada 60 s e ao desconectar, sempre com `UPDATE … WHERE owner_session = $1` (escrita atômica). Também salva na hora em eventos importantes: subida de nível, drop épico ou lendário, reset. Guarda snapshots diários dos últimos 7 dias.

## Protocolo (`docs/protocolo.md` + `packages/protocol`)

- C→S `hello{buildId, token, lastSeq?}` → S→C `welcome{serverNow, tick, tickAtMs, state, offlineReport, contentVersion}`. O cliente guarda o conteúdo em cache por versão. Se o `buildId` for diferente, o servidor pede `reload`.
- C→S `intent{seq, atTick, intent}` → S→C `ack{seq, appliedAt}` ou `reject{seq, code}`. O código de `reject` é o de `IntentError`.
- O cliente aplica a intenção no tick `atTick = tick + 3`. Se o servidor responder com `appliedAt ≠ atTick`, ou com `reject` de algo que o cliente já aplicou, o cliente pede `resync` e recebe `state`.
- S→C `checkpoint{tick, hash}` a cada 30 s (`hashState` custa 3,4 ms). Se o hash não bater, o cliente pede `resync`, e o servidor registra a divergência.
- **Reconexão:** o cliente reenvia as intenções com `seq` maior que o último `ack`. O servidor ignora as já aplicadas (idempotente por `seq`) e manda o estado atual.
- `ping`/`pong`. Limite de taxa por conexão: 20 intenções por segundo, com rajada de 40. As intenções recusadas são registradas.

## Mudanças no engine (primeiro, puras e testadas)

1. **Intenções como dados.** `type Intent` (união discriminada, uma variante por método público do `GameSim` em `apps/client/src/game/sim.ts:196-430`) com esquema Zod e `applyIntent(state, content, intent, ctx: { day })`, que chama as funções que já existem (`startHunt`, `equipItem`, `refineItem`, `setSkillRule`…). Fica em `packages/engine/src/intent.ts`. `debugSetLevel` e os recursos de depuração ficam de fora.
2. **`advanceAway(state, content, ticks, rates)`.** Move para o engine a lógica de `GameSim.applyAway` (`sim.ts:530`): menos de 5 min, `stepQuiet`; mais que isso, `resolveOffline`.
3. **Testes:** `computeRates` não altera o estado de entrada (ele já usa `cloneState` em `prepareSample`, `rates.ts:84`, mas falta o teste que garanta isso); `applyIntent` equivale às chamadas diretas; **lockstep:** dois engines com as mesmas intenções nos mesmos ticks dão o mesmo `hashState` depois de 24 h simuladas, com intenções sorteadas pelo fast-check.

## Cliente

- O `GameSim` ganha um `Transport`. O modo **local** fica como hoje (desenvolvimento, `?speed=N`, e2e atuais, jogo sem conta enquanto o Victor quiser). O modo **online** prevê com o engine, envia as intenções e aplica `welcome`, `state` e `ack`. A cena e a interface continuam lendo `sim.state` e recebendo os mesmos `SimSignal`.
- Telas novas: entrar e criar conta, vincular a conta convidado, lista de sessões (derrubar uma), recuperar a senha, "reconectando…", "sua conta entrou em outro aparelho". Textos em `packages/i18n` (pt-BR e en).
- **PWA sem rede:** o jogo abre e mostra o herói e o último resumo, e explica que o herói continua caçando. O tempo é resolvido quando a conexão voltar.

## Servidor (`apps/server`)

- Fastify com `@fastify/websocket`, `@fastify/rate-limit`, `@node-rs/argon2`, `arctic` (OAuth do Google), `postgres` e `zod`. Importa `@abismo/engine` e `@abismo/content` direto do workspace.
- Tabelas: `accounts`, `identities` (`guest`, `password`, `google`), `sessions` (hash do token, aparelho, `last_seen`, expiração), `heroes` (save texto, versão, tick, `tick_at`, `origin` `new` ou `imported`, `owner_session`), `hero_snapshots`, `password_resets`, `intent_rejections`.
- **Autenticação:** limite de tentativas por IP e por e-mail, recuperação de senha com token de uso único e expiração de 30 min, e listagem e revogação de sessões.
- **Importar o save local** (decisão 177): uma vez por conta, com `decodeSave` mais limites de sanidade:
  - nível compatível com `lifetime.xpEarned`;
  - `gold ≤ lifetime.goldEarned`;
  - iLvl dos itens dentro do que as caçadas liberadas dão;
  - refino possível;
  - `tick` compatível com o tempo de jogo.

  Um herói importado recebe `origin = imported`. Se a conta já tiver herói, o jogador escolhe qual manter.

- **LGPD:** política de privacidade (o texto precisa de revisão humana), exclusão de conta (apaga o herói em até 30 dias) e exportação dos dados (o save mais os dados da conta).
- Dockerfile do servidor e `docker-compose.yml` com Postgres para desenvolvimento.

## Situação em 2026-10-23

Commits 1 a 12 prontos e testados (decisões 172 a 180). O jogo roda online com `?online=1` em desenvolvimento ou `VITE_ONLINE=1` no build. O servidor sobe com `pnpm --filter @abismo/server dev`; sem `DATABASE_URL`, ele usa PGlite em `apps/server/.data`. Falta:

- **Commit 13 (deploy):** depende da escolha de hospedagem. Também falta o Dockerfile do servidor, que não dá para testar nesta máquina, porque não tem Docker.
- **Provedor de e-mail:** enquanto não houver um, o link de recuperação de senha vai para o log do servidor.
- **Google:** as credenciais do OAuth precisam ser criadas (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).
- **Turnstile:** o widget no cliente e a chave (`TURNSTILE_SECRET` no servidor).
- **Política de privacidade e termos de uso:** os textos completos, com revisão jurídica (decisão 179).
- **`docker-compose.yml` com Postgres de verdade:** escrito, mas não testado aqui.

## Ordem dos commits

1. `feat(engine)`: `Intent` + `applyIntent` + testes; o `GameSim` passa a usar o dispatcher (nada muda para o jogador).
2. `feat(engine)`: `advanceAway` + teste de que `computeRates` não altera o estado.
3. `test(engine)`: lockstep com fast-check.
4. `feat(protocol)`: mensagens, codec e `docs/protocolo.md`.
5. `feat(server)`: sessão em memória, laço, intenções, checkpoint, tempo fora (sem banco nem contas); teste com dois clientes simulados.
6. `feat(client)`: transporte online, `resync`, reconexão (`?online=1` em desenvolvimento).
7. `feat(server)`: Postgres, migrações, salvar e carregar, posse exclusiva, snapshots; `docker-compose`.
8. `feat(server,client)`: contas (convidado, senha, Google), sessões, recuperação de senha, limites de taxa.
9. `feat(server,client)`: importar o save local.
10. `feat(engine,server)`: dia de Brasília (decisão 178), semente do servidor.
11. `feat(client,server)`: LGPD.
12. `test`: carga (N clientes falsos; medir quantos heróis um processo aguenta com p99 do laço abaixo de 50 ms) e e2e online.
13. Deploy (depende da pergunta de hospedagem).

## Verificação

- `pnpm typecheck`, `pnpm lint` e `pnpm test` verdes em cada commit. O simulador não muda, porque nenhuma regra muda: o hash dourado tem que continuar `c1e2c353d96acd54`.
- Testes do servidor (vitest + Postgres no Docker): ack e ordem por `seq`; reconexão com intenções pendentes sem aplicar duas vezes; segunda conexão derruba a primeira sem perder progresso; servidor × engine (as mesmas intenções dão o mesmo hash); tempo fora pelo relógio do servidor; um `hello` com estado forjado é ignorado; limites de taxa; autenticação (senha errada, bloqueio, recuperação, Google com mock).
- E2E (Playwright com o servidor no ar), seguindo o aceite da fase: criar conta → jogar → fechar → abrir num segundo contexto do navegador (o "outro aparelho") → mesmo progresso. Editar o IndexedDB não muda nada no servidor.
- Teste de carga com o resultado registrado numa decisão.

## Perguntas que ficam para depois (não bloqueiam os commits 1 a 12)

- **Hospedagem** (custa dinheiro; necessária só no commit 13): Fly.io em São Paulo com Postgres gerenciado (recomendo), uma VPS com Docker Compose ou outra opção.
- **Envio de e-mail** para a recuperação de senha (custa dinheiro; necessário no commit 8): Resend (recomendo), SES ou SMTP próprio. Até a escolha, o servidor de desenvolvimento só escreve o link no log.
- **Credenciais do Google OAuth:** o Victor cria o projeto no Google Cloud.
