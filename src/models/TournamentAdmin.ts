import { Schema, model, Types } from 'mongoose';

export type TournamentAdminRole = 'super_admin' | 'admin' | 'referee';

export interface TournamentAdminDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: TournamentAdminRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<TournamentAdminDoc>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'referee'],
      required: true,
      default: 'admin',
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export const TournamentAdmin = model<TournamentAdminDoc>('TournamentAdmin', schema);
