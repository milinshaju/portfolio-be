import { Schema, model, Types } from 'mongoose';

export interface ExpenseDoc {
  _id: Types.ObjectId;
  date: string;
  category: string;
  amount: number;
  description?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<ExpenseDoc>(
  {
    date: { type: String, required: true, index: true },
    category: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    description: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const Expense = model<ExpenseDoc>('Expense', expenseSchema);
