import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { getSettings, Settings } from '../../models/Settings';
import { requireAuth, requireRole } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

router.get('/', requireAuth, requireDb, async (_req, res) => {
  const settings = await getSettings();
  res.json({
    settings: {
      defaultMonthlyDues: settings.defaultMonthlyDues,
      currency: settings.currency,
    },
  });
});

router.patch(
  '/',
  requireAuth,
  requireRole('super_admin'),
  requireDb,
  async (req, res) => {
    const { defaultMonthlyDues, currency } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (typeof defaultMonthlyDues === 'number' && defaultMonthlyDues >= 0) {
      updates.defaultMonthlyDues = defaultMonthlyDues;
    }
    if (typeof currency === 'string' && currency.trim().length > 0) {
      updates.currency = currency.trim().toUpperCase();
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const doc = await Settings.findOneAndUpdate(
      { key: 'global' },
      { $set: updates },
      { new: true, upsert: true }
    );
    res.json({
      settings: {
        defaultMonthlyDues: doc.defaultMonthlyDues,
        currency: doc.currency,
      },
    });
  }
);

export default router;
