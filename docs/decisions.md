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

## Perguntas para revisão

- **Teto de XP (item 12):** 2³¹ − 1 em décimos (coluna `integer`) ou em XP (coluna `bigint`)?
- **XP/h da Forja (item 18):** a fundição de bronze dá 4.500 XP/h e a adaga 4.800 XP/h, contra a meta de 3.000. Ajusto para a meta ou a produção pode ficar acima, já que depende do tempo de coleta dos materiais?
- **Inventário (item 7):** a interpretação “28 pilhas” está ok?
