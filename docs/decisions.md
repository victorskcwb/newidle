# Decisões

Decisões que a especificação não cobria (ou deixava ambígua). Formato: o que foi decidido, por quê, e o pilar (seção 1) ou a restrição (seção 2) que justificou.

## Primeira tarefa (2026-10-14)

### Ferramentas e repositório

1. **A raiz do repositório é a própria pasta `newidle`** (e não uma subpasta `valdren-idle/`). A estrutura interna segue a seção 3. _Por quê:_ é a pasta do projeto; uma subpasta só adicionaria um nível.
2. **TypeScript 6.0.3 em vez do 7.x.** O TS 7 é a versão estável atual, mas o `typescript-eslint` 8.71 aceita só `>=4.8.4 <6.1.0`. Voltamos ao 7 quando o typescript-eslint suportar. _Restrição:_ CI com lint (seção 3).
3. **Pacotes do workspace são consumidos como fonte TypeScript** (`exports` aponta para `src/index.ts`), sem etapa de build; o servidor roda com `tsx` e o cliente com Vite. _Por quê:_ zero passos de build entre pacotes e uma única implementação das regras (restrição 3).
4. **Docker não estava instalado na máquina de desenvolvimento.** O `docker-compose.yml` está escrito, mas ainda não foi exercitado; a primeira tarefa não precisa de Postgres nem de Redis.

### Engine

5. **`SlotState` inclui um retrato das habilidades e do banco do personagem.** `step` precisa deles para checar níveis, ferramentas e materiais, e o engine não faz I/O. _Risco (marco 2):_ os dois espaços compartilham o banco; o servidor vai precisar resolvê-los intercalados em ordem de tick. _Restrição 3 (uma única implementação)._
6. **O progresso da ação é guardado como `startedTick`** (o progresso é `tick − startedTick`), e não como um contador. Isso permite saltar direto para o próximo evento, sem iterar tick a tick, e deixa `step(n)` ≡ `n × step(1)` (há teste). _Pilar 2 (o offline é o centro):_ resolver 15 min ou 12 h custa praticamente o mesmo.
7. **Inventário de ação = 28 pilhas** (itens iguais empilham também no inventário). Depósito no banco a cada 500 ticks (5 min). Se um item novo não cabe, o inventário é depositado na hora: a coleta nunca para por inventário cheio. Também há depósito quando o espaço para. O combate pode ter regra própria (“inventário cheio” para a luta). _Pilar 2._
8. **Materiais vêm do inventário de ação primeiro e depois do banco.** Eles são checados quando a execução começa e de novo quando termina (caso algo fora do espaço os tenha retirado).
9. **Fila:** `startAction` substitui a ação atual e mantém a fila; `intent.stop` limpa a ação e a fila. Uma entrada da fila que não pode começar (falta material ou nível) é pulada, e o motivo é informado no `SlotStopped` se nada mais puder rodar. _Pilar 4 (decisões curtas, consequências longas)._
10. **Sorteio binomial:** é exato (n tentativas) quando a variância é < 100. Acima disso, usa aproximação normal com desvio de Irwin–Hall (soma de 12 uniformes). Só usa `+ − × ÷` e `sqrt`, que o IEEE 754 define exatamente; `Math.log`/`exp`/`pow` podem variar entre motores JS. O ESLint proíbe `Math.random`, `Math.pow`, `Math.exp`, `Math.log`, `Date`, `performance` e timers em `packages/engine/src`. _Restrição 4 (determinismo)._
11. **Curva de XP calculada com racionais `BigInt`** (75 × 11^(L−1) / 10^(L−1)), sem ponto flutuante. O total até o 99 é 8.540.900 XP.
12. **Teto de XP = 2³¹ − 1 em décimos** (≈ 214,7 milhões de XP), para caber num `integer` do Postgres. ⚠️ _A especificação pode querer dizer 2³¹ − 1 XP (a coluna teria de ser `bigint`). Está nas perguntas abaixo._
13. **`resolveOffline` divide o lote nos níveis ganhos e nas fronteiras de fila/parada.** Assim, XP, níveis, materiais e saídas garantidas batem **exatamente** com `step` (há teste), e saídas com chance batem em distribuição. No offline, tudo vai direto para o banco.
14. **Eventos extras:** `InventoryDeposited`. **Campos extras:** `ActionCompleted.nextStartTick` e `QueueAdvanced.durationTicks`, para a cena agendar animações sem ler o estado. Os eventos de combate entram com o combate.
15. **`hashState`** = FNV-1a 64 (`BigInt`) sobre JSON canônico (chaves ordenadas). O hash golden de 100.000 ticks é verificado no Node e no Chromium.
16. **Semente:** `deriveSeed(personagem, espaço, reinícios)` = 4 palavras FNV-1a 32 com offsets distintos + avalanche murmur3; sfc32 com 15 rodadas de aquecimento.

### Conteúdo

17. **Campos novos no conteúdo:** `nameKey` nas ações; `regions.json` com `skyColor` e `background`; um campo `tool` nos itens (`type`, `speedBonusPpm`). Por ora, ferramentas valem se estiverem no banco ou no inventário (ainda não há espaço de equipamento de ferramenta).
18. **Valores inventados** (a especificação não dava): picareta de bronze e martelo (sem bônus); adaga de bronze (velocidade 4, precisão +4, força +3); “Forjar adaga de bronze” = 1 barra, 3.000 ms, 4,0 XP. A fundição usa os valores do exemplo da seção 9.1 (2.400 ms, 3,0 XP), o que dá 4.500 XP/h, acima da meta de 3.000 (ver perguntas).

### Cliente e cena

19. **O relógio da cena é `Date.now()`, com atraso de 1 tick** (600 ms). Eventos que vencem com mais de 1,5 s de atraso (ex.: aba que voltou do segundo plano) são aplicados sem animação. _Pilar 3 (mundo vivo) sem “replay” de tempo perdido (seção 6.5)._
20. **Escala inteira com fallback:** se a escala inteira ocupar menos de 80% do espaço (ex.: celular de 360 px com dpr 2 → só 1×), a cena renderiza na escala inteira seguinte e o CSS a reduz para caber. _Restrição 8 (mobile-first)._
21. **Golpes de coleta:** número de golpes por ação = round(duração ÷ 750 ms); o quadro de impacto do último golpe cai exatamente no `ActionCompleted`. Golpes intermediários soltam poucas lascas; a conclusão solta a explosão maior e o item voando.
22. **Página de teste sem servidor:** guarda o estado no `localStorage` e, ao voltar, resolve a lacuna como o servidor fará (≤ 1.500 ticks com `step`, acima disso com `resolveOffline`, limitada a 12 h). A época do tick global (1/1/2026 UTC) é provisória e só local; quem define a época é o servidor.

## Banco, contas e inventário (2026-10-14)

23. **Postgres embutido (`embedded-postgres`) em vez de exigir Docker.** O `pnpm dev` sobe um Postgres 18 real como processo filho (porta 5433, dados em `tools/dev-db/.pgdata`), e os testes de integração sobem outro, temporário. O Docker Compose continua disponível: basta definir `DATABASE_URL`. Sem Redis por enquanto: nada do marco 1 precisa dele ainda. _Seção 12.4 (`pnpm dev` a partir de um clone limpo)._
24. **Postgres 18** (também no Compose), a versão que o embedded-postgres traz. Os UUID v7 são gerados na aplicação (`uuid`), então nada depende do `uuidv7()` nativo.
25. **Serialização por personagem:** toda operação de inventário começa com `SELECT … FOR UPDATE` na linha do personagem. Duas requisições do mesmo personagem nunca intercalam; personagens diferentes não se bloqueiam. Dentro da transação, os itens são processados em ordem de id. _Restrição 9 (atomicidade, sem duplicação)._
26. **Moedas no ledger usam `item_id = 'coins'`** e ficam em `characters.coins`. A checagem de consistência compara o ledger com `bank_items` e, para moedas, com `characters.coins`.
27. **Motivos do ledger:** `starter`, `action`, `combat`, `death`, `equip`, `market`, `shop`, `admin`. O `equip` existe porque equipar tira o item do banco, e o ledger acompanha o banco.
28. **O estado salvo em `slots.state` guarda `skills` e `bank` vazios:** as tabelas próprias são a fonte da verdade, e o estado é hidratado delas na resolução. A semente é gravada como int32 (mesmos bits do uint32).
29. **Coluna `accounts.role`** (`player`/`admin`) para o painel administrativo (seção 12.1). **Índice único `characters.account_id`** (1 personagem por conta; remover o índice libera mais) e **nome único sem diferenciar maiúsculas** (`lower(name)`). O nome aceita letras (inclusive acentuadas), dígitos, `_` e espaços simples, com 3–12 caracteres.
30. **Sessão:** cookie `vsid` HttpOnly, SameSite=Lax, Secure em produção, validade de 30 dias (fixa). Em desenvolvimento, o Vite faz proxy de `/api` para o servidor, então a API fica na mesma origem e o cookie funciona sem CORS. ⚠️ O `hello` do WebSocket (seção 7.4) leva um token, mas o cookie HttpOnly não é legível pelo JS. Proposta: autenticar o WS pelo cookie no upgrade e tornar o token do `hello` opcional (para o app nativo). Decido na tarefa do WebSocket.
31. **Limite de requisições em memória** (janela fixa de 1 min: 120 por IP, 60 por conta), suficiente para um processo. Passa para o Redis quando houver mais de uma instância.
32. **Argon2id com os padrões do `@node-rs/argon2`** (19 MiB, t=2, p=1, a linha de base do OWASP). No login de email inexistente, a senha é verificada contra um hash falso, para que o tempo de resposta não revele se a conta existe.
33. **Loja NPC:** recebe `floor(valorBase × qtd × 40 / 100)` moedas. Itens não negociáveis também podem ser vendidos à loja.

## Protocolo e tempo real (2026-10-14)

34. **O WebSocket autentica pelo cookie de sessão no upgrade.** O `token` do `hello` é opcional (para um futuro app nativo). Sem sessão válida, o servidor fecha com o código 4001. _Seção 12.1 (cookies HttpOnly)._
35. **Mensagens além da tabela 7.4:** `ping`/`pong` (o relógio estimado precisa de amostras) e `slot.requestResync` do cliente, com `reason`. `divergence` é registrada em `event_log` como bug; `stale` (cliente muito atrasado, ex.: aba em segundo plano) só pede o estado resolvido, sem registro. _Seção 6.5._
36. **`slot.started` traz `replyTo` e os eventos da própria intenção** (ex.: `QueueAdvanced`), para a cena animar o início. Erros de intenção também trazem `replyTo`. `actionBlocked` leva o `BlockReason` do engine em `details`, e o cliente explica o motivo ("Falta Minério de estanho").
37. **O `slot.checkpoint` leva o hash e, como "deltas persistidos", a lista completa de habilidades e o banco** naquele tick. Por enquanto são pequenos; quando o banco crescer, vira delta de verdade.
38. **O cliente guarda os últimos 64 estados** para calcular o hash no tick exato do checkpoint. Se estiver atrás do servidor, avança até o tick; se estiver à frente, parte do estado anterior mais próximo e avança até lá. Se o cliente estiver mais de 1.500 ticks atrás, pede o estado em vez de reproduzir.
39. **Mudanças fora do espaço** (ex.: venda à loja): o servidor resolve o espaço antes, aplica a venda e manda `slot.resync` com `reason: external` aos clientes do personagem.
40. **`intent.startCombat` e `intent.equip` já estão no protocolo**, com os campos da seção 7.4; o servidor responde `notImplemented` até o combate e o equipamento existirem.
41. **Cada conexão processa suas mensagens estritamente em ordem** (fila de promessas); `seq` fora de ordem é recusado. O limite de 10 intenções/s fecha a conexão com o código 4008.
42. **A página do engine sem servidor passou para `/?local`.** A raiz `/` agora é o jogo real (cadastro → herói → jogo).
43. **E2E com a stack completa em portas próprias** (Postgres 5434, API 3100, web 5174), para não colidir com um `pnpm dev` aberto.

## Perguntas para revisão

- **Teto de XP (item 12):** 2³¹ − 1 em décimos (coluna `integer`) ou em XP (coluna `bigint`)?
- **XP/h da Forja (item 18):** a fundição de bronze dá 4.500 XP/h e a adaga 4.800 XP/h, contra a meta de 3.000. Ajusto para a meta ou a produção pode ficar acima, já que depende do tempo de coleta dos materiais?
- **Inventário (item 7):** a interpretação “28 pilhas” está ok?
