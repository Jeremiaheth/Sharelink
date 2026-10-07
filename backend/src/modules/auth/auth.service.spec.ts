import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpDeliveryService } from './otp-delivery.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    otp: {
      deleteMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-access-token'),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  const delivery = { send: jest.fn() };

  beforeEach(async () => {
    delivery.send.mockReset().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: OtpDeliveryService, useValue: delivery },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('sendOtp', () => {
    it('should generate and store a hashed OTP', async () => {
      const dto: SendOtpDto = { phone: '+2348012345678' };
      mockPrisma.otp.deleteMany.mockResolvedValue({});
      mockPrisma.otp.count.mockResolvedValue(0);
      mockPrisma.otp.create.mockResolvedValue({ id: 'otp-1' });

      const result = await service.sendOtp(dto);

      expect(result.message).toContain('OTP sent successfully');
      expect(mockPrisma.otp.create).toHaveBeenCalled();
      const createArgs = mockPrisma.otp.create.mock.calls[0] as [
        { data: { phone: string; code: string; expiresAt: Date } },
      ];
      const createCall = createArgs[0].data;
      expect(createCall.phone).toBe(dto.phone);
      expect(createCall.code).toBeDefined(); // hashed
      expect(createCall.expiresAt).toBeInstanceOf(Date);
      const [, code] = delivery.send.mock.calls[0] as [string, string];
      expect(await bcrypt.compare(code, createCall.code)).toBe(true);
    });

    it('invalidates failed delivery while preserving cooldown', async () => {
      mockPrisma.otp.count.mockResolvedValue(0);
      mockPrisma.otp.create.mockResolvedValue({ id: 'failed-otp' });
      delivery.send.mockRejectedValue(new Error('delivery unavailable'));
      await expect(
        service.sendOtp({ phone: '+2348012345678' }),
      ).rejects.toThrow('delivery unavailable');
      expect(mockPrisma.otp.update).toHaveBeenCalledWith({
        where: { id: 'failed-otp' },
        data: { expiresAt: new Date(0) },
      });
      expect(mockPrisma.otp.deleteMany).toHaveBeenCalledWith({
        where: {
          phone: '+2348012345678',
          expiresAt: { lt: expect.any(Date) as Date },
          createdAt: { lt: expect.any(Date) as Date },
        },
      });
    });

    it('should throw if rate limited (recent OTP)', async () => {
      const dto: SendOtpDto = { phone: '+2348012345678' };
      mockPrisma.otp.deleteMany.mockResolvedValue({});
      mockPrisma.otp.count.mockResolvedValue(1);

      await expect(service.sendOtp(dto)).rejects.toThrow(
        'Please wait before requesting another OTP',
      );
      expect(delivery.send).not.toHaveBeenCalled();
      expect(mockPrisma.otp.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('should verify valid OTP, create user if needed, and return tokens', async () => {
      const dto: VerifyOtpDto = { phone: '+2348012345678', otp: '123456' };
      const hashedCode = await bcrypt.hash('123456', 10);

      mockPrisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        phone: dto.phone,
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
      });
      mockPrisma.otp.delete.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(null); // new user
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        phone: dto.phone,
        role: 'HOST',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.verifyOtp(dto);

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect((result.user as { phone: string }).phone).toBe(dto.phone);
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw on invalid OTP', async () => {
      const dto: VerifyOtpDto = { phone: '+2348012345678', otp: 'wrong' };
      const hashedCode = await bcrypt.hash('123456', 10);

      mockPrisma.otp.findFirst.mockResolvedValue({
        id: 'otp-1',
        code: hashedCode,
        expiresAt: new Date(Date.now() + 60000),
        attempts: 0,
      });
      mockPrisma.otp.update.mockResolvedValue({});

      await expect(service.verifyOtp(dto)).rejects.toThrow('Invalid OTP code');
    });
  });

  describe('refreshTokens', () => {
    it('should issue new tokens and revoke old refresh token', async () => {
      const dto = { refreshToken: 'valid-refresh' };
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'valid-refresh',
        revoked: false,
        expiresAt: new Date(Date.now() + 86400000),
        user: { id: 'user-1', phone: '+234...', role: 'HOST' },
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens(dto);

      expect(result.accessToken).toBeDefined();
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revoked: true } }),
      );
    });
  });
});
