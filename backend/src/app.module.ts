import { validateOtpConfiguration } from './modules/auth/otp-delivery.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HostsModule } from './modules/hosts/hosts.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RoutersModule } from './modules/routers/routers.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Global configuration - loads .env and makes ConfigService available app-wide
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
      validate: validateOtpConfiguration,
    }),
    // Database layer (global - PrismaService available everywhere)
    PrismaModule,
    AuthModule,
    UsersModule,
    HostsModule,
    SessionsModule,
    PaymentsModule,
    RoutersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
