/**
 * Prisma Seed Script for ShareLink NG
 *
 * Usage:
 *   npx prisma db seed
 *   or
 *   npm run db:seed
 *
 * This script is safe to run multiple times (idempotent where possible).
 */

import { PrismaClient, Role, HostStatus, PassType, SessionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed ISPs (common Nigerian fiber providers for pilot)
  const spectranet = await prisma.iSP.upsert({
    where: { name: 'Spectranet' },
    update: {},
    create: {
      name: 'Spectranet',
      revenueSharePercent: 0.2,
    },
  });

  const smile = await prisma.iSP.upsert({
    where: { name: 'Smile Communications' },
    update: {},
    create: {
      name: 'Smile Communications',
      revenueSharePercent: 0.2,
    },
  });

  console.log(`✓ Seeded ISPs: ${spectranet.name}, ${smile.name}`);

  // 2. Seed a test Admin user
  const admin = await prisma.user.upsert({
    where: { phone: '+2348012345678' },
    update: { role: Role.SUPER_ADMIN },
    create: {
      phone: '+2348012345678',
      name: 'ShareLink Admin',
      role: Role.SUPER_ADMIN,
      isPhoneVerified: true,
    },
  });

  console.log(`✓ Seeded Admin user: ${admin.phone}`);

  // 3. Seed a sample Host user + Host profile (for local development)
  const hostUser = await prisma.user.upsert({
    where: { phone: '+2348098765432' },
    update: {},
    create: {
      phone: '+2348098765432',
      name: 'Chinedu Okoro',
      role: Role.HOST,
      isPhoneVerified: true,
    },
  });

  const host = await prisma.host.upsert({
    where: { userId: hostUser.id },
    update: {},
    create: {
      userId: hostUser.id,
      ispId: spectranet.id,
      fullName: 'Chinedu Okoro',
      address: '15 Adeniran Ogunsanya Street',
      city: 'Surulere',
      state: 'Lagos',
      latitude: 6.4894,
      longitude: 3.3578,
      sharePercentage: 25,
      status: HostStatus.ACTIVE,
      isActive: true,
      totalEarnings: 125000.75,
    },
  });

  console.log(`✓ Seeded sample Host: ${host.fullName} (${hostUser.phone})`);

  // 4. Seed a sample Router for the host
  await prisma.router.upsert({
    where: { hostId: host.id },
    update: {},
    create: {
      hostId: host.id,
      name: 'Main House Router',
      model: 'MikroTik hAP ac³',
      ipAddress: '192.168.88.1',
      apiPort: 8728,
      username: 'admin',
      password: 'demo-router-pass-change-me', // NEVER use real passwords in seed
    },
  });

  console.log('✓ Seeded sample Router for Host');

  // 5. Optional: Seed a sample expired GuestSession + Transaction (for testing reports)
  const sampleSession = await prisma.guestSession.upsert({
    where: { voucherCode: 'DEMO-HOUR-001' },
    update: {},
    create: {
      voucherCode: 'DEMO-HOUR-001',
      hostId: host.id,
      passType: PassType.HOURLY,
      amountPaid: 500,
      currency: 'NGN',
      purchasedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2.5),
      expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 1.5),
      status: SessionStatus.EXPIRED,
      dataUsedMb: 420,
      guestPhone: '+2347011122233',
    },
  });

  await prisma.transaction.upsert({
    where: { paystackReference: 'ps_demo_tx_001' },
    update: {},
    create: {
      sessionId: sampleSession.id,
      amount: 500,
      currency: 'NGN',
      paystackReference: 'ps_demo_tx_001',
      status: 'SUCCESS',
      paidAt: sampleSession.purchasedAt,
    },
  });

  console.log('✓ Seeded sample GuestSession + Transaction');

  console.log('\n✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
