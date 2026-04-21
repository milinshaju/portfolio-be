import { Schema, model, Types } from 'mongoose';

export interface PlayerDoc {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  joinedAt?: Date;
  monthlyDues?: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const playerSchema = new Schema<PlayerDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    joinedAt: Date,
    monthlyDues: { type: Number, min: 0 },
    notes: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

playerSchema.index({ name: 1 });

export const Player = model<PlayerDoc>('Player', playerSchema);
