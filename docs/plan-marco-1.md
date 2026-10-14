# Plano do marco 1: protótipo jogável (cena viva + offline)

## Estado após a primeira tarefa (2026-10-14)

Pronto:

- Monorepo (pnpm + Turborepo), TypeScript estrito, ESLint (com regras de determinismo no engine), Prettier, Vitest, Playwright, Docker Compose (Postgres + Redis) e CI no GitHub Actions.
- `packages/engine`: PRNG sfc32, curva de XP, `SlotState`/`GameEvent`, `step` e `resolveOffline` para coleta e produção, fila com condições de parada, depósito automático, `hashState`, sementes, intenções (`startAction`, `setQueue`, `stopSlot`) e taxas para a interface.
- `packages/content`: esquemas Zod de itens, ações, regiões, monstros, tabelas de loot e áreas de caça; validação de referências cruzadas; conteúdo de Mineração (cobre, estanho) e Forja (barra e adaga de bronze).
- `packages/i18n`: textos pt-BR; o `content-build` falha se faltar tradução.
- `apps/client`: página de teste que roda o engine localmente com a cena PixiJS. O herói caminha até a rocha, minera com golpes sincronizados, solta lascas, o minério voa para a bolsa, o XP sobe e há faixa de nível. Inclui resumo offline e banco.
- Testes: 33 do engine (unidade, determinismo, offline vs tick a tick ±3% sobre 10.000 resoluções, fast-check), 7 de conteúdo e 2 e2e (determinismo no Chromium = Node; página de teste minerando).
- Esqueletos: `apps/server` (só `/health`), `packages/protocol` (envelope e intenções de ação), `tools/simulator` (XP/h por ação vs. metas da seção 4.3).

## Tarefas restantes, em ordem

Cada tarefa segue a ordem engine e testes → servidor → cena e interface.

1. **Infra local.** Validar `docker compose up` (Postgres 17 + Redis 7), módulo de configuração por variáveis de ambiente e `pnpm dev` subindo tudo a partir de um clone limpo.
2. **Esquema do banco (Drizzle) e migrações.** Tabelas `accounts`, `sessions`, `characters`, `skills`, `slots`, `bank_items`, `equipment`, `bestiary`, `item_ledger` e `event_log`, com ids UUID v7. _Revisar antes de aplicar: difícil de desfazer._
3. **`InventoryService`.** Toda escrita de item ou moeda numa transação com `SELECT … FOR UPDATE` e uma linha no `item_ledger`. Testes de integração: ledger = banco; duas requisições simultâneas não duplicam item.
4. **Autenticação REST.** Register, login e logout (argon2id, token de 256 bits guardado como hash, cookie HttpOnly), limites de requisição e erros `{ code, messageKey }`.
5. **Personagem.** `POST /characters` (nome único de 3–12 caracteres e aparência), `GET /me`, `GET /bank`, `GET /content/version`.
6. **Protocolo completo (seção 7.4)** em `packages/protocol`, com testes de esquema. _Revisar antes de fechar: difícil de desfazer._
7. **Servidor WebSocket.** `hello`/`welcome` com resumo offline; intenções validadas pelo engine; resolução preguiçosa (≤ 1.500 ticks com `step`, acima disso com `resolveOffline`); gravação de estado + deltas + ledger numa transação; `slot.checkpoint` a cada 50 ticks; `slot.resync`; registro de divergências; limite de 10 intenções/s.
8. **Rede no cliente.** Cliente WS com relógio estimado (média de 5 pings), render 1 tick atrasado, backoff de reconexão (1 s → 30 s), comparação de hash nos checkpoints e fade de 200 ms no resync. Substitui o `LocalSim` (que fica só como página de dev).
9. **Engine: combate.** Fórmulas 5.2, triângulo, XP 5.3, ondas e caminhada, comer abaixo do limite (3 ticks), poções, morte (só online), tabelas de loot (garantido, por peso, raro, proteção contra azar), bestiário e eventos de combate. Em seguida, **combate por médias offline** com teste de ±3% sobre 10.000 simulações e equipamento com bônus.
10. **Conteúdo do marco 1.** Mineração (ferro 15, carvão 30), Pesca (sardinha, truta, salmão), Culinária (com chance de queimar que cai com o nível), Forja de bronze e ferro (adaga, espada, escudo, elmo, peitoral), comida, Esgotos de Brumaporto (rato gigante, gosma do esgoto) com tabelas de loot.
11. **Cena: combate e equipamento.** Coreografia 6.3 (spawn pela direita, ataques com quadro de impacto no tick, projéteis, números flutuantes por tipo, piscar e tremor, morte e fade, loot voando, comer, volta à cidade), camadas de equipamento no herói e modo econômico.
12. **Telas do marco 1.** Cadastro e criação de herói com prévia animada; Início com cartões de espaço e fila; Habilidades; Combate com prévia (abates/h, XP/h, duração da comida); Equipamento com 12 espaços e comparação; Banco com busca, filtros e detalhes; resumo offline; Configurações (som, modo econômico, modo lista, reduzir movimento, fonte).
13. **Onboarding (seção 11.4)**, na medida do conteúdo do marco 1.
14. **Testes de aceite.** E2E completo (cadastro → minerar → forjar → equipar → lutar → fechar → voltar e ver o resumo), checkpoints sem divergência por 1 h (teste acelerado), teste de desempenho da cena e relatório `docs/report-marco-1.md`.

## Riscos

- **Banco compartilhado entre dois espaços** (marco 2): exige resolver os espaços intercalados por tick no servidor. O formato atual do `SlotState` permite isso, mas o serviço precisa ser desenhado para essa ordem.
- **Combate por médias dentro de ±3%:** comer, ondas e caminhada criam efeitos não lineares. Mitigação: validar cedo com o mesmo teste estatístico da coleta e dividir os lotes nos pontos de não linearidade (comida acaba, nível ganho).
- **Determinismo com combate:** fórmulas com divisão produzem frações. Toda conta que afeta estado tem de ser inteira (ppm, décimos); o teste golden no navegador pega regressões.
- **Tamanho do bundle** (PixiJS ≈ 500 kB): code-splitting da cena e atlas sob demanda.
- **Docker no Windows:** a máquina de desenvolvimento ainda não tem Docker; os testes de integração precisam dele (ou de Testcontainers).
