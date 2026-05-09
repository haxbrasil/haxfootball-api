# HaxFootball API

## Setup

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The server defaults to `http://0.0.0.0:3000`.

## Tests

```bash
pnpm test:e2e
```

## Authentication

Create a JWT with:

```http
POST /auth
Content-Type: application/json

{
  "apiKey": "APP_API_KEY"
}
```

Use the returned token for protected API routes:

```http
Authorization: Bearer <token>
```

JWTs do not expire. Rotate `JWT_SECRET` to invalidate issued tokens.

## Adding a Feature

Create a folder under `src/features/<feature-name>` using vertical slices:

```text
src/features/<feature>/
  <feature>.db.ts
  <feature>.contract.ts
  <feature>.routes.ts
  create-<entity>/index.ts
  list-<entity>/index.ts
```

Export Drizzle tables from `src/db/schema.ts` and register feature routes in
`src/app.ts`.
