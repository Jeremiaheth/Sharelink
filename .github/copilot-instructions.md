# Copilot instructions for this repository

Purpose: short, actionable guidance for GitHub Copilot / AI agents working on this repo.

Where to work
- Primary code: `backend/` — NestJS + TypeScript app. See [backend/README.md](backend/README.md).

Quick setup (from repo root)
```bash
cd backend
npm install
cp .env.example .env   # update env values
npm run db:generate
npm run db:migrate
npm run db:seed
npm run start:dev
```

Tests & lint
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e` (check `backend/test/jest-e2e.json` for DB config)
- Lint: `npm run lint`
- Format: `npm run format`

Guidelines for code edits
- Run `npm run lint` and relevant tests before proposing changes.
- Preserve API contracts and migrations; when changing Prisma schema, add a migration and update seeds.
- Match existing patterns: modules under `backend/src/modules/*`, DTOs, guards, strategies.
- Include unit and/or e2e tests for behavior changes.

Files worth inspecting
- [backend/src/main.ts](backend/src/main.ts)
- [backend/src/app.module.ts](backend/src/app.module.ts)
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- [backend/prisma/seed.ts](backend/prisma/seed.ts)
- [backend/test/jest-e2e.json](backend/test/jest-e2e.json)

If uncertain
- Ask for environment details (Postgres connection, test DB) before running migrations or e2e tests.
- If a proposed change touches multiple modules, request a brief design approval first.

Suggested next automations
- Add a `test-runner` skill to run tests and report failures.
- Add a pre-push hook to run `lint` + `test`.
