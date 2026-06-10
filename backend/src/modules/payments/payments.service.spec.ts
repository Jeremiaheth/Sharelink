import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { of } from 'rxjs';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let httpService: HttpService;
  let prisma: PrismaService;
  let sessionsService: SessionsService;

  const mockHttp = {
    axiosRef: {
      post: jest.fn(),
      get: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_xxx';
      if (key === 'PAYSTACK_WEBHOOK_SECRET') return 'whsec_xxx';
      return null;
    }),
  };

  const mockPrisma = {
    transaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockSessions = {
    createSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: HttpService, useValue: mockHttp },
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SessionsService, useValue: mockSessions },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    httpService = module.get<HttpService>(HttpService);
    prisma = module.get<PrismaService>(PrismaService);
    sessionsService = module.get<SessionsService>(SessionsService);

    jest.clearAllMocks();
  });

  describe('initializePayment', () => {
    it('should call Paystack initialize and return auth url + reference', async () => {
      const mockResponse = {
        data: {
          data: {
            authorization_url: 'https://paystack.com/pay/xxx',
            access_code: 'acc_xxx',
            reference: 'ref_123',
          },
        },
      };
      mockHttp.axiosRef.post.mockResolvedValue(mockResponse);

      const result = await service.initializePayment({
        email: 'guest@example.com',
        amount: 500,
        passType: 'HOURLY',
        hostId: 'host-1',
      } as any);

      expect(result.authorization_url).toBe('https://paystack.com/pay/xxx');
      expect(result.reference).toBe('ref_123');
      expect(mockHttp.axiosRef.post).toHaveBeenCalled();
    });
  });

  describe('verifyPayment', () => {
    it('should call Paystack verify', async () => {
      const mockData = { status: 'success', reference: 'ref_123' };
      mockHttp.axiosRef.get.mockResolvedValue({ data: { data: mockData } });

      const result = await service.verifyPayment('ref_123');
      expect(result.status).toBe('success');
    });
  });

  describe('handleWebhook', () => {
    it('should reject invalid signature', async () => {
      const body = { event: 'charge.success', data: { reference: 'ref_123' } };
      const badSig = 'bad-signature';

      await expect(service.handleWebhook(body, badSig)).rejects.toThrow('Invalid signature');
    });

    it('should process charge.success, create session + transaction, return voucher', async () => {
      const secret = 'whsec_xxx';
      const body = {
        event: 'charge.success',
        data: { reference: 'ref_success_123' },
      };

      // Correct signature
      const hash = require('crypto')
        .createHmac('sha512', secret)
        .update(JSON.stringify(body))
        .digest('hex');

      const verifiedData = {
        status: 'success',
        gateway_response: 'Successful',
        reference: 'ref_success_123',
        amount: 50000, // kobo
        paid_at: '2026-01-01T00:00:00Z',
        metadata: { hostId: 'host-1', passType: 'HOURLY' },
      };

      // Mock the internal verifyPayment call (re-verify in webhook)
      jest.spyOn(service as any, 'verifyPayment').mockResolvedValue(verifiedData);
      mockPrisma.transaction.findUnique.mockResolvedValue(null);
      mockSessions.createSession.mockResolvedValue({ id: 'sess-1', voucherCode: 'VOUCHER88' });
      mockPrisma.transaction.create.mockResolvedValue({});

      const result = await service.handleWebhook(body, hash);

      expect(result.success).toBe(true);
      expect(result.voucherCode).toBe('VOUCHER88');
      expect(mockSessions.createSession).toHaveBeenCalled();
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paystackReference: 'ref_success_123',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('should handle already processed transaction (idempotent)', async () => {
      const secret = 'whsec_xxx';
      const body = { event: 'charge.success', data: { reference: 'ref_dup' } };
      const hash = require('crypto').createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');

      jest.spyOn(service as any, 'verifyPayment').mockResolvedValue({ status: 'success' });
      mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'existing' }); // already done

      const result = await service.handleWebhook(body, hash);
      expect(result.success).toBe(true);
      expect(mockSessions.createSession).not.toHaveBeenCalled();
    });
  });
});
