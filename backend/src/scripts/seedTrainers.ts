import { getSupabaseAdmin } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

interface TrainerSeedAccount {
  email: string;
  password: string;
  role: "developer" | "trainer";
  name: string;
}

function trainerSeedAccounts(): TrainerSeedAccount[] {
  const rawAccounts = process.env.TRAINER_SEED_ACCOUNTS;
  if (!rawAccounts) {
    throw new Error("TRAINER_SEED_ACCOUNTS is required. Use comma-separated email:strong-password pairs.");
  }

  return rawAccounts.split(",").map((entry) => {
    const [email, ...passwordParts] = entry.split(":");
    const maybeRole = passwordParts.at(-1);
    const roleFromEntry = maybeRole === "developer" || maybeRole === "trainer" ? maybeRole : undefined;
    const password = (roleFromEntry ? passwordParts.slice(0, -1) : passwordParts).join(":");
    if (!email?.includes("@") || password.length < 12) {
      throw new Error("Each TRAINER_SEED_ACCOUNTS entry must be email:password[:role] with a password of at least 12 characters.");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const role = roleFromEntry ?? (normalizedEmail.startsWith("developer@") || normalizedEmail.startsWith("dev@") ? "developer" : "trainer");
    const name = role === "developer" ? "Developer Console" : "Fitness World Trainer";
    return { email: normalizedEmail, password, role, name };
  });
}

async function seed() {
  logger.info("Starting trainer accounts seeding...");
  try {
    const trainersToSeed = trainerSeedAccounts();
    const supabase = getSupabaseAdmin();

    for (const trainer of trainersToSeed) {
      logger.info({ email: trainer.email }, "Seeding trainer account...");
      const { data, error } = await supabase.auth.admin.createUser({
        email: trainer.email,
        password: trainer.password,
        email_confirm: true,
        app_metadata: {
          role: trainer.role,
        },
        user_metadata: {
          name: trainer.name,
        },
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
    process.exitCode = 1;
  }
}

void seed();
