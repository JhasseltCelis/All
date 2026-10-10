"""Build the Tennix identity kit around the Sweet Spot logo.

Usage: python build_brand.py <fonts_dir> <out_dir>
fonts_dir: Archivo_wdth_wght_112_900.ttf (logo, display), Archivo_wght_800.ttf, Archivo_wght_400.ttf.
Writes SVGs only (all text outlined); export them with vectorcraft-cli (see ../README.md).
Needs fonttools and uharfbuzz.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "logo" / "src"))
from build_concepts import BG, LAVENDER, LIME, NAVY, VIOLET, WHITE, Face, classic_ball, svg  # noqa: E402

LOGO_SIZE = 120  # font size the master lockup is drawn at
TRACK = -0.01


class Kit:
    def __init__(self, fonts):
        self.black = Face(fonts / "Archivo_wdth_wght_112_900.ttf")
        self.bold = Face(fonts / "Archivo_wght_800.ttf")
        self.reg = Face(fonts / "Archivo_wght_400.ttf")
        _, self.word_w, xs = self.black.outline("TENNIX", LOGO_SIZE, 0, 0, track=TRACK)
        self.x_left, self.x_adv = xs[5]
        self.cap = LOGO_SIZE * self.black.cap

    # ---- the logo ----

    def lockup(self, x, y, h, ink=NAVY, x_ink=VIOLET, gap=BG, ball=LIME, seam=VIOLET):
        """TENNIX with the violet X and the ball on its crossing. (x, y) is the top left of the caps, h the cap height."""
        k = h / self.cap
        size = LOGO_SIZE * k
        base = y + h
        _, _, xs = self.black.outline("TENNIX", size, x, base, track=TRACK)
        d, _, _ = self.black.outline("TENNI", size, x, base, track=TRACK)
        gx, gadv = xs[5]
        xd, _, _ = self.black.outline("X", size, gx, base)
        body = f'<path d="{d}" fill="{ink}"/><path d="{xd}" fill="{x_ink}"/>'
        return body + classic_ball(gx + gadv / 2, y + h / 2, size * 0.17, seam=seam, ball=ball, gap=gap, rot=-28)

    def lockup_width(self, h):
        return self.word_w * h / self.cap

    def symbol(self, cx, cy, h, x_ink=VIOLET, gap=NAVY, ball=LIME, seam=VIOLET):
        """The X with the ball, centred on (cx, cy); h is the height of the X."""
        size = h / self.black.cap
        _, _, xs = self.black.outline("X", size, 0, 0)
        gx, gadv = xs[0]
        xd, _, _ = self.black.outline("X", size, cx - (gx + gadv / 2), cy + h / 2)
        return f'<path d="{xd}" fill="{x_ink}"/>' + classic_ball(cx, cy, size * 0.17 * 1.15, seam=seam, ball=ball, gap=gap, rot=-28)

    # ---- text helpers (all outlined) ----

    def text(self, s, face, size, x, base, fill, track=0.0, anchor="start"):
        _, w, _ = face.outline(s, size, 0, 0, track=track)
        if anchor == "middle":
            x -= w / 2
        elif anchor == "end":
            x -= w
        d, _, _ = face.outline(s, size, x, base, track=track)
        return f'<path d="{d}" fill="{fill}"/>'

    def para(self, s, face, size, x, base, maxw, fill, lh=1.45):
        lines, cur = [], ""
        for word in s.split():
            trial = f"{cur} {word}".strip()
            if cur and face.outline(trial, size, 0, 0)[1] > maxw:
                lines.append(cur)
                cur = word
            else:
                cur = trial
        lines.append(cur)
        return "".join(self.text(ln, face, size, x, base + i * size * lh, fill) for i, ln in enumerate(lines)), len(lines)

    def pillars(self, cx, base, size, fill, dot=LIME, total_w=None):
        """FOLLOW  TRAVEL  GEAR  CLUB, separated by small lime squares, centred on cx."""
        words = ["FOLLOW", "TRAVEL", "GEAR", "CLUB"]
        gap = size * 1.6
        ws = [self.bold.outline(w, size, 0, 0, track=0.12)[1] for w in words]
        w = sum(ws) + gap * (len(words) - 1)
        x = cx - w / 2
        out = ""
        for i, (word, ww) in enumerate(zip(words, ws)):
            out += self.text(word, self.bold, size, x, base, fill, track=0.12)
            x += ww
            if i < len(words) - 1:
                q = size * 0.32
                out += f'<rect x="{x + gap / 2 - q / 2:g}" y="{base - size * 0.36 - q / 2:g}" width="{q:g}" height="{q:g}" fill="{dot}"/>'
                x += gap
        return out


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def build(kit, out):
    pad = 12  # small margin around transparent logo files
    h = 100
    w = kit.lockup_width(h) + 2 * pad
    H = h + 2 * pad
    # ---- Logo: full colour, dark backgrounds, one colour for merch and stamps ----
    logos = {
        "tennix-logo": dict(ink=NAVY, x_ink=VIOLET, gap=BG),
        "tennix-logo-dark": dict(ink=WHITE, x_ink=VIOLET, gap=NAVY),
        "tennix-logo-navy": dict(ink=NAVY, x_ink=NAVY, gap=WHITE, ball=NAVY, seam=WHITE),
        "tennix-logo-white": dict(ink=WHITE, x_ink=WHITE, gap=NAVY, ball=WHITE, seam=NAVY),
    }
    for name, kw in logos.items():
        write(out / "logo" / f"{name}.svg", svg(w, H, kit.lockup(pad, pad, h, **kw)))
    write(out / "logo" / "tennix-symbol.svg", svg(240, 240, kit.symbol(120, 120, 200, gap=BG)))
    write(out / "logo" / "tennix-symbol-dark.svg", svg(240, 240, kit.symbol(120, 120, 200, gap=NAVY)))

    # ---- App and web icons: square full-bleed master (stores round the corners themselves) ----
    icon = kit.symbol(512, 512, 600, gap=NAVY)
    write(out / "app" / "app-icon-1024.svg", svg(1024, 1024, icon, bg=NAVY))
    write(out / "app" / "app-icon-rounded.svg", svg(1024, 1024, icon, bg=NAVY, rx=230))
    # Android adaptive icon: foreground kept inside the 66% safe zone, background is a flat colour
    write(out / "app" / "android-foreground-432.svg", svg(432, 432, kit.symbol(216, 216, 190, gap=NAVY)))
    write(out / "app" / "android-background-432.svg", svg(432, 432, "", bg=NAVY))
    write(out / "web" / "favicon.svg", svg(64, 64, kit.symbol(32, 32, 44, gap=NAVY), bg=NAVY, rx=14))

    # ---- Web: link preview image ----
    og = kit.lockup(600 - kit.lockup_width(120) / 2, 230, 120, ink=WHITE, gap=NAVY)
    og += kit.pillars(600, 470, 26, LAVENDER)
    write(out / "web" / "og-image-1200x630.svg", svg(1200, 630, og, bg=NAVY))

    # ---- Social ----
    prof = kit.symbol(540, 540, 560, gap=NAVY)  # circle crops keep the whole X
    write(out / "social" / "profile-1080.svg", svg(1080, 1080, prof, bg=NAVY))

    def banner(W, Hh, logo_h, pill, safe_cx=None, safe_cy=None):
        cx = safe_cx or W / 2
        cy = safe_cy or Hh / 2
        body = kit.lockup(cx - kit.lockup_width(logo_h) / 2, cy - logo_h * 0.85, logo_h, ink=WHITE, gap=NAVY)
        body += kit.pillars(cx, cy + logo_h * 0.95, pill, LAVENDER)
        # lime court line along the bottom edge
        body += f'<rect x="0" y="{Hh - Hh * 0.035:g}" width="{W}" height="{Hh * 0.035:g}" fill="{LIME}"/>'
        return svg(W, Hh, body, bg=NAVY)
    write(out / "social" / "x-header-1500x500.svg", banner(1500, 500, 96, 22))
    write(out / "social" / "linkedin-cover-1584x396.svg", banner(1584, 396, 76, 18, safe_cx=1584 * 0.6))
    write(out / "social" / "facebook-cover-1640x624.svg", banner(1640, 624, 110, 24))
    write(out / "social" / "youtube-banner-2560x1440.svg", banner(2560, 1440, 120, 26))  # inside the 1546x423 safe area

    # ---- Merch: print files (one colour, transparent) are the logo/*-navy and *-white files; mockup sheet below ----
    write(out / "merch" / "merch-mockups.svg", merch_sheet(kit))

    # ---- Brand guidelines page ----
    write(out / "guidelines" / "tennix-brand-guidelines.svg", guidelines(kit))


def merch_sheet(kit):
    W, H = 1800, 1200
    b = f'<rect width="{W}" height="{H}" fill="{BG}"/>'
    b += kit.text("MERCH", kit.black, 54, 80, 120, NAVY, track=-0.01)
    b += kit.text("Print with the one colour logo on garments; full colour on stickers and paper.", kit.reg, 22, 80, 165, "#3A3766")
    # T-shirt (navy), white one colour logo on the chest
    tee = ("M250 300 L360 260 Q420 300 480 260 L590 300 L660 420 L590 455 L570 420 L570 760 L270 760 L270 420 L250 455 L180 420 Z")
    b += f'<path d="{tee}" fill="{NAVY}"/>'
    b += kit.lockup(420 - kit.lockup_width(28) / 2, 390, 28, ink=WHITE, x_ink=WHITE, gap=NAVY, ball=WHITE, seam=NAVY)
    b += kit.text("Tee: one colour white", kit.reg, 20, 420, 830, NAVY, anchor="middle")
    # Cap (lime) with the symbol in navy
    b += f'<path d="M760 560 Q760 330 960 330 Q1160 330 1160 560 Z" fill="{LIME}"/>'
    b += f'<path d="M740 560 L1250 560 Q1270 600 1200 610 L760 610 Q730 590 740 560 Z" fill="{LIME}" stroke="{NAVY}" stroke-width="0"/>'
    b += f'<path d="M760 560 L1160 560" stroke="#B9DC2C" stroke-width="6"/>'
    b += kit.symbol(960, 455, 110, x_ink=NAVY, gap=LIME, ball=NAVY, seam=LIME)
    b += kit.text("Cap: symbol on lime", kit.reg, 20, 990, 830, NAVY, anchor="middle")
    # Tote (lavender) with the full colour logo
    b += f'<path d="M1370 360 Q1370 260 1460 260 Q1550 260 1550 360" fill="none" stroke="{NAVY}" stroke-width="14"/>'
    b += f'<rect x="1300" y="350" width="320" height="400" fill="{LAVENDER}"/>'
    b += kit.lockup(1460 - kit.lockup_width(40) / 2, 520, 40, gap=LAVENDER)
    b += kit.text("Tote: full colour", kit.reg, 20, 1460, 830, NAVY, anchor="middle")
    # Stickers row
    b += f'<circle cx="300" cy="1010" r="90" fill="{NAVY}"/>' + kit.symbol(300, 1010, 100, gap=NAVY)
    b += f'<rect x="460" y="950" width="420" height="120" rx="60" fill="{LIME}"/>' + kit.lockup(670 - kit.lockup_width(40) / 2, 990, 40, ink=NAVY, x_ink=VIOLET, gap=LIME, ball=WHITE)
    b += f'<rect x="940" y="950" width="420" height="120" rx="60" fill="{VIOLET}"/>' + kit.lockup(1150 - kit.lockup_width(40) / 2, 990, 40, ink=WHITE, x_ink=NAVY, gap=VIOLET)
    b += kit.text("Stickers", kit.reg, 20, 1420, 1018, NAVY)
    return svg(W, H, b)


def guidelines(kit):
    W = 1600
    M = 100
    b = ""
    # Header band
    b += f'<rect width="{W}" height="520" fill="{NAVY}"/>'
    b += kit.lockup(M, 150, 150, ink=WHITE, gap=NAVY)
    b += kit.text("BRAND GUIDELINES", kit.bold, 22, M, 420, LAVENDER, track=0.14)
    b += kit.text("Logo: Sweet Spot", kit.reg, 22, W - M, 420, LAVENDER, anchor="end")
    y = 620

    def heading(n, title, yy):
        return (kit.text(n, kit.bold, 20, M, yy, VIOLET, track=0.1)
                + kit.text(title, kit.black, 44, M, yy + 56, NAVY, track=-0.01))

    # 01 The logo
    b += heading("01", "THE LOGO", y)
    txt, _ = kit.para("TENNIX is always spelled in full. The violet X carries a tennis ball on its crossing: the sweet spot, "
                      "where the ball meets the strings. Keep the X violet and the ball lime in the full colour logo.",
                      kit.reg, 24, M, y + 110, 640, "#3A3766")
    b += txt
    # Clear space demo
    lx, ly, lh = 860, y + 30, 90
    lw = kit.lockup_width(lh)
    cs = lh * 0.5
    b += f'<rect x="{lx - cs:g}" y="{ly - cs:g}" width="{lw + 2 * cs:g}" height="{lh + 2 * cs:g}" fill="none" stroke="{VIOLET}" stroke-width="2" stroke-dasharray="8 8"/>'
    b += kit.lockup(lx, ly, lh)
    b += kit.text("Clear space: half the cap height on every side", kit.reg, 18, lx - cs, ly + lh + cs + 34, "#3A3766")
    b += kit.text("Minimum size: 24 px tall on screen, 6 mm in print", kit.reg, 18, lx - cs, ly + lh + cs + 62, "#3A3766")
    y += 360

    # 02 Versions
    b += heading("02", "VERSIONS", y)
    y += 100
    cw = (W - 2 * M - 3 * 24) / 4
    vers = [("Full colour", BG, dict(ink=NAVY, x_ink=VIOLET, gap=BG)),
            ("On navy", NAVY, dict(ink=WHITE, x_ink=VIOLET, gap=NAVY)),
            ("One colour navy", WHITE, dict(ink=NAVY, x_ink=NAVY, gap=WHITE, ball=NAVY, seam=WHITE)),
            ("One colour white", VIOLET, dict(ink=WHITE, x_ink=WHITE, gap=VIOLET, ball=WHITE, seam=VIOLET))]
    for i, (label, bg, kw) in enumerate(vers):
        x = M + i * (cw + 24)
        b += f'<rect x="{x:g}" y="{y:g}" width="{cw:g}" height="200" fill="{bg}" stroke="{LAVENDER}" stroke-width="2"/>'
        vh = 44
        b += kit.lockup(x + cw / 2 - kit.lockup_width(vh) / 2, y + 100 - vh / 2, vh, **kw)
        b += kit.text(label, kit.reg, 18, x, y + 236, NAVY)
    y += 330

    # 03 Colour
    b += heading("03", "COLOUR", y)
    y += 100
    cols = [("Navy", NAVY, "20 18 58", "65 69 0 77", WHITE), ("Violet", VIOLET, "91 61 245", "63 75 0 4", WHITE),
            ("Lime", LIME, "215 255 61", "16 0 76 0", NAVY), ("Lavender", LAVENDER, "233 228 255", "9 11 0 0", NAVY),
            ("Background", BG, "246 244 255", "4 4 0 0", NAVY)]
    sw = (W - 2 * M - 4 * 20) / 5
    for i, (name, hexv, rgb, cmyk, ink) in enumerate(cols):
        x = M + i * (sw + 20)
        b += f'<rect x="{x:g}" y="{y:g}" width="{sw:g}" height="230" fill="{hexv}" stroke="{LAVENDER}" stroke-width="2"/>'
        b += kit.text(name, kit.bold, 24, x + 20, y + 48, ink)
        b += kit.text(hexv, kit.reg, 18, x + 20, y + 160, ink)
        b += kit.text(f"RGB {rgb}", kit.reg, 18, x + 20, y + 186, ink)
        b += kit.text(f"CMYK {cmyk}", kit.reg, 18, x + 20, y + 212, ink)
    y += 330

    # 04 Type
    b += heading("04", "TYPE", y)
    y += 110
    b += kit.text("Archivo Black", kit.black, 64, M, y + 40, NAVY, track=-0.01)
    b += kit.text("Logo and headlines. Uppercase, tight.", kit.reg, 20, M, y + 80, "#3A3766")
    b += kit.text("Archivo ExtraBold", kit.bold, 48, W / 2 + 20, y + 34, NAVY)
    b += kit.text("Titles and labels. Labels in caps, wide spacing.", kit.reg, 20, W / 2 + 20, y + 80, "#3A3766")
    b += kit.text("Archivo Regular for body text and descriptions.", kit.reg, 30, M, y + 150, NAVY)
    y += 250

    # 05 Don'ts
    b += heading("05", "DON'T", y)
    y += 100
    dont = [("Don't separate the ball from the X", dict(), "sep"), ("Don't recolour the X", dict(x_ink=LIME), None),
            ("Don't stretch or squash", dict(), "squash"), ("Don't place it on lime: the ball disappears", dict(), "busy")]
    for i, (label, kw, kind) in enumerate(dont):
        x = M + i * (cw + 24)
        bg = LIME if kind == "busy" else BG
        b += f'<rect x="{x:g}" y="{y:g}" width="{cw:g}" height="160" fill="{bg}" stroke="{LAVENDER}" stroke-width="2"/>'
        vh = 36
        lx = x + cw / 2 - kit.lockup_width(vh) / 2
        if kind == "sep":
            body = kit.text("TENNIX", kit.black, LOGO_SIZE * vh / kit.cap, lx, y + 80 + vh / 2, NAVY, track=TRACK)
            body += classic_ball(lx + kit.lockup_width(vh) + 24, y + 80, 14, gap=BG, rot=-28)
        elif kind == "squash":
            body = f'<g transform="translate({lx:g} {y + 80 - vh / 2:g}) scale(1.35 0.6)">' + kit.lockup(0, 0, vh) + "</g>"
            body = f'<g transform="translate({-kit.lockup_width(vh) * 0.17:g} {vh * 0.2:g})">{body}</g>'
        else:
            body = kit.lockup(lx, y + 80 - vh / 2, vh, **kw)
        b += body
        # red cross in the corner
        b += f'<path d="M{x + cw - 34:g} {y + 14:g} l20 20 M{x + cw - 14:g} {y + 14:g} l-20 20" stroke="#E5484D" stroke-width="4"/>'
        b += kit.text(label, kit.reg, 18, x, y + 196, NAVY)
    y += 300
    b += f'<rect x="0" y="{y:g}" width="{W}" height="140" fill="{NAVY}"/>'
    b += kit.pillars(W / 2, y + 78, 22, LAVENDER)
    return svg(W, y + 140, b, bg=WHITE)


if __name__ == "__main__":
    kit = Kit(Path(sys.argv[1]))
    build(kit, Path(sys.argv[2]))
    print("ok")
