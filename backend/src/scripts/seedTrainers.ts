import { getSupabaseAdmin } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

const trainersToSeed = [
  { email: "trainer@fitnessworld.in", password: "trainer123" },
  { email: "trainer1@fitnessworld.in", password: "trainer123" },
  { email: "trainer2@fitnessworld.in", password: "trainer123" },
];

async function seed() {
  logger.info("Starting trainer accounts seeding...");
  try {
    const supabase = getSupabaseAdmin();

    for (const trainer of trainersToSeed) {
      logger.info({ email: trainer.email }, "Seeding trainer account...");
      const { data, error } = await supabase.auth.admin.createUser({
        email: trainer.email,
        password: trainer.password,
        email_confirm: true,
      });

      if (error) {
        if (error.message.toLowerCase().includes("already registered") || error.message.toLowerCase().includes("already exists") || error.status === 422) {
          logger.info({ email: trainer.email }, "Trainer account already exists or email is registered. Skipping.");
        } else {
          logger.error({ email: trainer.email, error: error.message }, "Failed to seed trainer account");
        }
      } else {
        logger.info({ email: trainer.email, userId: data.user?.id }, "Successfully seeded trainer account");
      }
    }
    logger.info("Trainer accounts seeding completed!");
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : err }, "Failed to initialize seeding");
  }
}

void seed();
