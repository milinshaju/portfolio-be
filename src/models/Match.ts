import { Schema, model, Types } from 'mongoose';

export type MatchStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'bye';

export interface SetScore {
  a: number;
  b: number;
  winner?: 'A' | 'B';
}

export interface PointLog {
  set: number;
  serverTeam: 'A' | 'B';
  serverPlayerIndex: 0 | 1;
  winner: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  at: Date;
}

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

  // Match format (copied from tournament.roundFormats at generation time; admin-overridable)
  pointsPerSet: number;
  bestOf: number;

  // Live scoring state
  sets: SetScore[];
  currentSet: number;
  servingTeam?: 'A' | 'B';
  rightCourtPlayerA?: 0 | 1;
  rightCourtPlayerB?: 0 | 1;
  points: PointLog[];
  initialServingTeam?: 'A' | 'B';
  initialRightCourtPlayerA?: 0 | 1;
  initialRightCourtPlayerB?: 0 | 1;
  startedAt?: Date;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const setScoreSchema = new Schema<SetScore>(
  {
    a: { type: Number, required: true, default: 0 },
    b: { type: Number, required: true, default: 0 },
    winner: { type: String, enum: ['A', 'B'] },
  },
  { _id: false }
);

const pointLogSchema = new Schema<PointLog>(
  {
    set: { type: Number, required: true },
    serverTeam: { type: String, enum: ['A', 'B'], required: true },
    serverPlayerIndex: { type: Number, enum: [0, 1], required: true },
    winner: { type: String, enum: ['A', 'B'], required: true },
    scoreA: { type: Number, required: true },
    scoreB: { type: Number, required: true },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

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

    pointsPerSet: { type: Number, default: 30 },
    bestOf: { type: Number, default: 1 },

    sets: { type: [setScoreSchema], default: [] },
    currentSet: { type: Number, default: 0 },
    servingTeam: { type: String, enum: ['A', 'B'] },
    rightCourtPlayerA: { type: Number, enum: [0, 1] },
    rightCourtPlayerB: { type: Number, enum: [0, 1] },
    points: { type: [pointLogSchema], default: [] },
    initialServingTeam: { type: String, enum: ['A', 'B'] },
    initialRightCourtPlayerA: { type: Number, enum: [0, 1] },
    initialRightCourtPlayerB: { type: Number, enum: [0, 1] },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

matchSchema.index({ tournamentId: 1, round: 1, position: 1 }, { unique: true });

export const Match = model<MatchDoc>('Match', matchSchema);
