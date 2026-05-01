require("dotenv").config({ quiet: true });

const bcrypt = require("bcryptjs");

const db = require("../config/db");

const SALT_ROUNDS = 10;

function isBcryptHash(value) {
  return /^\$2[aby]\$/.test(value);
}

async function hashPlaintextPasswords() {
  const [users] = await db.query(
    "SELECT id, email, mot_de_passe FROM utilisateurs ORDER BY id"
  );

  let updatedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    if (isBcryptHash(user.mot_de_passe)) {
      skippedCount += 1;
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.mot_de_passe, SALT_ROUNDS);

    await db.query("UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?", [
      hashedPassword,
      user.id,
    ]);

    updatedCount += 1;
    console.log(`Hashed password for ${user.email}`);
  }

  console.log(
    `Finished. Updated ${updatedCount} password(s), skipped ${skippedCount} already hashed password(s).`
  );
}

hashPlaintextPasswords()
  .catch((error) => {
    console.error("Password hashing failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
