#!/usr/bin/env python3
"""Avionetas Hools: vídeo promocional del 2x1 en polos (#HoolsEnLaGrada).

Tres escenas con una avioneta antigua que sobrevuela tres estadios distintos
remolcando una pancarta con cada paso de la promo, y un cierre con el logo y
«2x1 en polos». Todo con aspecto de película vieja: grano, colores apagados,
viñeta, parpadeo y alguna raya.

Uso:
    python3 avionetas.py                      # vertical 9:16 (Reels, TikTok, stories)
    python3 avionetas.py --formato 16:9       # horizontal (YouTube, web)
    python3 avionetas.py --logo logo.png      # logo de verdad en el cierre (PNG con fondo transparente)
    python3 avionetas.py --musica tema.mp3    # le pone música (se corta al final del vídeo)
    python3 avionetas.py --fotograma 2.5      # solo guarda un PNG de ese segundo, para revisar

Necesita Python 3 con Pillow y numpy, y ffmpeg instalado.
"""
import argparse
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTES = os.path.join(AQUI, "fuentes")
LOGO = os.path.join(AQUI, "logo_hools.png")  # se usa solo si existe; si no, logo de texto
FPS = 30

# Colores de la marca (los mismos que la web y el blog)
VERDE = (33, 59, 46)
VERDE_OSC = (15, 31, 24)
DORADO = (204, 178, 41)
CREMA = (247, 244, 236)
TINTA = (20, 19, 15)
ROJO = (201, 61, 39)

# ── Guion ────────────────────────────────────────────────────────────────
# Cada escena: un estadio, una pancarta y la tarjeta de abajo (calcada de la
# web: número dorado, título en mayúsculas y una línea de explicación).
ESCENAS = [
    dict(estadio="clasico", num="1", pancarta="COMPRA TU POLO", sub=None,
         titulo="COMPRA TU POLO",
         texto="Cualquier polo de la web, a precio normal y sin códigos de descuento."),
    dict(estadio="herradura", num="2", pancarta="HAZTE LA FOTO", sub="#HoolsEnLaGrada",
         titulo="HAZTE LA FOTO",
         texto="Súbela a una story mencionando a @hoolsbrand o en X con #HoolsEnLaGrada."),
    dict(estadio="barrio", num="3", pancarta="TE MANDAMOS OTRO", sub=None,
         titulo="TE MANDAMOS OTRO",
         texto="Escríbenos por DM con tu número de pedido. Eliges modelo y talla, gratis."),
]
DUR_ESCENA = 4.6
DUR_CIERRE = 5.4


# ── Utilidades ───────────────────────────────────────────────────────────
def fuente(nombre, tam):
    archivos = {
        "display": "abril-fatface-latin-400-normal.woff",
        "serif": "source-serif-4-latin-900-normal.woff",
        "serif_b": "source-serif-4-latin-700-normal.woff",
        "sans": "mulish-latin-800-normal.woff",
        "sans_r": "mulish-latin-400-normal.woff",
    }
    return ImageFont.truetype(os.path.join(FUENTES, archivos[nombre]), max(6, int(tam)))


def mezcla(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def suave(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def sale(t):  # ease-out con un pelín de rebote
    t = min(1.0, max(0.0, t))
    return 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2


def texto_espaciado(draw, xy, texto, fnt, fill, espacio, anchor="la"):
    """Escribe letra a letra con espacio extra (las versalitas de la web)."""
    anchos = [draw.textlength(c, font=fnt) for c in texto]
    total = sum(anchos) + espacio * (len(texto) - 1)
    x, y = xy
    if anchor[0] == "m":
        x -= total / 2
    elif anchor[0] == "r":
        x -= total
    for c, w in zip(texto, anchos):
        draw.text((x, y), c, font=fnt, fill=fill, anchor="l" + anchor[1])
        x += w + espacio
    return total


def partir(draw, texto, fnt, ancho):
    lineas, actual = [], ""
    for palabra in texto.split():
        prueba = (actual + " " + palabra).strip()
        if draw.textlength(prueba, font=fnt) <= ancho or not actual:
            actual = prueba
        else:
            lineas.append(actual)
            actual = palabra
    if actual:
        lineas.append(actual)
    return lineas


def degradado_vertical(w, h, paradas):
    """paradas: [(posición 0-1, color), ...]"""
    ys = np.linspace(0, 1, h)[:, None]
    out = np.zeros((h, 1, 3), np.float32)
    for c in range(3):
        out[:, 0, c] = np.interp(ys[:, 0], [p for p, _ in paradas], [col[c] for _, col in paradas])
    return Image.fromarray(np.repeat(out, w, axis=1).astype(np.uint8))


# ── Formatos ─────────────────────────────────────────────────────────────
def layout(formato):
    if formato == "16:9":
        W, H = 1920, 1080
        return dict(W=W, H=H, u=H / 1080, vertical=False,
                    campo=dict(y_f=0.66 * H, y_n=1.10 * H, w_f=0.72 * W, w_n=4.6 * W),
                    avion_y=0.33 * H, avion_L=0.17 * W, pancarta=(0.34 * W, 0.15 * H),
                    cabecera_y=0.055 * H, tarjeta=(0.035 * W, 0.70 * H, 0.42 * W))
    W, H = 1080, 1920
    return dict(W=W, H=H, u=W / 1080, vertical=True,
                campo=dict(y_f=0.615 * H, y_n=1.05 * H, w_f=0.98 * W, w_n=4.1 * W),
                avion_y=0.235 * H, avion_L=0.27 * W, pancarta=(0.54 * W, 0.14 * W),
                cabecera_y=0.05 * H, tarjeta=(0.06 * W, 0.775 * H, 0.88 * W))


# ── Perspectiva del campo ────────────────────────────────────────────────
class Campo:
    """Proyecta un punto del campo (a: 0-1 a lo largo, b: 0 banda del fondo,
    1 banda de delante, alt: altura en «largos de campo») a la pantalla."""

    def __init__(self, W, H, y_f, y_n, w_f, w_n):
        self.W, self.H = W, H
        self.y_f, self.y_n, self.w_f, self.w_n = y_f, y_n, w_f, w_n
        self.k = w_n / w_f
        self.horizonte = y_f - w_f * (y_n - y_f) / (w_n - w_f)
        # más allá de esto la perspectiva se da la vuelta: lo más cercano que se pinta
        self.b_max = min(1.3, 0.92 * self.k / (self.k - 1))

    def escala(self, b):
        return self.w_f * self.k / (self.k - b * (self.k - 1))

    def p(self, a, b, alt=0.0):
        s = self.escala(b)
        y = self.y_f + (s - self.w_f) / (self.w_n - self.w_f) * (self.y_n - self.y_f) - alt * s
        return (self.W / 2 + (a - 0.5) * s, y)


def multitud(draw, rng, quad_fn, n, radio_fn, paleta):
    for _ in range(n):
        uu, vv = rng.random(), rng.random()
        x, y, s = quad_fn(uu, vv)
        r = radio_fn(s)
        col = paleta[rng.integers(len(paleta))]
        draw.ellipse((x - r, y - r * 1.2, x + r, y + r * 1.2), fill=col)


PALETA_GENTE = [(52, 44, 38), (70, 60, 52), (38, 36, 40), (96, 84, 70), (120, 104, 86),
                (150, 132, 110), (33, 59, 46), (33, 59, 46), (204, 178, 41), (201, 61, 39),
                (226, 214, 190), (88, 96, 110), (60, 72, 90)]


def grada(img, campo, base, prof, alt0, alt1, color, rng, filas=9, gente=1.0, paleta=PALETA_GENTE):
    """Una grada: `base` es una lista de (a, b, oa, ob) — punto del borde de
    abajo y hacia dónde «sube» la grada. Se dibuja por tramos, de lejos a cerca."""
    draw = ImageDraw.Draw(img)

    def punto(i, v):
        a, b, oa, ob = base[i]
        return campo.p(a + oa * prof * v, b + ob * prof * v, alt0 + (alt1 - alt0) * v)

    for i in range(len(base) - 1):
        # muro de delante (vallas de publicidad)
        a0, b0, _, _ = base[i]
        a1, b1, _, _ = base[i + 1]
        muro = [campo.p(a0, b0, 0), campo.p(a1, b1, 0), campo.p(a1, b1, alt0), campo.p(a0, b0, alt0)]
        draw.polygon(muro, fill=[DORADO, VERDE, CREMA, VERDE][i % 4])
        # cuerpo de la grada
        poly = [punto(i, 0), punto(i + 1, 0), punto(i + 1, 1), punto(i, 1)]
        draw.polygon(poly, fill=mezcla(color, (0, 0, 0), 0.06 * (i % 2)))
        for f in range(1, filas):
            v = f / filas
            draw.line([punto(i, v), punto(i + 1, v)], fill=mezcla(color, (0, 0, 0), 0.25),
                      width=max(1, int(campo.escala(b0) / 900)))
        # gente
        def quad(uu, vv, i=i):
            (x0, y0), (x1, y1) = punto(i, vv), punto(i + 1, vv)
            s = campo.escala(base[i][1] + (base[i + 1][1] - base[i][1]) * uu)
            return x0 + (x1 - x0) * uu, y0 + (y1 - y0) * uu, s

        largo = math.dist(punto(i, 0.5), punto(i + 1, 0.5))
        alto = math.dist(punto(i, 0), punto(i, 1))
        n = int(largo * alto / (campo.escala(b0) / 260) ** 2 * 0.55 * gente)
        multitud(draw, rng, quad, n, lambda s: max(1.0, s / 520), paleta)


def torre_luz(draw, campo, a, b, alto, u, estilo="celosia"):
    x, y = campo.p(a, b, 0)
    s = campo.escala(b)
    h = alto * s
    top = (x, y - h)
    gris = (58, 56, 52)
    if estilo == "celosia":
        base_w = 0.022 * s
        izq, der = (x - base_w, y), (x + base_w, y)
        ti, td = (x - base_w * 0.25, y - h), (x + base_w * 0.25, y - h)
        lw = max(1, int(s / 700))
        draw.line([izq, ti], fill=gris, width=lw)
        draw.line([der, td], fill=gris, width=lw)
        pasos = 14
        for k in range(pasos):
            t0, t1 = k / pasos, (k + 1) / pasos
            p0i = (izq[0] + (ti[0] - izq[0]) * t0, izq[1] + (ti[1] - izq[1]) * t0)
            p1d = (der[0] + (td[0] - der[0]) * t1, der[1] + (td[1] - der[1]) * t1)
            p0d = (der[0] + (td[0] - der[0]) * t0, der[1] + (td[1] - der[1]) * t0)
            p1i = (izq[0] + (ti[0] - izq[0]) * t1, izq[1] + (ti[1] - izq[1]) * t1)
            draw.line([p0i, p1d], fill=gris, width=max(1, lw - 1))
            draw.line([p0d, p1i], fill=gris, width=max(1, lw - 1))
        # cabeza inclinada hacia el campo
        cw, ch = 0.07 * s, 0.05 * s
        sentido = 1 if a < 0.5 else -1
        cab = [(top[0] - cw / 2, top[1] - ch), (top[0] + cw / 2, top[1] - ch - sentido * ch * 0.25),
               (top[0] + cw / 2, top[1] - sentido * ch * 0.25), (top[0] - cw / 2, top[1])]
        draw.polygon(cab, fill=gris)
        for i in range(5):
            for j in range(4):
                cx = top[0] - cw / 2 + cw * (i + 0.5) / 5
                cy = top[1] - ch + ch * (j + 0.5) / 4 - sentido * ch * 0.25 * (i + 0.5) / 5
                r = cw / 14
                draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(240, 232, 200))
    else:  # poste fino con corona de focos
        lw = max(2, int(s / 300))
        draw.line([(x, y), top], fill=gris, width=lw)
        cw = 0.045 * s
        draw.rectangle((top[0] - cw / 2, top[1] - cw * 0.35, top[0] + cw / 2, top[1]), fill=gris)
        for i in range(4):
            cx = top[0] - cw / 2 + cw * (i + 0.5) / 4
            r = cw / 10
            draw.ellipse((cx - r, top[1] - cw * 0.18 - r, cx + r, top[1] - cw * 0.18 + r), fill=(240, 232, 200))


def cesped(img, campo, tonos):
    draw = ImageDraw.Draw(img)
    franjas = 14
    for i in range(franjas):
        a0, a1 = -0.06 + 1.12 * i / franjas, -0.06 + 1.12 * (i + 1) / franjas
        poly = [campo.p(a0, -0.05), campo.p(a1, -0.05), campo.p(a1, campo.b_max), campo.p(a0, campo.b_max)]
        draw.polygon(poly, fill=tonos[i % 2])
    blanco = (236, 232, 214)

    def linea(puntos, b_ref):
        lw = max(2, int(campo.escala(b_ref) / 330))
        draw.line([campo.p(a, b) for a, b in puntos], fill=blanco, width=lw, joint="curve")

    linea([(0, 0), (1, 0)], 0)
    linea([(0, 1), (1, 1)], 1)
    linea([(0, 0), (0, 1)], 0.5)
    linea([(1, 0), (1, 1)], 0.5)
    linea([(0.5, 0), (0.5, 1)], 0.5)
    ra, rb = 9.15 / 105, 9.15 / 68
    circ = [(0.5 + ra * math.cos(t), 0.5 + rb * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 90)]
    linea(circ, 0.5)
    for lado in (0, 1):
        d = 1 if lado == 0 else -1
        x0 = lado
        area = [(x0, 0.2), (x0 + d * 16.5 / 105, 0.2), (x0 + d * 16.5 / 105, 0.8), (x0, 0.8)]
        linea(area, 0.5)
        chica = [(x0, 0.37), (x0 + d * 5.5 / 105, 0.37), (x0 + d * 5.5 / 105, 0.63), (x0, 0.63)]
        linea(chica, 0.5)
        # porterías
        p1, p2 = (x0, 0.46), (x0, 0.54)
        h = 2.44 / 105
        lw = max(2, int(campo.escala(0.5) / 250))
        draw.line([campo.p(*p1), campo.p(p1[0], p1[1], h), campo.p(p2[0], p2[1], h), campo.p(*p2)],
                  fill=(250, 248, 240), width=lw)


def nubes(img, rng, zona, n, color=(250, 246, 236), u=1.0, opacidad=200):
    W, H = img.size
    capa = Image.new("RGBA", (W, H), color + (0,))
    d = ImageDraw.Draw(capa)
    y0, y1 = zona
    for _ in range(n):
        cx, cy = rng.uniform(-0.1, 1.1) * W, rng.uniform(y0, y1) * H
        ancho = rng.uniform(0.18, 0.42) * W
        for _ in range(9):
            ox, oy = rng.uniform(-0.5, 0.5) * ancho, rng.uniform(-0.12, 0.05) * ancho
            r = rng.uniform(0.10, 0.22) * ancho
            d.ellipse((cx + ox - r, cy + oy - r * 0.7, cx + ox + r, cy + oy + r * 0.7), fill=color + (opacidad,))
        d.ellipse((cx - ancho * 0.6, cy - ancho * 0.04, cx + ancho * 0.6, cy + ancho * 0.09), fill=color + (opacidad,))
    capa = capa.filter(ImageFilter.GaussianBlur(14 * u))
    img.alpha_composite(capa)


def silueta_ciudad(draw, rng, W, y_base, y_alto, color, u, chimeneas=True):
    x = -20
    while x < W + 20:
        w = rng.uniform(30, 90) * u
        h = rng.uniform(0.3, 1.0) * (y_base - y_alto)
        draw.rectangle((x, y_base - h, x + w, y_base + 5), fill=color)
        if chimeneas and rng.random() < 0.15:
            draw.rectangle((x + w * 0.4, y_base - h - 40 * u, x + w * 0.4 + 7 * u, y_base - h), fill=color)
        x += w * rng.uniform(0.7, 1.05)


# ── Estadios ─────────────────────────────────────────────────────────────
def estadio(nombre, lay):
    """Fondo fijo de una escena: cielo, alrededores y estadio. Se pinta un
    poco más grande que el vídeo para poder hacer un zoom lento encima."""
    W, H, u = lay["W"], lay["H"], lay["u"]
    margen = 1.06
    Wb, Hb = int(W * margen), int(H * margen)
    c = lay["campo"]
    campo = Campo(Wb, Hb, c["y_f"] * margen, c["y_n"] * margen, c["w_f"] * margen, c["w_n"] * margen)
    rng = np.random.default_rng({"clasico": 7, "herradura": 11, "barrio": 23}[nombre])
    hz = campo.horizonte

    if nombre == "clasico":  # tarde de sol, grada de ladrillo con frontones y torres de celosía
        cielo = [(0, (150, 184, 196)), (hz / Hb, (222, 220, 202)), (1, (222, 220, 202))]
        img = degradado_vertical(Wb, Hb, cielo).convert("RGBA")
        nubes(img, rng, (0.08, hz / Hb - 0.04), 7, u=u)
    elif nombre == "herradura":  # atardecer, estadio en herradura sin cubierta
        cielo = [(0, (120, 112, 128)), (0.55 * hz / Hb, (214, 150, 98)), (hz / Hb, (240, 206, 140)), (1, (240, 206, 140))]
        img = degradado_vertical(Wb, Hb, cielo).convert("RGBA")
        sol = Image.new("RGBA", (Wb, Hb), (0, 0, 0, 0))
        ImageDraw.Draw(sol).ellipse((0.66 * Wb, hz - 0.11 * Wb, 0.84 * Wb, hz + 0.07 * Wb), fill=(250, 226, 160, 255))
        img.alpha_composite(sol.filter(ImageFilter.GaussianBlur(6 * u)))
        nubes(img, rng, (0.05, hz / Hb - 0.08), 5, color=(236, 170, 120), u=u, opacidad=170)
    else:  # día gris, campo de barrio entre casas y fábricas
        cielo = [(0, (150, 152, 150)), (hz / Hb, (206, 204, 194)), (1, (206, 204, 194))]
        img = degradado_vertical(Wb, Hb, cielo).convert("RGBA")
        nubes(img, rng, (0.0, hz / Hb), 14, color=(214, 212, 204), u=u, opacidad=180)

    draw = ImageDraw.Draw(img)
    # alrededores: del horizonte a las gradas
    if nombre == "clasico":
        draw.rectangle((0, hz, Wb, Hb), fill=(150, 156, 128))
        silueta_ciudad(draw, rng, Wb, hz + 6 * u, hz - 40 * u, (128, 132, 128), u, chimeneas=False)
        for i in range(40):
            y = hz + (campo.y_f - hz) * (i / 40) ** 1.6
            draw.line((0, y, Wb, y), fill=(140, 148, 118) if i % 2 else (156, 160, 130), width=max(1, int(3 * u)))
    elif nombre == "herradura":
        draw.rectangle((0, hz, Wb, Hb), fill=(176, 150, 112))
        silueta_ciudad(draw, rng, Wb, hz + 6 * u, hz - 70 * u, (150, 112, 96), u)
    else:
        draw.rectangle((0, hz, Wb, Hb), fill=(120, 114, 104))
        silueta_ciudad(draw, rng, Wb, hz + 10 * u, hz - 60 * u, (104, 98, 92), u)
        # gasómetro y chimenea de fábrica con humo
        gx, gy, gr = 0.15 * Wb, hz + 6 * u, 0.09 * Wb
        draw.rectangle((gx - gr, gy - gr * 0.9, gx + gr, gy), fill=(92, 86, 80))
        for k in range(5):
            yy = gy - gr * 0.9 * k / 4
            draw.line((gx - gr, yy, gx + gr, yy), fill=(70, 66, 60), width=max(1, int(3 * u)))
        for k in range(9):
            xx = gx - gr + 2 * gr * k / 8
            draw.line((xx, gy - gr * 0.9, xx, gy), fill=(70, 66, 60), width=max(1, int(2 * u)))
        fx = 0.86 * Wb
        draw.polygon([(fx - 14 * u, hz + 8 * u), (fx + 14 * u, hz + 8 * u), (fx + 8 * u, hz - 0.17 * Hb), (fx - 8 * u, hz - 0.17 * Hb)], fill=(110, 76, 62))
        humo = Image.new("RGBA", (Wb, Hb), (0, 0, 0, 0))
        hd = ImageDraw.Draw(humo)
        for k in range(10):
            r = (12 + 7 * k) * u
            cx, cy = fx - k * 26 * u, hz - 0.17 * Hb - k * 14 * u
            hd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(170, 166, 160, 150 - 12 * k))
        img.alpha_composite(humo.filter(ImageFilter.GaussianBlur(8 * u)))
        # adosados con chimeneas justo detrás de la grada
        y_casas = campo.p(0.5, -0.30)[1]
        x = -10
        while x < Wb:
            w = 0.075 * Wb
            hcasa = 0.045 * Hb
            col = [(126, 82, 66), (118, 76, 62), (136, 92, 72)][int(x) % 3]
            draw.rectangle((x, y_casas - hcasa, x + w, y_casas + 20 * u), fill=col)
            draw.polygon([(x - 2, y_casas - hcasa), (x + w / 2, y_casas - hcasa * 1.45), (x + w + 2, y_casas - hcasa)], fill=(70, 62, 60))
            draw.rectangle((x + w * 0.7, y_casas - hcasa * 1.6, x + w * 0.7 + 8 * u, y_casas - hcasa * 1.2), fill=(96, 64, 52))
            for vx in (0.25, 0.65):
                draw.rectangle((x + w * vx - 5 * u, y_casas - hcasa * 0.6, x + w * vx + 5 * u, y_casas - hcasa * 0.3), fill=(220, 206, 170))
            x += w

    draw = ImageDraw.Draw(img)

    # grada del fondo
    if nombre == "clasico":
        base = [(a, -0.07, 0, -1) for a in np.linspace(-0.04, 1.04, 9)]
        grada(img, campo, base, 0.16, 0.012, 0.11, (128, 72, 58), rng, filas=12)
        # tejado con frontones (los de Archibald Leitch)
        draw = ImageDraw.Draw(img)
        izq, der = campo.p(-0.06, -0.24, 0.115), campo.p(1.06, -0.24, 0.115)
        alto_t = 0.035 * campo.escala(-0.24)
        draw.polygon([izq, der, (der[0], der[1] - alto_t), (izq[0], izq[1] - alto_t)], fill=VERDE)
        draw.line([(izq[0], izq[1] - alto_t * 0.5), (der[0], der[1] - alto_t * 0.5)], fill=DORADO, width=max(1, int(2 * u)))
        n = 7
        for k in range(n):
            x0 = izq[0] + (der[0] - izq[0]) * (k + 0.12) / n
            x1 = izq[0] + (der[0] - izq[0]) * (k + 0.88) / n
            draw.polygon([(x0, izq[1] - alto_t), (x1, izq[1] - alto_t), ((x0 + x1) / 2, izq[1] - alto_t * 2.2)], fill=CREMA, outline=VERDE)
            r = alto_t * 0.28
            cx, cy = (x0 + x1) / 2, izq[1] - alto_t * 1.45
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=VERDE, width=max(1, int(2 * u)))
        # columnas que sujetan el tejado
        for k in range(9):
            a = -0.04 + 1.08 * k / 8
            draw.line([campo.p(a, -0.08, 0.02), campo.p(a, -0.24, 0.115)], fill=(60, 58, 54), width=max(1, int(2 * u)))
        for a, b in ((-0.12, -0.32), (1.12, -0.32)):
            torre_luz(draw, campo, a, b, 0.36, u, "celosia")
    elif nombre == "herradura":
        # anillo de grada que se curva por los fondos hacia la cámara
        base = []
        for t in np.linspace(0, 1, 26):
            ang = math.pi * (1 - t)
            a = 0.5 + 0.64 * math.cos(ang)
            b = -0.07 + (campo.b_max * 0.95) * (1 - math.sin(ang)) ** 1.3
            oa, ob = math.cos(ang) * 1.0, -math.sin(ang) * 1.0
            base.append((a, b, oa, ob))
        mitad = len(base) // 2
        # primero el centro (lo más lejano), luego los lados de lejos a cerca
        grada(img, campo, base[mitad - 6: mitad + 7], 0.18, 0.01, 0.10, (178, 162, 138), rng, filas=14)
        izq = list(reversed(base[: mitad - 5]))
        der = base[mitad + 6:]
        torres = [(-0.2, -0.28), (1.2, -0.28)]
        draw = ImageDraw.Draw(img)
        for a, b in torres:
            torre_luz(draw, campo, a, b, 0.42, u, "poste")
        cesped(img, campo, [(104, 128, 78), (116, 140, 86)])
        grada(img, campo, izq, 0.18, 0.01, 0.10, (178, 162, 138), rng, filas=14)
        grada(img, campo, der, 0.18, 0.01, 0.10, (178, 162, 138), rng, filas=14)
        # marcador antiguo encima del fondo
        draw = ImageDraw.Draw(img)
        mx, my = campo.p(0.5, -0.27, 0.13)
        mw, mh = 0.12 * campo.escala(-0.27), 0.035 * campo.escala(-0.27)
        draw.rectangle((mx - mw / 2, my - mh, mx + mw / 2, my), fill=TINTA, outline=DORADO, width=max(1, int(2 * u)))
        f = fuente("sans", mh * 0.55)
        draw.text((mx, my - mh / 2), "2 x 1", font=f, fill=DORADO, anchor="mm")
        return img.convert("RGB"), campo
    else:  # barrio
        # tribuna de madera con tejado a dos aguas y reloj
        base = [(a, -0.06, 0, -1) for a in np.linspace(0.12, 0.88, 7)]
        grada(img, campo, base, 0.10, 0.012, 0.06, (92, 70, 54), rng, filas=7)
        draw = ImageDraw.Draw(img)
        izq, der = campo.p(0.10, -0.17, 0.065), campo.p(0.90, -0.17, 0.065)
        alto_t = 0.05 * campo.escala(-0.17)
        draw.polygon([izq, der, (der[0] - alto_t, der[1] - alto_t), (izq[0] + alto_t, izq[1] - alto_t)], fill=(64, 58, 56))
        cx = (izq[0] + der[0]) / 2
        draw.polygon([(cx - alto_t * 1.6, izq[1] - alto_t * 0.6), (cx + alto_t * 1.6, izq[1] - alto_t * 0.6), (cx, izq[1] - alto_t * 2.0)], fill=CREMA, outline=VERDE)
        r = alto_t * 0.38
        cy = izq[1] - alto_t * 1.05
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(250, 246, 232), outline=TINTA, width=max(1, int(2 * u)))
        draw.line((cx, cy, cx, cy - r * 0.7), fill=TINTA, width=max(1, int(2 * u)))
        draw.line((cx, cy, cx + r * 0.5, cy + r * 0.2), fill=TINTA, width=max(1, int(2 * u)))
        for k in range(7):
            a = 0.12 + 0.76 * k / 6
            draw.line([campo.p(a, -0.065, 0.012), campo.p(a, -0.165, 0.062)], fill=(54, 50, 46), width=max(1, int(2 * u)))
        # terrazas de pie, sin cubierta, a los lados de la tribuna
        for xs in (np.linspace(-0.08, 0.12, 3), np.linspace(0.88, 1.08, 3)):
            grada(img, campo, [(a, -0.06, 0, -1) for a in xs], 0.10, 0.008, 0.045, (150, 146, 136), rng, filas=8, gente=0.6)
        draw = ImageDraw.Draw(img)
        for a, b in ((-0.1, -0.12), (1.1, -0.12)):
            torre_luz(draw, campo, a, b, 0.22, u, "poste")

    cesped(img, campo, [(100, 122, 74), (112, 134, 82)] if nombre == "clasico" else [(92, 108, 72), (102, 118, 78)])
    # gradas laterales, de lejos a cerca
    if nombre == "clasico":
        for lado, oa in ((-0.07, -1), (1.07, 1)):
            base = [(lado, b, oa, 0) for b in np.linspace(-0.07, campo.b_max, 12)]
            grada(img, campo, base, 0.14, 0.012, 0.08, (140, 130, 116), rng, filas=10, gente=0.8)
    else:
        for lado, oa in ((-0.07, -1), (1.07, 1)):
            base = [(lado, b, oa, 0) for b in np.linspace(-0.06, campo.b_max, 12)]
            grada(img, campo, base, 0.09, 0.008, 0.035, (150, 146, 136), rng, filas=6, gente=0.5)
    return img.convert("RGB"), campo


# ── Avioneta y pancarta ──────────────────────────────────────────────────
def avioneta(L):
    """Avioneta de ala alta mirando a la izquierda, crema con franja verde.
    Devuelve la imagen y el punto de la cola donde se ata la cuerda."""
    S = 3
    Ls = L * S
    w, h = int(Ls * 1.12), int(Ls * 0.55)
    ox, oy = Ls * 0.06, h * 0.52
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def P(pts):
        return [(ox + x * Ls, oy + y * Ls) for x, y in pts]

    tinta = (34, 32, 30)
    lw = max(2, int(Ls * 0.006))
    # tren de aterrizaje (detrás del fuselaje)
    d.line(P([(0.22, 0.04), (0.19, 0.14)]), fill=tinta, width=lw * 2)
    d.line(P([(0.30, 0.04), (0.20, 0.14)]), fill=tinta, width=lw)
    cx, cy = ox + 0.19 * Ls, oy + 0.15 * Ls
    r = 0.032 * Ls
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=tinta)
    d.ellipse((cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4), fill=(150, 146, 140))
    d.line(P([(0.94, 0.0), (0.95, 0.035)]), fill=tinta, width=lw)
    cx, cy, r = ox + 0.95 * Ls, oy + 0.04 * Ls, 0.012 * Ls
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=tinta)
    # estabilizador del otro lado
    d.polygon(P([(0.83, -0.03), (0.99, -0.034), (1.0, -0.022), (0.86, -0.018)]), fill=(196, 190, 176))
    # fuselaje
    fus = [(0.03, -0.055), (0.10, -0.068), (0.20, -0.08), (0.42, -0.085), (0.62, -0.062), (0.95, -0.032),
           (0.99, -0.03), (0.985, 0.0), (0.62, 0.028), (0.42, 0.058), (0.18, 0.062), (0.06, 0.055), (0.02, 0.03)]
    d.polygon(P(fus), fill=CREMA, outline=tinta)
    # franja verde con filete dorado
    d.polygon(P([(0.04, -0.004), (0.62, -0.006), (0.985, -0.022), (0.985, -0.010), (0.62, 0.012), (0.04, 0.020)]), fill=VERDE)
    d.line(P([(0.04, -0.008), (0.62, -0.010), (0.985, -0.025)]), fill=DORADO, width=lw)
    # capó del motor
    d.polygon(P([(0.01, -0.05), (0.13, -0.066), (0.15, 0.054), (0.01, 0.045)]), fill=VERDE, outline=tinta)
    for k in range(3):
        x = 0.04 + k * 0.03
        d.line(P([(x, -0.03), (x + 0.012, -0.03)]), fill=TINTA, width=lw)
    # cabina
    d.polygon(P([(0.20, -0.074), (0.40, -0.078), (0.43, -0.022), (0.22, -0.022)]), fill=(70, 86, 92), outline=tinta)
    d.line(P([(0.31, -0.077), (0.32, -0.022)]), fill=CREMA, width=lw * 2)
    d.line(P([(0.23, -0.07), (0.27, -0.03)]), fill=(150, 170, 172), width=lw)
    # deriva
    d.polygon(P([(0.80, -0.04), (0.88, -0.17), (0.93, -0.215), (0.995, -0.215), (0.995, -0.03)]), fill=CREMA, outline=tinta)
    d.polygon(P([(0.93, -0.215), (0.995, -0.215), (0.995, -0.03), (0.955, -0.04)]), fill=VERDE)
    d.line(P([(0.955, -0.21), (0.955, -0.04)]), fill=DORADO, width=lw)
    # estabilizador de este lado
    d.polygon(P([(0.84, -0.026), (1.0, -0.03), (1.0, -0.012), (0.86, -0.008)]), fill=CREMA, outline=tinta)
    # matrícula
    f = fuente("sans", 0.045 * Ls)
    d.text(P([(0.73, 0.012)])[0], "EC-HLS", font=f, fill=TINTA, anchor="mm")
    # ala alta y montante
    d.line(P([(0.37, -0.085), (0.31, 0.03)]), fill=tinta, width=lw * 2)
    d.rounded_rectangle([*P([(0.17, -0.118)])[0], *P([(0.47, -0.085)])[0]], radius=0.016 * Ls, fill=CREMA, outline=tinta, width=lw)
    d.line(P([(0.19, -0.098), (0.46, -0.098)]), fill=DORADO, width=lw)
    # hélice en movimiento (disco) y buje
    disco = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dd = ImageDraw.Draw(disco)
    dd.ellipse([*P([(-0.03, -0.15)])[0], *P([(0.012, 0.15)])[0]], fill=(60, 58, 54, 70))
    disco = disco.filter(ImageFilter.GaussianBlur(Ls * 0.006))
    img.alpha_composite(disco)
    d = ImageDraw.Draw(img)
    d.ellipse([*P([(-0.03, -0.025)])[0], *P([(0.02, 0.025)])[0]], fill=DORADO, outline=tinta)

    img = img.resize((w // S, h // S), Image.LANCZOS)
    cola = ((ox + 0.99 * Ls) / S, (oy - 0.01 * Ls) / S)
    helice = ((ox - 0.009 * Ls) / S, oy / S, 0.15 * L)
    return img, cola, helice


def pancarta_img(ancho, alto, num, texto, sub, colores=("verde",)):
    """La tela de la pancarta, plana. La ondulación se hace en cada fotograma."""
    S = 2
    w, h = int(ancho * S), int(alto * S)
    fondo, letra, acento = (VERDE, CREMA, DORADO) if colores[0] == "verde" else (DORADO, VERDE_OSC, VERDE)
    img = Image.new("RGBA", (w, h), fondo + (255,))
    d = ImageDraw.Draw(img)
    m = h * 0.07
    d.rectangle((m, m, w - m, h - m), outline=letra, width=max(2, int(h * 0.018)))
    d.rectangle((m * 1.6, m * 1.6, w - m * 1.6, h - m * 1.6), outline=acento, width=max(1, int(h * 0.008)))
    x0 = m * 2.6
    if num:
        r = h * 0.30
        cx, cy = x0 + r, h / 2
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=acento)
        f = fuente("display", r * 1.35)
        d.text((cx, cy + r * 0.04), num, font=f, fill=fondo, anchor="mm")
        x0 = cx + r + h * 0.12
    zona = w - x0 - m * 2.6
    tam = h * (0.42 if sub else 0.52)
    f = fuente("display", tam)
    while d.textlength(texto, font=f) > zona and tam > 10:
        tam *= 0.95
        f = fuente("display", tam)
    cx = x0 + zona / 2
    if sub:
        d.text((cx, h * 0.43), texto, font=f, fill=letra, anchor="mm")
        fs = fuente("sans", h * 0.16)
        texto_espaciado(d, (cx, h * 0.73), sub, fs, acento, h * 0.01, anchor="mm")
    else:
        d.text((cx, h * 0.52), texto, font=f, fill=letra, anchor="mm")
    # trama de la tela
    arr = np.array(img).astype(np.float32)
    rng = np.random.default_rng(3)
    trama = rng.normal(0, 5, (h, 1)) + rng.normal(0, 3, (1, w))
    arr[..., :3] = np.clip(arr[..., :3] + trama[..., None], 0, 255)
    img = Image.fromarray(arr.astype(np.uint8)).resize((int(ancho), int(alto)), Image.LANCZOS)
    return np.array(img)


def ondular(tela, t, u):
    """Mueve cada columna de la tela arriba y abajo, más cuanto más lejos del
    palo, y la sombrea según el pliegue. Devuelve (imagen RGBA, margen arriba)."""
    h, w = tela.shape[:2]
    x = np.arange(w)
    rel = x / w
    fase = 2 * math.pi * (x / (w * 0.42)) - t * 9.0
    amp = (2 + 13 * rel ** 1.3) * u
    dy = amp * np.sin(fase)
    pad = int(math.ceil(15 * u)) + 2
    H2 = h + 2 * pad
    filas = np.arange(H2)[:, None] - pad - dy[None, :]
    fi = np.floor(filas).astype(int)
    fr = (filas - fi)[..., None]
    valido0 = (fi >= 0) & (fi < h)
    valido1 = (fi + 1 >= 0) & (fi + 1 < h)
    a = np.where(valido0[..., None], tela[np.clip(fi, 0, h - 1), x[None, :]], 0).astype(np.float32)
    b = np.where(valido1[..., None], tela[np.clip(fi + 1, 0, h - 1), x[None, :]], 0).astype(np.float32)
    out = a * (1 - fr) + b * fr
    luz = 1 + 0.16 * np.cos(fase) * (0.3 + rel)
    out[..., :3] *= luz[None, :, None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), pad


def dibuja_vuelo(frame, avion, tela, t_vuelo, centro_x, y, lay):
    """Avioneta + cuerda + pancarta, con el centro del conjunto en centro_x."""
    u = lay["u"]
    img_av, cola, helice = avion
    bh, bw = tela.shape[:2]
    cuerda = 0.07 * lay["W"] if lay["vertical"] else 0.06 * lay["W"]
    total = img_av.width + cuerda + bw
    izq = centro_x - total / 2
    y = y + 5 * u * math.sin(t_vuelo * 2.1)
    ax, ay = izq, y - img_av.height * 0.52
    frame.alpha_composite(img_av, (int(ax), int(ay)))
    d = ImageDraw.Draw(frame)
    # pala de la hélice girando (una línea que se encoge y estira)
    hx, hy, hr = ax + helice[0], ay + helice[1], helice[2]
    k = math.cos(t_vuelo * 47)
    d.line((hx, hy - hr * k, hx, hy + hr * k), fill=(40, 38, 36), width=max(2, int(3 * u)))
    # cuerda con un poco de comba y brida hasta el palo
    tx, ty = ax + cola[0], ay + cola[1]
    palo_x = tx + cuerda
    centro_y = y + 0.18 * bh
    nudo = (palo_x - cuerda * 0.22, centro_y)
    pts = []
    for i in range(21):
        s = i / 20
        px = tx + (nudo[0] - tx) * s
        py = ty + (nudo[1] - ty) * s + math.sin(math.pi * s) * 10 * u
        pts.append((px, py))
    lw = max(1, int(2 * u))
    d.line(pts, fill=(40, 38, 36), width=lw)
    arriba, abajo = centro_y - bh / 2, centro_y + bh / 2
    d.line([nudo, (palo_x, arriba)], fill=(40, 38, 36), width=lw)
    d.line([nudo, (palo_x, abajo)], fill=(40, 38, 36), width=lw)
    ond, pad = ondular(tela, t_vuelo, u)
    frame.alpha_composite(ond, (int(palo_x), int(arriba - pad)))
    d.line((palo_x, arriba - 6 * u, palo_x, abajo + 6 * u), fill=(78, 56, 40), width=max(3, int(6 * u)))


# ── Textos encima ────────────────────────────────────────────────────────
def cabecera(frame, lay, alfa=1.0):
    W, u = lay["W"], lay["u"]
    capa = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    y = lay["cabecera_y"]
    a = int(255 * alfa)
    fk = fuente("sans", 24 * u)
    ft = fuente("serif", 62 * u)
    if lay["vertical"]:
        texto_espaciado(d, (W / 2, y), "CÓMO FUNCIONA EL 2X1", fk, VERDE + (a,), 5 * u, anchor="mm")
        d.text((W / 2, y + 62 * u), "Tres pasos. Sin trampa.", font=ft, fill=TINTA + (a,), anchor="mm")
    else:
        x = 0.035 * W
        texto_espaciado(d, (x, y), "CÓMO FUNCIONA EL 2X1", fk, VERDE + (a,), 5 * u, anchor="lm")
        d.text((x, y + 60 * u), "Tres pasos. Sin trampa.", font=ft, fill=TINTA + (a,), anchor="lm")
    frame.alpha_composite(capa)


def tarjeta(frame, lay, escena, t, T):
    """La tarjeta de la web: fondo crema, filete dorado a la izquierda,
    número grande en dorado, título y explicación."""
    u = lay["u"]
    x, y, ancho = lay["tarjeta"]
    entra = sale((t - 0.45) / 0.5)
    sal = suave((t - (T - 0.55)) / 0.4)
    if entra <= 0 or sal >= 1:
        return
    fn = fuente("serif", 92 * u)
    ftit = fuente("sans", 34 * u)
    ftx = fuente("sans_r", 29 * u)
    medida = ImageDraw.Draw(frame)
    col_txt = 130 * u
    lineas = partir(medida, escena["texto"], ftx, ancho - col_txt - 40 * u)
    alto = 34 * u + 46 * u + len(lineas) * 40 * u + 30 * u
    capa = Image.new("RGBA", (int(ancho), int(alto)), (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    d.rectangle((0, 0, ancho, alto), fill=CREMA + (245,))
    d.rectangle((0, 0, 7 * u, alto), fill=DORADO)
    d.text((62 * u, alto / 2), escena["num"], font=fn, fill=DORADO, anchor="mm")
    texto_espaciado(d, (col_txt, 34 * u + 20 * u), escena["titulo"], ftit, TINTA, 2.5 * u, anchor="ls")
    yy = 34 * u + 46 * u + 22 * u
    for linea in lineas:
        d.text((col_txt, yy), linea, font=ftx, fill=(70, 66, 60), anchor="lm")
        yy += 40 * u
    sombra = Image.new("RGBA", (int(ancho + 60 * u), int(alto + 60 * u)), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rectangle((30 * u, 36 * u, ancho + 30 * u, alto + 36 * u), fill=(0, 0, 0, 70))
    sombra = sombra.filter(ImageFilter.GaussianBlur(12 * u))
    desliz = (1 - entra) * 80 * u + sal * 60 * u
    opac = min(1.0, max(0.0, entra)) * (1 - sal)
    for img, dx, dy in ((sombra, -30 * u, -30 * u), (capa, 0, 0)):
        if opac < 1:
            arr = np.array(img)
            arr[..., 3] = (arr[..., 3] * opac).astype(np.uint8)
            img = Image.fromarray(arr)
        frame.alpha_composite(img, (int(x + dx), int(y + dy + desliz)))


# ── Cierre ───────────────────────────────────────────────────────────────
def fondo_papel(lay):
    W, H, u = lay["W"], lay["H"], lay["u"]
    rng = np.random.default_rng(5)
    base = np.array(degradado_vertical(W, H, [(0, (244, 238, 222)), (1, (232, 224, 202))])).astype(np.float32)
    fibras = rng.normal(0, 6, (H // 4, W // 4)).astype(np.float32)
    fibras = np.array(Image.fromarray(fibras).resize((W, H), Image.BILINEAR))
    base += fibras[..., None]
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(img)
    m = 34 * u
    d.rectangle((m, m, W - m, H - m), outline=VERDE, width=max(2, int(4 * u)))
    d.rectangle((m + 12 * u, m + 12 * u, W - m - 12 * u, H - m - 12 * u), outline=DORADO, width=max(1, int(2 * u)))
    return img


def logo_tipografico(alto, u):
    f = fuente("display", alto)
    medida = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    ancho = int(sum(medida.textlength(c, font=f) for c in "HOOLS") + alto * 0.12 * 4 + alto * 2.4)
    img = Image.new("RGBA", (ancho, int(alto * 1.7)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = ancho / 2, alto * 0.72
    w = texto_espaciado(d, (cx, cy), "HOOLS", f, VERDE, alto * 0.12, anchor="mm")
    for lado in (-1, 1):
        x0 = cx + lado * (w / 2 + alto * 0.25)
        x1 = cx + lado * (w / 2 + alto * 1.1)
        d.line((x0, cy - alto * 0.08, x1, cy - alto * 0.08), fill=DORADO, width=max(2, int(alto * 0.04)))
        d.line((x0, cy + alto * 0.08, x1, cy + alto * 0.08), fill=DORADO, width=max(2, int(alto * 0.04)))
    fs = fuente("sans", alto * 0.2)
    texto_espaciado(d, (cx, cy + alto * 0.72), "BRAND", fs, DORADO, alto * 0.12, anchor="mm")
    return img


def sello(frame, img, cx, cy, t, t0, dur=0.45):
    """Aparece como un sello: grande y transparente → su tamaño, con rebote."""
    p = (t - t0) / dur
    if p <= 0:
        return
    esc = 1 + 0.35 * (1 - sale(p))
    opac = min(1.0, p * 1.6)
    if abs(esc - 1) > 1e-3:
        img = img.resize((max(1, int(img.width * esc)), max(1, int(img.height * esc))), Image.BICUBIC)
    if opac < 1:
        arr = np.array(img)
        arr[..., 3] = (arr[..., 3] * opac).astype(np.uint8)
        img = Image.fromarray(arr)
    frame.alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


def texto_img(texto, fnt, color, sombra=None, desplaz=0, espacio=0):
    medida = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    ancho = sum(medida.textlength(c, font=fnt) for c in texto) + espacio * (len(texto) - 1)
    bb = fnt.getbbox(texto)
    alto = bb[3] - bb[1]
    pad = int(desplaz + fnt.size * 0.2)
    img = Image.new("RGBA", (int(ancho + 2 * pad), int(alto + 2 * pad)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if sombra:
        texto_espaciado(d, (pad + desplaz, pad - bb[1] + desplaz), texto, fnt, sombra, espacio)
    texto_espaciado(d, (pad, pad - bb[1]), texto, fnt, color, espacio)
    return img


# ── Acabado de película vieja ────────────────────────────────────────────
class Pelicula:
    def __init__(self, W, H, u, semilla=1):
        self.W, self.H, self.u = W, H, u
        self.rng = np.random.default_rng(semilla)
        self.grano = (self.rng.normal(0, 1, (H + 64, W + 64)) * 11).astype(np.float32)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
        self.vineta = np.clip(1.08 - 0.5 * r ** 2.2, 0.35, 1.0)[..., None].astype(np.float32)
        self.rayas = []

    def __call__(self, frame_rgb, corte=0.0):
        rng = self.rng
        a = np.asarray(frame_rgb, dtype=np.float32)
        lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
        a = lum[..., None] + (a - lum[..., None]) * 0.72          # colores apagados
        a = a * np.array([1.05, 1.0, 0.88], np.float32)            # tono cálido de copia vieja
        a = 16 + a * 0.90                                           # negros lavados
        a *= self.vineta
        a *= 1 + rng.normal(0, 0.018)                               # parpadeo
        ox, oy = rng.integers(0, 64, 2)
        a += self.grano[oy:oy + self.H, ox:ox + self.W, None]
        # rayas verticales que duran unos fotogramas
        if rng.random() < 0.06:
            self.rayas.append([rng.uniform(0, self.W), int(rng.integers(3, 9)), rng.choice([-1, 1])])
        for r in self.rayas:
            x = int(r[0])
            g = max(1, int(1.5 * self.u))
            a[:, max(0, x - g):x + g] += 38 * r[2]
            r[0] += rng.normal(0, 2)
            r[1] -= 1
        self.rayas = [r for r in self.rayas if r[1] > 0]
        # motas de polvo
        for _ in range(rng.integers(0, 4)):
            x, y = rng.integers(0, self.W), rng.integers(0, self.H)
            s = int(rng.integers(1, 4) * self.u)
            a[max(0, y - s):y + s, max(0, x - s):x + s] = 235 if rng.random() < 0.5 else 30
        if corte > 0:  # destello de empalme entre escenas
            a = a + (np.array([255, 240, 205], np.float32) - a) * corte
        a = np.clip(a, 0, 255).astype(np.uint8)
        # vaivén del fotograma en el proyector
        dx, dy = rng.integers(-1, 2), rng.integers(-1, 2)
        if dx or dy:
            a = np.roll(a, (int(dy * self.u), int(dx * self.u)), axis=(0, 1))
        return a


# ── Montaje ──────────────────────────────────────────────────────────────
class Video:
    def __init__(self, lay, logo=None):
        self.lay = lay
        W, u = lay["W"], lay["u"]
        print("Pintando estadios...", flush=True)
        self.fondos = [estadio(e["estadio"], lay)[0] for e in ESCENAS]
        self.avion = avioneta(lay["avion_L"])
        pw, ph = lay["pancarta"]
        self.telas = [pancarta_img(pw, ph, e["num"], e["pancarta"], e["sub"]) for e in ESCENAS]
        self.tela_final = pancarta_img(pw, ph, None, "2x1 EN POLOS", None, colores=("dorado",))
        self.papel = fondo_papel(lay)
        H = lay["H"]
        if logo is None and os.path.exists(LOGO):
            logo = LOGO
        if logo:
            lg = Image.open(logo).convert("RGBA")
            ancho = 0.62 * W if lay["vertical"] else 0.30 * W
            lg = lg.resize((int(ancho), int(lg.height * ancho / lg.width)), Image.LANCZOS)
            # sombra verde desplazada, como la del «2x1», para que destaque sobre el crema
            d = int(6 * u)
            sombra = Image.new("RGBA", lg.size, VERDE + (0,))
            sombra.putalpha(lg.getchannel("A"))
            self.logo = Image.new("RGBA", (lg.width + d, lg.height + d), (0, 0, 0, 0))
            self.logo.alpha_composite(sombra, (d, d))
            self.logo.alpha_composite(lg)
        else:
            self.logo = logo_tipografico(150 * u, u)
        tam_2x1 = (430 if lay["vertical"] else 320) * u
        self.img_2x1 = texto_img("2x1", fuente("display", tam_2x1), DORADO, sombra=VERDE, desplaz=10 * u)
        self.img_polos = texto_img("en polos", fuente("serif", 120 * u), VERDE)
        self.img_tag = texto_img("#HOOLSENLAGRADA", fuente("sans", 34 * u), TINTA, espacio=6 * u)
        self.img_web = texto_img("hoolsbrand.com", fuente("sans_r", 30 * u), (90, 84, 74))
        self.pelicula = Pelicula(W, H, u)
        self.duracion = DUR_ESCENA * len(ESCENAS) + DUR_CIERRE

    def _vuelo_x(self, t, T, tela):
        lay = self.lay
        W = lay["W"]
        cuerda = 0.07 * W if lay["vertical"] else 0.06 * W
        total = self.avion[0].width + cuerda + tela.shape[1]
        # en el momento central, la pancarta queda centrada en pantalla
        if total <= W * 0.96:
            centro_medio = W / 2
        else:  # no cabe entero: que se vea la pancarta completa
            centro_medio = W * 0.98 - total / 2
        inicio = W + total / 2 + 10
        fin = -total / 2 - 10
        s = 2 * t / T - 1
        g = 0.2 * s + 0.8 * s ** 5
        if s < 0:
            return centro_medio + (inicio - centro_medio) * (-g)
        return centro_medio + (fin - centro_medio) * g

    def fotograma(self, t):
        lay = self.lay
        W, H, u = lay["W"], lay["H"], lay["u"]
        n = len(ESCENAS)
        i = int(t // DUR_ESCENA)
        corte = 0.0
        if i < n:
            te = t - i * DUR_ESCENA
            fondo = self.fondos[i]
            # zoom lento sobre el estadio
            z = 1.0 + 0.045 * te / DUR_ESCENA
            Wb, Hb = fondo.size
            cw = W * (Wb / W) / z
            ch = H * (Hb / H) / z
            x0 = (Wb - cw) / 2
            y0 = (Hb - ch) * 0.55
            frame = fondo.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch)).convert("RGBA")
            cabecera(frame, lay, alfa=suave(te / 0.4) if i == 0 else 1.0)
            dibuja_vuelo(frame, self.avion, self.telas[i], te, self._vuelo_x(te, DUR_ESCENA, self.telas[i]), lay["avion_y"], lay)
            tarjeta(frame, lay, ESCENAS[i], te, DUR_ESCENA)
            if te < 0.12 and i > 0:
                corte = 1 - te / 0.12
            elif te > DUR_ESCENA - 0.1:
                corte = (te - (DUR_ESCENA - 0.1)) / 0.1
        else:
            te = t - n * DUR_ESCENA
            frame = self.papel.copy()
            T = 2.4
            if te < T:
                xv = self._vuelo_x(te, T, self.tela_final)
                dibuja_vuelo(frame, self.avion, self.tela_final, te + 3, xv, (0.15 if lay["vertical"] else 0.15) * H, lay)
            if lay["vertical"]:
                pos = dict(logo=0.305, x2=0.53, polos=0.665, tag=0.80, web=0.84)
            else:
                pos = dict(logo=0.25, x2=0.53, polos=0.75, tag=0.87, web=0.915)
            sello(frame, self.logo, W / 2, pos["logo"] * H, te, 0.5)
            sello(frame, self.img_2x1, W / 2, pos["x2"] * H, te, 1.0)
            sello(frame, self.img_polos, W / 2, pos["polos"] * H, te, 1.35)
            if te > 1.9:
                d = ImageDraw.Draw(frame)
                p = suave((te - 1.9) / 0.5)
                lw = 0.28 * W * p
                yl = (pos["tag"] - 0.035) * H
                d.line((W / 2 - lw, yl, W / 2 + lw, yl), fill=DORADO, width=max(2, int(3 * u)))
            sello(frame, self.img_tag, W / 2, pos["tag"] * H, te, 2.1, dur=0.35)
            sello(frame, self.img_web, W / 2, pos["web"] * H, te, 2.3, dur=0.35)
            if te < 0.12:
                corte = 1 - te / 0.12
            if te > DUR_CIERRE - 0.5:  # fundido a negro al final
                frame = Image.blend(frame, Image.new("RGBA", frame.size, (12, 10, 8, 255)), suave((te - (DUR_CIERRE - 0.5)) / 0.5))
        return self.pelicula(frame.convert("RGB"), corte)


def main():
    ap = argparse.ArgumentParser(description="Vídeo «Avionetas Hools» del 2x1 en polos")
    ap.add_argument("--formato", choices=["9:16", "16:9"], default="9:16")
    ap.add_argument("--salida", help="ruta del MP4 (por defecto avionetas_hools_<formato>.mp4 junto al script)")
    ap.add_argument("--logo", help="PNG del logo con fondo transparente (por defecto logo_hools.png)")
    ap.add_argument("--musica", help="audio para ponerle de fondo")
    ap.add_argument("--fotograma", type=float, help="guarda solo el PNG de ese segundo")
    args = ap.parse_args()

    lay = layout(args.formato)
    video = Video(lay, logo=args.logo)
    sufijo = args.formato.replace(":", "x")

    if args.fotograma is not None:
        ruta = os.path.join(AQUI, f"fotograma_{sufijo}_{args.fotograma:.1f}.png")
        Image.fromarray(video.fotograma(args.fotograma)).save(ruta)
        print(ruta)
        return

    salida = args.salida or os.path.join(AQUI, f"avionetas_hools_{sufijo}.mp4")
    W, H = lay["W"], lay["H"]
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if args.musica:
        cmd += ["-i", args.musica, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest",
                "-af", f"afade=t=out:st={video.duracion - 1.2:.2f}:d=1.2"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "21", "-maxrate", "10M", "-bufsize", "20M", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", salida]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(round(video.duracion * FPS))
    for k in range(total):
        proc.stdin.write(video.fotograma(k / FPS).tobytes())
        if k % FPS == 0:
            print(f"\rRender {100 * k // total:3d}%", end="", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg ha fallado")
    print(f"\rRender 100%\n{salida}")


if __name__ == "__main__":
    main()
