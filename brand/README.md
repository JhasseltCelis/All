# AI For You logo: "The Checked Layer"

Three outlined setup layers behind one finished, checked layer. It matches the site's story ("Four layers. One call.") and the checkboxes in its "Add the setup" demo.

| Use | File |
|---|---|
| Website header, documents (light background) | `svg/logo-horizontal.svg`, `pdf/logo-horizontal.pdf`, `png/logo-horizontal.png` |
| Dark background | `*-white` versions |
| Square spaces (posters, slides) | `logo-stacked` versions |
| Mark only | `svg/mark.svg`, `svg/mark-white.svg` |
| Browser tab icon | `icons/favicon.svg`, `icons/favicon.ico` (16, 32, 48) |
| Phone home screen / app | `icons/icon-180.png` (Apple), `icon-192.png`, `icon-512.png` |
| Social profile picture | `png/social-profile.png` (1080 x 1080, safe for circle crops) |

Colors: electric blue `#2340FF`, ink `#0B0B0C`, white. Wordmark: Archivo Expanded Black, converted to shapes, so no font is needed.

## Rebuild

```sh
python src/build_logo.py <Archivo-Expanded-Black.ttf> svg      # needs fonttools and uharfbuzz
vectorcraft-cli convert svg/logo-horizontal.svg pdf/logo-horizontal.pdf
vectorcraft-cli convert svg/logo-horizontal.svg png/logo-horizontal.png --scale 8
```

## Infographic

`infographic/ai-for-you-infographic.vectorcraft` is the editable file (open it in VectorCraft), with `.pdf` (print), `.png` (1200 px wide, for posts) and `.svg`. All copy is from the website. Rebuild:

```sh
python src/build_infographic.py <fonts_dir> infographic/ai-for-you-infographic.svg   # needs fonttools
vectorcraft-cli convert infographic/ai-for-you-infographic.svg infographic/ai-for-you-infographic.vectorcraft
vectorcraft-cli convert infographic/ai-for-you-infographic.vectorcraft infographic/ai-for-you-infographic.pdf
```

Rendering needs Archivo Expanded Black, Geist (400, 500, 600) and Geist Mono installed.
