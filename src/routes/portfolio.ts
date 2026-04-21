import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { ContactMessage } from '../models/ContactMessage';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  message: z.string().min(1).max(5000),
});

router.post('/contact', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  if (mongoose.connection.readyState !== 1) {
    console.log('[contact] DB not connected — logging only:', parsed.data);
    return res.status(202).json({ ok: true, persisted: false });
  }

  try {
    const saved = await ContactMessage.create(parsed.data);
    res.status(201).json({ ok: true, id: saved._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

export default router;
