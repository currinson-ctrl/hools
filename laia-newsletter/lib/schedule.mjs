// Calendario quincenal: el boletín sale los viernes indicados de cada mes
// (por defecto el 2.º y el 4.º). El workflow se lanza todos los viernes y
// esto decide si hoy toca.

export function nthWeekdayOfMonth(d) {
  return Math.ceil(d.getUTCDate() / 7);
}

export function isSendDay(d, fridays) {
  return d.getUTCDay() === 5 && fridays.includes(nthWeekdayOfMonth(d));
}

/** Día de envío anterior a `d` (para saber desde cuándo contar noticias). */
export function previousSendDay(d, fridays) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  for (let i = 0; i < 40; i++) {
    x.setUTCDate(x.getUTCDate() - 1);
    if (isSendDay(x, fridays)) return new Date(x);
  }
  return new Date(x.getTime() - 14 * 86400000);
}
