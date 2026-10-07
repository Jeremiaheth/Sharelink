/* eslint-disable @typescript-eslint/unbound-method -- axios.post is a static mocked function. */
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  OtpDeliveryService,
  validateOtpConfiguration,
} from './otp-delivery.service';

jest.mock('axios');
const post = jest.mocked(axios.post);
const sid = `AC${'a'.repeat(32)}`;
const env = {
  NODE_ENV: 'production',
  OTP_DELIVERY_MODE: 'twilio',
  OTP_CHANNEL: 'sms',
  TWILIO_ACCOUNT_SID: sid,
  WHATSAPP_API_TOKEN: 'b'.repeat(32),
  WHATSAPP_API_URL: `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
  OTP_FROM: '+15551234567',
  WHATSAPP_CONTENT_SID: `HX${'c'.repeat(32)}`,
};

describe('OTP delivery', () => {
  let log: jest.SpyInstance;
  beforeEach(() => {
    jest.resetAllMocks();
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('logs only in explicit development console mode', async () => {
    const service = new OtpDeliveryService(
      new ConfigService({
        NODE_ENV: 'development',
        OTP_DELIVERY_MODE: 'console',
      }),
    );
    await service.send('+2348012345678', '123456');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['production', 'test', undefined])(
    'rejects console mode in %s',
    (NODE_ENV) => {
      expect(() =>
        validateOtpConfiguration({ NODE_ENV, OTP_DELIVERY_MODE: 'console' }),
      ).toThrow();
    },
  );

  it.each([
    'OTP_DELIVERY_MODE',
    'TWILIO_ACCOUNT_SID',
    'WHATSAPP_API_TOKEN',
    'WHATSAPP_API_URL',
    'OTP_CHANNEL',
    'OTP_FROM',
  ])('rejects missing %s', (key) => {
    expect(() => validateOtpConfiguration({ ...env, [key]: '' })).toThrow();
  });
  it('rejects unsafe URLs and missing WhatsApp template', () => {
    expect(() =>
      validateOtpConfiguration({
        ...env,
        WHATSAPP_API_URL: 'https://other.example',
      }),
    ).toThrow();
    expect(() =>
      validateOtpConfiguration({
        ...env,
        OTP_CHANNEL: 'whatsapp',
        WHATSAPP_CONTENT_SID: '',
      }),
    ).toThrow();
  });

  it.each(['sms', 'whatsapp'])(
    'submits %s with credentials and no console output',
    async (OTP_CHANNEL) => {
      post.mockResolvedValue({
        status: 201,
        data: {
          sid: `SM${'d'.repeat(32)}`,
          status: 'queued',
          error_code: null,
        },
      });
      await new OtpDeliveryService(
        new ConfigService({ ...env, OTP_CHANNEL }),
      ).send('+2348012345678', '123456');
      const [url, payload, options] = post.mock.calls[0];
      expect(url).toBe(env.WHATSAPP_API_URL);
      const body = new URLSearchParams(payload as string);
      expect(body.get('To')).toBe(
        `${OTP_CHANNEL === 'whatsapp' ? 'whatsapp:' : ''}+2348012345678`,
      );
      expect(body.get('From')).toBe(
        `${OTP_CHANNEL === 'whatsapp' ? 'whatsapp:' : ''}${env.OTP_FROM}`,
      );
      if (OTP_CHANNEL === 'whatsapp') {
        expect(body.get('ContentSid')).toBe(env.WHATSAPP_CONTENT_SID);
        expect(body.get('ContentVariables')).toBe('{"1":"123456"}');
        expect(body.has('Body')).toBe(false);
      } else expect(body.get('Body')).toContain('123456');
      expect(options).toMatchObject({
        auth: { username: sid, password: env.WHATSAPP_API_TOKEN },
        timeout: 10000,
        maxRedirects: 0,
      });
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each(['HTTP rejection', 'timeout', 'network failure'])(
    'sanitizes %s',
    (reason) => {
      post.mockRejectedValue(new Error(`${reason}: secret 123456`));
      return expect(
        new OtpDeliveryService(new ConfigService(env)).send(
          '+2348012345678',
          '123456',
        ),
      ).rejects.toThrow('OTP delivery is unavailable. Please try again later.');
    },
  );
  it.each([
    { status: 201, data: {} },
    { status: 200, data: { sid: `SM${'d'.repeat(32)}`, status: 'queued' } },
    { status: 201, data: { sid: `SM${'d'.repeat(32)}`, status: 'failed' } },
    {
      status: 201,
      data: { sid: `SM${'d'.repeat(32)}`, status: 'queued', error_code: 123 },
    },
  ])('rejects malformed or failed provider acceptance', async (response) => {
    post.mockResolvedValue(response);
    await expect(
      new OtpDeliveryService(new ConfigService(env)).send(
        '+2348012345678',
        '123456',
      ),
    ).rejects.toThrow('OTP delivery is unavailable');
    expect(log).not.toHaveBeenCalled();
  });
});
