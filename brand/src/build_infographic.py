"""Build the AI For You infographic as an SVG with live text, for VectorCraft to open and export.

Usage: python build_infographic.py <fonts_dir> <out.svg>
fonts_dir holds the site's fonts: archivo-125-900.ttf (Archivo Expanded Black), Geist_wght_400/500/600.ttf
and Geist_Mono_wght_400.ttf. They are used to measure text so every line wraps inside its box; the SVG
names the families, so the fonts must be installed where the SVG is rendered.
All copy comes from the AI For You website.
"""
import sys
from html import escape
from pathlib import Path

from fontTools.ttLib import TTFont

W, M = 1200, 80  # canvas width, side margin
CW = W - 2 * M
BLUE, INK, MUTED, LINE, SOFT, WHITE, GREY = "#2340FF", "#0B0B0C", "#5E5E66", "#E4E4E8", "#F4F4F6", "#FFFFFF", "#A0A0AA"

FONTS = {}  # style -> (family, weight, TTFont)


def load_fonts(d):
    d = Path(d)
    for style, fam, wt, f in [("disp", "Archivo Expanded", 900, "archivo-125-900.ttf"),
                              ("reg", "Geist", 400, "Geist_wght_400.ttf"), ("med", "Geist", 500, "Geist_wght_500.ttf"),
                              ("semi", "Geist", 600, "Geist_wght_600.ttf"), ("mono", "Geist Mono", 400, "Geist_Mono_wght_400.ttf")]:
        FONTS[style] = (fam, wt, TTFont(d / f))


def width(text, style, size, track=0.0):
    font = FONTS[style][2]
    cmap, hmtx, upem = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    adv = sum(hmtx[cmap.get(ord(c), cmap[ord("?")])][0] for c in text)
    return adv / upem * size + track * size * max(len(text) - 1, 0)


def wrap(text, style, size, maxw):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and width(trial, style, size) > maxw:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    return lines + [cur]


class Doc:
    def __init__(self):
        self.parts = []

    def rect(self, x, y, w, h, fill="none", stroke=None, sw=2):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.parts.append(f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" fill="{fill}"{st}/>')

    def line(self, x1, y1, x2, y2, color=LINE, sw=1):
        self.parts.append(f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" stroke="{color}" stroke-width="{sw}"/>')

    def text(self, x, y, s, style, size, fill=INK, anchor="start", track=0.0):
        fam, wt, _ = FONTS[style]
        ls = f' letter-spacing="{track * size:g}"' if track else ""
        an = f' text-anchor="{anchor}"' if anchor != "start" else ""
        self.parts.append(f'<text x="{x:g}" y="{y:g}" font-family="{fam}" font-weight="{wt}" font-size="{size:g}" '
                          f'fill="{fill}"{ls}{an}>{escape(s)}</text>')

    def para(self, x, y, s, style, size, maxw, fill=INK, lh=1.4):
        """Wrapped paragraph; y is the first baseline. Returns the y just below the last line."""
        lines = wrap(s, style, size, maxw)
        for i, ln in enumerate(lines):
            self.text(x, y + i * size * lh, ln, style, size, fill)
        return y + (len(lines) - 1) * size * lh + size * 0.45

    def mark(self, x, y, s, ink=INK, paper=WHITE):
        """The Checked Layer logo mark on its 120 unit grid (brand/svg/mark.svg)."""
        for px, py, fill, stroke in [(38, 2, "none", ink), (26, 14, paper, ink), (14, 26, paper, ink), (2, 38, BLUE, None)]:
            self.rect(x + px * s, y + py * s, 80 * s, 80 * s, fill, stroke, 3 * s)
        pts = " L".join(f"{x + px * s:g} {y + py * s:g}" for px, py in [(22, 79), (35, 92), (63, 62)])
        self.parts.append(f'<path d="M{pts}" fill="none" stroke="{WHITE}" stroke-width="{9 * s:g}" stroke-linecap="square"/>')

    def check(self, x, y, size):
        self.rect(x, y, size, size, BLUE)
        k = size / 64
        pts = " L".join(f"{x + px * k:g} {y + py * k:g}" for px, py in [(15, 33), (26, 44), (49, 19)])
        self.parts.append(f'<path d="M{pts}" fill="none" stroke="{WHITE}" stroke-width="{8 * k:g}" stroke-linecap="square"/>')


def disp_lines(d, x, y, lines, size, colors):
    """Big uppercase display lines, tight leading. Returns y below the block."""
    for i, (ln, col) in enumerate(zip(lines, colors)):
        d.text(x, y + size * 0.86 * (i + 1) - size * 0.14, ln, "disp", size, col, track=-0.03)
    return y + size * 0.86 * len(lines)


def build(out):
    d = Doc()
    y = 0

    # Header
    d.mark(M, 44, 0.42)
    d.text(M + 62, 84, "AI FOR YOU", "disp", 30, track=-0.01)
    d.text(W - M, 80, "Personal AI setup", "mono", 20, MUTED, anchor="end")
    d.line(M, 130, W - M, 130)
    y = 190

    # Hero
    y = disp_lines(d, M, y, ["YOUR AI,", "SET UP", "FOR YOU."], 168, [INK, BLUE, BLUE]) + 48
    y = d.para(M, y, "You already pay for Claude, ChatGPT or Gemini. In one call I give it your voice, "
                     "your calendar, your files and your repeat tasks.", "reg", 32, 900, MUTED) + 70

    # Before / after
    ask_h = 92
    d.rect(M, y, CW, ask_h, WHITE, INK)
    d.text(M + 32, y + 56, "YOU ASK", "mono", 18, MUTED, track=0.04)
    d.text(M + 150, y + 57, "Reply to Carla. She wants to move Thursday's viewing to Saturday.", "med", 25)
    top = y + ask_h
    colw = CW / 2
    before = ("Dear Carla, Thank you for reaching out. I hope this message finds you well. I would be more than "
              "happy to accommodate your request. Please let me know what time works best for you on Saturday. Best regards.")
    after = ("Hi Carla, no problem at all. Saturday I'm free at 10:00 or 14:30 at the Brickell apartment. Which works "
             "for you? Once you confirm, I'll send parking details and the floor plan.")
    body_h = 470
    d.rect(M + colw, top, colw, body_h, SOFT)
    d.rect(M, top, CW, body_h, "none", INK)
    d.line(M + colw, top, M + colw, top + body_h, INK, 2)
    for i, (tag, txt, verdict, col, tcol) in enumerate([("BEFORE", before, "You'd rewrite this", MUTED, MUTED),
                                                        ("AFTER", after, "Ready to send", BLUE, INK)]):
        x = M + i * colw + 36
        d.text(x, top + 70, tag, "disp", 40, col, track=-0.01)
        d.line(x - 4, top + 100, x - 4, top + 340, BLUE if i else LINE, 4)
        d.para(x + 18, top + 136, txt, "reg", 23, colw - 96, tcol, lh=1.5)
        d.rect(x, top + body_h - 62, 14, 14, BLUE if i else MUTED)
        d.text(x + 26, top + body_h - 49, verdict, "mono", 19, INK if i else MUTED)
    y = top + body_h + 90

    # Black band: four layers
    band_top = y
    d.parts.append("BAND")  # placeholder, replaced once the band height is known
    y += 90
    y = disp_lines(d, M, y, ["FOUR LAYERS.", "ONE CALL."], 104, [WHITE, BLUE]) + 56
    layers = [("Instructions that sound like you", "Your role, clients, tone and languages, saved once."),
              ("Your tools, connected", "Email, calendar and files, with only the access you approve."),
              ("Skills for your repeat work", "One short sentence, and the work comes back done your way."),
              ("A cheat sheet and a tune up", "Your best prompts on one page. We fix what's off two weeks later.")]
    cell_w, cell_h = CW / 2, 300
    for i, (t, s) in enumerate(layers):
        cx, cy = M + (i % 2) * cell_w, y + (i // 2) * cell_h
        d.rect(cx, cy, cell_w, cell_h, "none", "#333338", 1)
        d.text(cx + 34, cy + 84, f"0{i + 1}", "disp", 56, BLUE)
        yy = d.para(cx + 34, cy + 138, t, "semi", 30, cell_w - 68, WHITE, lh=1.2)
        d.para(cx + 34, yy + 34, s, "reg", 21, cell_w - 68, GREY, lh=1.4)
    y += 2 * cell_h + 90
    band_h = y - band_top
    d.parts[d.parts.index("BAND")] = f'<rect x="0" y="{band_top:g}" width="{W}" height="{band_h:g}" fill="{INK}"/>'
    y += 100

    # How it works
    y = disp_lines(d, M, y, ["HOW IT WORKS"], 84, [INK]) + 24
    d.text(M, y + 10, "A short chat, one guided session and a check in two weeks later.", "reg", 26, MUTED)
    y += 56
    steps = [("10 minutes, whenever suits you", "Chat with Charles, our AI agent",
              "He asks about your work, your tools and the tasks that eat your week."),
             ("Video call, as long as it takes", "We set it up together",
              "You log in and share your screen. Your setup is prepared from the interview."),
             ("Two weeks later", "Use it, then we tune it", "We adjust what didn't fit and add what you found you need.")]
    for i, (dur, t, s) in enumerate(steps):
        d.line(M, y, W - M, y, LINE, 1)
        d.text(M, y + 96, f"0{i + 1}", "disp", 72, BLUE)
        x = M + 200
        d.text(x, y + 52, dur.upper(), "mono", 18, MUTED, track=0.04)
        d.text(x, y + 96, t, "semi", 34)
        d.para(x, y + 140, s, "reg", 23, CW - 200, MUTED)
        y += 190
    d.line(M, y, W - M, y, LINE, 1)
    y += 110

    # Packages
    y = disp_lines(d, M, y, ["PACKAGES"], 84, [INK]) + 24
    d.text(M, y + 10, "One time price, paid after the session. Care is optional.", "reg", 26, MUTED)
    y += 56
    plans = [("Starter", "$100", "One AI tool, set up right.", None),
             ("Pro", "$200", "Built around your top tasks.", "RECOMMENDED"),
             ("Team", "$500", "For small businesses, up to 5 people.", None),
             ("Care", "$25", "Keeps your setup current, per month.", "OPTIONAL")]
    pw, ph = CW / 4, 300
    for i, (name, price, desc, flag) in enumerate(plans):
        px = M + i * pw
        pick = name == "Pro"
        d.rect(px, y, pw, ph, BLUE if pick else WHITE, INK if not pick else BLUE, 2)
        fg, sub = (WHITE, "#D5DBFF") if pick else (INK, MUTED)
        d.text(px + 26, y + 52, name, "semi", 28, fg)
        if flag:
            d.text(px + 26, y + 84, flag, "mono", 15, sub, track=0.06)
        d.text(px + 26, y + 170, price, "disp", 60, fg, track=-0.02)
        d.para(px + 26, y + 222, desc, "reg", 20, pw - 52, sub, lh=1.35)
    y += ph + 70

    # Trust row
    trust = ["No passwords, ever", "Only the access you approve", "Pay after the session"]
    tw = CW / 3
    for i, t in enumerate(trust):
        tx = M + i * tw
        d.check(tx, y, 36)
        d.para(tx + 54, y + 27, t, "semi", 24, tw - 70, lh=1.25)
    y += 140

    # Call to action band
    cta_top = y
    d.parts.append("CTA")  # placeholder, replaced once the band height is known
    y += 100
    y = disp_lines(d, M, y, ["BOOK YOUR", "SETUP."], 120, [WHITE, BLUE]) + 60
    d.rect(M, y, 380, 84, BLUE)
    d.text(M + 34, y + 54, "Book your setup", "semi", 30, WHITE)
    d.parts.append(f'<path d="M{M + 318} {y + 42} h28 M{M + 334} {y + 30} l12 12 l-12 12" fill="none" stroke="{WHITE}" stroke-width="3"/>')
    d.text(M + 420, y + 54, "Setups from $100. Pay after.", "med", 28, GREY)
    y += 84 + 70
    d.text(M, y, "WORKS WITH CLAUDE, CHATGPT AND GEMINI", "mono", 18, GREY, track=0.06)
    d.mark(W - M - 60, y - 52, 0.5, WHITE, INK)
    y += 90
    d.parts[d.parts.index("CTA")] = f'<rect x="0" y="{cta_top:g}" width="{W}" height="{y - cta_top:g}" fill="{INK}"/>'

    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{y:g}" viewBox="0 0 {W} {y:g}">'
           f'<title>AI For You infographic</title><rect width="{W}" height="{y:g}" fill="{WHITE}"/>'
           + "".join(d.parts) + "</svg>\n")
    Path(out).write_text(svg)
    print(f"{W}x{y:g}")


if __name__ == "__main__":
    load_fonts(sys.argv[1])
    build(sys.argv[2])
