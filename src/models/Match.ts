import { Schema, model, Types } from 'mongoose';

export type MatchStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'bye';

export interface MatchDoc {
  _id: Types.ObjectId;
  tournamentId: Types.ObjectId;
  round: number;
  position: number;
  teamAId?: Types.ObjectId;
  teamBId?: Types.ObjectId;
  winnerId?: Types.ObjectId;
  nextMatchId?: Types.ObjectId;
  slot: 'A' | 'B';
  status: MatchStatus;
  scheduledAt?: Date;
  court?: string;
  scoreA?: number;
  scoreB?: number;
  createdAt: Date;
  updatedAt: Date;
}

const matchSchema = new Schema<MatchDoc>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true,
    },
    round: { type: Number, required: true, index: true },
    position: { type: Number, required: true },
    teamAId: { type: Schema.Types.ObjectId, ref: 'Team' },
    teamBId: { type: Schema.Types.ObjectId, ref: 'Team' },
    winnerId: { type: Schema.Types.ObjectId, ref: 'Team' },
    nextMatchId: { type: Schema.Types.ObjectId, ref: 'Match' },
    slot: { type: String, enum: ['A', 'B'], required: true },
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'in_progress', 'completed', 'bye'],
      default: 'pending',
    },
    scheduledAt: Date,
    court: String,
    scoreA: Number,
    scoreB: Number,
  },
  { timestamps: true }
);

matchSchema.index({ tournamentId: 1, round: 1, position: 1 }, { unique: true });

export const Match = model<MatchDoc>('Match', matchSchema);
