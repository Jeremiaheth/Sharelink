import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { HostStatus, SessionStatus, TransactionStatus } from '@prisma/client';

describe('Host Onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const testPhone = '+2349999999111'; // unique test phone for this suite
  let testUserId: string;
  let testToken: string;
  let testIspId: string;
  let createdHostId: string | null = null;
  let createdRouterId: string | null = null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Ensure a clean test user
    await prisma.user.deleteMany({ where: { phone: testPhone } });

    // Create test HOST user
    const user = await prisma.user.create({
      data: {
        phone: testPhone,
        role: 'HOST',
        isPhoneVerified: true,
      },
    });
    testUserId = user.id;

    // Get a real ISP from DB (seeded)
    const isp = await prisma.iSP.findFirst({
      where: { name: { contains: 'Spectranet', mode: 'insensitive' } },
    });
    if (!isp) {
      throw new Error('No ISP found for test. Run seed first.');
    }
    testIspId = isp.id;

    // Generate valid JWT for the test user (mimics auth flow)
    testToken = jwtService.sign({
      sub: testUserId,
      phone: testPhone,
      role: 'HOST',
    });
  }, 30000);

  afterAll(async () => {
    // Cleanup created records for this test user
    if (createdRouterId) {
      await prisma.router.deleteMany({ where: { id: createdRouterId } });
    }
    if (createdHostId) {
      await prisma.host.deleteMany({ where: { id: createdHostId } });
    }
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${testToken}` });

  describe('POST /api/v1/hosts/onboard', () => {
    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/onboard')
        .send({
          ispName: 'Spectranet',
          router: {
            ipAddress: '192.168.88.1',
            username: 'admin',
            password: 'test-pass',
          },
        })
        .expect(401);
    });

    it('should return 400 for invalid payload (missing router details)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/onboard')
        .set(authHeader())
        .send({
          ispName: 'Spectranet',
          // missing router
        })
        .expect(400);
    });

    it('should return 400 for invalid ISP', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/hosts/onboard')
        .set(authHeader())
        .send({
          ispName: 'NonExistentISP12345',
          router: {
            ipAddress: '192.168.88.1',
            username: 'admin',
            password: 'test-pass',
          },
        })
        .expect(400);

      expect(res.body.message).toContain('Valid ispId or ispName is required');
    });

    it('happy path: should onboard, link ISP, create Router, set defaults (integration with DB)', async () => {
      const payload = {
        ispName: 'Spectranet',
        fullName: 'Test Onboard Host',
        router: {
          name: 'Test MikroTik',
          model: 'hAP ac^2',
          ipAddress: '192.168.88.10',
          username: 'admin',
          password: 'super-secret-test',
        },
        sharePercentage: 25,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/hosts/onboard')
        .set(authHeader())
        .send(payload)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'PENDING');
      expect(res.body.message).toContain('onboarding started successfully');
      expect(res.body).toHaveProperty('host');
      expect(res.body).toHaveProperty('router');
      expect(res.body.host.sharePercentage).toBe(25);
      expect(res.body.host.ispId).toBe(testIspId);
      expect(res.body.router.ipAddress).toBe('192.168.88.10');
      expect(res.body.router.hostId).toBe(res.body.host.id);

      // Store for cleanup
      createdHostId = res.body.host.id;
      createdRouterId = res.body.router.id;

      // Verify in DB directly (FK relationships)
      const dbHost = await prisma.host.findUnique({
        where: { id: createdHostId },
        include: { isp: true },
      });
      expect(dbHost).toBeDefined();
      expect(dbHost?.userId).toBe(testUserId);
      expect(dbHost?.isp?.name).toMatch(/Spectranet/i);
      expect(dbHost?.sharePercentage).toBe(25);
      expect(dbHost?.status).toBe(HostStatus.PENDING);

      const dbRouter = await prisma.router.findUnique({
        where: { id: createdRouterId },
      });
      expect(dbRouter).toBeDefined();
      expect(dbRouter?.hostId).toBe(createdHostId);
    }, 30000);
  });

  describe('GET /api/v1/hosts/earnings (earnings dashboard)', () => {
    it('should return 401 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/v1/hosts/earnings')
        .expect(401);
    });

    it('should return earnings summary (0s if no qualifying sessions) for authenticated host', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/hosts/earnings')
        .set(authHeader())
        .expect(200);

      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('today');
      expect(res.body).toHaveProperty('thisMonth');
      expect(res.body).toHaveProperty('currency', 'NGN');
      expect(typeof res.body.total).toBe('number');
    });

    it('should compute earnings from a completed paid non-refunded session (integration)', async () => {
      // Create a qualifying completed session + success tx for the test host
      // First ensure host exists (from previous happy path or create minimal)
      let host = await prisma.host.findUnique({ where: { userId: testUserId } });
      if (!host) {
        host = await prisma.host.create({
          data: {
            userId: testUserId,
            sharePercentage: 55,
            status: HostStatus.PENDING,
          },
        });
      } else {
        // Ensure 55% for this test assertion (previous tests may have set 25)
        host = await prisma.host.update({
          where: { userId: testUserId },
          data: { sharePercentage: 55 },
        });
      }

      // Clean any previous sessions for this host to avoid unique voucher issues
      await prisma.transaction.deleteMany({ where: { session: { hostId: host.id } } });
      await prisma.guestSession.deleteMany({ where: { hostId: host.id } });

      const uniqueCode = `E${Date.now().toString().slice(-8)}`; // <= 9 chars + E = short for VarChar(20)
      const session = await prisma.guestSession.create({
        data: {
          voucherCode: uniqueCode,
          hostId: host.id,
          passType: 'HOURLY',
          amountPaid: 1000,
          status: SessionStatus.COMPLETED,
          expiresAt: new Date(),
        },
      });

      await prisma.transaction.create({
        data: {
          sessionId: session.id,
          amount: 1000,
          status: TransactionStatus.SUCCESS,
          paystackReference: `PS${Date.now().toString().slice(-10)}`,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/hosts/earnings')
        .set(authHeader())
        .expect(200);

      // With 55% share: 0.55 * 1000 = 550
      expect(res.body.total).toBeGreaterThanOrEqual(550);
      expect(res.body.sharePercentage).toBe(55);

      // cleanup this session/tx
      await prisma.transaction.deleteMany({ where: { sessionId: session.id } });
      await prisma.guestSession.delete({ where: { id: session.id } });
    }, 15000);
  });

  describe('POST /api/v1/hosts/payouts (payout request)', () => {
    it('should return 401 without auth', () => {
      return request(app.getHttpServer())
        .post('/api/v1/hosts/payouts')
        .send({ amount: 6000 })
        .expect(401);
    });

    it('should return 400 for amount below minimum (₦5,000)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/hosts/payouts')
        .set(authHeader())
        .send({ amount: 4000 })
        .expect(400);

      expect(res.body.message).toContain('Minimum payout amount is ₦5,000');
    });

    it('should create Payout record when host has sufficient balance (integration + DB check)', async () => {
      // Ensure a host with enough earnings exists for the test user
      let host = await prisma.host.findUnique({ where: { userId: testUserId } });
      if (!host) {
        host = await prisma.host.create({
          data: {
            userId: testUserId,
            sharePercentage: 55,
            totalEarnings: 10000, // sufficient balance
            status: HostStatus.PENDING,
          },
        });
      } else {
        await prisma.host.update({
          where: { userId: testUserId },
          data: { totalEarnings: 10000 },
        });
      }

      // Clean any previous pending payouts for clean test
      await prisma.payout.deleteMany({
        where: { hostId: host.id, status: 'PENDING' },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/hosts/payouts')
        .set(authHeader())
        .send({ amount: 6000 })
        .expect(200);

      expect(res.body).toHaveProperty('payout');
      expect(res.body.payout.status).toBe('PENDING');
      expect(Number(res.body.payout.amount)).toBe(6000);
      expect(res.body.payout.hostId).toBe(host.id);
      expect(res.body.message).toContain('Payout request submitted successfully');

      // Verify in DB
      const dbPayout = await prisma.payout.findUnique({
        where: { id: res.body.payout.id },
      });
      expect(dbPayout).toBeDefined();
      expect(dbPayout?.status).toBe('PENDING');
      expect(Number(dbPayout?.amount)).toBe(6000);

      // Cleanup this payout
      await prisma.payout.delete({ where: { id: res.body.payout.id } });
    });
  });
});
