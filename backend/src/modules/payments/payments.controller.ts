import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Initialize Paystack transaction.
   * Frontend calls this, then redirects user to the returned authorization_url.
   */
  @Post('initialize')
  async initialize(@Body() dto: InitializePaymentDto) {
    return this.paymentsService.initializePayment(dto);
  }

  /**
   * Verify payment (for client after Paystack redirect/callback).
   * Returns the voucher code on success.
   */
  @Get('verify')
  async verify(@Query('reference') reference: string) {
    if (!reference) {
      throw new Error('reference query param is required');
    }
    return this.paymentsService.verifyAndCreateSession(reference);
  }

  /**
   * Paystack Webhook endpoint.
   * IMPORTANT: Use raw body for signature verification.
   * In main.ts you may need to configure raw body parser for this route.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Body() body: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    // Note: For production webhook signature verification to be reliable,
    // configure raw body parsing for this route in main.ts (express.raw).
    // Passing parsed body works for most cases if JSON is not re-stringified.
    return this.paymentsService.handleWebhook(body, signature);
  }
}
