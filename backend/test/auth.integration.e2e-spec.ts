import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testPhone = '+2349999999000'; // dedicated test phone

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
      }),
    );

    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.otp.deleteMany({ where: { phone: testPhone } });
    await prisma.refreshToken.deleteMany({
      where: { user: { phone: testPhone } },
    });
    await prisma.user.deleteMany({ where: { phone: testPhone } });
    await app.close();
  });

  describe('/auth/send-otp (POST)', () => {
    it('should send OTP for valid phone', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/send-otp')
        .send({ phone: testPhone })
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('OTP sent successfully');
        });
    });

    it('should reject invalid phone format', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/send-otp')
        .send({ phone: '08012345678' }) // local format, not international
        .expect(400);
    });
  });

  describe('/auth/verify-otp (POST)', () => {
    it('should fail with invalid OTP', async () => {
      // First send OTP (it will be logged in console during test)
      await request(app.getHttpServer())
        .post('/api/v1/auth/send-otp')
        .send({ phone: testPhone });

      return request(app.getHttpServer())
        .post('/api/v1/auth/verify-otp')
        .send({ phone: testPhone, otp: '000000' })
        .expect(401);
    });

    // Note: Full success test is harder in e2e without reading the logged OTP.
    // In real CI you would mock the sender or use a test OTP provider.
    // For this demo we at least test the error paths and structure.
  });

  describe('Protected routes', () => {
    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/me')
        .expect(401);
    });
  });
});
