# Créditos dos assets

| Asset                                                        | Autor                                                       | Licença     | Onde                          |
| ------------------------------------------------------------ | ----------------------------------------------------------- | ----------- | ----------------------------- |
| Tiny Dungeon 1.0 (herói, monstros, lápide, porta)            | Kenney — [kenney.nl](https://kenney.nl/assets/tiny-dungeon) | CC0 1.0     | `vendor/kenney-tiny-dungeon/` |
| Tiny Town 1.1 (grama, terra, árvore, cogumelos, pedra, muro) | Kenney — [kenney.nl](https://kenney.nl/assets/tiny-town)    | CC0 1.0     | `vendor/kenney-tiny-town/`    |
| Água, lama, lava, ossos, ícones do app, efeitos              | Abismo Idle (desenhados por código)                         | do projeto  | `tools/content-build/src/`    |
| Sons                                                         | Abismo Idle (sintetizados com Web Audio)                    | do projeto  | `apps/client/src/audio/`      |
| Fonte Pixelify Sans                                          | Stefie Justprince                                           | SIL OFL 1.1 | Google Fonts                  |

CC0 não exige crédito, mas a Kenney agradece a menção: "Kenney (www.kenney.nl)". Os arquivos `License.txt` originais estão junto de cada pack em `vendor/`.

O tileset do jogo (`sprites/tiles.png`) é montado por `pnpm art` a partir dos packs, com escala 2× (16 → 32 px); os mapas (`pnpm maps:gen`) usam os mesmos ids de tile.
