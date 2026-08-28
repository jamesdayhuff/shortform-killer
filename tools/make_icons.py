#!/usr/bin/env python3
"""Generate the extension's PNG icons using only the standard library.

Chrome requires raster icons for `action` and `icons` — SVG is rejected —
and this machine has no ImageMagick or Pillow, so we write the PNG bytes
directly. Output is committed, so nobody needs to run this to use the
extension.

    python3 tools/make_icons.py
"""

import os
import struct
import zlib

BG = (220, 38, 38)      # red tile, matches the popup accent
FG = (255, 255, 255)    # the slash
SIZES = (16, 48, 128)
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def rounded_alpha(x, y, size, radius, samples=4):
    """Coverage of a rounded square at pixel (x, y), supersampled for edges."""
    hits = 0
    step = 1.0 / samples
    for sy in range(samples):
        for sx in range(samples):
            px = x + (sx + 0.5) * step
            py = y + (sy + 0.5) * step
            # Distance into the nearest corner region, if any.
            cx = min(max(px, radius), size - radius)
            cy = min(max(py, radius), size - radius)
            dx, dy = px - cx, py - cy
            if dx * dx + dy * dy <= radius * radius:
                hits += 1
    return hits / (samples * samples)


def slash_alpha(x, y, size, samples=4):
    """Coverage of a diagonal bar through the middle of the tile."""
    half_width = size * 0.070
    length = size * 0.285
    cx = cy = size / 2.0
    hits = 0
    step = 1.0 / samples
    for sy in range(samples):
        for sx in range(samples):
            px = x + (sx + 0.5) * step - cx
            py = y + (sy + 0.5) * step - cy
            # Rotate -45 degrees so the bar lies on one axis.
            k = 0.7071067811865476
            u = (px + py) * k    # along the bar
            v = (py - px) * k    # across the bar
            if abs(v) <= half_width and abs(u) <= length:
                hits += 1
    return hits / (samples * samples)


def blend(under, over, alpha):
    return tuple(round(u + (o - u) * alpha) for u, o in zip(under, over))


def make_png(size):
    radius = size * 0.22
    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # PNG filter type 0 (None)
        for x in range(size):
            tile = rounded_alpha(x, y, size, radius)
            if tile <= 0:
                row += bytes((0, 0, 0, 0))
                continue
            color = blend(BG, FG, slash_alpha(x, y, size))
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
        print("wrote %s (%d bytes)" % (path, os.path.getsize(path)))


if __name__ == "__main__":
    main()
