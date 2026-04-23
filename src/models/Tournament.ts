import { Schema, model, Types } from 'mongoose';

export type TournamentSize = 8 | 16 | 32 | 64;
export type TournamentStatus = 'draft' | 'published' | 'in_progress' | 'completed';

export interface Organizer {
  name: string;
  role?: string;
  phone?: string;
  email?: string;
}

export interface RoundFormat {
  round: number;
  pointsPerSet: number;
  bestOf: number;
}

export interface TournamentDoc {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueMapQuery?: string;
  organizers: Organizer[];
  size: TournamentSize;
  status: TournamentStatus;
  format: 'single_elimination';
  isActive: boolean;
  entryFee?: number;
  prize?: string;
  rules?: string;
  publicRegistrationOpen?: boolean;
  roundFormats?: RoundFormat[];
  createdAt: Date;
  updatedAt: Date;
}

const organizerSchema = new Schema<Organizer>(
  {
    name: { type: String, required: true, trim: true },
    role: String,
    phone: String,
    email: String,
  },
  { _id: false }
);

const roundFormatSchema = new Schema<RoundFormat>(
  {
    round: { type: Number, required: true },
    pointsPerSet: { type: Number, required: true },
    bestOf: { type: Number, required: true },
  },
  { _id: false }
);

const tournamentSchema = new Schema<TournamentDoc>(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    startDate: String,
    endDate: String,
    venueName: String,
    venueAddress: String,
    venueCity: String,
    venueMapQuery: String,
    organizers: [organizerSchema],
    size: { type: Number, enum: [8, 16, 32, 64], required: true, default: 16 },
    status: {
      type: String,
      enum: ['draft', 'published', 'in_progress', 'completed'],
      default: 'draft',
    },
    format: {
      type: String,
      enum: ['single_elimination'],
      default: 'single_elimination',
    },
    isActive: { type: Boolean, default: false, index: true },
    entryFee: Number,
    prize: String,
    rules: String,
    publicRegistrationOpen: { type: Boolean, default: false },
    roundFormats: { type: [roundFormatSchema], default: undefined },
  },
  { timestamps: true }
);

export const Tournament = model<TournamentDoc>('Tournament', tournamentSchema);
