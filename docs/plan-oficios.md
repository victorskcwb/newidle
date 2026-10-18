# Plano — Ofícios (skills de coleta e produção)

GDD 3.2: "skills de coleta alimentam produção, que alimenta combate". O que o jogo ganha: um segundo eixo de progresso que anda junto com a caça (sempre há uma barra enchendo), uma razão para escolher caçadas pelo recurso e não só pelo XP, e uma fonte de materiais de refino que o jogador controla.

## Regras

- **Quatro ofícios, níveis 1 a 99.** Curva: XP do nível L ao L+1 = floor(50 × 1,09^(L−1)), ~2,5 milhões de XP até o 99.
- **Coleta (Mineração, Herbalismo):** um ofício de coleta ativo por vez, em paralelo à caça. Coleta enquanto o herói está numa caçada (toda atividade fora da vila parada), como o combate. Cada caçada tem uma faixa de recurso (1 a 5); o herói coleta o melhor recurso com faixa ≤ a da caçada e nível exigido ≤ o dele. Velocidade: 1 unidade a cada `seconds` do recurso, +1% por nível acima do exigido (até +50%).
- **Produção (Forja, Alquimia):** uma receita ativa por vez, que roda sempre (também na vila e offline) enquanto houver insumos. Cada receita tem nível exigido, insumos, produto, tempo e XP.
- **Os produtos alimentam o que já existe:** a Alquimia faz poções e materiais de refino (essência, cristal, núcleo); a Forja faz fragmentos, a **liga de têmpera** (+10 pontos de chance numa tentativa de refino) e, no nível alto, o amuleto de proteção.
- **Offline exato:** coleta e produção são determinísticas (sem sorteio); o offline avança unidade a unidade, intercalando coleta e produção, e dá o mesmo resultado que o jogo aberto.
- **Tudo em conteúdo** (`professions.json`): ofícios, recursos, faixas das caçadas, receitas.

## Etapas

1. ✅ Conteúdo, engine (estado, tick, offline, refino com têmpera), save v12, testes.
2. ✅ Tela de Ofícios (níveis, coleta, receitas), opção de têmpera no ferreiro, resumo offline, registro.
3. 🟡 Conquistas de ofício (✅), simulador com ofícios, balanceamento.
4. Pesca e Culinária com refeições (abaixo). Depois: lenhador.

## Etapa 4 — Pesca, Culinária e refeições

- **Pesca** (coleta): peixes de faixa 1 a 5, como minérios e ervas, nas mesmas faixas das caçadas.
- **Culinária** (produção): peixes → refeições.
- **Refeição:** consumível com um bônus (um atributo) e duração de 30 min de caça. O jogador escolhe uma refeição; o herói come sozinho quando a anterior acaba e há estoque. Só conta o tempo de caça (o mesmo da coleta). Bônus pequenos e quase todos fora do XP (ouro, chance de item mágico, dano), para não acelerar o nível além da meta.
- **Offline:** a refeição muda os atributos, então muda a ficha de taxas. Se o estoque acabar no meio do tempo fora, o offline resolve em dois trechos: com refeição (ficha atual) e sem (ficha recalculada), somando os dois relatórios.
- **Atributos:** a refeição ativa fica no herói e entra na chave do cache de atributos.

## Riscos

- **Materiais demais** aceleram o refino. As receitas convertem devagar (muitas ervas por material) e o simulador mede o efeito.
- **Desempenho:** o tick ganha dois contadores; a amostragem da ficha de taxas não roda os ofícios.
