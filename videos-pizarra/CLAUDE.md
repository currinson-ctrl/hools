# Canal de historia «explicado con pizarra»

Cuando el usuario dé las pautas de un guion para este canal, el guion nuevo
(copia de `guion_ww2.py`) lleva SIEMPRE un `HOOK`: el gancho con el que arranca
el vídeo, antes de la portada. `pizarra.py` se niega a renderizar sin él.

## Cómo se escribe el gancho

Cuatro piezas, en este orden, en 2-4 frases cortas (máx. ~60 palabras, ≈ 20-25 s):

1. **Punto de partida**: lo que alguien prometió, quiso o era al principio.
2. **Final brutal y concreto**: cómo acabó, con un detalle visual o una cifra
   que choque con lo anterior. Cuanto mayor el contraste, mejor gancho.
3. **Pregunta** que abra la intriga: «¿Cómo pasó de ... a ...?».
4. **Cierre**: «Esta es la historia de ...».

Ejemplo de referencia (del usuario):

> Mussolini prometió devolver la grandeza a Italia. Acabó ejecutado por
> partisanos italianos y con su cadáver expuesto públicamente en Milán.
> ¿Cómo pasó de dirigir un país a terminar así? Esta es la historia de su
> ascenso y caída.

Reglas:
- Hechos reales y verificables; nada de exagerar para enganchar.
- No destripar el desarrollo: el gancho enseña el principio y el final, no el
  cómo (eso es lo que el espectador se queda a ver).
- La pizarra del gancho resume el contraste en grande: antes → después, la
  cifra o el dato fuerte en rojo y la pregunta en azul.
- La primera escena de `SCENES` no repite el gancho: arranca la historia.

Antes de renderizar: `python3 pizarra.py <guion> --check`.
