"""Build three Tennix logo concepts as SVG (wordmarks outlined), for VectorCraft to open and export.

Usage: python build_concepts.py <fonts_dir> <out_dir>
fonts_dir holds Archivo_wght_800.ttf (Archivo ExtraBold) and Archivo_wdth_wght_112_900.ttf (Archivo Black, 112% width).
Needs fonttools and uharfbuzz.
"""
import math
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

NAVY, VIOLET, LIME, LAVENDER, BG, WHITE = "#14123A", "#5B3DF5", "#D7FF3D", "#E9E4FF", "#F6F4FF", "#FFFFFF"


class Face:
    def __init__(self, path):
        self.font = TTFont(path)
        self.glyphs = self.font.getGlyphSet()
        self.hbfont = hb.Font(hb.Face(hb.Blob.from_file_path(str(path))))
        self.upem = self.font["head"].unitsPerEm
        self.cap = self.font["OS/2"].sCapHeight / self.upem
        self.xh = self.font["OS/2"].sxHeight / self.upem

    def outline(self, text, size, x, baseline, track=0.0):
        """Returns (svg path d, advance width, per-glyph x positions)."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, {"kern": True})
        k = size / self.upem
        pen = SVGPathPen(self.glyphs)
        names = self.font.getGlyphOrder()
        cx, xs = 0.0, []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            gx = x + (cx + pos.x_offset) * k
            xs.append((gx, pos.x_advance * k))
            self.glyphs[names[info.codepoint]].draw(TransformPen(pen, (k, 0, 0, -k, gx, baseline - pos.y_offset * k)))
            cx += pos.x_advance + track * self.upem
        return pen.getCommands(), (cx - track * self.upem) * k, xs


def svg(w, h, body, bg=None, rx=0):
    rect = f'<rect width="{w:g}" height="{h:g}" rx="{rx:g}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}">{rect}{body}</svg>\n'


# ---------- Concept 1: Seam X. A lime ball whose two seams cross into the X of Tennix. ----------

def seam_ball(cx, cy, r, seam=VIOLET, ball=LIME):
    """Tennis ball: the classic two seams, bent so they cross in the middle as an X."""
    s = r / 100
    clip = f"c{int(cx)}_{int(cy)}_{int(r)}"
    a = [(-84, -52), (-20, 20), (20, -20), (84, 52)]   # seam 1: an S curve, top left to bottom right
    b = [(84, -52), (20, 20), (-20, -20), (-84, 52)]   # seam 2: its mirror, so the seams cross as an X

    def curve(p):
        (x0, y0), (x1, y1), (x2, y2), (x3, y3) = [(cx + px * s, cy + py * s) for px, py in p]
        return f"M{x0:g} {y0:g} C{x1:g} {y1:g} {x2:g} {y2:g} {x3:g} {y3:g}"
    w = 15 * s
    return (f'<clipPath id="{clip}"><circle cx="{cx:g}" cy="{cy:g}" r="{r:g}"/></clipPath>'
            f'<circle cx="{cx:g}" cy="{cy:g}" r="{r:g}" fill="{ball}"/>'
            f'<g clip-path="url(#{clip})" fill="none" stroke="{seam}" stroke-width="{w:g}" stroke-linecap="round">'
            f'<path d="{curve(a)}"/><path d="{curve(b)}"/></g>')


def concept_seam(black, out):
    size = 120
    d, tw, _ = black.outline("TENNI", size, 0, 120, track=-0.01)
    r = size * black.cap * 0.62  # ball a little taller than the caps, centred on them
    ball_cx = tw + 10 + r
    cy = 120 - size * black.cap / 2
    body = lambda ink: f'<path d="{d}" fill="{ink}"/>' + seam_ball(ball_cx, cy, r)
    w = ball_cx + r + 4
    (out / "1-seam-x-light.svg").write_text(svg(w, 150, body(NAVY)))
    (out / "1-seam-x-dark.svg").write_text(svg(w, 150, body(WHITE)))
    (out / "1-seam-x-icon.svg").write_text(svg(240, 240, seam_ball(120, 120, 84), bg=NAVY, rx=54))


# ---------- Concept 2: Court T. The court seen from above; its service lines draw the T. ----------

def court(x, y, s, line=LIME, ball=LIME, bg=VIOLET, rx=54):
    """App tile with a court plan: baseline frame, service line and centre line form a T, ball in play."""
    def L(x1, y1, x2, y2):
        return f'<line x1="{x + x1 * s:g}" y1="{y + y1 * s:g}" x2="{x + x2 * s:g}" y2="{y + y2 * s:g}"/>'
    lw = 12 * s
    return (f'<rect x="{x:g}" y="{y:g}" width="{240 * s:g}" height="{240 * s:g}" rx="{rx * s:g}" fill="{bg}"/>'
            f'<g stroke="{line}" stroke-width="{lw:g}" stroke-linecap="square" fill="none">'
            f'<path d="M{x + 52 * s:g} {y + 40 * s:g} V{y + 200 * s:g} H{x + 188 * s:g} V{y + 40 * s:g}"/>'
            + L(52, 96, 188, 96) + L(120, 96, 120, 200) + "</g>"
            # the net: a heavier line across the top, a little wider than the court
            + f'<line x1="{x + 36 * s:g}" y1="{y + 40 * s:g}" x2="{x + 204 * s:g}" y2="{y + 40 * s:g}" stroke="{WHITE}" stroke-width="{16 * s:g}" stroke-linecap="round"/>'
            f'<circle cx="{x + 156 * s:g}" cy="{y + 148 * s:g}" r="{16 * s:g}" fill="{ball}"/>')


def concept_court(bold, out):
    size = 112
    d, tw, _ = bold.outline("tennix", size, 172, 118, track=-0.02)
    w = 172 + tw + 4
    for name, ink in [("light", NAVY), ("dark", WHITE)]:
        (out / f"2-court-t-{name}.svg").write_text(svg(w, 150, court(0, 8, 0.56) + f'<path d="{d}" fill="{ink}"/>'))
    (out / "2-court-t-icon.svg").write_text(svg(240, 240, court(0, 0, 1)))


# ---------- Concept 3: Bounce. Lowercase wordmark; the dot of the i is the ball, mid bounce. ----------

def concept_bounce(bold, out):
    size = 150
    base = 230
    d, tw, xs = bold.outline("tennıx", size, 0, base, track=-0.02)  # dotless i, the ball replaces the dot
    ix, iadv = xs[4]
    i_cx = ix + iadv / 2
    xh_top = base - size * bold.xh
    r = 19
    bcy = xh_top - 34
    # Dashed flight path from above the t to the ball, then a short bounce mark
    t_x = xs[0][0] + xs[0][1] * 0.55
    arc = (f'<path d="M{t_x:g} {xh_top - 22:g} Q{(t_x + i_cx) / 2:g} {bcy - 120:g} {i_cx - r - 6:g} {bcy - 6:g}" '
           f'fill="none" stroke="{VIOLET}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16"/>')
    ball = f'<circle cx="{i_cx:g}" cy="{bcy:g}" r="{r}" fill="{LIME}" stroke="{NAVY}" stroke-width="0"/>'
    w = tw + 6
    for name, ink in [("light", NAVY), ("dark", WHITE)]:
        (out / f"3-bounce-{name}.svg").write_text(svg(w, 260, arc + f'<path d="{d}" fill="{ink}"/>' + ball))
    # Icon: ball mid flight over a dashed arc, on navy
    icon = (f'<path d="M48 176 Q104 34 160 104" fill="none" stroke="{VIOLET}" stroke-width="12" stroke-linecap="round" stroke-dasharray="2 24"/>'
            f'<line x1="44" y1="190" x2="196" y2="190" stroke="{LAVENDER}" stroke-width="6" stroke-linecap="round" opacity="0.35"/>'
            f'<circle cx="172" cy="118" r="30" fill="{LIME}"/>')
    (out / "3-bounce-icon.svg").write_text(svg(240, 240, icon, bg=NAVY, rx=54))


if __name__ == "__main__":
    fonts, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    black = Face(fonts / "Archivo_wdth_wght_112_900.ttf")
    bold = Face(fonts / "Archivo_wght_800.ttf")
    concept_seam(black, out)
    concept_court(bold, out)
    concept_bounce(bold, out)
    print("ok")
