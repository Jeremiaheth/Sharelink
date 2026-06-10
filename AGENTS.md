# AGENTS.md — AI agent onboarding for this repository

Purpose: provide concise, actionable guidance for AI coding agents to be immediately productive in this codebase.

Overview
- Backend lives in `backend/` — a NestJS TypeScript app using Prisma (Postgres). See [backend/README.md](backend/README.md) for details.
- Primary docs: [README.md](README.md) and [ShareLink_NG_Developer_Specification.md](ShareLink_NG_Developer_Specification.md).

Key files to inspect
- App entry: [backend/src/main.ts](backend/src/main.ts)
- App module: [backend/src/app.module.ts](backend/src/app.module.ts)
- Prisma schema: [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- Prisma seed: [backend/prisma/seed.ts](backend/prisma/seed.ts)
- Tests: [backend/test](backend/test) (Jest e2e/unit)

Useful commands (run from repo root)
- Change to backend: `cd backend`
- Install deps: `npm install`
- Copy env example: `cp .env.example .env` and update environment variables
- Start dev server: `npm run start:dev`
- Build: `npm run build`
- Run unit tests: `npm run test`
- Run e2e tests: `npm run test:e2e`
- Lint: `npm run lint`
- Format: `npm run format`
- Prisma: `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run db:studio`

Agent guidance
- Prefer editing under `backend/` unless task explicitly targets root docs.
- Always run relevant tests and linter before proposing code changes: `npm run lint` and `npm run test` / `npm run test:e2e`.
- Preserve existing API contracts and database migrations — create new migration files when schema changes are needed.
- Use immutability patterns and input validation consistent with repository conventions.
- If adding or updating code, include or update unit and e2e tests that demonstrate the change.

Conventions & gotchas
- NestJS modules organized under `backend/src/modules/*` (auth, users, sessions, etc.). Follow existing module, DTO, guard, and strategy patterns.
- Prisma migrations live under `backend/prisma/migrations` and are applied via the `db:migrate` script.
- E2E tests use a test database config — check `backend/test/jest-e2e.json` before running.

Where to find more context
- Development and architecture notes: [backend/README.md](backend/README.md)
- Project specification: [ShareLink_NG_Developer_Specification.md](ShareLink_NG_Developer_Specification.md)

Suggested next agent customizations
- `create-skill test-runner`: an automated skill to run `npm run test` and `npm run test:e2e` and report failures.
- `create-hook pre-push-tests`: a hook that runs lint + tests before push and blocks if they fail.

If you'd like, I can refine this file further or add a `.github/copilot-instructions.md` variant — tell me which you prefer.
