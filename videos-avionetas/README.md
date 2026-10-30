# Avionetas Hools — vídeo del 2x1 en polos

Vídeo promocional de **#HoolsEnLaGrada** con estética de película antigua:

| Escena | Estadio | Pancarta | Tarjeta de abajo |
|---|---|---|---|
| 1 | Clásico: tribuna de ladrillo con frontones, torres de celosía, tarde de sol | **1 · COMPRA TU POLO** | Cualquier polo de la web, a precio normal y sin códigos de descuento. |
| 2 | Herradura al atardecer, sin cubierta, con marcador «2 x 1» | **2 · HAZTE LA FOTO** · #HoolsEnLaGrada | Súbela a una story mencionando a @hoolsbrand o en X con #HoolsEnLaGrada. |
| 3 | Campo de barrio: tribuna de madera con reloj, adosados, gasómetro y chimenea | **3 · TE MANDAMOS OTRO** | Escríbenos por DM con tu número de pedido. Eliges modelo y talla, gratis. |
| Cierre | Papel crema con marco verde y dorado | avioneta con pancarta dorada «2x1 EN POLOS» | Logo oficial de Hools · **2x1 en polos** · #HOOLSENLAGRADA · hoolsbrand.com |

Duración: 19,2 s a 30 fps. Sin música (se le puede poner con `--musica`).
Acabado: colores apagados y cálidos, grano, viñeta, parpadeo, rayas, motas de
polvo, vaivén del fotograma y un destello en cada cambio de escena.
Colores y letras de la marca: verde `#213B2E`, dorado `#CCB229`, crema,
Source Serif 4 y Mulish (las de la web) y Abril Fatface para las pancartas.

## Vídeo hecho

`avionetas_hools_9x16.mp4`: vertical 1080×1920, para Reels, TikTok y stories.

## Volver a generarlo

```bash
python3 avionetas.py                       # vertical
python3 avionetas.py --formato 16:9        # horizontal, solo si hace falta
python3 avionetas.py --logo otro.png       # con otro logo (PNG transparente)
python3 avionetas.py --musica tema.mp3     # con música, fundida al final
python3 avionetas.py --fotograma 7         # solo un PNG del segundo 7, para revisar
```

Necesita Python 3 con Pillow y numpy, y ffmpeg. Tarda unos 2 minutos y
medio por vídeo. Los textos están arriba del script, en `ESCENAS`.

El logo del cierre es `logo_hools.png` (el oficial, en dorado). Si se borra,
sale un logo de texto. Con `--logo otro.png` se usa otro.

Las fuentes de `fuentes/` tienen licencia SIL Open Font License (`fuentes/OFL.txt`).
