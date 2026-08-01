"""Single source of truth for the Solum mark. Every asset in this folder is
generated from here, so the geometry can never drift between variants.
Run: python3 build.py"""

ACCENT = "#FF6B19"   # --accent-500
INK    = "#1A0E08"   # --ink
PAPER  = "#FAF6F0"   # --paper

# The mark: a plot boundary with a chamfered corner, three survey crosshairs
# and one control point. Coordinates are on a 40x40 grid, content inset 5..35.
def mark(boundary, marks, sw_b="2.2", sw_m="1.6"):
    return f'''  <path d="M7 7 H27 L33 13 V33 H7 Z" fill="none" stroke="{boundary}" stroke-width="{sw_b}" stroke-linejoin="round"/>
  <path d="M5 7 h4 M7 5 v4" stroke="{marks}" stroke-width="{sw_m}" stroke-linecap="round"/>
  <path d="M5 33 h4 M7 31 v4" stroke="{marks}" stroke-width="{sw_m}" stroke-linecap="round"/>
  <path d="M31 33 h4 M33 31 v4" stroke="{marks}" stroke-width="{sw_m}" stroke-linecap="round"/>
  <circle cx="27" cy="7" r="2.1" fill="{marks}"/>'''

def svg(w, h, vb, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="{vb}" fill="none" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n{body}\n</svg>\n')

def write(name, content):
    open(name, "w").write(content)
    print("  ", name)

print("mark:")
write("solum-mark.svg",       svg(40,40,"0 0 40 40", mark(ACCENT, INK),  "Solum"))
write("solum-mark-black.svg", svg(40,40,"0 0 40 40", mark(INK, INK),     "Solum"))
write("solum-mark-white.svg", svg(40,40,"0 0 40 40", mark("#FFFFFF","#FFFFFF"), "Solum"))
# inherits the surrounding text colour, for inline use
write("solum-mark-mono.svg",  svg(40,40,"0 0 40 40", mark("currentColor","currentColor"), "Solum"))

# ---- lockups -------------------------------------------------------------
# The wordmark is live text in Urbanist 800. See README for the outlining note.
def word(x, y, size, fill, anchor="start"):
    return (f'  <text x="{x}" y="{y}" text-anchor="{anchor}" fill="{fill}" '
            f'font-family="Urbanist, Inter, Helvetica, Arial, sans-serif" '
            f'font-weight="800" font-size="{size}" letter-spacing="-0.01em">SOLUM</text>')

print("horizontal lockup:")
h_body = ('  <g transform="translate(0,4)">\n' + mark(ACCENT, INK) + "\n  </g>\n"
          + word(50, 34, 27, INK))
write("solum-logo-horizontal.svg",       svg(176,48,"0 0 176 48", h_body, "Solum"))
h_white = ('  <g transform="translate(0,4)">\n' + mark(ACCENT, "#FFFFFF") + "\n  </g>\n"
           + word(50, 34, 27, "#FFFFFF"))
write("solum-logo-horizontal-white.svg", svg(176,48,"0 0 176 48", h_white, "Solum"))

print("stacked lockup:")
s_body = ('  <g transform="translate(38,0)">\n' + mark(ACCENT, INK) + "\n  </g>\n"
          + word(58, 74, 27, INK, "middle"))
write("solum-logo-stacked.svg", svg(116,84,"0 0 116 84", s_body, "Solum"))

print("favicon:")
# tighter crop so the mark stays legible at 16px
fav = svg(32,32,"3 3 34 34", mark(ACCENT, INK, "2.6", "2.0"), "Solum")
write("favicon.svg", fav)

# Both HTML files ship as single documents, so they carry the icon inline rather
# than fetching it. This emits the exact tag to paste into their <head>.
print("inline favicon tag:")
import re, urllib.parse
compact = re.sub(r"\s+", " ", fav.replace('role="img" aria-label="Solum"', "")
                                 .replace("<title>Solum</title>", "")).strip()
tag = ('<link rel="icon" href="data:image/svg+xml,'
       + urllib.parse.quote(compact, safe="") + '">\n')
write("favicon-inline.html", tag)
