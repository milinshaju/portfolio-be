import { Schema, model, Types } from 'mongoose';

export type CommitteeRole =
  | 'President'
  | 'Secretary'
  | 'Joint Secretary'
  | 'Treasurer'
  | null;

export interface MemberDoc {
  _id: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  role?: CommitteeRole;
  photo?: string;
  isFounder: boolean;
  isActive: boolean;
  joinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<MemberDoc>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    role: {
      type: String,
      enum: ['President', 'Secretary', 'Joint Secretary', 'Treasurer', null],
      default: null,
    },
    photo: String,
    isFounder: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    joinedAt: Date,
  },
  { timestamps: true }
);

export const Member = model<MemberDoc>('Member', memberSchema);
