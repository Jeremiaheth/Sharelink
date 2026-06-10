import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HostsService } from './hosts.service';
import { CreateHostDto } from './dto/create-host.dto';
import { UpdateHostStatusDto } from './dto/update-host-status.dto';
import { OnboardHostDto } from './dto/onboard-host.dto';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Host } from '@prisma/client';

@Controller('hosts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HostsController {
  constructor(private readonly hostsService: HostsService) {}

  @Post()
  @Roles('ADMIN', 'SUPER_ADMIN', 'HOST')
  async create(@Body() createHostDto: CreateHostDto): Promise<Host> {
    return this.hostsService.createHost(createHostDto);
  }

  @Get('user/:userId')
  @Roles('ADMIN', 'SUPER_ADMIN', 'HOST')
  async findByUserId(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<Host | null> {
    return this.hostsService.findHostByUserId(userId);
  }

  @Patch('user/:userId/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async updateStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() updateStatusDto: UpdateHostStatusDto,
  ): Promise<Host> {
    return this.hostsService.updateHostStatus(userId, updateStatusDto);
  }

  // Basic list for admin
  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN')
  async findAll(): Promise<Host[]> {
    return this.hostsService.findAllHosts();
  }

  /**
   * Start / complete Host onboarding flow.
   * Requires authenticated HOST (or admin).
   * Links ISP, creates/updates Router, ensures Host record + default share_percentage.
   */
  @Post('onboard')
  @HttpCode(HttpStatus.OK)
  @Roles('HOST', 'ADMIN', 'SUPER_ADMIN')
  async onboard(
    @Request() req: { user: { id: string; role: string } },
    @Body() dto: OnboardHostDto,
  ) {
    return this.hostsService.onboardHost(req.user.id, dto);
  }

  /**
   * Earnings dashboard for the authenticated Host.
   * Returns today / this month / total (computed from completed paid non-refunded sessions).
   */
  @Get('earnings')
  @HttpCode(HttpStatus.OK)
  @Roles('HOST', 'ADMIN', 'SUPER_ADMIN')
  async getEarnings(@Request() req: { user: { id: string } }) {
    return this.hostsService.getEarningsSummary(req.user.id);
  }

  /**
   * Host requests a payout from their available earnings.
   * Minimum ₦5,000. Creates a PENDING Payout record linked to the Host.
   * Admin will later approve/process (via Paystack etc.).
   */
  @Post('payouts')
  @HttpCode(HttpStatus.OK)
  @Roles('HOST', 'ADMIN', 'SUPER_ADMIN')
  async requestPayout(
    @Request() req: { user: { id: string } },
    @Body() dto: RequestPayoutDto,
  ) {
    return this.hostsService.requestPayout(req.user.id, dto.amount);
  }
}
