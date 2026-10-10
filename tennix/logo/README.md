# Tennix logo concepts

Palette: navy `#14123A`, violet `#5B3DF5`, lime `#D7FF3D`, lavender `#E9E4FF`, background `#F6F4FF`. Wordmarks in Archivo (Black 112% width for Seam X, ExtraBold for the others), converted to shapes.

| Concept | Idea | Files |
|---|---|---|
| 01 Seam X | The ball's two seams cross into the X of TENNIX | `1-seam-x-*` |
| 02 Court T | The court from above: net, service line and centre line draw the T | `2-court-t-*` |
| 03 Bounce | Lowercase; the dot of the i is the ball at the end of a rally arc | `3-bounce-*` |

Each concept has `-light` (on light backgrounds), `-dark` (on navy) and `-icon` (app icon) versions as `svg/`, `png/` (4x) and editable `vectorcraft/` files. `tennix-logo-concepts.png` compares all three.

Rebuild: `python src/build_concepts.py <fonts_dir> svg` (needs fonttools and uharfbuzz), then `vectorcraft-cli convert svg/<name>.svg png/<name>.png --scale 4`.
