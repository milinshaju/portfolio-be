import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDB, isDbConnected } from '../src/db';
import { User } from '../src/models/User';
import { getSettings } from '../src/models/Settings';
import mongoose from 'mongoose';

async function main() {
  await connectDB();
  if (!isDbConnected()) {
    console.error('[seed] database unavailable — start MongoDB first.');
    process.exit(1);
  }

  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('[seed] Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env');
    process.exit(1);
  }

  const settings = await getSettings();
  console.log(`[seed] settings ready (dues=${settings.defaultMonthlyDues} ${settings.currency})`);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    existing.name = name;
    existing.passwordHash = await bcrypt.hash(password, 10);
    existing.role = 'super_admin';
    existing.isActive = true;
    await existing.save();
    console.log(`[seed] super admin updated: ${email}`);
  } else {
    await User.create({
      email: email.toLowerCase(),
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'super_admin',
      isActive: true,
    });
    console.log(`[seed] super admin created: ${email}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
