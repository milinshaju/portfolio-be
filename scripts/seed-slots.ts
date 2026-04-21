import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, isDbConnected } from '../src/db';
import { Slot, DEFAULT_SLOTS } from '../src/models/Slot';

async function main() {
  await connectDB();
  if (!isDbConnected()) {
    console.error('[seed-slots] database unavailable — start MongoDB first.');
    process.exit(1);
  }

  let created = 0;
  for (const s of DEFAULT_SLOTS) {
    const existing = await Slot.findOne({ startHour: s.startHour });
    if (existing) continue;
    await Slot.create({ ...s, playerIds: [] });
    created++;
  }
  console.log(`[seed-slots] created ${created} slots (total in DB: ${await Slot.countDocuments()})`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
