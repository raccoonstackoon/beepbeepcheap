#!/usr/bin/env python3
"""
Regenerate PWA / Apple touch icons from hyrax.png with correct aspect ratio.
Background matches frontend/src/index.css: --bg-primary, --app-bg-grid-image
logic (24px grid, rgba(90,122,154,0.15)). If you change those tokens, update
constants below and rerun.

Run from repo root:
  python3 frontend/scripts/generate-pwa-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Source art (RGBA)
ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "public" / "icons"
SRC = ICONS / "hyrax.png"

# Mirror index.css :root + body background (keep in sync if design changes)
BG_PRIMARY = (232, 244, 248)  # --bg-primary #E8F4F8
GRID_RGB = (90, 122, 154)  # same hue as --text-secondary family, index.css grid
GRID_ALPHA = 0.15  # rgba(..., 0.15) in index.css
GRID_STEP_PX = 24


def _grid_line_rgb() -> tuple[int, int, int]:
    """1px grid line color composited over bg-primary (same math as CSS over solid bg)."""
    sr, sg, sb = GRID_RGB
    a = GRID_ALPHA
    br, bg, bb = BG_PRIMARY
    return (
        int(sr * a + br * (1 - a)),
        int(sg * a + bg * (1 - a)),
        int(sb * a + bb * (1 - a)),
    )


def draw_app_background(size: int) -> Image.Image:
    """RGB square matching the app page background + subtle grid."""
    line = _grid_line_rgb()
    img = Image.new("RGB", (size, size), BG_PRIMARY)
    draw = ImageDraw.Draw(img)
    for y in range(0, size, GRID_STEP_PX):
        draw.rectangle([0, y, size - 1, y], fill=line)
    for x in range(0, size, GRID_STEP_PX):
        draw.rectangle([x, 0, x, size - 1], fill=line)
    return img

# Hyrax fits inside this fraction of the square (maskable safe zone ~80%)
SAFE = 0.78

OUTPUTS = [
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon-180.png", 180),
    ("apple-touch-icon-167.png", 167),
    ("apple-touch-icon-152.png", 152),
    ("favicon-32.png", 32),
]


def make_square(size: int) -> Image.Image:
    src = Image.open(SRC).convert("RGBA")
    w, h = src.size
    max_side = int(size * SAFE)
    scale = min(max_side / w, max_side / h)
    nw, nh = int(w * scale), int(h * scale)
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = draw_app_background(size).convert("RGBA")
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas.convert("RGB")


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing source: {SRC}")
    for name, px in OUTPUTS:
        out = ICONS / name
        img = make_square(px)
        img.save(out, "PNG", optimize=True)
        print(f"Wrote {out.relative_to(ROOT)} ({px}x{px})")


if __name__ == "__main__":
    main()
