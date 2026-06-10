import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly paystackBaseUrl = 'https://api.paystack.co';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  private get secretKey(): string {
    return this.configService.get<string>('PAYSTACK_SECRET_KEY') || '';
  }

  private get webhookSecret(): string {
    return this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET') || this.secretKey;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Initialize a Paystack transaction.
   * Returns data for frontend to redirect user to authorization_url.
   */
  async initializePayment(dto: InitializePaymentDto) {
    const amountInKobo = Math.round(dto.amount * 100);

    const payload = {
      email: dto.email,
      amount: amountInKobo,
      currency: 'NGN',
      metadata: {
        hostId: dto.hostId,
        hubSpotId: dto.hubSpotId,
        passType: dto.passType,
        guestPhone: dto.guestPhone,
        deviceInfo: dto.deviceInfo,
        source: 'sharelink-ng',
      },
      // callback_url can be set here or on dashboard
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.paystackBaseUrl}/transaction/initialize`,
          payload,
          { headers: this.headers },
        ),
      );

      const { data } = response.data;
      this.logger.log(`Paystack initialize successful for ref: ${data.reference}`);

      return {
        authorization_url: data.authorization_url,
        access_code: data.access_code,
        reference: data.reference,
      };
    } catch (error: any) {
      this.logger.error('Paystack initialize failed', error.response?.data || error.message);
      throw new BadRequestException('Failed to initialize payment with Paystack');
    }
  }

  /**
   * Verify a transaction by reference (can be called from client callback or webhook).
   */
  async verifyPayment(reference: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.paystackBaseUrl}/transaction/verify/${reference}`,
          { headers: this.headers },
        ),
      );

      return response.data.data;
    } catch (error: any) {
      this.logger.error('Paystack verify failed', error.response?.data || error.message);
      throw new BadRequestException('Payment verification failed');
    }
  }

  /**
   * Handle Paystack webhook.
   * Verifies signature, processes charge.success, creates session + transaction record.
   */
  async handleWebhook(body: any, signature: string): Promise<{ success: boolean; message: string; voucherCode?: string }> {
    // 1. Verify signature
    const hash = crypto
      .createHmac('sha512', this.webhookSecret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (hash !== signature) {
      this.logger.warn('Invalid Paystack webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    const event = body.event;
    const data = body.data;

    this.logger.log(`Received Paystack webhook: ${event} for ref ${data?.reference}`);

    if (event === 'charge.success') {
      // Re-verify for security (recommended)
      const verified = await this.verifyPayment(data.reference);

      if (verified.status === 'success' && verified.gateway_response === 'Successful') {
        // Idempotency: check if we already processed this reference
        const existingTx = await this.prisma.transaction.findUnique({
          where: { paystackReference: data.reference },
        });

        if (existingTx) {
          this.logger.log(`Transaction ${data.reference} already processed`);
          return { success: true, message: 'Already processed', voucherCode: undefined };
        }

        const metadata = verified.metadata || {};

        // 2. Create the GuestSession (this generates the voucher)
        const session = await this.sessionsService.createSession({
          hostId: metadata.hostId,
          hubSpotId: metadata.hubSpotId,
          passType: metadata.passType,
          amountPaid: verified.amount / 100, // back from kobo
          guestPhone: metadata.guestPhone,
          deviceInfo: metadata.deviceInfo,
        });

        // 3. Record the Transaction
        await this.prisma.transaction.create({
          data: {
            sessionId: session.id,
            amount: verified.amount / 100,
            currency: 'NGN',
            paystackReference: data.reference,
            status: 'SUCCESS',
            paidAt: new Date(verified.paid_at || Date.now()),
            metadata: verified,
          },
        });

        this.logger.log(`Payment success: created session ${session.id} with voucher ${session.voucherCode}`);

        return {
          success: true,
          message: 'Payment processed, session created',
          voucherCode: session.voucherCode,
        };
      }
    } else if (event === 'charge.failed') {
      // Optionally record failed transaction if session was pre-created, but here we create on success
      this.logger.log(`Payment failed for ref ${data.reference}`);
      // Could create a FAILED Transaction here if needed
    }

    return { success: true, message: 'Event received' };
  }

  /**
   * Client-side verify after Paystack redirect.
   * Returns voucher if successful.
   */
  async verifyAndCreateSession(reference: string) {
    const verified = await this.verifyPayment(reference);

    if (verified.status !== 'success') {
      throw new BadRequestException('Payment was not successful');
    }

    // Reuse the same logic as webhook for idempotency and creation
    const result = await this.handleSuccessFromVerify(verified);
    return result;
  }

  private async handleSuccessFromVerify(verified: any) {
    const reference = verified.reference;
    const metadata = verified.metadata || {};

    const existingTx = await this.prisma.transaction.findUnique({
      where: { paystackReference: reference },
    });

    if (existingTx) {
      // Find the session to return voucher
      const session = await this.prisma.guestSession.findFirst({
        where: { transactions: { some: { paystackReference: reference } } },
      });
      return { success: true, voucherCode: session?.voucherCode };
    }

    const session = await this.sessionsService.createSession({
      hostId: metadata.hostId,
      hubSpotId: metadata.hubSpotId,
      passType: metadata.passType,
      amountPaid: verified.amount / 100,
      guestPhone: metadata.guestPhone,
      deviceInfo: metadata.deviceInfo,
    });

    await this.prisma.transaction.create({
      data: {
        sessionId: session.id,
        amount: verified.amount / 100,
        currency: 'NGN',
        paystackReference: reference,
        status: 'SUCCESS',
        paidAt: new Date(verified.paid_at || Date.now()),
        metadata: verified,
      },
    });

    return {
      success: true,
      message: 'Payment verified and session created',
      voucherCode: session.voucherCode,
      sessionId: session.id,
    };
  }
}
