import { Test, TestingModule } from '@nestjs/testing';
import { MikroTikService } from './mikrotik.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock the entire routeros-api module
jest.mock('routeros-api', () => {
  const mockWrite = jest.fn().mockResolvedValue([]);
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockClose = jest.fn().mockResolvedValue(undefined);

  return {
    RouterOSAPI: jest.fn().mockImplementation(() => ({
      connect: mockConnect,
      write: mockWrite,
      close: mockClose,
    })),
  };
});

describe('MikroTikService', () => {
  let service: MikroTikService;
  let prisma: PrismaService;

  const mockPrisma = {
    router: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MikroTikService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MikroTikService>(MikroTikService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();

    // Default router mock
    mockPrisma.router.findUnique.mockResolvedValue({
      id: 'router-1',
      ipAddress: '192.168.88.1',
      apiPort: 8728,
      username: 'admin',
      password: 'testpass',
      hostId: 'host-1',
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('connect', () => {
    it('should connect using router from DB and update online status', async () => {
      const conn = await service.connect('router-1');

      expect(mockPrisma.router.findUnique).toHaveBeenCalledWith({
        where: { id: 'router-1' },
      });
      expect(mockPrisma.router.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'router-1' },
          data: { isOnline: true, lastSeenAt: expect.any(Date) },
        }),
      );
      expect(conn).toBeDefined();
      expect(conn.connect).toHaveBeenCalled();
    });

    it('should handle connection failure and mark router offline', async () => {
      const { RouterOSAPI } = require('routeros-api');
      RouterOSAPI.mockImplementationOnce(() => ({
        connect: jest.fn().mockRejectedValue(new Error('Connection refused')),
        close: jest.fn(),
      }));

      await expect(service.connect('router-1')).rejects.toThrow('MikroTik connection failed');

      expect(mockPrisma.router.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isOnline: false },
        }),
      );
    });
  });

  describe('applyQoS', () => {
    it('should apply Queue Tree + PCQ configuration with host protection', async () => {
      await service.applyQoS('router-1', 55);

      const { RouterOSAPI } = require('routeros-api');
      const mockInstance = RouterOSAPI.mock.results[0].value;

      // Should have called write multiple times for queue types and trees
      expect(mockInstance.write).toHaveBeenCalledWith(
        expect.stringContaining('/queue/type/add'),
        expect.any(Array),
      );
      expect(mockInstance.write).toHaveBeenCalledWith(
        expect.stringContaining('/queue/tree/add'),
        expect.any(Array),
      );
      expect(mockInstance.close).toHaveBeenCalled();
    });
  });

  describe('enableHotspot', () => {
    it('should apply basic Hotspot + captive portal configuration', async () => {
      await service.enableHotspot('router-1');

      const { RouterOSAPI } = require('routeros-api');
      const mockInstance = RouterOSAPI.mock.results[0].value;

      expect(mockInstance.write).toHaveBeenCalledWith(
        expect.stringContaining('/ip/hotspot/profile/add'),
        expect.any(Array),
      );
      expect(mockInstance.write).toHaveBeenCalledWith(
        expect.stringContaining('/ip/hotspot/add'),
        expect.any(Array),
      );
      expect(mockInstance.close).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return router stats including active hotspot users', async () => {
      const { RouterOSAPI } = require('routeros-api');
      RouterOSAPI.mockImplementationOnce(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        write: jest
          .fn()
          .mockResolvedValueOnce([{ '.id': '*1' }]) // hotspot active
          .mockResolvedValueOnce([]), // interfaces
        close: jest.fn().mockResolvedValue(undefined),
      }));

      const stats = await service.getStats('router-1');

      expect(stats.isOnline).toBe(true);
      expect(stats.activeHotspotUsers).toBe(1);
      expect(stats.lastChecked).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('should throw NotFoundException for unknown router', async () => {
      mockPrisma.router.findUnique.mockResolvedValue(null);
      await expect(service.connect('unknown-router')).rejects.toThrow('Router unknown-router not found');
    });
  });
});
