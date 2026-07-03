import { Category } from "@prisma/client";

/**
 * Catalogo inicial de fuentes RSS, curado por categoria. Son un punto de
 * partida orientativo, no una lista verificada en produccion: antes de
 * activarlas de verdad, confirma que cada feedUrl responde XML valido
 * (algunos sitios cambian de plantilla o retiran su RSS con el tiempo) y que
 * el contenido encaja con el tono de la marca. Anade/quita fuentes desde el
 * dashboard en /dashboard/sources sin tocar codigo.
 */
export const SEED_SOURCES: Array<{
  name: string;
  feedUrl: string;
  category: Category;
}> = [
  // Aficion / cultura ultra
  {
    name: "Ultras Futbol",
    feedUrl: "https://ultrasfutbol.home.blog/feed/",
    category: Category.AFICION,
  },
  {
    name: "BeSoccer - Noticias",
    feedUrl: "https://es.besoccer.com/rss",
    category: Category.AFICION,
  },

  // Desplazamientos / viajes de hinchas / groundhopping
  {
    name: "Union Rayo (desplazamientos afición)",
    feedUrl: "https://unionrayo.com/feed/",
    category: Category.VIAJES,
  },
  {
    name: "Groundhopper Guides",
    feedUrl: "https://groundhopperguides.com/blog/feed/",
    category: Category.VIAJES,
  },
  {
    name: "Football Ground Guide",
    feedUrl: "https://footballgroundguide.com/feed/",
    category: Category.VIAJES,
  },

  // Moda casual / terrace fashion
  {
    name: "Who Killed Bambi? (Casual)",
    feedUrl: "https://wkbambi.com/blogs/news.atom",
    category: Category.MODA,
  },
  {
    name: "Lower Block - Terrace Fashion",
    feedUrl: "https://lowerblock.com/feed/",
    category: Category.MODA,
  },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  AFICION: "Afición / Ultras",
  VIAJES: "Desplazamientos / Viajes",
  MODA: "Moda casual",
};

export const CATEGORY_HASHTAGS: Record<Category, string[]> = {
  AFICION: ["#Ultras", "#Aficion", "#Futbol"],
  VIAJES: ["#Desplazamientos", "#AwayDays", "#Futbol"],
  MODA: ["#Casual", "#TerraceFashion", "#Hools"],
};

// Consulta de respaldo para buscar una foto de stock cuando la fuente RSS
// no trae ninguna imagen. En ingles porque el banco de imagenes (Openverse)
// tiene mejor cobertura/etiquetado en ingles.
export const CATEGORY_IMAGE_HINT: Record<Category, string> = {
  AFICION: "football fans stadium crowd",
  VIAJES: "football fans travel stadium",
  MODA: "streetwear casual fashion",
};
