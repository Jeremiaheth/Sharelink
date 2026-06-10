import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Router } from '@prisma/client';
import { RouterOSAPI } from 'routeros-api';

export interface MikroTikConfig {
  host: string;
  user: string;
  password: string;
  port?: number;
}

export interface RouterStats {
  isOnline: boolean;
  activeHotspotUsers: number;
  bandwidthUsage?: {
    rx: number;
    tx: number;
  };
  queues?: any[];
  lastChecked: Date;
}

@Injectable()
export class MikroTikService {
  private readonly logger = new Logger(MikroTikService.name);
  private connections: Map<string, RouterOSAPI> = new Map(); // Simple connection cache per router

  constructor(private prisma: PrismaService) {}

  /**
   * Load router config from DB.
   */
  private async loadRouter(routerId: string): Promise<Router> {
    const router = await this.prisma.router.findUnique({
      where: { id: routerId },
    });
    if (!router) {
      throw new NotFoundException(`Router ${routerId} not found`);
    }
    return router;
  }

  /**
   * Create and connect to a MikroTik router.
   * Returns a connected RouterOSAPI instance.
   */
  async connect(routerIdOrConfig: string | MikroTikConfig): Promise<RouterOSAPI> {
    let config: MikroTikConfig;
    let routerId: string | null = null;

    if (typeof routerIdOrConfig === 'string') {
      routerId = routerIdOrConfig;
      const router = await this.loadRouter(routerId);
      config = {
        host: router.ipAddress,
        user: router.username,
        password: router.password,
        port: router.apiPort || 8728,
      };
    } else {
      config = routerIdOrConfig;
    }

    const conn = new RouterOSAPI({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port || 8728,
      timeout: 10, // seconds
    });

    try {
      await conn.connect();
      this.logger.log(`Connected to MikroTik at ${config.host}`);

      if (routerId) {
        // Update online status
        await this.prisma.router.update({
          where: { id: routerId },
          data: { isOnline: true, lastSeenAt: new Date() },
        });
        this.connections.set(routerId, conn);
      }

      return conn;
    } catch (error: any) {
      this.logger.error(`Failed to connect to MikroTik ${config.host}: ${error.message}`);
      if (routerId) {
        await this.prisma.router.update({
          where: { id: routerId },
          data: { isOnline: false },
        });
      }
      throw new Error(`MikroTik connection failed: ${error.message}`);
    }
  }

  /**
   * Close connection for a router.
   */
  async disconnect(routerId: string): Promise<void> {
    const conn = this.connections.get(routerId);
    if (conn) {
      try {
        await conn.close();
      } catch (e) {
        this.logger.warn(`Error closing connection for ${routerId}`);
      }
      this.connections.delete(routerId);
    }
  }

  /**
   * Apply Queue Trees + PCQ for bandwidth sharing / Host protection.
   * This is a simplified but functional implementation based on the spec (70-80% host protection).
   */
  async applyQoS(routerId: string, hostSharePercent: number = 55, totalDownloadKbps = 100000, totalUploadKbps = 20000): Promise<void> {
    const conn = await this.connect(routerId);

    try {
      const hostLimitDown = Math.floor(totalDownloadKbps * (hostSharePercent / 100));
      const hostLimitUp = Math.floor(totalUploadKbps * (hostSharePercent / 100));
      const guestLimitDown = totalDownloadKbps - hostLimitDown;
      const guestLimitUp = totalUploadKbps - hostLimitUp;

      // 1. Create PCQ types (if not exist)
      await this.writeSafe(conn, '/queue/type/add', [
        '=name=pcq-download',
        '=kind=pcq',
        '=pcq-rate=0',
        '=pcq-limit=50',
        '=pcq-classifier=dst-address',
      ]);

      await this.writeSafe(conn, '/queue/type/add', [
        '=name=pcq-upload',
        '=kind=pcq',
        '=pcq-rate=0',
        '=pcq-limit=50',
        '=pcq-classifier=src-address',
      ]);

      // 2. Main Queue Tree for the WAN interface (simplified - assume ether1-wan or configurable)
      // const wanInterface = 'ether1'; // TODO: make configurable per router - used in future NAT/hotspot rules

      // Parent queue for total limit
      await this.writeSafe(conn, '/queue/tree/add', [
        `=name=total-download`,
        `=parent=global`,
        `=queue=pcq-download`,
        `=limit-at=${totalDownloadKbps}k`,
        `=max-limit=${totalDownloadKbps}k`,
      ]);

      await this.writeSafe(conn, '/queue/tree/add', [
        `=name=total-upload`,
        `=parent=global`,
        `=queue=pcq-upload`,
        `=limit-at=${totalUploadKbps}k`,
        `=max-limit=${totalUploadKbps}k`,
      ]);

      // Host protected queue (higher priority / guaranteed)
      await this.writeSafe(conn, '/queue/tree/add', [
        `=name=host-download`,
        `=parent=total-download`,
        `=queue=default`,
        `=limit-at=${hostLimitDown}k`,
        `=max-limit=${Math.floor(totalDownloadKbps * 0.9)}k`, // 90% cap to leave headroom
        `=priority=1`,
      ]);

      await this.writeSafe(conn, '/queue/tree/add', [
        `=name=host-upload`,
        `=parent=total-upload`,
        `=queue=default`,
        `=limit-at=${hostLimitUp}k`,
        `=max-limit=${Math.floor(totalUploadKbps * 0.9)}k`,
        `=priority=1`,
      ]);

      // Guest / shared queue (lower priority)
      await this.writeSafe(conn, '/queue/tree/add', [
        `=name=guests-download`,
        `=parent=total-download`,
        `=queue=pcq-download`,
        `=limit-at=${guestLimitDown}k`,
        `=max-limit=${totalDownloadKbps}k`,
        `=priority=8`,
      ]);

      await this.writeSafe(conn, '/queue/tree/add', [
        `=name=guests-upload`,
        `=parent=total-upload`,
        `=queue=pcq-upload`,
        `=limit-at=${guestLimitUp}k`,
        `=max-limit=${totalUploadKbps}k`,
        `=priority=8`,
      ]);

      this.logger.log(`Applied QoS (Queue Tree + PCQ) for router ${routerId} with ${hostSharePercent}% host share`);
    } finally {
      await this.disconnect(routerId);
    }
  }

  /**
   * Enable and basic configure Hotspot with captive portal support.
   * This sets up the basics; voucher integration can be done via user profiles or IP bindings.
   */
  async enableHotspot(routerId: string, lanInterface = 'bridge', wanInterface = 'ether1'): Promise<void> {
    const conn = await this.connect(routerId);

    try {
      // Basic Hotspot setup (idempotent where possible using /add or /set)
      // 1. Hotspot server profile
      await this.writeSafe(conn, '/ip/hotspot/profile/add', [
        `=name=sharelink-hotspot`,
        `=hotspot-address=10.5.50.1`,
        `=dns-name=hotspot.sharelink.local`,
        `=login-by=cookie,http-chap,http-pap,mac`, // support multiple auth methods
      ]);

      // 2. Add Hotspot server on LAN interface
      await this.writeSafe(conn, '/ip/hotspot/add', [
        `=name=sharelink-hotspot`,
        `=interface=${lanInterface}`,
        `=profile=sharelink-hotspot`,
        `=address-pool=hotspot-pool`,
        `=disabled=no`,
      ]);

      // 3. Walled garden for free access (optional: your own portal, Paystack, etc.)
      await this.writeSafe(conn, '/ip/hotspot/walled-garden/add', [
        `=dst-host=*.paystack.com`,
        `=action=allow`,
      ]);

      // 4. Basic IP pool (if not exists)
      await this.writeSafe(conn, '/ip/pool/add', [
        `=name=hotspot-pool`,
        `=ranges=10.5.50.10-10.5.50.254`,
      ]);

      // 5. NAT for guests (masquerade)
      await this.writeSafe(conn, '/ip/firewall/nat/add', [
        `=chain=srcnat`,
        `=out-interface=${wanInterface}`,
        `=src-address=10.5.50.0/24`,
        `=action=masquerade`,
      ]);

      this.logger.log(`Hotspot + captive portal basics enabled on router ${routerId}`);
    } finally {
      await this.disconnect(routerId);
    }
  }

  /**
   * Read basic router stats.
   */
  async getStats(routerId: string): Promise<RouterStats> {
    const conn = await this.connect(routerId);
    const stats: RouterStats = {
      isOnline: true,
      activeHotspotUsers: 0,
      lastChecked: new Date(),
    };

    try {
      // Hotspot active users
      const activeUsers = await conn.write('/ip/hotspot/active/print');
      stats.activeHotspotUsers = activeUsers.length || 0;

      // Simple interface traffic (example - first interface)
      const interfaces = await conn.write('/interface/print', ['?name=ether1']);
      if (interfaces.length > 0) {
        // For real stats, you'd use /interface/monitor-traffic (streaming)
        // Here we just note the interface exists
        stats.bandwidthUsage = { rx: 0, tx: 0 }; // Placeholder - implement monitor if needed
      }

      // Queue stats (simplified)
      const queues = await conn.write('/queue/tree/print', ['?name=total-download']);
      stats.queues = queues;

      return stats;
    } catch (error: any) {
      stats.isOnline = false;
      this.logger.error(`Error getting stats for ${routerId}: ${error.message}`);
      return stats;
    } finally {
      await this.disconnect(routerId);
    }
  }

  /**
   * Helper to safely write commands (many /add are not strictly idempotent, so we often just run them).
   */
  private async writeSafe(conn: RouterOSAPI, path: string, params: string[] = []): Promise<any> {
    try {
      return await conn.write(path, params);
    } catch (error: any) {
      // Some commands fail if entry already exists — this is common and often safe to ignore for setup
      if (error.message?.includes('already have') || error.message?.includes('failure')) {
        this.logger.debug(`Safe ignore on ${path}: ${error.message}`);
        return [];
      }
      throw error;
    }
  }

}
