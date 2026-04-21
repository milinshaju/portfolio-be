import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB, isDbConnected } from '../src/db';
import { TournamentAdmin } from '../src/models/TournamentAdmin';

async function main() {
  await connectDB();
  if (!isDbConnected()) {
    console.error('[seed-tournament] database unavailable — start MongoDB first.');
    process.exit(1);
  }

  const email = process.env.TOURNAMENT_SUPERADMIN_EMAIL;
  const password = process.env.TOURNAMENT_SUPERADMIN_PASSWORD;
  const name = process.env.TOURNAMENT_SUPERADMIN_NAME || 'Tournament Admin';

  if (!email || !password) {
    console.error(
      '[seed-tournament] Set TOURNAMENT_SUPERADMIN_EMAIL and TOURNAMENT_SUPERADMIN_PASSWORD in .env'
    );
    process.exit(1);
  }

  const existing = await TournamentAdmin.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.name = name;
    existing.passwordHash = await bcrypt.hash(password, 10);
    existing.role = 'super_admin';
    existing.isActive = true;
    await existing.save();
    console.log(`[seed-tournament] super admin updated: ${email}`);
  } else {
    await TournamentAdmin.create({
      email: email.toLowerCase(),
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'super_admin',
      isActive: true,
    });
    console.log(`[seed-tournament] super admin created: ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
