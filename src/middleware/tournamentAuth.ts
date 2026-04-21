import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { TournamentAdminRole } from '../models/TournamentAdmin';

export type TournamentAuthedRequest = Request & {
  tournamentUser?: {
    userId: string;
    role: TournamentAdminRole;
    email: string;
  };
};

type JwtPayload = {
  sub: string;
  role: TournamentAdminRole;
  email: string;
  scope: 'tournament';
};

export const TOURNAMENT_COOKIE = 'tournament_token';

export function signTournamentToken(payload: Omit<JwtPayload, 'scope'>) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ ...payload, scope: 'tournament' as const }, secret, {
    expiresIn,
  } as jwt.SignOptions);
}

export function verifyTournamentToken(token: string): JwtPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const payload = jwt.verify(token, secret) as JwtPayload;
    if (payload.scope !== 'tournament') return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireTournamentAuth(
  req: TournamentAuthedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies?.[TOURNAMENT_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const payload = verifyTournamentToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.tournamentUser = {
    userId: payload.sub,
    role: payload.role,
    email: payload.email,
  };
  next();
}

export function requireTournamentRole(...roles: TournamentAdminRole[]) {
  return (req: TournamentAuthedRequest, res: Response, next: NextFunction) => {
    if (!req.tournamentUser) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.tournamentUser.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function tournamentCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProd,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}
