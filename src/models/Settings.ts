import { Schema, model } from 'mongoose';

export interface SettingsDoc {
  key: string;
  defaultMonthlyDues: number;
  currency: string;
  updatedAt: Date;
  createdAt: Date;
}

const settingsSchema = new Schema<SettingsDoc>(
  {
    key: { type: String, default: 'global', unique: true },
    defaultMonthlyDues: { type: Number, default: 600, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true }
);

export const Settings = model<SettingsDoc>('Settings', settingsSchema);

export async function getSettings(): Promise<SettingsDoc> {
  const existing = await Settings.findOne({ key: 'global' });
  if (existing) return existing;
  return await Settings.create({ key: 'global' });
}
