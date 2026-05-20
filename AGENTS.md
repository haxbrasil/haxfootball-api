# AGENTS.md

Guidance for AI agents working in this repository.

## Project

This API uses Elysia, Bun, Drizzle, SQLite, and TypeBox.

Use vertical slices by feature. Keep feature-specific behavior inside the owning
feature, and use public feature boundaries when another feature needs to call it.

Do not add service classes, repository classes, or dependency-injection
containers. Operation modules should hold use-case logic directly.

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

## Feature Layout

Use this structure for feature folders:

```text
src/features/<feature>/
  db.ts
  http.ts

  _shared/
    db/
      queries.ts
    http/
      inputs.ts
      responses.ts
    domain/
      *.ts
    adapters/
      *.ts

  create-<entity>/index.ts
  list-<entity>/index.ts
  get-<entity>/index.ts
  update-<entity>/index.ts
  delete-<entity>/index.ts
```

Use these folders and files as follows:

- `db.ts`: public feature database boundary. Put Drizzle tables, table constants,
  relations when needed, and inferred row types here.
- `http.ts`: public feature HTTP boundary. Put route composition here and
  re-export HTTP schemas or mappers that other features may use.
- `_shared/db/queries.ts`: reusable feature-local database access used by
  multiple operation slices.
- `_shared/http/inputs.ts`: reusable inbound HTTP schemas, such as params,
  query fragments, body field schemas, and input DTO types.
- `_shared/http/responses.ts`: reusable outbound HTTP schemas, response DTO
  types, and response mappers.
- `_shared/domain/*.ts`: pure reusable feature logic, such as validation,
  derivation, aggregation, normalization, compatibility checks, or schema
  evaluation. Domain modules must not perform external I/O.
- `_shared/adapters/*.ts`: feature-private external I/O helpers, such as process
  spawning, filesystem access, remote API clients, or runtime integration code.
- `<operation>/index.ts`: public operation entrypoint for a concrete use case.

Operation-specific schemas belong in the operation folder. If code is invoked
from outside the feature as a concrete use case, make it a public operation
folder instead of exporting it from `_shared`.

Do not introduce root-level suffix files like `*.contract.ts`, `*.db.ts`,
`*.routes.ts`, `*.service.ts`, `*.persistence.ts`, or `*.util.ts`.

Do not invent new `_shared` categories without explicit user consent.

## Imports

- Use path aliases instead of relative imports: `@/*` for `src`, `@/test/*` for
  `test`, and `@lib` for top-level generic libraries.
- Put generic cross-feature libraries in `lib/<library>/index.ts`, and re-export
  them from `lib/index.ts`.
- Keep `lib` generic. Feature-specific business rules, persistence, HTTP errors,
  route composition, and DTO mapping stay in the feature.
- Cross-feature imports must use public feature boundaries:
  `@/features/<feature>/db`, `@/features/<feature>/http`, or
  `@/features/<feature>/<operation>`.
- Do not import another feature's `_shared` modules. Promote the needed behavior
  to a public feature boundary or public operation folder first.
- Biome forbids cross-feature `_shared` imports in production code and imports
  from old suffix module paths.

## Coding Style

Prefer explicit, equational-style code for non-trivial transformations:

- Name intermediate values.
- Keep each step easy to inspect.
- Use `map`, `filter`, `find`, and `reduce` when they make data flow clearer
  than imperative loops.
- Avoid complex `reduce` by default, but keep it when it is still the clearest
  expression of the transformation.

Use one blank line between meaningful phases, such as input normalization,
guards, database reads, database writes, transformations, and returns. Biome
does not enforce arbitrary blank lines between conceptual code blocks, so keep
this readable while respecting formatter output.

Do not add defensive runtime type guards just to appease lint or TypeScript.
Prefer precise types at the boundary and simple annotations where needed. Add
runtime validation only when the input is genuinely untrusted or validation is
the behavior being implemented.

## HTTP

- Use Elysia plugins for cross-cutting app behavior.
- Use guards for route access policy, such as bearer JWT auth.
- Use wrapper plugins for shared route metadata, such as common error response
  schemas.
- Keep operation functions framework-agnostic where practical. They should
  accept typed inputs and return DTOs, not Elysia context objects.
- Do not use database-derived insert/select types as HTTP operation input or
  output contracts. Use schema-derived DTO types and map database rows to
  response DTOs.

## Pagination

All GET list endpoints must use cursor-based pagination. Do not return bare
arrays from list endpoints.

Use the shared pagination utilities from `@lib`:

- Use `paginationQuerySchema` or equivalent `limit` and `cursor` fields in route
  query schemas.
- Use `paginatedResponseSchema(itemSchema)` and `PaginatedResponse<T>`.
- Use `cursorAfter(column, query.cursor, direction)`,
  `cursorSort(column, direction)`, and `pageLimit(query)` in database queries.
- Use `pageItems(rows, query, cursorFor)` to build responses.
- Cursor columns must be stable and match the sort direction. Prefer unique
  columns such as internal IDs, unique names, unique keys, or per-parent
  sequences.
- List tests should assert endpoint-specific data inside `items`, not only the
  paginated envelope.

## Errors

Use `HttpError` helpers from `src/shared/http/errors.ts` for expected HTTP
errors. Do not hand-build error response objects inside operations.

Global error formatting belongs in `src/plugins/error-handler.ts`.

Route response schemas should include route-specific errors like `404`. Shared
errors such as validation and internal server errors should be applied through
the common error response plugin.

## Environment

Environment config is validated in `src/config/env.ts` with TypeBox. Add new env
vars to the schema there and consume them through the exported `env` object.

## Database

- `src/db/schema.ts` should only export Drizzle database schemas.
- Run `bun run db:generate` after schema changes to create migrations
  automatically.
- Do not write migrations by hand unless explicitly requested.
- Drizzle introspects the schema in `src/db/schema.ts` and generates SQL
  migrations with metadata.

Feature-local query modules may use Drizzle and database tables, but should not
own unrelated business rules or pure derivation logic. Keep pure transformations
in `_shared/domain` when extraction is justified.

## Tests

E2E tests are the primary public behavior test layer. Put them under
`test/e2e`.

Aim for E2E coverage strong enough to define the external behavior of the API.
If this project were fully reimplemented, passing the E2E suite should be enough
evidence that the new implementation preserves expected behavior.

E2E tests should use the public API surface only. Test files under `test/e2e`
must not import from `@/features`, `@/db`, or `@/app`; the shared E2E harness is
the only exception. The boundary is enforced by
`bun run test:e2e:boundaries`.

Internal tests belong under `test/internal`. Use them for implementation-specific
behavior that is valuable to test but should not be part of the public
reimplementation contract, such as persistence details, feature-local
algorithms, or direct operation tests. Internal tests may import application
modules and database tables.

Use the shared E2E helpers from `test/e2e/helpers/helpers.ts`:

- `request()` is the default for API tests. It sends an authenticated JSON
  request and stringifies object bodies.
- `publicRequest()` is for unauthenticated JSON requests, such as `POST /auth`.
- `rawRequest()` is only for cases that need native `RequestInit` behavior or no
  default headers.

Prefer explicit request bodies in each test. Do not hide core test setup behind
feature-specific factories unless repetition becomes genuinely painful.

Keep tests isolated. Do not share created entities through file-level mutable
state or `beforeAll`. If a test needs an account or other entity, create it
inside that test with unique input values.

Tests should read like request/response examples. Assert status codes and the
response body shape that matters for the behavior under test.

If a response shape is needed for a local E2E assertion, prefer a small explicit
type annotation in the test. Do not import feature contract types into E2E
tests.

## Verification

Run `bun run typecheck` after code changes.

Run `bun run test:e2e` when request handling, auth, validation, persistence, or
route behavior changes.

If a change affects migrations or database shape, also run the relevant Drizzle
command.
