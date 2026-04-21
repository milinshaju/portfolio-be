import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, isDbConnected } from '../src/db';
import { Slot } from '../src/models/Slot';
import { Payment } from '../src/models/Payment';

async function main() {
  await connectDB();
  if (!isDbConnected()) {
    console.error('[reset] database unavailable.');
    process.exit(1);
  }
  const delSlots = await Slot.deleteMany({});
  const delPayments = await Payment.deleteMany({});
  console.log(
    `[reset] dropped ${delSlots.deletedCount} slot(s) and ${delPayments.deletedCount} payment(s). Run seed:slots next.`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
