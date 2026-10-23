# Protocolo cliente ↔ servidor

Referência das mensagens trocadas entre o cliente e o servidor. Os tipos e esquemas estão em `packages/protocol`, que os dois lados importam. O modelo foi definido na decisão 173 (réplica com checagem). O lado do cliente está implementado em `Replica` (`packages/protocol/src/replica.ts`), sem transporte; o navegador, os testes do servidor e o teste de carga usam a mesma classe.

## Transporte

- Uma WebSocket por aba. Cada quadro de texto leva uma mensagem JSON. `bigint` vai como `{ "$bigint": "…" }`, o mesmo formato do save.
- Quadro maior que 1 MB, JSON inválido ou mensagem fora do esquema é descartado. Três descartes seguidos derrubam a conexão com `kicked{protocol}`.
- O estado do jogo viaja sempre como **texto de save** (`encodeSave`). O cliente o lê com `decodeSave`, então migração e validação são as mesmas de um save local.
- `PROTOCOL_VERSION` começa em 1 e sobe a cada mudança incompatível.

## Tempo

O servidor é o único relógio, e cada tick dura 100 ms. Toda mensagem de relógio (`clock`) diz que o tick `tick` começou no instante `atMs` do servidor. O cliente estima a diferença entre o relógio dele e o do servidor pelo `serverNow` e pelos `pong`.

O cliente roda **`CLIENT_LEAD_TICKS` (5) ticks à frente** do servidor. Cada intenção é aplicada no tick atual do cliente e enviada com esse tick (`atTick`). Como o servidor ainda não chegou lá, ele a guarda e a aplica no mesmo tick, antes de rodar esse tick. Os dois chegam ao mesmo resultado, inclusive nos sorteios (refino, reforja, forja).

## Cliente → servidor

| Mensagem | Campos                         | Notas                                                                                                                                                             |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hello`  | `protocol`, `buildId`, `token` | Primeira mensagem. O `token` é o da sessão (conta convidado ou login).                                                                                            |
| `intent` | `seq`, `atTick`, `intent`      | `seq` cresce a partir do `lastSeq` do último `welcome`/`state` (um aparelho novo continua a numeração). `intent` é um `Intent` (`packages/engine/src/intent.ts`). |
| `resync` | —                              | Pede o estado inteiro.                                                                                                                                            |
| `ping`   | `t` (relógio do cliente)       | Latência e conexão viva.                                                                                                                                          |

## Servidor → cliente

| Mensagem     | Campos                                                                     | Notas                                                                                                            |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `welcome`    | `serverNow`, `clock`, `save`, `lastSeq`, `offlineReport`, `contentVersion` | Resposta ao `hello`. O tempo fora já foi resolvido (`advanceAway`). `lastSeq` é a última intenção aplicada.      |
| `ack`        | `seq`, `appliedAt`                                                         | A intenção foi aplicada no tick `appliedAt`.                                                                     |
| `reject`     | `seq`, `code`                                                              | A regra recusou, com o código de `IntentError`, ou o protocolo recusou (`too_early`, `rate_limited`, `bad_day`). |
| `checkpoint` | `tick`, `hash`                                                             | `hashState` do tick depois das intenções dele e antes de rodá-lo, a cada `CHECKPOINT_TICKS` (300 ticks = 30 s).  |
| `state`      | `clock`, `save`, `lastSeq`                                                 | Resposta ao `resync`.                                                                                            |
| `kicked`     | `reason`                                                                   | `other_session`, `reload` (`buildId` diferente), `auth`, `maintenance`, `protocol`. A conexão fecha em seguida.  |
| `pong`       | `t`, `serverNow`                                                           |                                                                                                                  |

## Regras do servidor para cada intenção

1. Valida a mensagem pelo esquema estrito. Um campo a mais já é recusa.
2. `seq` menor ou igual ao último aplicado: ignora, mas responde `ack` de novo (é o reenvio de uma reconexão).
3. `atTick` acima de `tick atual + MAX_LEAD_TICKS` (50): `reject{too_early}`.
4. `atTick` no passado (a mensagem chegou atrasada): aplica no tick atual e responde `ack` com `appliedAt` diferente.
5. Intenções que dependem do dia (`claim_login`, `refresh_quests`) precisam trazer o dia do servidor; senão, `reject{bad_day}`.
6. Limite de 20 intenções por segundo, com rajada de 40: `reject{rate_limited}`. As recusas ficam registradas.

## O que o cliente faz com as respostas

- `ack` com `appliedAt = atTick`: nada a fazer, a previsão estava certa.
- `ack` com `appliedAt ≠ atTick`, ou `reject` de uma intenção que ele já tinha aplicado: a réplica divergiu, então ele manda `resync`.
- `checkpoint`: compara com o próprio `hashState` naquele tick (guarda os hashes dos últimos ticks). Se for diferente, manda `resync`. O servidor registra quantas vezes isso acontece.
- **Conexão caiu:** a cena segue a réplica por até 30 s e depois mostra "reconectando…". Ao reconectar, o cliente manda `hello`, recebe `welcome` (com o tempo fora resolvido) e reenvia as intenções com `seq > lastSeq`, cujo `atTick` antigo vira "atrasado" pela regra 4.
- `kicked{other_session}`: mostra "sua conta entrou em outro aparelho" e não reconecta sozinho.

## Uma sessão por conta

Um `hello` válido de uma conta que já tem sessão ativa derruba a anterior com `kicked{other_session}`. Antes de entregar o herói à nova conexão, o servidor salva o estado da anterior.
