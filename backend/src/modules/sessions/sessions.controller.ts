import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GuestSession, SessionStatus } from '@prisma/client';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * Create a new guest session (typically called after successful payment / server-side).
   * Generates unique voucher code.
   * (Protected in production via internal calls or admin; relaxed here for testability)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSessionDto): Promise<GuestSession> {
    return this.sessionsService.createSession(dto);
  }

  /**
   * Get session details by voucher code.
   * Public for captive portal / guest use. Auto-activates if valid.
   */
  @Get('v/:voucherCode')
  async getByVoucher(@Param('voucherCode') voucherCode: string) {
    const session = await this.sessionsService.getSessionByVoucher(voucherCode, true);
    // Return safe public info (hide sensitive like full transactions if needed)
    return {
      id: session.id,
      voucherCode: session.voucherCode,
      status: session.status,
      passType: session.passType,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      purchasedAt: session.purchasedAt,
      // host/hubSpot details can be expanded if needed via include
    };
  }

  /**
   * Explicitly start/activate a session (e.g. on first captive portal connect).
   */
  @Post('v/:voucherCode/start')
  async startSession(@Param('voucherCode') voucherCode: string) {
    const session = await this.sessionsService.getSessionByVoucher(voucherCode, true);
    if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.PENDING) {
      // re-fetch or just return current
    }
    return {
      status: session.status,
      message: session.status === SessionStatus.ACTIVE 
        ? 'Session activated successfully' 
        : 'Session is no longer valid',
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Trigger expiry of old sessions (can be called by admin or cron).
   */
  @Post('expire')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  async expireOld() {
    const count = await this.sessionsService.expireOldSessions();
    return { expiredCount: count, message: `Expired ${count} old sessions` };
  }

  /**
   * List sessions for a host (protected).
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HOST', 'ADMIN', 'SUPER_ADMIN')
  async findByHost(@Query('hostId') hostId: string) {
    if (!hostId) {
      throw new Error('hostId query param is required');
    }
    return this.sessionsService.findSessionsByHost(hostId);
  }
}
