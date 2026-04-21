import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { TournamentAdmin } from '../../models/TournamentAdmin';
import {
  TOURNAMENT_COOKIE,
  signTournamentToken,
  tournamentCookieOptions,
  requireTournamentAuth,
  type TournamentAuthedRequest,
} from '../../middleware/tournamentAuth';
import { isDbConnected } from '../../db';

const router = Router();

router.post('/login', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await TournamentAdmin.findOne({
    email: String(email).toLowerCase().trim(),
  });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  user.lastLoginAt = new Date();
  await user.save();

  const token = signTournamentToken({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
  });
  res.cookie(TOURNAMENT_COOKIE, token, tournamentCookieOptions());
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(TOURNAMENT_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireTournamentAuth, async (req: TournamentAuthedRequest, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  const user = await TournamentAdmin.findById(req.tournamentUser!.userId);
  if (!user || !user.isActive) return res.status(401).json({ error: 'Not authenticated' });
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

router.patch('/me', requireTournamentAuth, async (req: TournamentAuthedRequest, res) => {
  if (!isDbConnected()) return res.status(503).json({ error: 'Database unavailable' });
  const { name, currentPassword, newPassword } = req.body ?? {};
  const user = await TournamentAdmin.findById(req.tournamentUser!.userId);
  if (!user || !user.isActive) return res.status(401).json({ error: 'Not authenticated' });

  if (typeof name === 'string' && name.trim().length > 0) user.name = name.trim();

  if (newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password required' });
    }
    const ok = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    user.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await user.save();
  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

export default router;
