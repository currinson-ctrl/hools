/**
 * Catalogo inicial de grupos de aficion, con su cuenta oficial de X
 * verificada a mano por el usuario. Solo se siembra una vez (upsert por
 * handle, idempotente) - despues se gestionan desde /dashboard/groups sin
 * tocar codigo.
 */
export const SEED_GROUPS: Array<{ name: string; handle: string; aliases?: string }> = [
  { name: "Gradafans Real Madrid", handle: "GradaFansRMCF" },
  // "Biris Norte" es el nombre real del grupo; en tuits aparece tambien
  // como "Biris" a secas o estilizado "Biri$".
  { name: "Biris Oficial", handle: "birisoficial", aliases: "Biris Norte, Biris, Biri$" },
  { name: "Frente Atlético", handle: "FA82Oficial" },
  { name: "Bultzad", handle: "BultzadaTX" },
  { name: "Indar Gorri", handle: "19IndarGorri87" },
  { name: "Hools Valencia", handle: "HoolsVCF1919" },
  { name: "Herri Norte", handle: "HerriNorte1982" },
  { name: "Frente Bokeron", handle: "frentebokeron86" },
  { name: "Supporters Gol Sur", handle: "1986Oficial" },
  { name: "Ultra Boys", handle: "ULTRASGIJON" },
  { name: "Ultras Sur", handle: "FondoSur_1980" },
  { name: "Bukaneros", handle: "Bukaneros92" },
  { name: "Curva Espanyol", handle: "CurvaRCDE" },
  { name: "Celtarras", handle: "CeltarrasOficia" },
  { name: "Symmachiari", handle: "Symmachiarii94" },
  { name: "Riazor Blues", handle: "RB1987Oficial" },
];
