import { Schema, model, Types } from 'mongoose';

export interface SlotDoc {
  _id: Types.ObjectId;
  startHour: number;
  endHour: number;
  label?: string;
  playerIds: Types.ObjectId[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const slotSchema = new Schema<SlotDoc>(
  {
    startHour: { type: Number, required: true, min: 5, max: 21 },
    endHour: { type: Number, required: true, min: 6, max: 22 },
    label: String,
    playerIds: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
    notes: String,
  },
  { timestamps: true }
);

slotSchema.index({ startHour: 1 }, { unique: true });

export const Slot = model<SlotDoc>('Slot', slotSchema);

export const DEFAULT_SLOTS: { startHour: number; endHour: number; label?: string }[] = [
  { startHour: 5, endHour: 7 },
  { startHour: 7, endHour: 9 },
  { startHour: 9, endHour: 11 },
  { startHour: 11, endHour: 13 },
  { startHour: 13, endHour: 15 },
  { startHour: 15, endHour: 17 },
  { startHour: 17, endHour: 19 },
  { startHour: 19, endHour: 21 },
];
