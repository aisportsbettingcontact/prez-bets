#!/usr/bin/env python3
"""
Splits Card Image Generator — mirrors the frontend feed design exactly.

Color picking logic is ported from GameCard.tsx:
  - isUnusable: skip if luminance < 0.04 or > 0.90
  - tooSimilar: skip if Euclidean RGB distance < 60
  - pickColor: try primary → secondary → tertiary → fallback
  - awayColor: also skip if too similar to homeColor

Usage:
  python3 generate_splits_image.py '<json_data>' <output_path>
"""

import sys
import json
import os
import io
import math
import urllib.request
from PIL import Image, ImageDraw, ImageFont

try:
    import cairosvg
    HAS_CAIROSVG = True
except ImportError:
    HAS_CAIROSVG = False

# ── Font paths ────────────────────────────────────────────────────────────────
FONT_DIR  = os.path.join(os.path.dirname(__file__), "fonts")
FONT_BOLD = os.path.join(FONT_DIR, "Barlow-Bold.ttf")
FONT_SEMI = os.path.join(FONT_DIR, "Barlow-SemiBold.ttf")
FONT_REG  = os.path.join(FONT_DIR, "Barlow-Regular.ttf")

# ── Palette ───────────────────────────────────────────────────────────────────
BG_DARK       = (12, 14, 20)
BG_CARD       = (20, 24, 32)
BG_HEADER     = (28, 32, 42)
BG_BAR_EMPTY  = (38, 44, 58)
WHITE         = (255, 255, 255)
GRAY_L        = (160, 170, 195)   # TICKETS / MONEY label
GRAY_D        = (75, 85, 105)     # footer / "@"
OVER_COLOR    = (55, 185, 95)
UNDER_COLOR   = (200, 65, 65)

FALLBACK_AWAY = (26, 74, 138)     # #1a4a8a
FALLBACK_HOME = (200, 75, 12)     # #c84b0c

TAB_SPREAD    = (255, 196, 0)
TAB_TOTAL     = (60, 200, 110)
TAB_ML        = (99, 160, 255)

W   = 1100
PAD = 32

# ── Color helpers (exact port of GameCard.tsx logic) ─────────────────────────
def hex_to_rgb(h):
    if not h:
        return None
    h = h.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    if len(h) != 6:
        return None
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return None

def luminance(rgb):
    r, g, b = [c / 255.0 for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def is_unusable(rgb):
    """True if too dark (lum < 0.04) or too light (lum > 0.90)."""
    if rgb is None:
        return True
    lum = luminance(rgb)
    return lum < 0.04 or lum > 0.90

def too_similar(rgb_a, rgb_b):
    """True if Euclidean RGB distance < 60."""
    if rgb_a is None or rgb_b is None:
        return False
    dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(rgb_a, rgb_b)))
    return dist < 60

def pick_color(p, s, t, fallback):
    """Try primary → secondary → tertiary → fallback, skip unusable."""
    for c in [p, s, t]:
        if c and not is_unusable(c):
            return c
    return fallback

def resolve_team_colors(primary_hex, secondary_hex, tertiary_hex, other_color, fallback):
    """
    Resolve the display color for a team, mirroring GameCard.tsx's awayColor logic.
    `other_color` is the opposing team's resolved color (used for tooSimilar check).
    """
    p = hex_to_rgb(primary_hex)
    s = hex_to_rgb(secondary_hex)
    t = hex_to_rgb(tertiary_hex)
    for c in [p, s, t]:
        if c is None:
            continue
        if is_unusable(c):
            continue
        if other_color and too_similar(c, other_color):
            continue
        return c
    return fallback

def darken(rgb, f=0.28):
    return tuple(max(0, int(c * f)) for c in rgb)

# ── Font / draw helpers ───────────────────────────────────────────────────────
def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def tw(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0]

def th(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]

def draw_rr(draw, xy, r, fill=None, outline=None, ow=2):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=ow)

def fetch_logo(url, size):
    if not url:
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = resp.read()
        if url.lower().endswith(".svg") or b"<svg" in data[:200]:
            if HAS_CAIROSVG:
                png_data = cairosvg.svg2png(bytestring=data,
                                             output_width=size, output_height=size)
                img = Image.open(io.BytesIO(png_data)).convert("RGBA")
            else:
                return None
        else:
            img = Image.open(io.BytesIO(data)).convert("RGBA")
        return img.resize((size, size), Image.LANCZOS)
    except Exception as e:
        print(f"[logo] failed {url}: {e}", file=sys.stderr)
        return None

# ── Bar renderer ──────────────────────────────────────────────────────────────
def draw_split_bar(draw, x, y, bar_w, bar_h,
                   lp, rp, left_color, right_color, font_pct):
    """
    Two-tone pill bar. Labels are always white with black stroke.
    When a segment is too narrow, the label is placed just outside.
    """
    r = bar_h // 2
    lp = max(0, min(100, lp if lp is not None else 50))
    rp = 100 - lp
    left_w  = int(bar_w * lp / 100)
    right_w = bar_w - left_w

    lp_str  = f"{lp}%"
    rp_str  = f"{rp}%"
    lbl_w_l = tw(draw, lp_str, font_pct)
    lbl_w_r = tw(draw, rp_str, font_pct)
    lbl_h   = th(draw, lp_str, font_pct)
    lbl_y   = y + (bar_h - lbl_h) // 2 - 1

    INSIDE_MIN = lbl_w_l + 18

    # Background pill
    draw_rr(draw, [x, y, x + bar_w, y + bar_h], r, fill=BG_BAR_EMPTY)

    # Left segment
    if left_w > 0:
        if left_w >= bar_w:
            draw_rr(draw, [x, y, x + bar_w, y + bar_h], r, fill=left_color)
        else:
            draw_rr(draw, [x, y, x + left_w + r, y + bar_h], r, fill=left_color)
            draw.rectangle([x + left_w, y, x + left_w + r, y + bar_h], fill=BG_BAR_EMPTY)

    # Right segment
    if right_w > 0:
        if right_w >= bar_w:
            draw_rr(draw, [x, y, x + bar_w, y + bar_h], r, fill=right_color)
        else:
            draw_rr(draw, [x + left_w - r, y, x + bar_w, y + bar_h], r, fill=right_color)
            if left_w > 0:
                draw.rectangle([x + left_w - r, y, x + left_w, y + bar_h], fill=left_color)

    # Divider
    if 0 < left_w < bar_w:
        draw.rectangle([x + left_w - 1, y + 2, x + left_w + 1, y + bar_h - 2],
                       fill=BG_DARK)

    # Left label — inside if there's room, otherwise above-left of bar
    if left_w >= INSIDE_MIN:
        draw.text((x + 10, lbl_y), lp_str, font=font_pct, fill=WHITE,
                  stroke_width=1, stroke_fill=(0, 0, 0))
    else:
        # Place label above the left edge of the bar so it never overlaps right side
        above_y = y - lbl_h - 2
        draw.text((x, above_y), lp_str, font=font_pct, fill=WHITE,
                  stroke_width=1, stroke_fill=(0, 0, 0))

    # Right label — inside if there's room, otherwise above-right of bar
    if right_w >= lbl_w_r + 18:
        draw.text((x + bar_w - lbl_w_r - 10, lbl_y), rp_str, font=font_pct, fill=WHITE,
                  stroke_width=1, stroke_fill=(0, 0, 0))
    else:
        above_y = y - lbl_h - 2
        draw.text((x + bar_w - lbl_w_r, above_y), rp_str, font=font_pct, fill=WHITE,
                  stroke_width=1, stroke_fill=(0, 0, 0))

# ── Section renderer ──────────────────────────────────────────────────────────
def draw_section(draw, x, y, sec_w, title, accent,
                 r1_lbl, r1_left, r1_right,
                 r2_lbl, r2_left, r2_right,
                 left_name, right_name,
                 left_color, right_color, fonts):
    f_title = fonts["title"]
    f_lbl   = fonts["label"]
    f_pct   = fonts["pct"]
    f_name  = fonts["name"]

    title_h = th(draw, title, f_title)
    hdr_h   = title_h + 12       # compact — 6px top + 6px bottom

    name_h  = th(draw, left_name, f_name)
    bar_h   = 32
    row_gap = 10

    # Tab
    draw_rr(draw, [x, y, x + sec_w, y + hdr_h], 6,
            fill=BG_HEADER, outline=accent, ow=2)
    t_w = tw(draw, title, f_title)
    draw.text((x + (sec_w - t_w) // 2, y + 6), title,
              font=f_title, fill=accent)

    cy = y + hdr_h + 10

    for row_lbl, lp, rp in [(r1_lbl, r1_left, r1_right),
                              (r2_lbl, r2_left, r2_right)]:
        lp_val = lp if lp is not None else 50

        # Name row — abbreviations in WHITE, center label in gray
        rn_w  = tw(draw, right_name, f_name)
        lbl_w = tw(draw, row_lbl, f_lbl)

        draw.text((x, cy), left_name, font=f_name, fill=WHITE)
        draw.text((x + (sec_w - lbl_w) // 2, cy), row_lbl,
                  font=f_lbl, fill=GRAY_L)
        draw.text((x + sec_w - rn_w, cy), right_name, font=f_name, fill=WHITE)

        cy += name_h + 3

        draw_split_bar(draw, x, cy, sec_w, bar_h,
                       lp_val, 100 - lp_val,
                       left_color, right_color, f_pct)

        cy += bar_h + row_gap

    return cy - y

# ── Main card renderer ────────────────────────────────────────────────────────
def render_card(data, output_path):
    away_team = data["away_team"]
    home_team = data["home_team"]
    away_abbr = data.get("away_abbr", away_team[:3].upper())
    home_abbr = data.get("home_abbr", home_team[:3].upper())
    league    = data.get("league",    "NBA")
    game_date = data.get("game_date", "")
    start_time = data.get("start_time", "")

    spread    = data.get("spread",    {})
    total     = data.get("total",     {})
    moneyline = data.get("moneyline", {})

    # ── Resolve colors using exact frontend pickColor logic ───────────────────
    # Home color: pick first usable from primary → secondary → tertiary
    home_color = pick_color(
        hex_to_rgb(data.get("home_color")),
        hex_to_rgb(data.get("home_color2")),
        hex_to_rgb(data.get("home_color3")),
        FALLBACK_HOME,
    )
    # Away color: also skip if too similar to home
    away_color = resolve_team_colors(
        data.get("away_color"),
        data.get("away_color2"),
        data.get("away_color3"),
        home_color,
        FALLBACK_AWAY,
    )

    fonts = {
        "matchup": load_font(FONT_BOLD, 30),
        "title":   load_font(FONT_BOLD, 16),
        "label":   load_font(FONT_SEMI, 13),
        "pct":     load_font(FONT_BOLD, 17),
        "name":    load_font(FONT_SEMI, 13),
        "footer":  load_font(FONT_REG,  13),
    }

    # Layout
    inner_w     = W - PAD * 2
    section_gap = 16
    section_w   = (inner_w - section_gap * 2) // 3

    logo_size  = 84
    logo_pad   = 8
    logo_total = logo_size + logo_pad * 2

    # Estimate height
    _dummy_img  = Image.new("RGB", (1, 1))
    _dummy_draw = ImageDraw.Draw(_dummy_img)
    title_h = th(_dummy_draw, "SPREAD", fonts["title"])
    hdr_h   = title_h + 12
    name_h  = th(_dummy_draw, "GSW", fonts["name"])
    sec_h   = hdr_h + 10 + ((name_h + 3 + 32 + 10) * 2)
    header_h = logo_total + 20
    footer_h = 30
    H = 14 + header_h + 14 + sec_h + footer_h + 20

    img  = Image.new("RGBA", (W, H), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Card background
    draw_rr(draw, [0, 0, W, H], 16, fill=BG_CARD)

    # Top gradient stripe
    for px in range(W):
        t = px / W
        r = int(away_color[0]*(1-t) + home_color[0]*t)
        g = int(away_color[1]*(1-t) + home_color[1]*t)
        b = int(away_color[2]*(1-t) + home_color[2]*t)
        draw.line([(px, 0), (px, 5)], fill=(r, g, b))

    # ── Header ────────────────────────────────────────────────────────────────
    hdr_y  = 6 + 12
    logo_y = hdr_y + 4

    away_logo = fetch_logo(data.get("away_logo", ""), logo_size)
    home_logo = fetch_logo(data.get("home_logo", ""), logo_size)

    if away_logo:
        cx1, cy1 = PAD, logo_y
        draw.ellipse([cx1, cy1, cx1 + logo_total, cy1 + logo_total],
                     fill=darken(away_color))
        img.paste(away_logo, (cx1 + logo_pad, cy1 + logo_pad), away_logo)

    if home_logo:
        cx1, cy1 = W - PAD - logo_total, logo_y
        draw.ellipse([cx1, cy1, cx1 + logo_total, cy1 + logo_total],
                     fill=darken(home_color))
        img.paste(home_logo, (cx1 + logo_pad, cy1 + logo_pad), home_logo)

    # Matchup text — team names in their resolved display color
    f_m = fonts["matchup"]
    logo_right_edge = PAD + logo_total + 14
    logo_left_edge  = W - PAD - logo_total - 14
    text_zone_w     = logo_left_edge - logo_right_edge

    at_w = tw(draw, away_team, f_m)
    vs_w = tw(draw, "  @  ",   f_m)
    ht_w = tw(draw, home_team, f_m)
    total_mw = at_w + vs_w + ht_w

    mx = logo_right_edge + max(0, (text_zone_w - total_mw) // 2)
    my = logo_y + (logo_total - th(draw, away_team, f_m)) // 2

    draw.text((mx, my), away_team, font=f_m, fill=away_color,
              stroke_width=2, stroke_fill=BG_DARK)
    draw.text((mx + at_w, my), "  @  ", font=f_m, fill=GRAY_D,
              stroke_width=1, stroke_fill=BG_DARK)
    draw.text((mx + at_w + vs_w, my), home_team, font=f_m, fill=home_color,
              stroke_width=2, stroke_fill=BG_DARK)

    # Divider
    div_y = hdr_y + logo_total + 14
    draw.line([(PAD, div_y), (W - PAD, div_y)], fill=(40, 46, 60), width=1)

    # ── Sections ──────────────────────────────────────────────────────────────
    sec_y = div_y + 14

    sections = [
        {
            "title":      "SPREAD",
            "accent":     TAB_SPREAD,
            "r1_lbl":     "TICKETS",
            "r1_left":    spread.get("away_ticket_pct"),
            "r1_right":   spread.get("home_ticket_pct"),
            "r2_lbl":     "MONEY",
            "r2_left":    spread.get("away_money_pct"),
            "r2_right":   spread.get("home_money_pct"),
            "left_name":  away_abbr,
            "right_name": home_abbr,
            "left_color": away_color,
            "right_color":home_color,
        },
        {
            "title":      "TOTAL",
            "accent":     TAB_TOTAL,
            "r1_lbl":     "TICKETS",
            "r1_left":    total.get("over_ticket_pct"),
            "r1_right":   total.get("under_ticket_pct"),
            "r2_lbl":     "MONEY",
            "r2_left":    total.get("over_money_pct"),
            "r2_right":   total.get("under_money_pct"),
            "left_name":  "OVER",
            "right_name": "UNDER",
            "left_color": OVER_COLOR,
            "right_color":UNDER_COLOR,
        },
        {
            "title":      "MONEYLINE",
            "accent":     TAB_ML,
            "r1_lbl":     "TICKETS",
            "r1_left":    moneyline.get("away_ticket_pct"),
            "r1_right":   moneyline.get("home_ticket_pct"),
            "r2_lbl":     "MONEY",
            "r2_left":    moneyline.get("away_money_pct"),
            "r2_right":   moneyline.get("home_money_pct"),
            "left_name":  away_abbr,
            "right_name": home_abbr,
            "left_color": away_color,
            "right_color":home_color,
        },
    ]

    max_sec_h = 0
    for i, sec in enumerate(sections):
        sx = PAD + i * (section_w + section_gap)
        h  = draw_section(
            draw, sx, sec_y, section_w,
            sec["title"], sec["accent"],
            sec["r1_lbl"], sec["r1_left"], sec["r1_right"],
            sec["r2_lbl"], sec["r2_left"], sec["r2_right"],
            sec["left_name"], sec["right_name"],
            sec["left_color"], sec["right_color"],
            fonts,
        )
        max_sec_h = max(max_sec_h, h)

    # ── Footer ────────────────────────────────────────────────────────────────
    footer_y    = sec_y + max_sec_h + 12
    footer_text = f"{league}  ·  Daily Betting Splits  ·  {game_date}  ·  {start_time}"
    ft_w = tw(draw, footer_text, fonts["footer"])
    draw.text(((W - ft_w) // 2, footer_y), footer_text,
              font=fonts["footer"], fill=GRAY_D)

    # Crop and save
    final_h = footer_y + 26
    img = img.crop((0, 0, W, final_h))

    out = Image.new("RGB", img.size, BG_DARK)
    if img.mode == "RGBA":
        out.paste(img, mask=img.split()[3])
    else:
        out.paste(img)
    out.save(output_path, "PNG", optimize=True)
    print(f"OK:{output_path}:{out.size[0]}x{out.size[1]}")

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: generate_splits_image.py '<json>' <output.png>", file=sys.stderr)
        sys.exit(1)
    render_card(json.loads(sys.argv[1]), sys.argv[2])
