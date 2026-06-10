-- ShareLink NG - Initial Migration
-- Generated for Prisma schema (PostgreSQL)
-- Run with: npx prisma migrate dev  (when you have a live DATABASE_URL)

-- ==========================================
-- Enums
-- ==========================================

CREATE TYPE "Role" AS ENUM ('HOST', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "HostStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PassType" AS ENUM ('HOURLY', 'DAILY');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- ==========================================
-- Tables
-- ==========================================

-- users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'HOST',
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- isps
CREATE TABLE "isps" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revenueSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "isps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "isps_name_key" ON "isps"("name");

-- hosts
CREATE TABLE "hosts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ispId" TEXT,
    "fullName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "revenueShare" DOUBLE PRECISION NOT NULL DEFAULT 0.55,
    "status" "HostStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "totalEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hosts_userId_key" ON "hosts"("userId");
CREATE INDEX "hosts_status_idx" ON "hosts"("status");
CREATE INDEX "hosts_ispId_idx" ON "hosts"("ispId");
CREATE INDEX "hosts_latitude_longitude_idx" ON "hosts"("latitude", "longitude");

-- routers
CREATE TABLE "routers" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT,
    "model" TEXT,
    "ipAddress" TEXT NOT NULL,
    "apiPort" INTEGER NOT NULL DEFAULT 8728,
    "username" TEXT NOT NULL DEFAULT 'admin',
    "password" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "routers_hostId_key" ON "routers"("hostId");

-- hub_spots
CREATE TABLE "hub_spots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hub_spots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hub_spots_latitude_longitude_idx" ON "hub_spots"("latitude", "longitude");

-- guest_sessions
CREATE TABLE "guest_sessions" (
    "id" TEXT NOT NULL,
    "voucherCode" VARCHAR(20) NOT NULL,
    "hostId" TEXT,
    "hubSpotId" TEXT,
    "passType" "PassType" NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "dataUsedMb" INTEGER DEFAULT 0,
    "guestPhone" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_sessions_voucherCode_key" ON "guest_sessions"("voucherCode");
CREATE INDEX "guest_sessions_status_expiresAt_idx" ON "guest_sessions"("status", "expiresAt");
CREATE INDEX "guest_sessions_hostId_idx" ON "guest_sessions"("hostId");
CREATE INDEX "guest_sessions_voucherCode_idx" ON "guest_sessions"("voucherCode");

-- transactions
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paystackReference" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transactions_paystackReference_key" ON "transactions"("paystackReference");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");
CREATE INDEX "transactions_paystackReference_idx" ON "transactions"("paystackReference");

-- payouts
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "paystackTransferCode" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payouts_paystackTransferCode_key" ON "payouts"("paystackTransferCode");
CREATE INDEX "payouts_hostId_status_idx" ON "payouts"("hostId", "status");

-- notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");
CREATE INDEX "notifications_phone_idx" ON "notifications"("phone");

-- ==========================================
-- Foreign Keys
-- ==========================================

ALTER TABLE "hosts" ADD CONSTRAINT "hosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_ispId_fkey" FOREIGN KEY ("ispId") REFERENCES "isps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "routers" ADD CONSTRAINT "routers_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_sessions" ADD CONSTRAINT "guest_sessions_hubSpotId_fkey" FOREIGN KEY ("hubSpotId") REFERENCES "hub_spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
