# Patchwork Free Deployment Runbook

This runbook prepares Patchwork for a no-cost deployment using:

- Frontend: Cloudflare Pages
- Backend: Render free web service
- Database: Neon free Postgres
- File uploads: Supabase free Storage

This stack fits the current app layout:

- `client/` is a Vite static build.
- `server/` is a long-running Express + Socket.IO app.
- uploads are already wired to Supabase Storage.

## 1. Security First

Before you deploy anything public:

- Rotate `DATABASE_URL`.
- Rotate `SUPABASE_SERVICE_ROLE_KEY`.
- Replace `JWT_SECRET` with a strong random value.
- Treat the values currently in `server/.env` as exposed if they were ever shared outside your machine.

The local `.env` files are ignored by git. Backup copies are also ignored now.

## 2. Branch and Runtime

- Current working branch at the time of this runbook: `jack`
- Recommended Node version: `20.19.0`
- `.nvmrc` has been added at the repo root for local consistency.

Why `20.19.0`:

- the client uses Vite 7, which requires Node `^20.19.0 || >=22.12.0`

## 3. Provider Setup Order

Create and configure services in this order:

1. Neon database
2. Supabase project and Storage bucket
3. Render backend
4. Cloudflare Pages frontend

This order keeps the backend setup straightforward because Render needs the database URL, frontend origin, and Supabase keys before it can boot cleanly.

## 4. Neon

- Create a free Neon project in a US region close to Render if possible.
- Copy the pooled connection string with SSL enabled.
- Use that value for `DATABASE_URL` in Render.

Do not reuse the current local database credentials.

## 5. Supabase

- Create or reuse a free Supabase project.
- Create a public Storage bucket named `images`.
- Copy:
  - project URL as `SUPABASE_URL`
  - service role key as `SUPABASE_SERVICE_ROLE_KEY`

The current backend upload route expects a public URL to come back from the bucket, so the bucket must be public for the current implementation.

## 6. Render Backend

Two options:

- Use the included `render.yaml` blueprint in the repo root.
- Create the service manually in the Render dashboard using the same settings.

Manual settings:

- Service type: Web Service
- Root directory: `server`
- Build command: `npm ci --include=dev`
- Pre-deploy command: `npm run db:migrate`
- Start command: `npm run start`
- Health check path: `/api/health`
- Plan: Free
- Region: Oregon

Set these environment variables in Render:

- `NODE_VERSION=20.19.0`
- `NODE_ENV=production`
- `DEBUG_REQUESTS=false`
- `ACTION_LOGGING_ENABLED=true`
- `SUPABASE_BUCKET=images`
- `DATABASE_URL=<your Neon connection string>`
- `JWT_SECRET=<new random secret>`
- `CLIENT_ORIGIN=https://<your-pages-project>.pages.dev`
- `SUPABASE_URL=https://<your-project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<your service role key>`

Notes:

- Render assigns `PORT` automatically.
- `sequelize-cli` lives in `devDependencies`, so the build command includes dev deps intentionally to allow the migration command to run.
- Free Render services sleep after inactivity, so the first request after idle will be slow.

## 7. Cloudflare Pages Frontend

Create a Pages project that points at this repo.

Recommended settings:

- Production branch: `jack` if you want to deploy directly from the current branch
- Root directory: `client`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`

Set this environment variable in Pages:

- `VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api`

Notes:

- `client/public/_redirects` has been added so single-page app routes resolve to `index.html`.
- `client/.env.pages.template` is a tracked reference file for the hosted frontend value.

## 8. Local Reference Env Copies

Tracked reference files added for deployment setup:

- `client/.env.pages.template`
- `server/.env.render.template`

These are safe templates only. They do not contain live secrets.

## 9. Local Validation Before First Deploy

Run these from the repo root:

```bash
npm run build --prefix client
npm test --prefix server
```

Optional:

```bash
npm run lint --prefix client
```

Do not run migrations against production until Neon and Render env vars are ready.

## 10. Post-Deploy Smoke Test

After both services are live:

1. Open the Pages URL and confirm the app shell loads.
2. Confirm `GET https://<render-service>.onrender.com/api/health` succeeds.
3. Register a new account.
4. Log in and reload the page to confirm token restore works.
5. Create a post.
6. Upload an image.
7. Open a second account/browser and test live messaging.
8. Visit a deep route directly, such as `/marketplace` or `/post/<id>`, to confirm SPA routing works.

## 11. Remaining Manual Work

These tasks still require dashboard access:

- creating Cloudflare, Render, Neon, and Supabase projects
- rotating secrets
- setting the real environment variables
- confirming the free-tier limits are acceptable for your demo
