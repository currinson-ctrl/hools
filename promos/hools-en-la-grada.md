# Promo «Hools en la Grada» — 2x1 con foto

Compra un polo, súbelo a la grada (foto en el estadio o la previa mencionando a
@hoolsbrand) y te regalamos otro, envío incluido.

- **Landing para stories:** https://www.hoolsbrand.com/pages/hools-en-la-grada
  (fuente: `theme/pages/hools-en-la-grada.html`)
- **Bases:** https://www.hoolsbrand.com/pages/bases-hools-en-la-grada
  (fuente: `theme/pages/bases-hools-en-la-grada.html`)
- Ambas páginas se crearon **ocultas**. Para lanzar: Tienda online → Páginas →
  cada una → Visibilidad: **Visible**.

## Reglas

| | |
|---|---|
| Pedido válido | hoolsbrand.com, ≥1 polo a precio completo, **sin ningún código** |
| No acumulable | Con ningún código ni promo (los 6 códigos activos ya no se combinan entre sí) |
| Foto | Estadio o previa, con el polo comprado, cuenta pública, mención @hoolsbrand (+ #HoolsEnLaGrada) |
| Plazo | 30 días desde la entrega del pedido |
| Fecha de fin | Ninguna. Si se cierra, se anuncia y los pedidos anteriores conservan sus 30 días |
| Regalo | 1 polo por pedido, modelo y talla a elegir según stock, envío gratis a la dirección del pedido |
| Devoluciones | Si se devuelve el comprado, se pierde el regalo |

**Sin código de descuento a propósito:** un código del 100 % circularía por
grupos y foros. El regalo se da con un pedido en borrador, uno a uno.

## Operativa en Shopify (por cada participante)

1. **Comprobar** en Pedidos: lleva polo, no lleva descuento, entregado hace
   ≤ 30 días, y la foto cumple. Etiqueta el pedido `2x1-grada` y pega en la
   nota el enlace o la captura de la foto.
2. **Regalo:** Pedidos → Borradores → Crear pedido →
   - cliente: el mismo · producto: polo y talla elegidos
   - Añadir descuento → 100 % (motivo: «Hools en la Grada»)
   - Envío → tarifa personalizada «Regalo Hools en la Grada», 0 €
   - Etiqueta `2x1-grada-regalo` · nota: «Regalo del pedido #XXXX»
   - Crear pedido (total 0 €) → preparar y enviar como siempre.
3. **Repost** de la foto citando la cuenta (lo permiten las bases).
4. **Medir** filtrando pedidos por `2x1-grada` (participantes) y
   `2x1-grada-regalo` (coste en polos + envíos).

Respuesta tipo por DM cuando se valida:
> ¡Eso es llevarlo a la grada! 🏟️ Pedido #XXXX validado. Dinos modelo y talla del que quieres y te lo mandamos sin coste. Return to the Origins.

Respuesta tipo si no cumple:
> Gracias por la foto 🙌 Para el 2x1 el pedido tiene que ir sin códigos de descuento y la foto en un estadio o en la previa con el polo puesto. Si quieres, mándanos otra y la miramos.

## Línea en las fichas de los polos

El tema publicado no se puede escribir desde fuera del editor, así que esto
se pega a mano (1 minuto): Tienda online → Temas → Personalizar → plantilla
**Productos** → bloque «Información del producto» → Añadir bloque →
**Liquid personalizado** (debajo del precio) → pegar:

```liquid
{%- if product.type == 'Polo' -%}
<a href="/pages/hools-en-la-grada" style="display:block;margin:14px 0;padding:12px 14px;background:#151515;color:#F8F8F8;text-decoration:none;font-family:'Muli',sans-serif;font-size:13px;letter-spacing:.06em;line-height:1.4;border-left:4px solid #CCB229;">
  <strong style="color:#CCB229;letter-spacing:.18em;">2x1 · HOOLS EN LA GRADA</strong><br>
  Llévalo al estadio o a la previa, nómbranos y te regalamos otro. Envío incluido &rarr;
</a>
{%- endif -%}
```

Solo sale en productos de tipo «Polo». Para quitarlo cuando acabe la promo,
se borra el bloque.

## Copys

### Post de lanzamiento (feed / carrusel)
> Tu polo, en la grada. El siguiente lo pagamos nosotros.
>
> Compra un polo Hools, hazte una foto con él en el estadio o en la previa y nómbranos. Te mandamos otro gratis, envío incluido.
>
> 1. Compra tu polo en la web
> 2. Foto en la grada o la previa con @hoolsbrand y #HoolsEnLaGrada
> 3. DM con tu número de pedido
>
> Sin fecha de fin. 30 días desde que te llega. No acumulable con otros códigos.
> Return to the Origins. Link en bio.
>
> #HoolsEnLaGrada #terraceculture #awaydays #casualculture #matchday #futbol #modstyle

### Secuencia de stories (enlace: /pages/hools-en-la-grada)
1. **Gancho** (foto de grada a sangre): «¿Vas al partido este finde?»
2. **Mecánica**: «Compra un polo · Foto en la grada o la previa · Te regalamos otro. Envío incluido.» + sticker de enlace «2x1 HOOLS»
3. **Prueba social** (cuando haya fotos): repost de participantes + «Tú eres el siguiente.» + sticker de enlace

### Repost de participantes
> Así se lleva un Hools: en la grada. 📸 @usuario
> ¿El tuyo? #HoolsEnLaGrada

### Línea para la bio (mientras dure)
> 2x1: tu polo en la grada = otro gratis ⬇️
