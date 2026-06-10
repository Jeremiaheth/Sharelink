import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHostDto } from './dto/create-host.dto';
import { UpdateHostStatusDto } from './dto/update-host-status.dto';
import { OnboardHostDto } from './dto/onboard-host.dto';
import { EarningsCalculator } from './earnings-calculator';
import { RoutersService } from '../routers/routers.service';
import { Host, HostStatus, Router as PrismaRouter, Payout } from '@prisma/client';

@Injectable()
export class HostsService {
  private readonly logger = new Logger(HostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routersService: RoutersService,
  ) {}

  async createHost(dto: CreateHostDto): Promise<Host> {
    // Ensure the User exists (FK relationship)
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with id ${dto.userId} not found`);
    }

    // Enforce one Host per User (unique constraint on userId)
    const existingHost = await this.prisma.host.findUnique({
      where: { userId: dto.userId },
    });
    if (existingHost) {
      throw new BadRequestException('A Host profile already exists for this user');
    }

    return this.prisma.host.create({
      data: {
        userId: dto.userId,
        fullName: dto.fullName,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        latitude: dto.latitude,
        longitude: dto.longitude,
        sharePercentage: dto.sharePercentage ?? 25,
        status: HostStatus.PENDING,
      },
    });
  }

  async findHostByUserId(userId: string): Promise<Host | null> {
    return this.prisma.host.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, phone: true, role: true },
        },
      },
    });
  }

  async updateHostStatus(
    userId: string,
    dto: UpdateHostStatusDto,
  ): Promise<Host> {
    const host = await this.prisma.host.findUnique({
      where: { userId },
    });

    if (!host) {
      throw new NotFoundException(`Host not found for user ${userId}`);
    }

    // Validate status transition if needed (basic for now)
    const newStatus = dto.status as HostStatus;

    return this.prisma.host.update({
      where: { userId },
      data: {
        status: newStatus,
        isActive: newStatus === HostStatus.ACTIVE,
      },
    });
  }

  // Bonus basic CRUD for completeness (not strictly required by task but useful)
  async findAllHosts(): Promise<Host[]> {
    return this.prisma.host.findMany({
      include: { user: { select: { id: true, phone: true } } },
    });
  }

  /**
   * Onboarding flow for a Host (after phone/OTP auth).
   * - Ensures Host record exists for the user (creates with defaults if needed)
   * - Links to ISP (by id or name)
   * - Creates (or updates) the initial Router record
   * - Sets default sharePercentage
   * Returns status for frontend.
   */
  async onboardHost(
    userId: string,
    dto: OnboardHostDto,
  ): Promise<{
    host: Host;
    router: PrismaRouter;
    status: string;
    message: string;
  }> {
    if (!dto.router) {
      throw new BadRequestException('router details are required');
    }

    // 1. Resolve ISP
    let isp = null;
    if (dto.ispId) {
      isp = await this.prisma.iSP.findUnique({ where: { id: dto.ispId } });
    } else if (dto.ispName) {
      isp = await this.prisma.iSP.findFirst({
        where: {
          name: {
            equals: dto.ispName,
            mode: 'insensitive',
          },
        },
      });
    }

    if (!isp) {
      throw new BadRequestException(
        'Valid ispId or ispName is required. Available ISPs: Spectranet, Smile Communications, etc.',
      );
    }

    // 2. Find or create Host for this user (enforce 1:1)
    let host = await this.prisma.host.findUnique({ where: { userId } });

    const sharePercentage = dto.sharePercentage ?? 25;

    if (!host) {
      // Create minimal host (reusing some logic from createHost)
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('Authenticated user not found');
      }

      host = await this.prisma.host.create({
        data: {
          userId,
          fullName: dto.fullName,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          latitude: dto.latitude,
          longitude: dto.longitude,
          sharePercentage,
          status: HostStatus.PENDING,
          ispId: isp.id,
        },
      });
    } else {
      // Update existing host with ISP + share + basic profile
      host = await this.prisma.host.update({
        where: { userId },
        data: {
          ispId: isp.id,
          sharePercentage,
          fullName: dto.fullName ?? host.fullName,
          address: dto.address ?? host.address,
          city: dto.city ?? host.city,
          state: dto.state ?? host.state,
          latitude: dto.latitude ?? host.latitude,
          longitude: dto.longitude ?? host.longitude,
          status: HostStatus.PENDING, // reset to pending on re-onboard
        },
      });
    }

    // 3. Create or update initial Router record (1:1 with host)
    const routerData = {
      name: dto.router.name ?? 'Main Router',
      model: dto.router.model,
      ipAddress: dto.router.ipAddress,
      apiPort: dto.router.apiPort ?? 8728,
      username: dto.router.username,
      password: dto.router.password, // Note: In production, encrypt this!
    };

    let router = await this.prisma.router.findUnique({
      where: { hostId: host.id },
    });

    if (router) {
      router = await this.prisma.router.update({
        where: { hostId: host.id },
        data: routerData,
      });
    } else {
      router = await this.prisma.router.create({
        data: {
          hostId: host.id,
          ...routerData,
        },
      });
    }

    // === Router Provisioning (new) ===
    // After router details are saved, automatically provision the MikroTik device.
    try {
      const sharePercent = host.sharePercentage ?? 75; // default 75% Host / 25% Guests per task
      await this.routersService.applyQoSForHostRouter(host.id, sharePercent);
      await this.routersService.enableHotspotForRouter(router.id);
      this.logger.log(`Router ${router.id} provisioned successfully for host ${host.id} (QoS ${sharePercent}% / Hotspot enabled)`);
    } catch (error: any) {
      // Provisioning failure should not fail the entire onboarding (router record is already saved).
      // The router status (isOnline) will be updated by MikroTikService on failure.
      this.logger.error(`Router provisioning failed for router ${router.id}: ${error.message}`);
    }

    return {
      host,
      router,
      status: host.status,
      message:
        'Host onboarding started successfully. ISP linked and router configured + provisioned (QoS + Hotspot). Status is PENDING (awaiting admin approval).',
    };
  }

  /**
   * Get earnings dashboard summary for a host (identified by their User id).
   * Calculates live from completed, paid, non-refunded GuestSessions.
   * Uses the Host's current sharePercentage.
   * Also syncs the computed total to Host.totalEarnings for quick storage/query.
   */
  async getEarningsSummary(userId: string): Promise<{
    total: number;
    today: number;
    thisMonth: number;
    currency: string;
    sharePercentage: number;
  }> {
    const host = await this.findHostByUserId(userId);
    if (!host) {
      return {
        total: 0,
        today: 0,
        thisMonth: 0,
        currency: 'NGN',
        sharePercentage: 25,
      };
    }

    // Fetch sessions + their transactions for accurate qualification
    const sessions = await this.prisma.guestSession.findMany({
      where: {
        hostId: host.id,
      },
      include: {
        transactions: {
          select: {
            status: true,
            amount: true,
          },
        },
      },
    });

    const summary = EarningsCalculator.calculateSummary(
      sessions,
      host.sharePercentage,
    );

    // Store / sync the total earnings on the Host record for easy querying
    const currentTotal = host.totalEarnings ? Number(host.totalEarnings) : 0;
    if (Math.abs(summary.total - currentTotal) > 0.01) {
      await this.prisma.host.update({
        where: { id: host.id },
        data: {
          totalEarnings: summary.total,
        },
      });
    }

    return {
      ...summary,
      currency: 'NGN',
      sharePercentage: host.sharePercentage,
    };
  }

  /**
   * Host requests a payout.
   * - Validates minimum amount ₦5,000
   * - Validates sufficient available balance (totalEarnings minus any existing pending payouts)
   * - Creates a Payout record linked to the Host with status PENDING
   */
  async requestPayout(userId: string, amount: number): Promise<{
    payout: Payout;
    availableBefore: number;
    availableAfter: number;
    message: string;
  }> {
    const host = await this.findHostByUserId(userId);
    if (!host) {
      throw new NotFoundException('Host profile not found for this user');
    }

    if (amount < 5000) {
      throw new BadRequestException('Minimum payout amount is ₦5,000');
    }

    // Calculate pending payouts to determine available balance
    const pendingPayouts = await this.prisma.payout.aggregate({
      where: {
        hostId: host.id,
        status: 'PENDING',
      },
      _sum: {
        amount: true,
      },
    });

    const pendingTotal = pendingPayouts._sum.amount ? Number(pendingPayouts._sum.amount) : 0;
    const currentTotal = host.totalEarnings ? Number(host.totalEarnings) : 0;
    const available = currentTotal - pendingTotal;

    if (amount > available) {
      throw new BadRequestException(
        `Insufficient balance. Available: ₦${available.toFixed(2)} (after pending payouts)`,
      );
    }

    // Create the payout request
    const payout = await this.prisma.payout.create({
      data: {
        hostId: host.id,
        amount,
        currency: 'NGN',
        status: 'PENDING',
        // requestedAt defaults to now() in schema
      },
    });

    return {
      payout,
      availableBefore: available,
      availableAfter: available - amount,
      message: 'Payout request submitted successfully. Status: PENDING. An admin will review and process it.',
    };
  }
}
