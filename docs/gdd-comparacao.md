# GDD × Abismo Idle (2026-10-18)

Comparação entre o [GDD](../game-design-idle-rpg.md) e o jogo como está hoje (especificação + [decisões](decisions.md) 1–139).

## 1. Conflitos

Decididos em 2026-10-18 conforme a coluna "Recomendação" (decisão 140).

| #   | GDD                                                                             | Especificação / jogo atual                                                                                                                                                                | Recomendação                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Servidor autoritativo desde já (0.2, 11)                                        | Single-player com save local até o marco 4 (restrição 5). O engine já é puro e pronto para rodar no servidor.                                                                             | Manter o save local por enquanto. O servidor vira obrigatório **antes** do primeiro ranking, mercado ou compra, porque o save local é fácil de editar.                                                |
| C2  | Stack Angular + FastAPI + MongoDB                                               | React + Phaser + TypeScript. O servidor precisa ser Node para reaproveitar o engine.                                                                                                      | Manter a stack atual. O GDD diz "sugerida".                                                                                                                                                           |
| C3  | Jogo ativo dá +10–20% e habilidades clicáveis dão burst (4)                     | "Clicar não acelera nada" (restrição 6)                                                                                                                                                   | Manter a restrição 6. Ela combina com sessões curtas, e o próprio GDD diz que o jogo ativo não pode ser obrigatório.                                                                                  |
| C4  | VIP com +25–50% de XP e ouro; poções de XP ×2 à venda (8.2)                     | Nada de XP, itens de poder ou chance de drop à venda (restrição 7)                                                                                                                        | Manter a restrição 7. XP comprado leva ao topo do ranking de resets, o que a regra 0.3 do próprio GDD proíbe. O VIP pode vender offline maior, slots, automação, cosméticos e a moeda premium diária. |
| C5  | 6 raridades: Comum, Incomum (verde), Raro (azul), Épico, Lendário, Mítico (3.3) | 5 raridades: Comum, Mágico (azul), Raro (amarelo), Épico, Lendário                                                                                                                        | Manter as 5, que já estão no conteúdo, no save e no balanceamento. "Mítico" pode entrar depois como sexta raridade de late game (masmorra).                                                           |
| C6  | Reset diário às 00:00 de Brasília (6.1)                                         | Meia-noite local do aparelho (decisão 75)                                                                                                                                                 | Mudar junto com o servidor; antes disso, o horário fixo não protege nada.                                                                                                                             |
| C7  | Nenhum asset de terceiros que lembre as franquias (0.1, 14)                     | Criaturas, terreno e efeitos do OpenTibia Sprite Pack (CC BY 4.0, uso comercial permitido). A decisão 88 já notava que parte dele "imita o Tibia de perto". Os nomes são todos originais. | Legalmente ok. Antes de publicar em loja (Steam ou mobile), avaliar se vale trocar as criaturas por arte própria, pela identidade visual (pilar 1.2 "nostalgia com identidade própria").              |

## 2. O que já existe

| GDD                                                                                  | Onde está no jogo                                                    |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Personagem se move no mapa, cavebot (1.3)                                            | cena Phaser, caçada livre (decisão 106)                              |
| Níveis, atributos, árvore de habilidades (3.1)                                       | Guerreiro, 12 nós                                                    |
| Loot com raridades, afixos, refino +15 com proteção, filtro e venda automática (3.3) | seções 7 e decisões 47, 116, 124                                     |
| Lendários únicos, reforja                                                            | decisões 73–74                                                       |
| Cartas com pity e bônus de região (3.4)                                              | decisão 71                                                           |
| Prestígio com loja e ciclos mais rápidos (3.5)                                       | reset, decisões 68–70                                                |
| Regiões, chefes, elites (3.6)                                                        | 3 regiões, 9 caçadas, elites com afixos                              |
| Offline com resumo "Enquanto você estava fora" (4)                                   | seção 9, limite 12 h + Paciência                                     |
| Automações desbloqueáveis (4)                                                        | parcial: Automação libera regra do filtro                            |
| Notificações (4)                                                                     | PWA, decisão 78                                                      |
| Onboarding com recompensas rápidas (5)                                               | nível 2 em segundos, mágico garantido no 5º abate, dicas contextuais |
| Metas diárias e semanal (6.1, 6.2)                                                   | decisão 75                                                           |
| Feedback visual e sonoro, acessibilidade, modo gráfico (9)                           | decisões 76, 107, 118, 130, 133                                      |
| Taxas por hora visíveis (9)                                                          | ficha de taxas no mapa de caçadas                                    |

## 3. O que falta, por prioridade

O critério é o do GDD: retenção antes de monetização, e primeiro o que não depende de servidor.

### A. Sem servidor, alto impacto em retenção

1. ✅ **Pity em drops de equipamento épico e lendário** (3.3): decisão 141.
2. ✅ **Login diário com dias acumulados** (6.1): decisão 142.
3. ✅ **Conquistas e títulos** (6.4): decisões 144–145.
4. ✅ **Estatísticas detalhadas** (9): decisão 145 (sem o gráfico de XP/h, que precisa de histórico).
5. ✅ **Bestiário com marcos de abates** (3.4): decisões 143 e 145.
6. ✅ **Primeiro item raro garantido** (5): decisão 146.

### B. Sem servidor, médio impacto

7. **Coleção de itens** (registrar uma base ou um lendário único dá bônus pequeno) (3.4).
8. **Sets de 2/4/6 peças** (3.3).
9. **Mais automações:** auto-equipar o melhor (o engine já tem "equipar melhores"), auto-mudar de caçada, auto-reset (4).
10. **Inglês** (9). O i18n já está pronto; falta o `en.json` e o seletor.
11. **Masmorra infinita** (3.6). Já planejada no marco 3, com ranking pessoal.

### C. Sistemas grandes fora da especificação (decidir se entram)

12. **Skills de coleta e produção estilo OSRS** (3.2): mineração, pesca, forja, alquimia, até o nível 99. É o maior gancho de retenção do GDD que o jogo não tem, e também o maior escopo: economia, conteúdo e interface novos.
13. **Pets** (3.4, 8.2.7).
14. **4ª classe (invocador)** (3.1). A especificação prevê 3.

### D. Dependem de servidor (marco 4)

Telemetria D1/D7/D30 (já é a tarefa 9 do marco 2, pendente), save na nuvem e contas, ranking, chat, anúncio de drop raro, guildas, mercado, mundo boss, PvP assíncrono, eventos agendados, anti-cheat e LGPD.

### E. Monetização (depois de A–D)

VIP, passe de temporada, starter pack, cosméticos, moeda premium com valor em reais, PIX. Tudo só depois do servidor (C1) e respeitando a decisão sobre C4.
