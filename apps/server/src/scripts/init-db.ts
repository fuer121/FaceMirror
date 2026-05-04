import { hasPostgres, initPostgresSchema } from "../lib/db.js";

async function main() {
  if (!hasPostgres()) {
    throw new Error("DATABASE_URL is required to initialize production database.");
  }

  await initPostgresSchema();
  console.log(JSON.stringify({
    ok: true,
    database: "postgres",
    initialized_at: new Date().toISOString()
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
