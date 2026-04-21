import { Schema, model, models } from 'mongoose';

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    source: { type: String, default: 'portfolio' },
  },
  { timestamps: true }
);

export const ContactMessage =
  models.ContactMessage || model('ContactMessage', contactMessageSchema);
