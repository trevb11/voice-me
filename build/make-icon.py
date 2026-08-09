#!/usr/bin/env python3
"""
make-icon.py — generate the Voice Me app icon.

A thin monoline capital V in near-black on the app's own light olive, with a
looping flourish off the top of the right arm.

Drawn from signed distance fields rather than an image file so it stays
reproducible and tweakable — no binary asset to re-cut by hand, and no
dependency on PIL or a vector toolchain. Antialiasing comes from the distance
field directly (coverage = 0.5 - d), which is exact enough at every size macOS
asks for and costs one evaluation per pixel.

    python3 build/make-icon.py             # build/icon.png + build/icon.icns
    python3 build/make-icon.py --preview   # just the 1024 PNG, for a quick look

Colours are taken from styles.css :root — keep them in sync.
"""

import math, os, struct, subprocess, sys, zlib

OLIVE = (0xE1, 0xDB, 0xBA)   # --bg
INK   = (0x1A, 0x18, 0x0E)   # --text-primary

SIZE = 1024
HERE = os.path.dirname(os.path.abspath(__file__))


# ── Signed distance fields ─────────────────────────────────────────────────
# Negative inside the shape, positive outside, magnitude in pixels.

def sd_round_box(px, py, half_w, half_h, r):
    qx = abs(px) - half_w + r
    qy = abs(py) - half_h + r
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def sd_stroke(px, py, ax, ay, bx, by, w_start, w_end):
    """Distance to a segment whose half-width tapers from w_start to w_end.

    The V uses a constant width; only the flourish tapers, thinning as it winds
    in so it reads as a pen lifting rather than a wire stopping.
    """
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    denom = bax * bax + bay * bay
    h = 0.0 if denom == 0 else max(0.0, min(1.0, (pax * bax + pay * bay) / denom))
    return math.hypot(pax - bax * h, pay - bay * h) - (w_start + (w_end - w_start) * h)


# ── Geometry, in a centred coordinate system (+y is down) ──────────────────
# macOS Big Sur icons are a rounded square inset in a transparent canvas; the
# 824/1024 proportion and ~22% corner radius are Apple's grid.

PLATE_HALF   = 412.0
PLATE_RADIUS = 185.0

# A CAPITAL V: symmetric arms rising to the same cap height, roughly as wide as
# it is tall, apex centred on the plate. Asymmetric arms and heavy weight
# contrast make it read as a cursive lowercase v instead.
V_LEFT  = (-196.0, -168.0)
V_RIGHT = (196.0, -168.0)
V_APEX  = (0.0, 242.0)

# Even weight throughout. Thick/thin contrast makes the letter read as
# handwriting; a uniform monoline keeps it a drawn capital, and lets the
# flourish be the only thing doing any flourishing.
V_WEIGHT = 15.0

# The curl: a full loop off the top of the right arm.
#
# Its centre is DERIVED from the arm's direction rather than placed by eye, so
# the spiral leaves the tip along the same heading the stroke arrived on. Placed
# by hand it doubles back on itself and reads as a hook stuck onto the letter
# instead of a flourish growing out of it.
CURL_RADIUS  = 54.0
CURL_SWEEP   = 7.4          # radians; > 2π so it loops fully and tucks inside
CURL_TIGHTEN = 0.84         # how much the radius shrinks over the sweep
CURL_W_START, CURL_W_END = 15.0, 2.8
CURL_STEPS = 160


def curl_points():
    """Sample the flourish, starting exactly at the right arm's tip.

    The spiral's centre is chosen so its initial tangent matches the arm's
    heading: for a spiral, the tangent at t=0 is perpendicular to the radius,
    so putting the centre a quarter-turn off the stroke direction makes the
    curl continue the line instead of reversing it.
    """
    ax = V_RIGHT[0] - V_APEX[0]
    ay = V_RIGHT[1] - V_APEX[1]
    mag = math.hypot(ax, ay)
    ax, ay = ax / mag, ay / mag                     # arm heading, apex → tip

    # Rotate the heading a quarter turn to find the centre. The sign puts the
    # centre on the OUTSIDE of the letter, so the curl flourishes away from the
    # V; the other sign winds it back over the arm and reads as a mistake.
    turn = 1.0 if CURL_SWEEP > 0 else -1.0
    cx = V_RIGHT[0] + CURL_RADIUS * (-ay * turn)
    cy = V_RIGHT[1] + CURL_RADIUS * (ax * turn)

    r0 = CURL_RADIUS
    a0 = math.atan2(V_RIGHT[1] - cy, V_RIGHT[0] - cx)

    pts = []
    for i in range(CURL_STEPS + 1):
        t = i / CURL_STEPS
        a = a0 + CURL_SWEEP * t
        r = r0 * (1.0 - CURL_TIGHTEN * t)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a),
                    CURL_W_START + (CURL_W_END - CURL_W_START) * t))
    return pts


def coverage(d):
    """Distance field to alpha, with one pixel of antialiasing."""
    return max(0.0, min(1.0, 0.5 - d))


def render(size):
    scale = size / SIZE
    c = size / 2.0
    s = lambda v: v * scale
    pt = lambda p: (p[0] * scale, p[1] * scale)

    plate_half, plate_r = s(PLATE_HALF), s(PLATE_RADIUS)
    apex, left, right = pt(V_APEX), pt(V_LEFT), pt(V_RIGHT)
    w = s(V_WEIGHT)

    curl = [(x * scale, y * scale, w * scale) for x, y, w in curl_points()]
    curl_segs = list(zip(curl, curl[1:]))

    # Bounding box of the curl, so most pixels skip it entirely.
    cxs = [p[0] for p in curl]; cys = [p[1] for p in curl]
    pad = s(CURL_W_START) + 2
    cx0, cx1 = min(cxs) - pad, max(cxs) + pad
    cy0, cy1 = min(cys) - pad, max(cys) + pad

    rows = []
    for y in range(size):
        py = y - c + 0.5
        row = bytearray()
        in_curl_band = cy0 <= py <= cy1
        for x in range(size):
            px = x - c + 0.5

            plate = coverage(sd_round_box(px, py, plate_half, plate_half, plate_r))
            if plate <= 0.0:
                row += b'\x00\x00\x00\x00'
                continue

            d = min(sd_stroke(px, py, left[0], left[1], apex[0], apex[1], w, w),
                    sd_stroke(px, py, apex[0], apex[1], right[0], right[1], w, w))

            if in_curl_band and cx0 <= px <= cx1:
                for (ax, ay, aw), (bx, by, bw) in curl_segs:
                    dc = sd_stroke(px, py, ax, ay, bx, by, aw, bw)
                    if dc < d:
                        d = dc
                        if d < -1.0:
                            break

            ink = coverage(d)
            r = round(OLIVE[0] * (1 - ink) + INK[0] * ink)
            g = round(OLIVE[1] * (1 - ink) + INK[1] * ink)
            b = round(OLIVE[2] * (1 - ink) + INK[2] * ink)
            row += bytes((r, g, b, round(plate * 255)))
        rows.append(row)
    return rows


# ── PNG writer (zlib is stdlib; no image library needed) ───────────────────

def write_png(path, size, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def main():
    png = os.path.join(HERE, 'icon.png')
    print(f'rendering {SIZE}×{SIZE}…')
    write_png(png, SIZE, render(SIZE))
    print(f'  → {png}')
    if '--preview' in sys.argv:
        return

    # macOS wants an .icns; iconutil builds one from a sized iconset.
    iconset = os.path.join(HERE, 'icon.iconset')
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for scale, suffix in ((1, ''), (2, '@2x')):
            px = base * scale
            write_png(os.path.join(iconset, f'icon_{base}x{base}{suffix}.png'), px, render(px))
    icns = os.path.join(HERE, 'icon.icns')
    subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', icns], check=True)
    subprocess.run(['rm', '-rf', iconset], check=True)
    print(f'  → {icns}')


if __name__ == '__main__':
    main()
