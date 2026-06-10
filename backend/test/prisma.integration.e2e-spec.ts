import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Simple PrismaService Integration Test
 *
 * This test verifies that:
 *  - PrismaService can be instantiated via Nest DI
 *  - It can successfully connect to the database
 *  - It can execute a basic raw query
 *
 * Requirements to run:
 *   1. Valid DATABASE_URL in .env pointing to a PostgreSQL instance
 *      with the schema applied (run `npm run db:migrate`)
 *   2. npm run test:e2e -- test/prisma.integration-spec.ts
 *
 * If no valid database is configured, the test is automatically skipped.
 */
describe('PrismaService Integration', () => {
  let prisma: PrismaService;
  let module: TestingModule;

  const databaseUrl = process.env.DATABASE_URL || '';

  // Robust guard for environments without a real database (placeholder from .env.example)
  const hasRealDatabase =
    !!databaseUrl &&
    !databaseUrl.includes('user:password@host') &&
    !databaseUrl.includes('johndoe') &&
    !databaseUrl.includes('localhost:5432/mydb') &&
    !databaseUrl.includes('REPLACE_WITH_YOUR_ACTUAL_PASSWORD');

  if (!hasRealDatabase) {
    // Entire suite is skipped — this is the expected behavior in dev machines without Postgres/Supabase
    it.skip('requires a real DATABASE_URL (Supabase or local Postgres) + applied migrations to run integration tests', () => {
      // Placeholder skipped test. Update .env with a valid connection string and run migrations.
    });
    return;
  }

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  }, 15000); // generous timeout for DB connection

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(prisma).toBeDefined();
  });

  it('should successfully connect and execute a basic query', async () => {
    // Basic raw query to confirm connectivity and Prisma Client is working
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;

    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].ok).toBe(1);
  });

  it('should be able to count records on core models (schema applied)', async () => {
    // These should not throw if the migration has been applied
    const userCount = await prisma.user.count();
    const hostCount = await prisma.host.count();
    const sessionCount = await prisma.guestSession.count();

    expect(typeof userCount).toBe('number');
    expect(typeof hostCount).toBe('number');
    expect(typeof sessionCount).toBe('number');
  });
});
