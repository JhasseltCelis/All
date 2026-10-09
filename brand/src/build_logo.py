"""Build the AI For You logo SVGs: "The Checked Layer" mark plus the outlined wordmark.

Usage: python build_logo.py <Archivo-Expanded-Black.ttf> <out_dir>
The wordmark is converted to paths (shaped with HarfBuzz, so kerning is kept), so the
SVGs render the same everywhere without the font installed.
"""
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

BLUE, INK, WHITE = "#2340FF", "#0B0B0C", "#FFFFFF"
TRACKING = -0.01  # em, as on the site's logo
WORD_SPACE = 0.14  # em added to each space, so the words read apart at this weight


def mark(ink, paper, x=0.0, y=0.0, s=1.0):
    """Three outlined setup layers behind the finished, checked one. Drawn on a 120 unit grid."""
    def r(px, py, fill, stroke):
        st = f' stroke="{stroke}" stroke-width="{3 * s:g}"' if stroke else ""
        return f'<rect x="{x + px * s:g}" y="{y + py * s:g}" width="{80 * s:g}" height="{80 * s:g}" fill="{fill}"{st}/>'
    pts = [(22, 79), (35, 92), (63, 62)]
    d = "M" + " L".join(f"{x + px * s:g} {y + py * s:g}" for px, py in pts)
    return "".join([
        r(38, 2, "none", ink), r(26, 14, paper, ink), r(14, 26, paper, ink), r(2, 38, BLUE, None),
        f'<path d="{d}" fill="none" stroke="{WHITE}" stroke-width="{9 * s:g}" stroke-linecap="square"/>',
    ])


def text_path(font, glyphs, blob, line, size, x, baseline):
    """Outline one line of text as an SVG path; returns (path_d, advance_width)."""
    face = hb.Face(blob)
    hbf = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(line)
    buf.guess_segment_properties()
    hb.shape(hbf, buf, {"kern": True, "liga": False})
    upem = font["head"].unitsPerEm
    k = size / upem
    track = TRACKING * upem
    pen = SVGPathPen(glyphs)
    cx = 0.0
    names = font.getGlyphOrder()
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        tp = TransformPen(pen, (k, 0, 0, -k, x + (cx + pos.x_offset) * k, baseline - pos.y_offset * k))
        glyphs[names[info.codepoint]].draw(tp)
        cx += pos.x_advance + track
        if line[info.cluster] == " ":
            cx += WORD_SPACE * upem
    return pen.getCommands(), (cx - track) * k


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w:g}" height="{h:g}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}">{rect}{body}</svg>\n'


def main(font_path, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    blob = hb.Blob.from_file_path(font_path)
    cap = font["OS/2"].sCapHeight / font["head"].unitsPerEm

    # Mark alone (square canvas of the 120 grid) and the favicon (blue square + check only)
    for name, ink, paper in [("mark", INK, WHITE), ("mark-white", WHITE, INK)]:
        (out / f"{name}.svg").write_text(svg(120, 120, mark(ink, paper)))
    check = '<path d="M15 33 L26 44 L49 19" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="square"/>'
    (out / "icon.svg").write_text(svg(64, 64, f'<rect width="64" height="64" fill="{BLUE}"/>{check}'))

    # Horizontal lockup: one line, caps as tall as the blue square, sitting on its baseline
    size = 80 / cap * 0.62
    d, tw = text_path(font, glyphs, blob, "AI FOR YOU", size, 140, 118 - (80 - 80 * 0.62) / 2)
    w = 140 + tw + 2
    for name, ink, paper in [("logo-horizontal", INK, WHITE), ("logo-horizontal-white", WHITE, INK)]:
        (out / f"{name}.svg").write_text(svg(w, 120, mark(ink, paper) + f'<path d="{d}" fill="{ink}"/>'))

    # Stacked lockup: two lines spanning the mark's height
    size = 52 / cap
    d1, w1 = text_path(font, glyphs, blob, "AI FOR", size, 150, 54)
    d2, w2 = text_path(font, glyphs, blob, "YOU", size, 150, 118)
    w = 150 + max(w1, w2) + 2
    for name, ink, paper in [("logo-stacked", INK, WHITE), ("logo-stacked-white", WHITE, INK)]:
        (out / f"{name}.svg").write_text(svg(w, 120, mark(ink, paper) + f'<path d="{d1} {d2}" fill="{ink}"/>'))

    # Social profile image: mark centred on white, safe inside a circular crop
    (out / "social-profile.svg").write_text(svg(1080, 1080, mark(INK, WHITE, 270, 270, 4.5), bg=WHITE))


if __name__ == "__main__":
    main(*sys.argv[1:3])
