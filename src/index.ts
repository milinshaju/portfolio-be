import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { connectDB } from './db';
import portfolioRouter from './routes/portfolio';
import clubRouter from './routes/club';
import tournamentRouter from './routes/tournament';

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — admin login will refuse to issue tokens.');
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/portfolio', portfolioRouter);
app.use('/api/club', clubRouter);
app.use('/api/tournament', tournamentRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
