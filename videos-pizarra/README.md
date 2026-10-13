# Vídeos tipo pizarra

Genera vídeos cortos en los que una mano dibuja y escribe sobre una pizarra
blanca mientras una voz en off en español explica el tema.

## Requisitos
- Python 3 con Pillow
- ffmpeg
- espeak-ng + mbrola + mbrola-es2 (voz) y fonts-comic-neue (letra)

```
sudo apt-get install ffmpeg espeak-ng mbrola mbrola-es2 fonts-comic-neue
```

## Uso
```
python3 pizarra.py guion_ww2 segunda_guerra_mundial.mp4
```

Para un tema nuevo, copia `guion_ww2.py`, escribe su `HOOK` y cambia las
escenas.

### El gancho (obligatorio)
Todos los vídeos empiezan con un gancho (`HOOK`): punto de partida → final
impactante → pregunta → «Esta es la historia de...». Por ejemplo: «Mussolini
prometió devolver la grandeza a Italia. Acabó ejecutado por partisanos
italianos y con su cadáver expuesto públicamente en Milán. ¿Cómo pasó de
dirigir un país a terminar así? Esta es la historia de su ascenso y caída».
Sin `HOOK` el vídeo no se genera. Las pautas completas están en `CLAUDE.md`;
para revisar un guion sin renderizar: `python3 pizarra.py guion_ww2 --check`.

### Escenas
Cada escena tiene
un texto de narración y una lista de dibujos (`text`, `arrow`, `globe`,
`tank`, `plane`, `person`, `calendar`...). La duración de cada escena se
ajusta sola a lo que dura la narración.

Variables opcionales: `PIZARRA_VOICE` (por defecto `mb-es2`) y
`PIZARRA_SPEED` (palabras por minuto, por defecto 140).
