import { Injectable } from '@nestjs/common';
import { MikroTikService } from './mikrotik.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoutersService {
  constructor(
    private prisma: PrismaService,
    private mikrotikService: MikroTikService,
  ) {}

  async applyQoSForHostRouter(hostId: string, sharePercent = 55) {
    const router = await this.prisma.router.findUnique({ where: { hostId } });
    if (!router) {
      throw new Error(`No router found for host ${hostId}`);
    }
    return this.mikrotikService.applyQoS(router.id, sharePercent);
  }

  async enableHotspotForRouter(routerId: string) {
    return this.mikrotikService.enableHotspot(routerId);
  }

  async getRouterStats(routerId: string) {
    return this.mikrotikService.getStats(routerId);
  }

  // Additional basic router CRUD can go here later
}
