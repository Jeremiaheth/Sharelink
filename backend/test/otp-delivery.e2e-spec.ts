/* eslint-disable @typescript-eslint/unbound-method -- axios.post is a static mocked function. */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { App } from 'supertest/types';
import request from 'supertest';
import axios from 'axios';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { OtpDeliveryService } from '../src/modules/auth/otp-delivery.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

jest.mock('axios');
describe('OTP delivery HTTP flow (isolated persistence)', () => {
  let app: INestApplication<App>;
  const phone = '+2348012345678';
  const sid = `AC${'a'.repeat(32)}`;
  const prisma = {
    otp: {
      deleteMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.otp.count.mockResolvedValue(0);
    prisma.otp.create.mockResolvedValue({ id: 'otp-1' });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        OtpDeliveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: {} },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'production',
            OTP_DELIVERY_MODE: 'twilio',
            OTP_CHANNEL: 'sms',
            TWILIO_ACCOUNT_SID: sid,
            WHATSAPP_API_TOKEN: 'b'.repeat(32),
            WHATSAPP_API_URL: `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            OTP_FROM: '+15551234567',
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns 200 only after provider acceptance', async () => {
    jest.mocked(axios.post).mockResolvedValue({
      status: 201,
      data: { sid: `SM${'c'.repeat(32)}`, status: 'queued' },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({ phone })
      .expect(200);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('returns sanitized 503 and invalidates OTP on delivery failure', async () => {
    jest
      .mocked(axios.post)
      .mockRejectedValue(new Error('sensitive provider payload'));
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({ phone })
      .expect(503);
    expect(JSON.stringify(result.body)).not.toContain(
      'sensitive provider payload',
    );
    expect(prisma.otp.update).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: { expiresAt: new Date(0) },
    });
    prisma.otp.count.mockResolvedValue(1);
    await request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({ phone })
      .expect(400);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid phone numbers before sending', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/send-otp')
      .send({ phone: '08012345678' })
      .expect(400);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
