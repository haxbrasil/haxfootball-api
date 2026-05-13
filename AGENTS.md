# AGENTS.md

Guidance for AI agents working in this repository.

## Commands

- Install dependencies with `bun install`.
- Run the development server with `bun dev`.
- Run type checks with `bun run typecheck`.
- Run linting with `bun run lint`.
- Check formatting with `bun run format:check`.
- Format files with `bun run format`.
- Run all tests with `bun run test`.
- Run E2E tests with `bun run test:e2e`.
- Run the E2E boundary check with `bun run test:e2e:boundaries`.
- Run internal tests with `bun run test:internal`.
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
  <feature>.service.ts
  <feature>.persistence.ts
  <feature>.util.ts
  create-<entity>/index.ts
  list-<entity>/index.ts
  get-<entity>/index.ts
  update-<entity>/index.ts
  delete-<entity>/index.ts
```

Do not add service classes, repository classes, or dependency-injection containers. Operation modules should contain the use-case logic and operation-specific schemas. When shared behavior is needed, extract plain functions into a file whose suffix is explicitly allowed below.

Do not invent vague file categories or generic helper layers. If logic is shared inside a feature, extract it only when the responsibility is concrete and the name describes that responsibility.

Prefer equational-style code for non-trivial transformations: name intermediate values, keep each step explicit, and use `map`, `filter`, `find`, and `reduce` where they make the data flow clearer than imperative loops. Avoid complex `reduce` by default, but keep it when it is still the clearest expression of the transformation. Use spacing to separate conceptual phases, especially between derived constants, transformations, selections, effects, and returns.

## Feature file suffixes

Only use the file suffixes listed here. Do not introduce any other suffix without explicit user consent.

- `<feature>.db.ts`: Drizzle table definitions for one feature.
- `<feature>.contract.ts`: shared HTTP request, response, and route contract schemas for one feature.
- `<feature>.routes.ts`: route composition for one feature. Route files should mainly connect operations to Elysia.
- `<feature>.service.ts`: named feature behavior that is more than a small pure helper, such as aggregation, derivation, schema evaluation, compatibility rules, or runtime coordination that is part of the feature.
- `<feature>.persistence.ts`: shared feature-local database persistence when multiple operations need the same persistence behavior.
- `*.util.ts`: pure utility helpers. Utility modules must not import database clients, Drizzle tables, environment config, or HTTP errors.
- `index.ts`: operation entrypoints inside operation folders such as `create-<entity>/index.ts`, `list-<entity>/index.ts`, `get-<entity>/index.ts`, `update-<entity>/index.ts`, and `delete-<entity>/index.ts`.

Operation-specific schemas should stay in the operation folder. They do not need a separate suffix unless one of the approved suffixes above already fits.

## Imports and internal libraries

- Use path aliases instead of relative imports: `@/*` for `src`, `@/test/*` for `test`, and `@lib` for top-level generic libraries.
- Put generic, cross-feature libraries in `lib/<library>/index.ts`, and re-export them from `lib/index.ts`.
- Keep `lib` generic. Feature-specific business rules, persistence, HTTP errors, route composition, and DTO mapping stay in the feature.

## Boundaries

- Database definitions belong in `<feature>.db.ts`.
- Shared HTTP contracts belong in `<feature>.contract.ts`.
- Operation-specific request or response schemas belong in that operation folder.
- Routes belong in `<feature>.routes.ts` and should mainly compose operations.
- `*.util.ts` modules should be pure. Inject dependencies instead of importing infrastructure.
- `*.service.ts` modules should still stay framework-agnostic where practical.
- Feature-local persistence modules may use Drizzle and database tables, but should not own unrelated business rules or pure derivation logic. Keep pure transformations in separately named modules when extraction is justified.
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

E2E tests are the primary public behavior test layer. Put them under `test/e2e`.

Aim for E2E coverage that is strong enough to define the external behavior of the API. If this project were fully re-implemented, passing the E2E suite should be enough evidence that the new implementation preserves the expected behavior.

E2E tests should use the public API surface only. Test files under `test/e2e` must not import from `@/features`, `@/db`, or `@/app`; the shared E2E harness is the only exception. The boundary is enforced by `bun run test:e2e:boundaries`.

Internal tests belong under `test/internal`. Use them for implementation-specific behavior that is valuable to test but should not be part of the public reimplementation contract, such as persistence details, feature-local algorithms, or direct operation tests. Internal tests may import application modules and database tables.

Use the shared E2E helpers from `test/e2e/helpers/helpers.ts`:

- `request()` is the default for API tests. It sends an authenticated JSON request and stringifies object bodies.
- `publicRequest()` is for unauthenticated JSON requests, such as `POST /auth`.
- `rawRequest()` is only for cases that need native `RequestInit` behavior or no default headers.

Prefer explicit request bodies in each test. Do not hide core test setup behind feature-specific factories unless repetition becomes genuinely painful.

Keep tests isolated. Do not share created entities through file-level mutable state or `beforeAll`. If a test needs an account or other entity, create it inside that test with unique input values.

Tests should read like request/response examples. Assert status codes and the response body shape that matters for the behavior under test.

If a response shape is needed for a local E2E assertion, prefer a small explicit type annotation in the test. Do not import feature contract types into E2E tests.

## Verification

Run `bun run typecheck` after code changes. Run `bun run test:e2e` when request handling, auth, validation, persistence, or route behavior changes. If a change affects migrations or database shape, also run the relevant Drizzle command.
