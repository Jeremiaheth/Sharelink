import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { SessionStatus, PassType } from '@prisma/client';

describe('GuestSession & Voucher System (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const testPhone = '+2349999999222';
  let testUserId: string;
  let testToken: string;
  let testHostId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Setup test user + host
    await prisma.user.deleteMany({ where: { phone: testPhone } });
    const user = await prisma.user.create({
      data: { phone: testPhone, role: 'HOST', isPhoneVerified: true },
    });
    testUserId = user.id;

    const host = await prisma.host.create({
      data: { userId: testUserId, sharePercentage: 55, status: 'PENDING' },
    });
    testHostId = host.id;

    testToken = jwtService.sign({ sub: testUserId, phone: testPhone, role: 'HOST' });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { session: { hostId: testHostId } } });
    await prisma.guestSession.deleteMany({ where: { hostId: testHostId } });
    await prisma.host.deleteMany({ where: { id: testHostId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await app.close();
  });

  const authHeader = () => ({ Authorization: `Bearer ${testToken}` });

  describe('Voucher generation & session creation', () => {
    it('should create session and return short unique voucher (happy path)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .set(authHeader())
        .send({
          hostId: testHostId,
          passType: 'HOURLY',
          amountPaid: 500,
        });

      if (createRes.status !== 201) {
        console.error('Create session failed with status', createRes.status, 'body:', JSON.stringify(createRes.body));
      }

      expect(createRes.status).toBe(201);
      const res = createRes;

      expect(res.body.voucherCode).toBeDefined();
      expect(res.body.voucherCode.length).toBeGreaterThanOrEqual(6);
      expect(res.body.voucherCode.length).toBeLessThanOrEqual(10);
      expect(res.body.status).toBe(SessionStatus.PENDING);
      expect(res.body.passType).toBe(PassType.HOURLY);
      expect(res.body.hostId).toBe(testHostId);
    });

    it('should reject creation without hostId or hubSpotId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .set(authHeader())
        .send({
          passType: 'HOURLY',
          amountPaid: 500,
        })
        .expect(400);
    });
  });

  describe('Voucher lookup & auto-expiry/activation', () => {
    it('should create then retrieve session by voucher', async () => {
      // Create inside it for isolation
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/sessions')
        .set(authHeader())
        .send({
          hostId: testHostId,
          passType: 'HOURLY',
          amountPaid: 500,
        });

      if (createRes.status !== 201) {
        console.error('Create session (for voucher test) failed with status', createRes.status, 'body:', JSON.stringify(createRes.body));
      }

      expect(createRes.status).toBe(201);
      const voucherCode = createRes.body.voucherCode;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/sessions/v/${voucherCode}`)
        .expect(200);

      expect(res.body.voucherCode).toBe(voucherCode);
      // status may be PENDING or ACTIVE depending on timing/auto-activate
      expect([SessionStatus.PENDING, SessionStatus.ACTIVE]).toContain(res.body.status);
    }, 10000);

    it('should return 404 for unknown voucher', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/sessions/v/INVALID99')
        .expect(404);
    });
  });

  describe('Session expiry', () => {
    it('should reject expire for non-admin (HOST token)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/sessions/expire')
        .set(authHeader())
        .expect(403);
    });
  });
});
