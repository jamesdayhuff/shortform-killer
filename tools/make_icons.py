#!/usr/bin/env python3
"""Generate the extension's PNG icons using only the standard library.

Chrome requires raster icons for `action` and `icons` — SVG is rejected —
and this machine has no ImageMagick or Pillow, so we write the PNG bytes
directly. Output is committed, so nobody needs to run this to use the
extension.

The mark: a portrait frame — the shape of every short-form video — struck
through. Three shapes, no gradients, no detail, so it still reads at 16px.

    python3 tools/make_icons.py
"""

import os
import struct
import zlib

BG = (220, 38, 38)      # brand red, matches the popup accent
FG = (255, 255, 255)    # the portrait frame
SIZES = (16, 48, 128)
SAMPLES = 4             # supersampling per axis, for clean curves and diagonals

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def rounded_rect(px, py, cx, cy, half_w, half_h, radius):
    """True if (px, py) is inside a rounded rectangle centred on (cx, cy)."""
    dx = abs(px - cx) - (half_w - radius)
    dy = abs(py - cy) - (half_h - radius)
    if dx <= 0 or dy <= 0:
        return dx <= radius and dy <= radius
    return dx * dx + dy * dy <= radius * radius


def diagonal_band(px, py, cx, cy, half_width):
    """True if (px, py) lies within a band through the centre at 45 degrees."""
    k = 0.7071067811865476
    across = ((py - cy) - (px - cx)) * k
    return abs(across) <= half_width


def coverage(x, y, predicate):
    """Antialiased coverage of `predicate` over one pixel, 0.0 to 1.0."""
    hits = 0
    step = 1.0 / SAMPLES
    for sy in range(SAMPLES):
        for sx in range(SAMPLES):
            if predicate(x + (sx + 0.5) * step, y + (sy + 0.5) * step):
                hits += 1
    return hits / (SAMPLES * SAMPLES)


def blend(under, over, alpha):
    return tuple(round(u + (o - u) * alpha) for u, o in zip(under, over))


def make_png(size):
    c = size / 2.0
    tile_radius = size * 0.22

    # The portrait frame, and the strike cut back through it in the tile
    # colour — a knockout rather than an overlaid line, which stays crisp
    # when the whole mark is only 16px wide.
    frame_half_w = size * 0.17
    frame_half_h = size * 0.28
    frame_radius = size * 0.055
    strike_half = size * 0.058

    def in_tile(px, py):
        return rounded_rect(px, py, c, c, c, c, tile_radius)

    def in_frame(px, py):
        return rounded_rect(px, py, c, c, frame_half_w, frame_half_h, frame_radius)

    def in_strike(px, py):
        return diagonal_band(px, py, c, c, strike_half)

    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # PNG filter type 0 (None)
        for x in range(size):
            tile = coverage(x, y, in_tile)
            if tile <= 0:
                row += bytes((0, 0, 0, 0))
                continue
            color = BG
            color = blend(color, FG, coverage(x, y, in_frame))
            color = blend(color, BG, coverage(x, y, in_strike))
            row += bytes((color[0], color[1], color[2], round(tile * 255)))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, "icon%d.png" % size)
        with open(path, "wb") as handle:
            handle.write(make_png(size))
        print("wrote %s (%d bytes)" % (os.path.relpath(path, os.path.dirname(OUT_DIR)), os.path.getsize(path)))


if __name__ == "__main__":
    main()
