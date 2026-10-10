# Tennix identity kit (logo: Sweet Spot)

TENNIX spelled in full; the violet X carries a tennis ball where its strokes cross. Start with `guidelines/tennix-brand-guidelines.pdf`.

| Need | File |
|---|---|
| Logo on light backgrounds | `logo/tennix-logo.svg` / `.pdf` / `.png` (editable: `.vectorcraft`) |
| Logo on navy or dark photos | `logo/tennix-logo-dark.*` |
| One colour (embroidery, screen print, stamps) | `logo/tennix-logo-navy.*`, `logo/tennix-logo-white.*` |
| Symbol only (X + ball) | `logo/tennix-symbol.*`, `logo/tennix-symbol-dark.*` |
| App Store / Google Play icon | `app/app-icon-1024.png` (square, the stores round the corners) |
| Android adaptive icon | `app/android-foreground-432.png` + `app/android-background-432.png` |
| Other app sizes | `app/app-icon-512/192/180/120/48.png` |
| Website favicon | `web/favicon.svg`, `web/favicon.ico`, `web/favicon-180.png` (Apple touch icon) |
| Link preview (Open Graph) | `web/og-image-1200x630.png` |
| Social profile picture (all platforms) | `social/profile-1080.png` (safe for circle crops) |
| Social covers | `social/x-header-1500x500.png`, `linkedin-cover-1584x396.png`, `facebook-cover-1640x624.png`, `youtube-banner-2560x1440.png` |
| Instagram | `social/instagram/`: profile, intro post and 4 pillar posts (1080x1350, also a carousel), story template, 4 highlight covers |
| TikTok | `social/tiktok/`: profile, video cover, end card, and a safe area guide (content clear of the buttons and caption) |
| Merch | One colour logo files above for garments; ideas in `merch/merch-mockups.png` |

Colours: navy `#14123A`, violet `#5B3DF5`, lime `#D7FF3D`, lavender `#E9E4FF`, background `#F6F4FF`. CMYK values in the guidelines are starting points; confirm with a print proof.
Type: Archivo Black (logo, headlines), Archivo ExtraBold (titles, labels), Archivo Regular (body). All free on Google Fonts.

Rebuild: `python src/build_brand.py <fonts_dir> .` writes the SVGs (needs fonttools and uharfbuzz), then export with `vectorcraft-cli convert <file>.svg <file>.png|.pdf`.
