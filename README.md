# ShareLink NG

**ISP-agnostic broadband sharing economy platform for Nigeria.**

Fiber subscribers (Hosts) safely monetize excess bandwidth by sharing with neighbors through controlled, QoS-protected access. The platform also supports public HubSpots for time-based paid guest access.

## Features (MVP)

- **Authentication**: Phone number + OTP signup/login with JWT
- **Host Onboarding**: ISP selection + automatic MikroTik router provisioning (Queue Trees + PCQ QoS + Hotspot)
- **Payments**: Paystack integration (transaction initialization, webhook verification with signature validation)
- **Guest Access**: Unique short voucher codes, time-based sessions (hourly/daily), auto-expiry and activation
- **Earnings**: Real-time calculation from completed paid sessions (today / this month / lifetime) with automatic sync to Host balance
- **Payouts**: Hosts can request payouts (minimum ₦5,000) with pending balance tracking

## Tech Stack

- **Backend**: NestJS (TypeScript)
- **Database**: PostgreSQL via Supabase
- **Payments**: Paystack (API + Webhooks)
- **Router Management**: MikroTik RouterOS API (QoS + Hotspot)
- **Testing**: Jest (unit + integration/e2e)

## Project Structure

```
Sharelink/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # Phone OTP + JWT
│   │   │   ├── hosts/          # Onboarding, earnings, payouts
│   │   │   ├── sessions/       # GuestSession + voucher system
│   │   │   ├── payments/       # Paystack integration
│   │   │   ├── routers/        # MikroTikService (QoS + Hotspot)
│   │   │   └── ...
│   │   └── prisma/             # Prisma client + service
│   └── prisma/                 # Schema, migrations, seed
├── ShareLink_NG_Developer_Specification.md
└── README.md
```

## Getting Started (Backend)

```bash
cd backend
cp .env.example .env          # Add your Supabase + Paystack + JWT secrets
npm install
npm run db:migrate            # Apply schema to Supabase
npm run db:seed               # (Optional) Load sample data
npm run start:dev
```

API runs at `http://localhost:3000/api/v1`

### Important Environment Variables
- `DATABASE_URL` — Supabase Postgres connection string (Session Pooler recommended)
- `JWT_SECRET`
- `PAYSTACK_SECRET_KEY` + `PAYSTACK_WEBHOOK_SECRET`
- MikroTik credentials are stored per-router in the database (set during Host onboarding)

## Documentation
- Full Product & Technical Specification: [`ShareLink_NG_Developer_Specification.md`](ShareLink_NG_Developer_Specification.md)

## Current Status
**MVP complete.** The full critical path is implemented and integration-tested:

1. Host authenticates → completes onboarding (ISP + router details)
2. Router is automatically provisioned (QoS rules + Hotspot enabled)
3. Guest pays via Paystack → receives voucher → activates session
4. Host views real-time earnings and can request payouts (≥ ₦5,000)

All major modules (Auth, Hosts, Sessions, Payments, Routers/MikroTik, Earnings, Payouts) are integrated with comprehensive unit and end-to-end tests.

---

Built as a pilot-ready backend for a neutral broadband sharing platform in Nigeria.

### Production OTP delivery

Phone authentication requires a configured Twilio account before a pilot deployment.
Set `NODE_ENV=production`, `OTP_DELIVERY_MODE=twilio`, `OTP_CHANNEL=sms` or
`whatsapp`, `TWILIO_ACCOUNT_SID`, and `WHATSAPP_API_TOKEN` (the account Auth Token).
Set `WHATSAPP_API_URL` to
`https://api.twilio.com/2010-04-01/Accounts/<account-sid>/Messages.json` and
`OTP_FROM` to your registered sender's E.164 phone number. These existing
WhatsApp URL/token variables are used for both channels and now specifically
implement the Twilio Messages API, not an arbitrary provider API.

For WhatsApp, also set `WHATSAPP_CONTENT_SID` to an approved authentication
Content template with variable `1` containing the OTP and text describing the
10-minute expiry. Obtain recipient opt-in and complete provider sender/template
approval before enabling this channel. No automatic channel fallback is used.
See [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource).

Startup fails on missing or invalid delivery configuration in every environment.
Console output requires both `NODE_ENV=development` and
`OTP_DELIVERY_MODE=console`. Never enable it on a shared deployment.
No OTP, token, message payload, or raw provider error is logged by provider mode.
Requests use a 10-second timeout and do not follow redirects or automatically retry.

HTTP 200 means the provider accepted the message for dispatch, not confirmed
handset delivery. Provider errors, timeouts, or malformed acceptance responses
return a sanitized HTTP 503. Failed codes expire immediately; their records
remain for the existing one-minute resend cooldown. The success response retains
its `message` field and `OTP sent successfully` prefix. No schema migration is
needed. OTP generation uses a cryptographic random source.

Before deployment, run a credentialed smoke test to a controlled destination on
each enabled channel and verify receipt. Unit and isolated HTTP-flow tests mock
the provider, so they do not prove live delivery or sender/template approval.
Run `npm test -- --runInBand auth` and
`npm run test:e2e -- --runInBand otp-delivery.e2e-spec.ts` from `backend/`.
