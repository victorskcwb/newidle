# Plano — Pets e classes

O Victor pediu pets (GDD 3.4, 8.2.7) e as classes da especificação (seção 5.3: Caçadora no reset 5, Feiticeiro no reset 10; troca de classe só no reset).

## Etapa 1 — Pets

- **Seis pets em conteúdo** (`pets.json`), um por chefe de caçada a partir de Cinzarra: cada chefe tem 2% de chance por vitória de trazer o seu (também nos andares de chefe do Abismo e no offline, por binomial, como as cartas).
- **Estrelas:** cópias repetidas sobem o pet até 3 estrelas; o bônus é por estrela (ex.: +3% de ouro por estrela).
- **Um pet ativo** de cada vez: só ele dá o bônus e só ele segue o herói no mapa. Fica no herói (entra no cache de atributos) e não volta no reset.
- **Arte:** criaturas do OpenTibia Sprite Pack já usadas pelos monstros, menores e com outra cor (o pet de um chefe lembra os monstros daquela caçada).
- **Interface:** aba Pets no Diário (silhueta até encontrar, estrelas, bônus, onde cai, ativar); aviso e registro quando um pet aparece.

## Etapa 2 — Classes

- **Classes em conteúdo** (`classes.json`): atributo principal (Guerreiro: Força; Caçadora: Destreza; Feiticeiro: Energia), resets para liberar, perfil de distribuição automática, ataque à distância ou não.
- **Dano:** +1% por ponto do atributo principal da classe (hoje: Força para todos).
- **Armas por classe:** espadas (Guerreiro), arcos (Caçadora), cajados (Feiticeiro), 4 tiers cada, com o campo `classId` no item-base. Arma de outra classe fica inativa; o loot e o ferreiro só geram armas da classe do herói.
- **Árvores de habilidades** de 12 nós para Caçadora e Feiticeiro, no mesmo formato da do Guerreiro.
- **Troca de classe no altar de reset**, entre as liberadas; a classe nova recebe a arma inicial dela.
- **Cena:** roupa por classe (arqueira encapuzada, mago de manto) e projéteis para os ataques à distância.

## Riscos

- **Balanceamento das classes:** as árvores novas copiam a forma da do Guerreiro com números equivalentes, e o simulador mede cada classe.
- **Save:** pets e classe mudam o estado (save v19).
