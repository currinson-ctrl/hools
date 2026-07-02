import { PrismaClient } from "@prisma/client";
import { SEED_SOURCES } from "../src/lib/sources";

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
