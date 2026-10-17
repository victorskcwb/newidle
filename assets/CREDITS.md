# Créditos dos assets

| Asset                                                                         | Autor                                                                                                                                                                                | Licença                                                   | Onde                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------- |
| OpenTibia Sprite Pack (chão, bordas de grama, água, plantas, árvores, rochas) | Peonso e os autores listados em [`AUTHORS.md`](vendor/opentibia-sprite-pack/AUTHORS.md) — [github.com/peonso/opentibia_sprite_pack](https://github.com/peonso/opentibia_sprite_pack) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `vendor/opentibia-sprite-pack/` |
| Tiny Dungeon 1.0 (herói, monstros)                                            | Kenney — [kenney.nl](https://kenney.nl/assets/tiny-dungeon)                                                                                                                          | CC0 1.0                                                   | `vendor/kenney-tiny-dungeon/`   |
| Lápides, ossos, lava, marcador de colisão, ícones do app, efeitos             | Abismo Idle (desenhados por código)                                                                                                                                                  | do projeto                                                | `tools/content-build/src/`      |
| Sons                                                                          | Abismo Idle (sintetizados com Web Audio)                                                                                                                                             | do projeto                                                | `apps/client/src/audio/`        |
| Fonte Pixelify Sans                                                           | Stefie Justprince                                                                                                                                                                    | SIL OFL 1.1                                               | Google Fonts                    |

## OpenTibia Sprite Pack (CC BY 4.0)

Usamos só as folhas `otsp_tiles_01` e `otsp_nature_01` (cópias em `vendor/opentibia-sprite-pack/`, com a licença, os autores e o README do pack). **Mudanças feitas:** os sprites foram recortados das folhas, recombinados num tileset novo (`sprites/tiles.png`, 32 px) e numa folha de objetos grandes (`sprites/props.png`, 64 px), com o magenta trocado por transparência; no jogo, os mapas recebem uma cor por região. Nenhum sprite de criatura, item ou logotipo do pack é usado. O jogo mostra estes créditos em Configurações → Créditos.

O pack não tem licença da CipSoft e não usamos nada do Tibia em si (nem o fankit, cujos termos proíbem o uso fora de vídeos e capturas).

## Kenney (CC0)

CC0 não exige crédito, mas a Kenney agradece a menção: "Kenney (www.kenney.nl)". O `License.txt` original está junto do pack em `vendor/`.

## Como a arte é montada

`pnpm maps:gen` gera os mapas (`maps/*.tmj`) com os ids de `tools/content-build/src/tileset.ts`; `pnpm art` monta `sprites/tiles.png` e `sprites/props.png` a partir das folhas do pack e dos tiles desenhados por código.
