import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export function validateOtpConfiguration(env: Record<string, unknown>) {
  const text = (key: string): string =>
    typeof env[key] === 'string' ? env[key] : '';
  const mode = env.OTP_DELIVERY_MODE;
  if (mode === 'console' && env.NODE_ENV === 'development') return env;
  if (mode !== 'twilio') {
    throw new Error(
      'OTP_DELIVERY_MODE must be twilio, or console with NODE_ENV=development',
    );
  }
  const sid = text('TWILIO_ACCOUNT_SID');
  const token = text('WHATSAPP_API_TOKEN');
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid) || !/^[0-9a-fA-F]{32}$/.test(token)) {
    throw new Error(
      'Valid TWILIO_ACCOUNT_SID and WHATSAPP_API_TOKEN are required',
    );
  }
  if (env.WHATSAPP_API_URL !== endpoint) {
    throw new Error(
      'WHATSAPP_API_URL must be the HTTPS Twilio Messages endpoint for this account',
    );
  }
  if (!['sms', 'whatsapp'].includes(text('OTP_CHANNEL'))) {
    throw new Error('OTP_CHANNEL must be sms or whatsapp');
  }
  if (!/^\+[1-9]\d{7,14}$/.test(text('OTP_FROM'))) {
    throw new Error('OTP_FROM must be the registered sender in E.164 format');
  }
  if (
    env.OTP_CHANNEL === 'whatsapp' &&
    !/^HX[0-9a-fA-F]{32}$/.test(text('WHATSAPP_CONTENT_SID'))
  ) {
    throw new Error(
      'WhatsApp requires an approved WHATSAPP_CONTENT_SID authentication template',
    );
  }
  return env;
}

@Injectable()
export class OtpDeliveryService {
  constructor(private readonly config: ConfigService) {
    validateOtpConfiguration(
      Object.fromEntries(
        [
          'NODE_ENV',
          'OTP_DELIVERY_MODE',
          'TWILIO_ACCOUNT_SID',
          'WHATSAPP_API_TOKEN',
          'WHATSAPP_API_URL',
          'OTP_CHANNEL',
          'OTP_FROM',
          'WHATSAPP_CONTENT_SID',
        ].map((key) => [key, this.config.get<string>(key)]),
      ),
    );
  }

  async send(phone: string, code: string): Promise<void> {
    if (this.config.get<string>('OTP_DELIVERY_MODE') === 'console') {
      console.log(`[DEV OTP] Phone: ${phone}, Code: ${code}`);
      return;
    }
    const whatsapp = this.config.get<string>('OTP_CHANNEL') === 'whatsapp';
    const prefix = whatsapp ? 'whatsapp:' : '';
    const body = new URLSearchParams({
      To: `${prefix}${phone}`,
      From: `${prefix}${this.config.getOrThrow<string>('OTP_FROM')}`,
    });
    if (whatsapp) {
      body.set(
        'ContentSid',
        this.config.getOrThrow<string>('WHATSAPP_CONTENT_SID'),
      );
      body.set('ContentVariables', JSON.stringify({ '1': code }));
    } else {
      body.set(
        'Body',
        `Your ShareLink NG OTP is ${code}. It expires in 10 minutes.`,
      );
    }
    try {
      const response = await axios.post<{
        sid?: string;
        status?: string;
        error_code?: number | null;
      }>(this.config.getOrThrow<string>('WHATSAPP_API_URL'), body.toString(), {
        auth: {
          username: this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
          password: this.config.getOrThrow<string>('WHATSAPP_API_TOKEN'),
        },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
        maxRedirects: 0,
        maxContentLength: 65536,
      });
      if (
        response.status !== 201 ||
        !/^SM[0-9a-fA-F]{32}$/.test(response.data?.sid ?? '') ||
        ![
          'accepted',
          'queued',
          'sending',
          'sent',
          'delivered',
          'read',
        ].includes(response.data?.status ?? '') ||
        response.data?.error_code != null
      ) {
        throw new Error('Provider did not accept the message');
      }
    } catch {
      // Never expose provider errors: they can contain credentials and OTP payloads.
      throw new ServiceUnavailableException(
        'OTP delivery is unavailable. Please try again later.',
      );
    }
  }
}
