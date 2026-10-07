import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Tokens } from './interfaces/tokens.interface';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OtpDeliveryService } from './otp-delivery.service';

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpDelivery: OtpDeliveryService,
  ) {}

  /**
   * Send OTP to phone number.
   * Uses the configured delivery provider; console requires explicit development mode.
   * Cleans up expired OTPs and limits attempts.
   */
  async sendOtp(dto: SendOtpDto): Promise<{ message: string }> {
    const { phone } = dto;

    // Clean up expired OTPs for this phone
    await this.prisma.otp.deleteMany({
      where: {
        phone,
        expiresAt: { lt: new Date() },
        createdAt: { lt: new Date(Date.now() - 60 * 1000) },
      },
    });

    // Check recent attempts (rate limiting)
    const recentOtps = await this.prisma.otp.count({
      where: {
        phone,
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000), // last 1 minute
        },
      },
    });

    if (recentOtps >= 1) {
      throw new BadRequestException(
        'Please wait before requesting another OTP',
      );
    }

    // Generate 6-digit OTP
    const code = this.generateOtpCode();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP
    const record = await this.prisma.otp.create({
      data: {
        phone,
        code: hashedCode,
        expiresAt,
      },
    });

    // Keep failed attempts for the resend cooldown, but make their codes unusable.
    try {
      await this.otpDelivery.send(phone, code);
    } catch (error) {
      await this.prisma.otp.update({
        where: { id: record.id },
        data: { expiresAt: new Date(0) },
      });
      throw error;
    }

    return {
      message: 'OTP sent successfully. Check your phone.',
    };
  }

  /**
   * Verify OTP and return JWT tokens + user info.
   * Creates user if not exists (phone signup).
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<Tokens & { user: any }> {
    const { phone, otp } = dto;

    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        phone,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('OTP not found or expired');
    }

    // Check attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      await this.prisma.otp.delete({ where: { id: otpRecord.id } });
      throw new UnauthorizedException(
        'Too many failed attempts. Request new OTP.',
      );
    }

    // Verify code
    const isValid = await bcrypt.compare(otp, otpRecord.code);
    if (!isValid) {
      await this.prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP code');
    }

    // OTP valid - delete it
    await this.prisma.otp.delete({ where: { id: otpRecord.id } });

    // Find or create user
    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          role: 'HOST', // default for phone signup
          isPhoneVerified: true,
        },
      });
    } else {
      // Update verification status
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isPhoneVerified: true,
          lastLoginAt: new Date(),
        },
      });
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshTokens(dto: RefreshTokenDto): Promise<Tokens> {
    const { refreshToken } = dto;

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revoked ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old refresh token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Issue new tokens
    return this.generateTokens(storedToken.user);
  }

  /**
   * Generate access + refresh tokens.
   * Stores refresh token in DB for revocation support.
   */
  private async generateTokens(
    user: Pick<User, 'id' | 'phone' | 'role'>,
  ): Promise<Tokens> {
    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    // Generate secure random refresh token
    const refreshTokenPlain = crypto.randomBytes(40).toString('hex');
    const refreshExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    );

    // Store refresh token (plain for simple lookup + revocation)
    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenPlain,
        userId: user.id,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenPlain,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  private generateOtpCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }
}
