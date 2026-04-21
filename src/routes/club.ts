import { Router } from 'express';
import authRouter from './club/auth';
import membersRouter from './club/members';
import playersRouter from './club/players';
import slotsRouter from './club/slots';
import paymentsRouter from './club/payments';
import expensesRouter from './club/expenses';
import dashboardRouter from './club/dashboard';
import usersRouter from './club/users';
import settingsRouter from './club/settings';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ service: 'g30-sports-club', status: 'ok' });
});

router.use('/auth', authRouter);
router.use('/members', membersRouter);
router.use('/players', playersRouter);
router.use('/slots', slotsRouter);
router.use('/payments', paymentsRouter);
router.use('/expenses', expensesRouter);
router.use('/dashboard', dashboardRouter);
router.use('/users', usersRouter);
router.use('/settings', settingsRouter);

export default router;
