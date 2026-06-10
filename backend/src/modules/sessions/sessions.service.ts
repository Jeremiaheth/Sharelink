import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSessionDto, PassTypeDto } from './dto/create-session.dto';
import { GuestSession, SessionStatus, PassType } from '@prisma/client';
import * as crypto from 'crypto';

const VOUCHER_LENGTH = 8; // short and user-friendly
const MAX_GENERATE_ATTEMPTS = 5;

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a short, user-friendly unique voucher code.
   * Format: uppercase letters and digits, no confusing chars.
   */
  private async generateUniqueVoucherCode(): Promise<string> {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid 0,1,I,O
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(VOUCHER_LENGTH);
      for (let i = 0; i < VOUCHER_LENGTH; i++) {
        code += chars[(bytes[i] ?? 0) % chars.length];
      }

      const existing = await this.prisma.guestSession.findUnique({
        where: { voucherCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new Error('Failed to generate unique voucher code after multiple attempts');
  }

  /**
   * Create a new GuestSession after successful payment.
   * Generates voucher, sets times based on passType, status PENDING.
   */
  async createSession(dto: CreateSessionDto): Promise<GuestSession> {
    if (!dto.hostId && !dto.hubSpotId) {
      throw new BadRequestException('Either hostId or hubSpotId is required');
    }

    const voucherCode = await this.generateUniqueVoucherCode();

    const purchasedAt = new Date();
    let expiresAt: Date;

    if (dto.passType === PassTypeDto.HOURLY) {
      expiresAt = new Date(purchasedAt.getTime() + 60 * 60 * 1000); // 1 hour
    } else {
      expiresAt = new Date(purchasedAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    }

    const session = await this.prisma.guestSession.create({
      data: {
        voucherCode,
        hostId: dto.hostId,
        hubSpotId: dto.hubSpotId,
        passType: dto.passType as PassType,
        amountPaid: dto.amountPaid,
        currency: 'NGN',
        purchasedAt,
        expiresAt,
        status: SessionStatus.PENDING,
        guestPhone: dto.guestPhone,
        deviceInfo: dto.deviceInfo,
      },
    });

    return session;
  }

  /**
   * Get session by voucher code. Optionally activates it if PENDING and not expired.
   */
  async getSessionByVoucher(voucherCode: string, autoActivate = true): Promise<GuestSession> {
    const session = await this.prisma.guestSession.findUnique({
      where: { voucherCode },
      include: {
        host: { select: { id: true, fullName: true } },
        hubSpot: { select: { id: true, name: true } },
        transactions: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Invalid or unknown voucher code');
    }

    // Auto-expire check
    if (session.status !== SessionStatus.EXPIRED && new Date() > session.expiresAt) {
      await this.prisma.guestSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.EXPIRED },
      });
      session.status = SessionStatus.EXPIRED;
    }

    // Auto-activate on first use if still valid
    if (autoActivate && session.status === SessionStatus.PENDING && new Date() <= session.expiresAt) {
      const updated = await this.prisma.guestSession.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.ACTIVE,
          startedAt: new Date(),
        },
      });
      return { ...session, ...updated };
    }

    return session;
  }

  /**
   * Manually expire old sessions (can be called periodically or via admin endpoint).
   */
  async expireOldSessions(): Promise<number> {
    const result = await this.prisma.guestSession.updateMany({
      where: {
        status: {
          notIn: [SessionStatus.EXPIRED, SessionStatus.COMPLETED, SessionStatus.CANCELLED],
        },
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: SessionStatus.EXPIRED,
      },
    });

    return result.count;
  }

  /**
   * Update session status (e.g., on disconnect or manual complete).
   */
  async updateSessionStatus(
    voucherCode: string,
    newStatus: SessionStatus,
  ): Promise<GuestSession> {
    const session = await this.prisma.guestSession.findUnique({
      where: { voucherCode },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.guestSession.update({
      where: { voucherCode },
      data: { status: newStatus },
    });
  }

  /**
   * Get sessions for a host (for dashboard).
   */
  async findSessionsByHost(hostId: string): Promise<GuestSession[]> {
    return this.prisma.guestSession.findMany({
      where: { hostId },
      orderBy: { purchasedAt: 'desc' },
    });
  }
}
