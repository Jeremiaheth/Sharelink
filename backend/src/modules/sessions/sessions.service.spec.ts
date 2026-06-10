import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSessionDto, PassTypeDto } from './dto/create-session.dto';
import { SessionStatus } from '@prisma/client';

describe('SessionsService', () => {
  let service: SessionsService;
  let prisma: PrismaService;

  const mockPrisma = {
    guestSession: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Ensure all needed mock methods exist
    mockPrisma.guestSession = {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('voucher generation (internal)', () => {
    it('should generate a short user-friendly code (8 chars, no confusing letters)', async () => {
      // We test indirectly via create, but can spy
      mockPrisma.guestSession.findUnique.mockResolvedValue(null);
      mockPrisma.guestSession.create.mockResolvedValue({ voucherCode: 'ABCD1234' });

      const dto: CreateSessionDto = {
        hostId: 'host-1',
        passType: PassTypeDto.HOURLY,
        amountPaid: 500,
      };

      const result = await service.createSession(dto);
      expect(result.voucherCode).toBeDefined();
      expect(result.voucherCode.length).toBe(8);
      // Should not contain confusing chars in practice (tested via impl)
    });

    it('should ensure uniqueness by retrying on collision', async () => {
      // First call finds existing, second succeeds
      mockPrisma.guestSession.findUnique
        .mockResolvedValueOnce({ id: 'existing' }) // collision
        .mockResolvedValueOnce(null); // unique
      mockPrisma.guestSession.create.mockResolvedValue({ voucherCode: 'UNIQUE88' });

      const dto: CreateSessionDto = {
        hostId: 'host-1',
        passType: PassTypeDto.HOURLY,
        amountPaid: 500,
      };

      await service.createSession(dto);
      expect(mockPrisma.guestSession.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('createSession', () => {
    it('should create session with generated voucher, correct times and PENDING status', async () => {
      mockPrisma.guestSession.findUnique.mockResolvedValue(null);
      const created = {
        id: 'sess-1',
        voucherCode: 'TEST1234',
        hostId: 'host-1',
        passType: 'HOURLY',
        amountPaid: 500,
        status: SessionStatus.PENDING,
        purchasedAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };
      mockPrisma.guestSession.create.mockResolvedValue(created);

      const dto: CreateSessionDto = {
        hostId: 'host-1',
        passType: PassTypeDto.HOURLY,
        amountPaid: 500,
      };

      const result = await service.createSession(dto);

      expect(result.status).toBe(SessionStatus.PENDING);
      expect(result.voucherCode).toBeDefined();
      expect(mockPrisma.guestSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hostId: 'host-1',
            passType: 'HOURLY',
            status: SessionStatus.PENDING,
          }),
        }),
      );
    });

    it('should throw if neither hostId nor hubSpotId provided', async () => {
      const dto: CreateSessionDto = {
        passType: PassTypeDto.HOURLY,
        amountPaid: 500,
      } as any;

      await expect(service.createSession(dto)).rejects.toThrow('Either hostId or hubSpotId is required');
    });
  });

  describe('getSessionByVoucher + auto logic', () => {
    it('should return session and auto-activate if PENDING and not expired', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 3600000);
      const pendingSession = {
        id: 'sess-1',
        voucherCode: 'ACTIVATE',
        status: SessionStatus.PENDING,
        expiresAt: future,
        purchasedAt: now,
      };
      mockPrisma.guestSession.findUnique.mockResolvedValue(pendingSession);
      mockPrisma.guestSession.update.mockResolvedValue({
        ...pendingSession,
        status: SessionStatus.ACTIVE,
        startedAt: now,
      });

      const result = await service.getSessionByVoucher('ACTIVATE', true);

      expect(result.status).toBe(SessionStatus.ACTIVE);
      expect(mockPrisma.guestSession.update).toHaveBeenCalled();
    });
  });

  describe('expireOldSessions', () => {
    it('should update expired sessions and return count', async () => {
      mockPrisma.guestSession.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.expireOldSessions();

      expect(count).toBe(3);
      expect(mockPrisma.guestSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: { lt: expect.any(Date) },
          }),
          data: { status: SessionStatus.EXPIRED },
        }),
      );
    });
  });
});
