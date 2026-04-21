import mongoose from 'mongoose';

let connected = false;

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn(
      '[db] MONGODB_URI not set — running without a database connection.'
    );
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    connected = true;
    console.log('[db] connected');
  } catch (err) {
    console.warn(
      `[db] could not connect (${(err as Error).message}). Continuing without a database — writes will fail.`
    );
  }
}

export function isDbConnected() {
  return connected && mongoose.connection.readyState === 1;
}
