import { Schema, model, Types } from 'mongoose';

export interface PaymentDoc {
  _id: Types.ObjectId;
  playerId: Types.ObjectId;
  month: string;
  amount: number;
  paid: boolean;
  paidAt?: Date;
  notes?: string;
  recordedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
  {
    playerId: {
      type: Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    month: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    paid: { type: Boolean, default: false },
    paidAt: Date,
    notes: String,
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

paymentSchema.index({ playerId: 1, month: 1 }, { unique: true });

export const Payment = model<PaymentDoc>('Payment', paymentSchema);
