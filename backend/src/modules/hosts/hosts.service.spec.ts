import { Test, TestingModule } from '@nestjs/testing';
import { HostsService } from './hosts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutersService } from '../routers/routers.service';
import { CreateHostDto } from './dto/create-host.dto';
import { UpdateHostStatusDto, HostStatusDto } from './dto/update-host-status.dto';
import { OnboardHostDto } from './dto/onboard-host.dto';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { EarningsCalculator } from './earnings-calculator';
import { HostStatus, SessionStatus, TransactionStatus } from '@prisma/client';

describe('HostsService', () => {
  let service: HostsService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    host: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    guestSession: {
      findMany: jest.fn(),
    },
    payout: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
    router: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    isp: {
      findFirst: jest.fn(),
    },
    iSP: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockRoutersService = {
    applyQoSForHostRouter: jest.fn(),
    enableHotspotForRouter: jest.fn(),
    getRouterStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HostsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RoutersService, useValue: mockRoutersService },
      ],
    }).compile();

    service = module.get<HostsService>(HostsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('createHost', () => {
    it('should create a host linked to an existing user', async () => {
      const dto: CreateHostDto = {
        userId: 'user-123',
        fullName: 'Test Host',
        sharePercentage: 25,
      };

      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.host.findUnique.mockResolvedValue(null); // no existing
      mockPrisma.host.create.mockResolvedValue({
        id: 'host-1',
        userId: 'user-123',
        sharePercentage: 25,
        status: HostStatus.PENDING,
      });

      const result = await service.createHost(dto);

      expect(result).toHaveProperty('id', 'host-1');
      expect(mockPrisma.host.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-123',
            sharePercentage: 25,
            status: HostStatus.PENDING,
          }),
        }),
      );
    });

    it('should throw if user does not exist (FK enforcement)', async () => {
      const dto: CreateHostDto = { userId: 'nonexistent' };
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createHost(dto)).rejects.toThrow('User with id nonexistent not found');
    });

    it('should throw if host already exists for the user (1:1 relation)', async () => {
      const dto: CreateHostDto = { userId: 'user-123' };
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.host.findUnique.mockResolvedValue({ id: 'existing-host' });

      await expect(service.createHost(dto)).rejects.toThrow(
        'Host profile already exists for this user',
      );
    });
  });

  describe('findHostByUserId', () => {
    it('should return host with user relation when found', async () => {
      const mockHost = {
        id: 'host-1',
        userId: 'user-123',
        user: { id: 'user-123', phone: '+234...' },
      };
      mockPrisma.host.findUnique.mockResolvedValue(mockHost);

      const result = await service.findHostByUserId('user-123');

      expect(result).toEqual(mockHost);
      expect(mockPrisma.host.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: { user: { select: { id: true, phone: true, role: true } } },
      });
    });

    it('should return null if no host for user', async () => {
      mockPrisma.host.findUnique.mockResolvedValue(null);
      const result = await service.findHostByUserId('user-999');
      expect(result).toBeNull();
    });
  });

  describe('updateHostStatus', () => {
    it('should update status and isActive flag', async () => {
      const existingHost = { id: 'host-1', userId: 'user-123', status: HostStatus.PENDING };
      mockPrisma.host.findUnique.mockResolvedValue(existingHost);
      mockPrisma.host.update.mockResolvedValue({
        ...existingHost,
        status: HostStatus.ACTIVE,
        isActive: true,
      });

      const dto: UpdateHostStatusDto = { status: HostStatusDto.ACTIVE };
      const result = await service.updateHostStatus('user-123', dto);

      expect(result.status).toBe(HostStatus.ACTIVE);
      expect(result.isActive).toBe(true);
      expect(mockPrisma.host.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: { status: HostStatus.ACTIVE, isActive: true },
      });
    });

    it('should throw NotFound if no host for user', async () => {
      mockPrisma.host.findUnique.mockResolvedValue(null);
      const dto: UpdateHostStatusDto = { status: HostStatusDto.ACTIVE };

      await expect(service.updateHostStatus('user-999', dto)).rejects.toThrow(
        'Host not found for user',
      );
    });
  });

  // ==================== Earnings Calculation Tests ====================

  describe('EarningsCalculator (pure)', () => {
    it('should only count COMPLETED sessions with SUCCESS tx and no REFUNDS', () => {
      const mockSessions = [
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 1000,
          purchasedAt: new Date(),
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
        {
          status: SessionStatus.CANCELLED, // edge case: cancelled
          amountPaid: 500,
          purchasedAt: new Date(),
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 2000,
          purchasedAt: new Date(),
          transactions: [{ status: TransactionStatus.REFUNDED }], // edge case: refunded
        },
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 800,
          purchasedAt: new Date(),
          transactions: [{ status: TransactionStatus.SUCCESS }, { status: TransactionStatus.REFUNDED }],
        },
      ];

      const result = EarningsCalculator.calculateSummary(mockSessions, 55);
      // Only first session qualifies: 0.55 * 1000 = 550
      expect(result.total).toBe(550);
    });

    it('should correctly break down by today and this month', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

      const mockSessions = [
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 1000,
          purchasedAt: now,
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 2000,
          purchasedAt: yesterday,
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 5000,
          purchasedAt: lastMonth,
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
      ];

      const result = EarningsCalculator.calculateSummary(mockSessions, 25, now);
      // 25% of 1000 = 250 today
      // 25% of 1000 + 2000 = 750 this month (yesterday is still this month)
      // total = 250 + 500 + 1250 = 2000
      expect(result.today).toBe(250);
      expect(result.thisMonth).toBe(750);
      expect(result.total).toBe(2000);
    });

    it('should handle decimal amounts and round correctly', () => {
      const session = {
        status: SessionStatus.COMPLETED,
        amountPaid: '1234.56',
        purchasedAt: new Date(),
        transactions: [{ status: TransactionStatus.SUCCESS }],
      };
      const result = EarningsCalculator.calculateSummary([session], 55);
      // 0.55 * 1234.56 = 679.008 -> 679.01
      expect(result.total).toBe(679.01);
    });
  });

  describe('getEarningsSummary', () => {
    it('should return zeros when no host exists for user', async () => {
      mockPrisma.host.findUnique.mockResolvedValue(null);

      const result = await service.getEarningsSummary('user-no-host');
      expect(result).toEqual({
        total: 0,
        today: 0,
        thisMonth: 0,
        currency: 'NGN',
        sharePercentage: 25,
      });
    });

    it('should compute summary from qualifying sessions and sync totalEarnings', async () => {
      const mockHost = {
        id: 'host-1',
        userId: 'user-123',
        sharePercentage: 55,
        totalEarnings: 0,
      };
      const mockSessions = [
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 1000,
          purchasedAt: new Date(),
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
        {
          status: SessionStatus.COMPLETED,
          amountPaid: 2000,
          purchasedAt: new Date(),
          transactions: [{ status: TransactionStatus.SUCCESS }],
        },
      ];

      mockPrisma.host.findUnique.mockResolvedValue(mockHost);
      mockPrisma.guestSession.findMany.mockResolvedValue(mockSessions);
      mockPrisma.host.update.mockResolvedValue({ ...mockHost, totalEarnings: 1650 });

      const result = await service.getEarningsSummary('user-123');

      expect(result.total).toBe(1650); // 0.55 * 3000
      expect(result.sharePercentage).toBe(55);
      expect(mockPrisma.host.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totalEarnings: 1650 },
        }),
      );
    });
  });

  // ==================== Payout Request Tests ====================

  describe('requestPayout', () => {
    it('should throw if host not found', async () => {
      mockPrisma.host.findUnique.mockResolvedValue(null);

      await expect(service.requestPayout('user-no-host', 10000)).rejects.toThrow(
        'Host profile not found for this user',
      );
    });

    it('should throw on minimum amount validation (< 5000)', async () => {
      const mockHost = { id: 'host-1', userId: 'user-123', totalEarnings: 10000 };
      mockPrisma.host.findUnique.mockResolvedValue(mockHost);
      mockPrisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

      await expect(service.requestPayout('user-123', 4000)).rejects.toThrow(
        'Minimum payout amount is ₦5,000',
      );
    });

    it('should throw on insufficient balance (considering pending payouts)', async () => {
      const mockHost = { id: 'host-1', userId: 'user-123', totalEarnings: 10000 };
      mockPrisma.host.findUnique.mockResolvedValue(mockHost);
      mockPrisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 6000 } }); // pending 6000, available 4000

      await expect(service.requestPayout('user-123', 5000)).rejects.toThrow(
        'Insufficient balance',
      );
    });

    it('should create Payout record with status PENDING and correct amount when valid', async () => {
      const mockHost = { id: 'host-1', userId: 'user-123', totalEarnings: 10000 };
      const mockPayout = {
        id: 'payout-1',
        hostId: 'host-1',
        amount: 6000,
        status: 'PENDING',
        currency: 'NGN',
      };

      mockPrisma.host.findUnique.mockResolvedValue(mockHost);
      mockPrisma.payout.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.payout.create.mockResolvedValue(mockPayout);

      const result = await service.requestPayout('user-123', 6000);

      expect(result.payout).toEqual(mockPayout);
      expect(result.availableBefore).toBe(10000);
      expect(result.availableAfter).toBe(4000);
      expect(mockPrisma.payout.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hostId: 'host-1',
          amount: 6000,
          status: 'PENDING',
          currency: 'NGN',
        }),
      });
    });
  });

  // ==================== Onboarding + Router Provisioning Tests ====================

  describe('onboardHost + router provisioning', () => {
    const mockOnboardDto: OnboardHostDto = {
      ispName: 'Spectranet',
      router: {
        ipAddress: '192.168.88.1',
        username: 'admin',
        password: 'test',
        name: 'Test Router',
        model: 'hAP ac^2',
      },
      sharePercentage: 75,
    };

    it('should call router provisioning (applyQoS + enableHotspot) after saving router record', async () => {
      // Setup mocks for user + host creation flow (simplified from existing)
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.host.findUnique.mockResolvedValue(null); // no existing host
      const createdHost = {
        id: 'host-1',
        userId: 'user-123',
        sharePercentage: 75,
        status: HostStatus.PENDING,
      };
      mockPrisma.host.create.mockResolvedValue(createdHost);

      // Router creation
      const createdRouter = { id: 'router-1', hostId: 'host-1' };
      mockPrisma.router = mockPrisma.router || {};
      mockPrisma.router.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.router.create = jest.fn().mockResolvedValue(createdRouter);

      // ISP (note Prisma client exposes as iSP due to model name)
      mockPrisma.iSP.findFirst.mockResolvedValue({ id: 'isp-1', name: 'Spectranet' });
      mockPrisma.iSP.findUnique.mockResolvedValue(null);

      // Provisioning mocks
      mockRoutersService.applyQoSForHostRouter.mockResolvedValue(undefined);
      mockRoutersService.enableHotspotForRouter.mockResolvedValue(undefined);

      await service.onboardHost('user-123', mockOnboardDto);

      expect(mockRoutersService.applyQoSForHostRouter).toHaveBeenCalledWith('host-1', 75);
      expect(mockRoutersService.enableHotspotForRouter).toHaveBeenCalledWith('router-1');
    });

    it('should still complete onboarding even if provisioning fails (and rely on MikroTikService to update router status on error)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-123' });
      mockPrisma.host.findUnique.mockResolvedValue(null);
      const createdHost = { id: 'host-1', userId: 'user-123', sharePercentage: 75, status: HostStatus.PENDING };
      mockPrisma.host.create.mockResolvedValue(createdHost);

      const createdRouter = { id: 'router-1', hostId: 'host-1' };
      mockPrisma.router.findUnique = jest.fn().mockResolvedValue(null);
      mockPrisma.router.create = jest.fn().mockResolvedValue(createdRouter);

      mockPrisma.iSP.findFirst.mockResolvedValue({ id: 'isp-1' });
      mockPrisma.iSP.findUnique.mockResolvedValue(null);

      mockRoutersService.applyQoSForHostRouter.mockRejectedValue(new Error('Connection timeout'));

      const result = await service.onboardHost('user-123', mockOnboardDto);

      expect(result.status).toBe(HostStatus.PENDING);
      expect(result.message).toContain('router configured + provisioned');
      // Provisioning error was caught; router status update is handled inside MikroTikService on connect failure
      expect(mockRoutersService.applyQoSForHostRouter).toHaveBeenCalled();
    });
  });
});
