import { PrismaClient } from "@prisma/client";
import { SEED_SOURCES } from "../src/lib/sources";
import { SEED_GROUPS } from "../src/lib/groups-seed";

const prisma = new PrismaClient();

async function main() {
  for (const source of SEED_SOURCES) {
    await prisma.source.upsert({
      where: { feedUrl: source.feedUrl },
      update: { name: source.name, category: source.category },
      create: source,
    });
  }
  console.log(`Sembradas ${SEED_SOURCES.length} fuentes.`);

  // Para los grupos sembrados, este catalogo es la fuente de verdad: el
  // upsert tambien actualiza name/aliases en cada deploy (los grupos
  // anadidos a mano desde el dashboard no estan aqui y no se tocan).
  for (const group of SEED_GROUPS) {
    await prisma.group.upsert({
      where: { handle: group.handle },
      update: { name: group.name, aliases: group.aliases ?? null },
      create: { name: group.name, handle: group.handle, aliases: group.aliases ?? null },
    });
  }
  console.log(`Sembrados ${SEED_GROUPS.length} grupos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
