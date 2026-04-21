import { Schema, model, Types } from 'mongoose';

export type UserRole = 'super_admin' | 'admin' | 'member';

export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  memberId?: Types.ObjectId;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
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
      enum: ['super_admin', 'admin', 'member'],
      required: true,
      default: 'admin',
    },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export const User = model<UserDoc>('User', userSchema);
