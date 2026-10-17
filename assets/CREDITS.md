# Créditos dos assets

| Asset                                                                                                   | Autor                                                                                                                                                                                | Licença                                                   | Onde                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------- |
| OpenTibia Sprite Pack (chão, bordas de grama, água, plantas, árvores, rochas, paredes e móveis da vila) | Peonso e os autores listados em [`AUTHORS.md`](vendor/opentibia-sprite-pack/AUTHORS.md) — [github.com/peonso/opentibia_sprite_pack](https://github.com/peonso/opentibia_sprite_pack) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `vendor/opentibia-sprite-pack/`  |
| 16x16 DungeonTileset II 1.7 (herói, monstros e armas animados)                                          | 0x72 — [0x72.itch.io/dungeontileset-ii](https://0x72.itch.io/dungeontileset-ii)                                                                                                      | CC0 1.0                                                   | `vendor/0x72-dungeontileset-ii/` |
| Particle Pack 1.1 (efeitos de golpes e habilidades)                                                     | Kenney — [kenney.nl](https://kenney.nl/assets/particle-pack)                                                                                                                         | CC0 1.0                                                   | `vendor/kenney-particle-pack/`   |
| Ícones da interface                                                                                     | Lorc, Delapouite e outros autores do [game-icons.net](https://game-icons.net)                                                                                                        | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `vendor/game-icons/`             |
| Lápides, ossos, lava, marcador de colisão, ícones do app                                                | Abismo Idle (desenhados por código)                                                                                                                                                  | do projeto                                                | `tools/content-build/src/`       |
| Sons                                                                                                    | Abismo Idle (sintetizados com Web Audio)                                                                                                                                             | do projeto                                                | `apps/client/src/audio/`         |
| Fonte Pixelify Sans                                                                                     | Stefie Justprince                                                                                                                                                                    | SIL OFL 1.1                                               | Google Fonts                     |

## OpenTibia Sprite Pack (CC BY 4.0)

Usamos só as folhas `otsp_tiles_01`, `otsp_nature_01`, `otsp_town_01` e `otsp_walls_01` (cópias em `vendor/opentibia-sprite-pack/`, com a licença, os autores e o README do pack). **Mudanças feitas:** os sprites foram recortados das folhas, recombinados num tileset novo (`sprites/tiles.png`, 32 px) e numa folha de objetos grandes (`sprites/props.png`, 64 px), com o magenta trocado por transparência; no jogo, os mapas recebem uma cor por região. Nenhum sprite de criatura, item ou logotipo do pack é usado. O jogo mostra estes créditos em Configurações → Créditos.

O pack não tem licença da CipSoft e não usamos nada do Tibia em si (nem o fankit, cujos termos proíbem o uso fora de vídeos e capturas).

## game-icons.net (CC BY 3.0)

Os ícones de menus, habilidades e atributos são SVGs do game-icons.net, recoloridos pela interface. A lista de cada ícone usado, com o autor, fica em `vendor/game-icons/ICONS.md`.

## CC0 (0x72 e Kenney)

CC0 não exige crédito, mas fica o agradecimento a 0x72 e a Kenney. As partículas da Kenney foram reduzidas de 512 para 128 px; os quadros do 0x72 foram reorganizados numa folha própria (`sprites/actors.png`).

## Como a arte é montada

`pnpm maps:gen` gera os mapas (`maps/*.tmj`) com os ids de `tools/content-build/src/tileset.ts`; `pnpm art` monta `sprites/tiles.png`, `sprites/props.png`, `sprites/actors.png` e `sprites/fx.png`, e escreve os quadros dos personagens no `sprites/manifest.json`.
