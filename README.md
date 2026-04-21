# Backend API

Single Node.js + Express service backed by MongoDB (Mongoose). Serves all three FE apps.

## Routes

```
GET  /api/health
POST /api/portfolio/contact    # contact form submissions
GET  /api/club                 # (stub — future club features)
GET  /api/tournament           # (stub — future tournament features)
```

## Dev

```bash
npm install
cp .env.example .env           # edit MONGODB_URI if needed
npm run dev                    # → http://localhost:4000
```

MongoDB is optional in dev — if `MONGODB_URI` is unset or unreachable, the contact route logs and returns `202` instead of persisting.

## Stack

- Node.js + Express
- Mongoose (MongoDB ODM)
- Zod for request validation
- Helmet, CORS, Morgan
- `tsx` for dev, `tsc` for build

## Scripts

| Script              | What it does                               |
|---------------------|--------------------------------------------|
| `npm run dev`       | Watch mode via `tsx`                       |
| `npm run build`     | Compile TS → `dist/`                       |
| `npm run start`     | Run compiled output                        |
| `npm run type-check`| Type-check only                            |

See [`../portfolio/ARCHITECTURE.md`](../portfolio/ARCHITECTURE.md) for how this fits into the platform.
