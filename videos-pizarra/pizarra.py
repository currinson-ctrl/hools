"""Motor de vídeos tipo pizarra ("whiteboard animation").

Una mano con rotulador dibuja trazos y escribe textos sobre un fondo blanco
mientras una voz en off narra cada escena.

Uso:  python3 pizarra.py guion_ww2 salida.mp4
El guion es un módulo Python con una lista SCENES de dicts:
    {"narration": str, "ops": [ops...]}
Los ops se construyen con las funciones de dibujo de este módulo.
"""
import importlib
import math
import os
import random
import subprocess
import sys
import tempfile
import wave

from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
SS = 2                      # supersampling para antialiasing
FPS = 25
BG = (252, 251, 247)
INK = (29, 29, 31)
RED = (214, 40, 40)
BLUE = (29, 78, 216)
GREEN = (22, 128, 61)
GRAY = (110, 110, 110)
ORANGE = (234, 120, 20)
FONT = "/usr/share/fonts/opentype/comic-neue/ComicNeue-Bold.otf"
VOICE = os.environ.get("PIZARRA_VOICE", "mb-es2")
SPEED = os.environ.get("PIZARRA_SPEED", "140")

_rng = random.Random(7)

# ---------------------------------------------------------------- primitivas


def _resample(pts, step=4.0):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        d = math.dist(a, b)
        n = max(1, int(d / step))
        for i in range(1, n + 1):
            t = i / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def _wobble(pts, amp=1.3):
    ph1, ph2 = _rng.uniform(0, 6.28), _rng.uniform(0, 6.28)
    f1, f2 = _rng.uniform(0.01, 0.03), _rng.uniform(0.01, 0.03)
    out, acc = [], 0.0
    for i, p in enumerate(pts):
        if i:
            acc += math.dist(pts[i - 1], p)
        out.append((p[0] + amp * math.sin(acc * f1 + ph1),
                    p[1] + amp * math.sin(acc * f2 + ph2)))
    return out


def stroke(pts, color=INK, width=5, wobble=1.3):
    pts = _resample(pts)
    if wobble:
        pts = _wobble(pts, wobble)
    return {"type": "stroke", "pts": pts, "color": color, "width": width}


def text(x, y, s, size=44, color=INK, anchor="mm"):
    return {"type": "text", "x": x, "y": y, "s": s, "size": size,
            "color": color, "anchor": anchor}


def line(a, b, **kw):
    return [stroke([a, b], **kw)]


def poly(pts, closed=False, **kw):
    pts = list(pts) + ([pts[0]] if closed else [])
    return [stroke(pts, **kw)]


def rect(x, y, w, h, **kw):
    return poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], closed=True, **kw)


def ellipse(cx, cy, rx, ry, a0=-90, a1=275, **kw):
    n = max(24, int((rx + ry) / 2))
    pts = [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
            cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    return [stroke(pts, **kw)]


def circle(cx, cy, r, **kw):
    return ellipse(cx, cy, r, r, **kw)


def bezier(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])
            for t in (i / n for i in range(n + 1))]


def arrow(a, b, bend=0, head=22, **kw):
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy) or 1
    ctrl = (mid[0] - dy / ln * bend, mid[1] + dx / ln * bend)
    pts = bezier(a, ctrl, b)
    ex, ey = b[0] - pts[-4][0], b[1] - pts[-4][1]
    ang = math.atan2(ey, ex)
    h1 = (b[0] - head * math.cos(ang - 0.45), b[1] - head * math.sin(ang - 0.45))
    h2 = (b[0] - head * math.cos(ang + 0.45), b[1] - head * math.sin(ang + 0.45))
    return [stroke(pts, **kw), stroke([h1, b, h2], **kw)]


def blob(cx, cy, rx, ry, seed=1, **kw):
    r = random.Random(seed)
    k = [r.uniform(0.85, 1.15) for _ in range(9)]
    n = 60
    pts = []
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        f = k[int(i / n * 8) % 9] * (1 - (i / n * 8) % 1) + k[(int(i / n * 8) + 1) % 9] * ((i / n * 8) % 1)
        if i == n:
            f = k[0]
        pts.append((cx + rx * f * math.cos(a), cy + ry * f * math.sin(a)))
    return [stroke(pts, **kw)]


def star(cx, cy, r, **kw):
    pts = []
    for i in range(11):
        rr = r if i % 2 == 0 else r * 0.42
        a = math.radians(-90 + 36 * i)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return [stroke(pts, **kw)]


def hatch(x, y, w, h, gap=14, **kw):
    """Rayado diagonal dentro de un rectángulo (para "colorear")."""
    ops = []
    for c in range(0, int(w + h), gap):
        p0 = (x + max(0, c - h), y + min(h, c))
        p1 = (x + min(w, c), y + max(0, c - w))
        ops.append(stroke([p0, p1], wobble=0.6, **kw))
    return ops

# ---------------------------------------------------------------- iconos


def globe(cx, cy, r, color=INK):
    o = circle(cx, cy, r, color=color, width=6)
    o += ellipse(cx, cy, r * 0.45, r, a0=-90, a1=270, color=color, width=4)
    o += line((cx, cy - r), (cx, cy + r), color=color, width=4)
    o += line((cx - r, cy), (cx + r, cy), color=color, width=4)
    o += ellipse(cx, cy - r * 0.5, r * 0.86, r * 0.12, a0=180, a1=360, color=color, width=3)
    o += ellipse(cx, cy + r * 0.5, r * 0.86, r * 0.12, a0=0, a1=180, color=color, width=3)
    o += blob(cx - r * 0.35, cy - r * 0.25, r * 0.22, r * 0.3, seed=3, color=GREEN, width=5)
    o += blob(cx + r * 0.4, cy + r * 0.2, r * 0.2, r * 0.25, seed=5, color=GREEN, width=5)
    return o


def document(x, y, w=150, h=190, color=INK):
    f = 34
    o = poly([(x, y), (x + w - f, y), (x + w, y + f), (x + w, y + h), (x, y + h)], closed=True, color=color)
    o += poly([(x + w - f, y), (x + w - f, y + f), (x + w, y + f)], color=color, width=4)
    for i in range(4):
        o += line((x + 20, y + 60 + i * 28), (x + w - 22 - (i % 2) * 30, y + 60 + i * 28), color=GRAY, width=4)
    return o


def chart_down(x, y, w=200, h=170):
    o = poly([(x, y), (x, y + h), (x + w, y + h)])
    pts = [(x + 15, y + 25), (x + 55, y + 50), (x + 85, y + 40), (x + 125, y + 95), (x + 150, y + 85), (x + 185, y + 145)]
    o += [stroke(pts, color=RED, width=6)]
    o += arrow((x + 150, y + 85), (x + 192, y + 150), color=RED, width=6, head=18)[1:]
    return o


def person(cx, cy, s=1.0, color=INK, arms_up=False):
    o = circle(cx, cy - 70 * s, 18 * s, color=color)
    o += line((cx, cy - 52 * s), (cx, cy + 5 * s), color=color)
    if arms_up:
        o += poly([(cx - 30 * s, cy - 75 * s), (cx, cy - 35 * s), (cx + 30 * s, cy - 75 * s)], color=color)
    else:
        o += poly([(cx - 28 * s, cy - 10 * s), (cx, cy - 38 * s), (cx + 28 * s, cy - 10 * s)], color=color)
    o += poly([(cx - 22 * s, cy + 50 * s), (cx, cy + 5 * s), (cx + 22 * s, cy + 50 * s)], color=color)
    return o


def podium(cx, cy):
    o = person(cx, cy - 40, 0.9, arms_up=True)
    o += poly([(cx - 55, cy - 20), (cx + 55, cy - 20), (cx + 40, cy + 70), (cx - 40, cy + 70)], closed=True)
    o += circle(cx - 70, cy - 120, 9, width=4) + line((cx - 62, cy - 112), (cx - 30, cy - 85), width=4)
    return o


def flag(x, y, w=120, h=78, color=INK, fill=None):
    o = line((x, y + h + 90), (x, y), width=6)
    o += poly([(x, y), (x + w, y + 8), (x + w, y + h + 8), (x, y + h)], closed=True, color=color)
    if fill:
        o += hatch(x + 6, y + 12, w - 12, h - 12, gap=13, color=fill, width=4)
    return o


def tank(x, y, s=1.0, color=INK):
    o = poly([(x, y), (x + 220 * s, y), (x + 240 * s, y + 30 * s), (x + 220 * s, y + 60 * s),
              (x, y + 60 * s), (x - 20 * s, y + 30 * s)], closed=True, color=color)
    for i in range(5):
        o += circle(x + (20 + 45 * i) * s, y + 32 * s, 14 * s, color=color, width=4)
    o += poly([(x + 50 * s, y), (x + 70 * s, y - 50 * s), (x + 160 * s, y - 50 * s), (x + 175 * s, y)], color=color)
    o += line((x + 160 * s, y - 30 * s), (x + 300 * s, y - 40 * s), color=color, width=7)
    return o


def plane(x, y, s=1.0, color=INK):
    o = poly([(x, y), (x + 180 * s, y - 8 * s), (x + 210 * s, y + 5 * s), (x + 180 * s, y + 18 * s), (x, y + 14 * s),
              (x - 20 * s, y - 25 * s), (x + 10 * s, y - 2 * s)], closed=True, color=color)
    o += poly([(x + 80 * s, y + 4 * s), (x + 110 * s, y + 70 * s), (x + 130 * s, y + 70 * s), (x + 120 * s, y + 6 * s)], color=color)
    o += poly([(x + 90 * s, y - 4 * s), (x + 115 * s, y - 50 * s), (x + 130 * s, y - 50 * s), (x + 125 * s, y - 6 * s)], color=color)
    return o


def ship(x, y, s=1.0, color=INK):
    o = poly([(x, y), (x + 300 * s, y), (x + 270 * s, y + 50 * s), (x + 30 * s, y + 50 * s)], closed=True, color=color)
    o += rect(x + 90 * s, y - 40 * s, 110 * s, 40 * s, color=color)
    o += rect(x + 120 * s, y - 80 * s, 30 * s, 40 * s, color=color)
    o += line((x + 200 * s, y - 25 * s), (x + 260 * s, y - 35 * s), color=color, width=6)
    return o


def waves(x, y, w, color=BLUE):
    pts = [(x + i, y + 8 * math.sin(i / 18)) for i in range(0, int(w), 4)]
    return [stroke(pts, color=color, width=4, wobble=0.5)]


def boat(x, y, s=1.0, color=INK):
    o = poly([(x, y), (x + 120 * s, y), (x + 100 * s, y + 35 * s), (x + 10 * s, y + 35 * s)], closed=True, color=color)
    for i in range(3):
        o += circle(x + (30 + 30 * i) * s, y - 14 * s, 11 * s, color=color, width=4)
    return o


def candle(cx, cy):
    o = rect(cx - 30, cy, 60, 170)
    o += line((cx, cy), (cx, cy - 22), width=4)
    o += [stroke(bezier((cx, cy - 22), (cx - 30, cy - 50), (cx, cy - 95)), color=ORANGE, width=5)]
    o += [stroke(bezier((cx, cy - 95), (cx + 30, cy - 50), (cx, cy - 22)), color=ORANGE, width=5)]
    o += line((cx - 70, cy + 170), (cx + 70, cy + 170), width=6)
    return o


def snowflake(cx, cy, r, color=BLUE):
    o = []
    for k in range(3):
        a = math.radians(90 + 60 * k)
        o += line((cx - r * math.cos(a), cy - r * math.sin(a)), (cx + r * math.cos(a), cy + r * math.sin(a)), color=color, width=4)
    return o


def mushroom(cx, cy, color=INK):
    o = []
    o += [stroke(bezier((cx - 25, cy), (cx - 15, cy - 90), (cx - 30, cy - 150)), color=color)]
    o += [stroke(bezier((cx + 25, cy), (cx + 15, cy - 90), (cx + 30, cy - 150)), color=color)]
    o += blob(cx, cy - 190, 110, 60, seed=11, color=color)
    o += blob(cx, cy - 190, 60, 30, seed=12, color=ORANGE, width=4)
    o += line((cx - 160, cy), (cx + 160, cy), width=6)
    return o


def calendar(x, y, label, color=RED):
    o = rect(x, y, 150, 130)
    o += line((x, y + 34), (x + 150, y + 34))
    o += line((x + 35, y - 14), (x + 35, y + 14), width=6) + line((x + 115, y - 14), (x + 115, y + 14), width=6)
    o += [text(x + 75, y + 84, label, size=42, color=color)]
    return o


def lightning(cx, cy, color=ORANGE):
    return poly([(cx + 10, cy - 60), (cx - 20, cy + 5), (cx + 15, cy), (cx - 15, cy + 65)], color=color, width=6)


def ruins(x, y):
    o = poly([(x, y), (x, y - 140), (x + 30, y - 110), (x + 50, y - 160), (x + 90, y - 90), (x + 120, y - 120), (x + 130, y)])
    o += poly([(x + 170, y), (x + 170, y - 80), (x + 200, y - 100), (x + 230, y - 60), (x + 240, y)])
    o += line((x - 30, y), (x + 280, y), width=6)
    for i in range(3):
        o += rect(x + 20 + i * 35, y - 70, 18, 22, width=3)
    return o


def laurel(cx, cy, r, color=GREEN):
    o = []
    for side in (-1, 1):
        pts = [(cx + side * r * math.sin(math.radians(a)), cy + r * math.cos(math.radians(a))) for a in range(20, 160, 5)]
        o += [stroke(pts, color=color, width=4)]
        for a in range(35, 150, 22):
            px, py = cx + side * r * math.sin(math.radians(a)), cy + r * math.cos(math.radians(a))
            o += ellipse(px + side * 10, py, 9, 5, color=color, width=3)
    return o

# ---------------------------------------------------------------- render

_fonts = {}


def _font(size):
    if size not in _fonts:
        _fonts[size] = ImageFont.truetype(FONT, size * SS)
    return _fonts[size]


def _hand_sprite():
    """Mano sujetando un rotulador. Devuelve (sprite RGBA, offset de la punta)."""
    S = 2
    im = Image.new("RGBA", (420 * S, 420 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ang = math.radians(52)
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = -uy, ux
    tip = (30 * S, 30 * S)

    def P(along, side):
        return (tip[0] + (ux * along + px * side) * S, tip[1] + (uy * along + py * side) * S)
    skin, skin_d = (241, 194, 150, 255), (190, 130, 90, 255)
    # brazo
    d.polygon([P(150, -40), P(150, 45), P(520, 120), P(520, -60)], fill=skin, outline=skin_d, width=3 * S)
    # rotulador
    d.polygon([P(0, 0), P(22, -9), P(22, 9)], fill=(30, 30, 30, 255))
    d.polygon([P(22, -13), P(190, -13), P(190, 13), P(22, 13)], fill=(45, 45, 52, 255))
    d.polygon([P(22, -13), P(48, -13), P(48, 13), P(22, 13)], fill=(220, 220, 225, 255))
    # dedos y palma
    for along, side, rx, ry in [(70, -18, 26, 16), (88, 16, 34, 20), (112, 26, 34, 20), (134, 30, 30, 19)]:
        cx, cy = P(along, side)
        d.ellipse([cx - rx * S, cy - ry * S, cx + rx * S, cy + ry * S], fill=skin, outline=skin_d, width=2 * S)
    cx, cy = P(150, 5)
    d.ellipse([cx - 62 * S, cy - 56 * S, cx + 62 * S, cy + 56 * S], fill=skin, outline=skin_d, width=3 * S)
    cx, cy = P(70, -18)
    d.ellipse([cx - 24 * S, cy - 14 * S, cx + 24 * S, cy + 14 * S], fill=skin)
    im = im.resize((420, 420), Image.LANCZOS)
    return im, (30, 30)


def _build_timeline(ops):
    """Convierte ops en eventos con coste acumulado (ink + desplazamientos)."""
    events, cost, pen = [], 0.0, None
    for op in ops:
        if op["type"] == "stroke":
            pts = [(x * SS, y * SS) for x, y in op["pts"]]
            start = pts[0]
        else:
            f = _font(op["size"])
            img = Image.new("RGBA", (1, 1))
            bbox = ImageDraw.Draw(img).textbbox((op["x"] * SS, op["y"] * SS), op["s"], font=f, anchor=op["anchor"])
            start = (bbox[0], (bbox[1] + bbox[3]) / 2)
        if pen is not None:
            d = math.dist(pen, start)
            events.append(("travel", cost, cost + d * 0.3, pen, start))
            cost += d * 0.3
        if op["type"] == "stroke":
            for a, b in zip(pts, pts[1:]):
                d = math.dist(a, b)
                events.append(("seg", cost, cost + d, a, b, op))
                cost += d
            pen = pts[-1]
        else:
            x0, y0, x1, y1 = bbox
            layer = Image.new("RGBA", (x1 - x0 + 4, y1 - y0 + 4), (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((op["x"] * SS - x0 + 2, op["y"] * SS - y0 + 2), op["s"], font=f,
                                       fill=op["color"] + (255,), anchor=op["anchor"])
            ln = (x1 - x0) * 1.6
            events.append(("text", cost, cost + ln, (x0 - 2, y0 - 2), layer, op))
            cost += ln
            pen = (x1, (y0 + y1) / 2)
    return events, cost


def _tts(textstr, path):
    subprocess.run(["espeak-ng", "-v", VOICE, "-s", SPEED, "-w", path, textstr],
                   check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate(), w.getframerate(), w.readframes(w.getnframes())


def _ease(t):
    return t * t * (3 - 2 * t)


def render(scenes, out_path):
    tmp = tempfile.mkdtemp()
    hand, (hox, hoy) = _hand_sprite()
    TRANS = 0.7
    audio_chunks, rate = [], 16000
    timeline_t = 0.0

    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                           "-crf", "20", "-pix_fmt", "yuv420p", os.path.join(tmp, "v.mp4")], stdin=subprocess.PIPE)

    def emit(img):
        ff.stdin.write(img.tobytes())

    prev_final = None
    for si, sc in enumerate(scenes):
        dur, rate, pcm = _tts(sc["narration"], os.path.join(tmp, f"s{si}.wav"))
        # transición: la pizarra anterior se desplaza a la izquierda
        if prev_final is not None:
            blank = Image.new("RGB", (W, H), BG)
            n = int(TRANS * FPS)
            for i in range(n):
                off = int(W * _ease((i + 1) / n))
                fr = blank.copy()
                fr.paste(prev_final, (-off, 0))
                emit(fr)
            timeline_t += n / FPS
        lead = 0.4
        audio_chunks.append((timeline_t + lead, pcm))
        events, total = _build_timeline(sc["ops"])
        draw_time = max(2.5, min(dur * 0.92, dur - 0.2))
        draw_time = sc.get("draw_time", draw_time)
        scene_len = max(dur + lead + 1.3, draw_time + lead + 1.2)
        nframes = int(scene_len * FPS)
        canvas = Image.new("RGB", (W * SS, H * SS), BG)
        cd = ImageDraw.Draw(canvas)
        ei, partial = 0, {}
        last_pen = (W * SS * 0.6, H * SS * 1.2)
        exit_start = None
        for f in range(nframes):
            t = f / FPS - lead
            c = total * min(1.0, max(0.0, t / draw_time)) if draw_time > 0 else total
            # dibujar eventos completados
            pen = last_pen
            while ei < len(events) and events[ei][1] <= c:
                ev = events[ei]
                frac = min(1.0, (c - ev[1]) / max(1e-6, ev[2] - ev[1]))
                if ev[0] == "seg":
                    a, b, op = ev[3], ev[4], ev[5]
                    p = (a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac)
                    w = op["width"] * SS
                    cd.line([a, p], fill=op["color"], width=w)
                    r = w / 2
                    cd.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=op["color"])
                    pen = p
                    if frac < 1:
                        break
                elif ev[0] == "travel":
                    a, b = ev[3], ev[4]
                    pen = (a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac)
                    if frac < 1:
                        break
                else:
                    (x0, y0), layer, op = ev[3], ev[4], ev[5]
                    done = partial.get(ei, 0)
                    upto = int(layer.width * frac)
                    if upto > done:
                        sl = layer.crop((done, 0, upto, layer.height))
                        canvas.paste(sl, (x0 + done, y0), sl)
                        partial[ei] = upto
                    pen = (x0 + upto, y0 + layer.height * (0.55 + 0.25 * math.sin(upto / 9)))
                    if frac < 1:
                        break
                ei += 1
            last_pen = pen
            frame = canvas.reduce(SS)
            # mano
            hx, hy = pen[0] / SS, pen[1] / SS
            if c >= total:
                if exit_start is None:
                    exit_start = f
                k = _ease(min(1.0, (f - exit_start) / (0.7 * FPS)))
                hx, hy = hx + (W + 200 - hx) * k, hy + (H + 300 - hy) * k
            if hx < W + 150:
                frame.paste(hand, (int(hx - hox), int(hy - hoy)), hand)
            emit(frame)
        timeline_t += nframes / FPS
        prev_final = canvas.reduce(SS)
        print(f"escena {si + 1}/{len(scenes)} ({scene_len:.1f}s)", flush=True)

    # cierre
    for _ in range(int(1.0 * FPS)):
        emit(prev_final)
    timeline_t += 1.0
    ff.stdin.close()
    ff.wait()

    total_samples = int((timeline_t + 0.5) * rate)
    buf = bytearray(total_samples * 2)
    for start, pcm in audio_chunks:
        o = int(start * rate) * 2
        buf[o:o + len(pcm)] = pcm[:len(buf) - o]
    apath = os.path.join(tmp, "a.wav")
    with wave.open(apath, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(buf))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(tmp, "v.mp4"), "-i", apath,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-af", "highpass=f=80,loudnorm",
                    "-shortest", out_path], check=True)
    print("listo:", out_path, f"{timeline_t:.1f}s")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    mod = importlib.import_module(sys.argv[1])
    render(mod.SCENES, sys.argv[2])
