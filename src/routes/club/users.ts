import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../../models/User';
import { requireAuth, requireRole } from '../../middleware/auth';
import { isDbConnected } from '../../db';

const router = Router();

function requireDb(_req: unknown, res: Response, next: NextFunction) {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  next();
}

router.get('/', requireAuth, requireRole('super_admin'), requireDb, async (_req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ role: 1, createdAt: 1 })
    .lean();
  res.json({ users });
});

router.post('/', requireAuth, requireRole('super_admin'), requireDb, async (req, res) => {
  const { email, name, password, role, memberId } = req.body ?? {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name, password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: String(email).toLowerCase().trim(),
    name,
    passwordHash,
    role: role === 'super_admin' ? 'super_admin' : 'admin',
    memberId: memberId || undefined,
    isActive: true,
  });
  res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

router.patch('/:id', requireAuth, requireRole('super_admin'), requireDb, async (req, res) => {
  const { name, isActive, role, password } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (role !== undefined && ['admin', 'super_admin'].includes(role)) updates.role = role;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select(
    '-passwordHash'
  );
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user });
});

export default router;
