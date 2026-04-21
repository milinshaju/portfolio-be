import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, isDbConnected } from '../src/db';
import { Member, type CommitteeRole } from '../src/models/Member';

const seed: { name: string; role?: CommitteeRole }[] = [
  { name: 'Member 01', role: 'President' },
  { name: 'Member 02', role: 'Secretary' },
  { name: 'Member 03', role: 'Joint Secretary' },
  { name: 'Member 04', role: 'Treasurer' },
  ...Array.from({ length: 26 }, (_, i) => ({
    name: `Member ${String(i + 5).padStart(2, '0')}`,
  })),
];

async function main() {
  await connectDB();
  if (!isDbConnected()) {
    console.error('[seed-members] database unavailable — start MongoDB first.');
    process.exit(1);
  }
  let created = 0;
  for (const m of seed) {
    const existing = await Member.findOne({ name: m.name });
    if (existing) continue;
    await Member.create({ ...m, isFounder: true, isActive: true });
    created++;
  }
  console.log(`[seed-members] created ${created} members (total in DB now)`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
