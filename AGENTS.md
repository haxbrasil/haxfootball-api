# AGENTS.md

Guidance for AI agents working in this repository.

## Commands

- Install dependencies with `bun install`.
- Run type checks with `bun run typecheck`.
- Run E2E tests with `bun run test:e2e`.
- Run the development server with `bun dev`.
- Generate migrations with `bun run db:generate`.
- Apply migrations with `bun run db:migrate`.

## Architecture

This API uses Elysia, Bun, Drizzle, SQLite, and TypeBox.

Prefer feature folders with vertical slices. A feature should group its route composition, shared contracts, database table, and operation folders together:

```text
src/features/<feature>/
  <feature>.db.ts
  <feature>.contract.ts
  <feature>.routes.ts
  create-<entity>/index.ts
  list-<entity>/index.ts
  get-<entity>/index.ts
  update-<entity>/index.ts
  delete-<entity>/index.ts
```

Avoid adding generic service/repository classes unless there is real behavior or an abstraction boundary that justifies them. Operation modules should contain the use-case logic and operation-specific schemas.

Do not invent vague file categories such as `store`, `service`, `manager`, or generic helper layers. If logic is shared inside a feature, extract it only when the responsibility is concrete and the name describes that responsibility. Acceptable examples are narrow feature-local modules such as `<feature>.persistence.ts` for shared database persistence, `<feature>.invariants.ts` for feature invariants, or `*.util.ts` for pure utilities.

Prefer equational-style code for non-trivial transformations: name intermediate values, keep each step explicit, and use `map`, `filter`, `find`, and `reduce` where they make the data flow clearer than imperative loops. Avoid complex `reduce` by default, but keep it when it is still the clearest expression of the transformation. Use spacing to separate conceptual phases, especially between derived constants, transformations, selections, effects, and returns.

## Boundaries

- Database definitions belong in `<feature>.db.ts`.
- Shared HTTP contracts belong in `<feature>.contract.ts`.
- Operation-specific request or response schemas belong in that operation folder.
- Routes belong in `<feature>.routes.ts` and should mainly compose operations.
- `*.util.ts` modules should be pure. They should not import database clients, Drizzle tables, environment config, or HTTP errors. Inject dependencies instead.
- Feature-local persistence modules may use Drizzle and database tables, but should not own unrelated business rules or pure derivation logic. Keep invariants and pure transformations in separately named modules when extraction is justified.
- `src/db/schema.ts` should only export Drizzle database schemas.
- Do not use database-derived insert/select types as HTTP operation input/output contracts. Use schema-derived DTO types and map database rows to response DTOs.
- Do not add defensive runtime type guards just to appease lint or TypeScript. Prefer precise types at the boundary and simple annotations where needed. Add runtime validation only when the input is genuinely untrusted or validation is the behavior being implemented.

## Elysia

- Use Elysia plugins for cross-cutting app behavior.
- Use guards for route access policy, such as bearer JWT auth.
- Use wrapper plugins for shared route metadata, such as common error response schemas.
- Keep operation functions framework-agnostic where practical. They should accept typed inputs and return DTOs, not Elysia context objects.

## Errors

Use `HttpError` helpers from `src/shared/http/errors.ts` for expected HTTP errors. Do not hand-build error response objects inside operations.

Global error formatting belongs in `src/plugins/error-handler.ts`.

Route response schemas should include route-specific errors like `404`. Shared errors such as validation and internal server errors should be applied through the common error response plugin.

## Environment

Environment config is validated in `src/config/env.ts` with TypeBox. Add new env vars to the schema there and consume them through the exported `env` object.

## Database

Run `bun run db:generate` after any schema changes to create migrations automatically. Do not write migrations by hand unless explicitly requested. Drizzle introspects the schema in `src/db/schema.ts` and generates correct SQL migrations with proper metadata.

## Tests

E2E tests are the primary test layer. Put them under `test/e2e`.

Use the shared helpers from `test/e2e/helpers.ts`:

- `request()` is the default for API tests. It sends an authenticated JSON request and stringifies object bodies.
- `publicRequest()` is for unauthenticated JSON requests, such as `POST /auth`.
- `rawRequest()` is only for cases that need native `RequestInit` behavior or no default headers.

Prefer explicit request bodies in each test. Do not hide core test setup behind feature-specific factories unless repetition becomes genuinely painful.

Keep tests isolated. Do not share created entities through file-level mutable state or `beforeAll`. If a test needs an account or other entity, create it inside that test with unique input values.

Tests should read like request/response examples. Assert status codes and the response body shape that matters for the behavior under test.

If a response shape is needed for a local assertion, prefer a small explicit type annotation or an existing contract type and keep the test focused on behavior.

## Verification

Run `bun run typecheck` after code changes. Run `bun run test:e2e` when request handling, auth, validation, persistence, or route behavior changes. If a change affects migrations or database shape, also run the relevant Drizzle command.
