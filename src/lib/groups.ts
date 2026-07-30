export interface KnownGroup {
  name: string;
  aliases: string[];
  handle: string;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMBINING_DIACRITICS = new RegExp("[̀-ͯ]", "g");

function foldAccents(input: string): string {
  return input.normalize("NFD").replace(COMBINING_DIACRITICS, "");
}

/**
 * De la lista de grupos conocidos (curada a mano en /dashboard/groups),
 * devuelve los que se mencionan de verdad en el texto (insensible a
 * mayusculas/tildes, con limites de palabra para no enganchar substrings
 * sueltos dentro de otra palabra).
 */
export function findMentionedGroups(text: string, groups: KnownGroup[]): KnownGroup[] {
  const normalizedText = foldAccents(text).toLowerCase();

  return groups.filter((group) =>
    [group.name, ...group.aliases].some((candidate) => {
      const folded = foldAccents(candidate).toLowerCase();
      // \b solo funciona entre caracter de palabra y no-palabra: si el alias
      // empieza/termina en un simbolo (ej. "Biri$"), anclarlo con \b haria
      // que no casara nunca; en ese extremo no se exige limite.
      const start = /^\w/.test(folded) ? "\\b" : "";
      const end = /\w$/.test(folded) ? "\\b" : "";
      const pattern = new RegExp(`${start}${escapeRegExp(folded)}${end}`);
      return pattern.test(normalizedText);
    })
  );
}

/**
 * Envuelve la primera aparicion literal (insensible a mayusculas, no a
 * tildes) del nombre/alias de cada grupo dentro de html con un enlace a su
 * perfil de X. Si no encuentra ninguna variante exacta en el texto (p.ej.
 * por una tilde distinta), simplemente no enlaza ese grupo ahi (la mencion
 * en el tuit no depende de esto).
 */
export function linkMentionedGroups(html: string, groups: KnownGroup[]): string {
  let result = html;
  for (const group of groups) {
    for (const candidate of [group.name, ...group.aliases]) {
      const pattern = new RegExp(`(${escapeRegExp(candidate)})`, "i");
      if (pattern.test(result)) {
        result = result.replace(
          pattern,
          `<a href="https://x.com/${group.handle}" target="_blank" rel="noopener noreferrer">$1</a>`
        );
        break;
      }
    }
  }
  return result;
}

export function parseAliases(raw: string | null | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}
