import { Router } from 'express';
import authRouter from './tournament/auth';
import tournamentsRouter from './tournament/tournaments';
import teamsRouter from './tournament/teams';
import matchesRouter from './tournament/matches';
import usersRouter from './tournament/users';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ service: 'badminton-tournament', status: 'ok' });
});

router.use('/auth', authRouter);
router.use('/tournaments', tournamentsRouter);
router.use('/teams', teamsRouter);
router.use('/matches', matchesRouter);
router.use('/users', usersRouter);

export default router;
