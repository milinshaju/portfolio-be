import { Router } from 'express';
import { Member } from '../../models/Member';
import { requireAuth, requireRole } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

const requireManager = requireRole('admin', 'super_admin');

function requireDb(_req: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

router.get('/', requireDb, async (_req, res) => {
  const members = await Member.find({ isActive: true }).sort({ role: 1, name: 1 }).lean();
  res.json({ members });
});

router.post('/', requireAuth, requireManager, requireDb, async (req, res) => {
  const { name, phone, email, role, photo, isFounder } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const member = await Member.create({
    name,
    phone,
    email,
    role: role || null,
    photo,
    isFounder: isFounder ?? true,
  });
  res.status(201).json({ member });
});

router.patch('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const { id } = req.params;
  const updates = (({ name, phone, email, role, photo, isActive }) => ({
    name,
    phone,
    email,
    role,
    photo,
    isActive,
  }))(req.body ?? {});
  Object.keys(updates).forEach(
    (k) => updates[k as keyof typeof updates] === undefined && delete updates[k as keyof typeof updates]
  );
  const member = await Member.findByIdAndUpdate(id, updates, { new: true });
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json({ member });
});

router.delete('/:id', requireAuth, requireManager, requireDb, async (req, res) => {
  const m = await Member.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
