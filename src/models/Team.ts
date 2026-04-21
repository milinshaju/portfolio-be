import { Schema, model, Types } from 'mongoose';

export interface TeamDoc {
  _id: Types.ObjectId;
  tournamentId: Types.ObjectId;
  name: string;
  player1: string;
  player2: string;
  phone?: string;
  email?: string;
  seed?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<TeamDoc>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    player1: { type: String, required: true, trim: true },
    player2: { type: String, required: true, trim: true },
    phone: String,
    email: String,
    seed: Number,
    notes: String,
  },
  { timestamps: true }
);

teamSchema.index({ tournamentId: 1, seed: 1 });

export const Team = model<TeamDoc>('Team', teamSchema);
