# ShareLink NG

ISP-agnostic broadband sharing economy platform for Nigeria.

## Project Structure

- `backend/` — NestJS + TypeScript API (Node.js)
  - `src/common/` — Shared filters, middleware, decorators, constants, utils, DTOs
  - `src/modules/` — Feature modules (auth, users, hosts, sessions, payments, routers, admin)
- `ShareLink_NG_Developer_Specification.md` — Full product & technical spec (MVP/Pilot)

## Getting Started (Backend)

```bash
cd backend
cp .env.example .env   # then fill in your values (especially the Supabase DATABASE_URL password)
npm install
npm run db:migrate     # applies schema to Supabase
npm run db:seed        # optional sample data
npm run start:dev
```

API will be available at http://localhost:3000/api/v1

**Database:** Configured for your Supabase Postgres (Session Pooler).
- Update the password in `.env` using the connection string from your Supabase dashboard.
- Run `npm run db:migrate` to create the tables.

See `backend/README.md` (NestJS default) and the developer specification for more details.

**Status:** Foundations scaffolding complete (Phase 0 ready).
