# ShareLink NG – Product & Technical Specification (MVP / Pilot)

**Version:** 1.0  
**Date:** June 2026  
**Status:** Ready for Development  
**Pilot Scope:** 1 Lagos estate, 10–20 Hosts + 1–2 Street Hubs

---

## 1. Executive Summary & Vision

ShareLink NG is building a neutral, ISP-agnostic broadband sharing economy platform in Nigeria. The platform enables fiber subscribers (Hosts) to safely monetize excess bandwidth by sharing with neighbors through controlled, QoS-protected access, while also operating public HubSpots for time-based paid access.

**Core Vision:** Create an ecosystem where data is cheap, accessible, and effectively unlimited by leveraging existing fiber infrastructure through a sharing economy model.

**Primary Goal for Pilot:** Prove product-market fit by achieving strong Host earnings, meaningful guest usage, and excellent Host experience (QoS protection).

---

## 2. Success Metrics (Pilot)

Ranked by importance:

1. **Average monthly net earnings per active Host**  
   - Target: ₦80,000 – ₦150,000+  
   - Pivot threshold: Below ₦60,000 average

2. **Total guest usage volume**  
   - Target: 800–1,500+ paid hours per month by Month 3

3. **Host QoS satisfaction & retention**  
   - Target: ≥90% of Hosts report connection as “unaffected”  
   - Target: ≥80% Host retention at Month 3

---

## 3. Business Model & Economics

**Revenue Split (Pilot):**
- **Host:** 55%
- **ShareLink NG:** 25%
- **ISP Partner:** 20%

**Payouts:** Instant via Paystack to OPay, PalmPay, or bank account. Minimum payout threshold: ₦5,000.

**Positioning:** ShareLink NG acts as a neutral technology and marketplace layer on top of existing fiber ISP networks.

---

## 4. MVP Scope Definition

### In Scope (MVP / Pilot)
- Residential Host Sharing (primary focus)
- Host onboarding with MikroTik router provisioning
- Earnings dashboard and payouts for Hosts
- Guest discovery, purchase, and connection flow
- Basic Admin dashboard (early build)
- MikroTik Queue Trees + PCQ QoS (70-80% Host protection)
- Paystack integration for payments and payouts
- Basic notifications (Push + WhatsApp)

### Out of Scope (Phase 2+)
- Advanced Host customization
- Deep real-time ISP integrations
- Advanced analytics
- Mesh networking
- White-label platform

---

## 5. User Roles

- **Host**: Fiber subscriber who shares bandwidth
- **Guest**: Person who buys time-based access
- **Admin**: Operations and pilot management
- **ISP Partner**: Fiber provider (revenue share + ToS support)

---

## 6. Data Model (Core Entities)

### Main Entities
- **User**
- **Host**
- **Router** (MikroTik)
- **GuestSession**
- **Transaction**
- **Payout**
- **ISP**
- **HubSpot**
- **Notification**

**Key Relationships:**
- One User → One Host
- One Host → One Router
- One Host or HubSpot → Many GuestSessions
- One Host → Many Payouts
- GuestSession → Many Transactions

---

## 7. Core User Flows

### Host Onboarding Flow
1. Phone + OTP signup
2. Select ISP and verify
3. Scan MikroTik QR code / auto-configure
4. Confirm default sharing split (75/25)
5. Account approval (manual for pilot)
6. Go live

### Guest Purchase & Connect Flow
1. View nearby Hosts/Hubs on map
2. Select pass (hourly/daily)
3. Pay via Paystack
4. Receive voucher code (App + WhatsApp)
5. Connect via captive portal
6. View session timer + extend option

---

## 8. Technical Architecture

### Recommended Stack
- **Mobile App**: React Native (TypeScript)
- **Backend**: Node.js + NestJS
- **Database**: PostgreSQL (via Supabase)
- **Real-time**: Socket.io
- **Payments**: Paystack
- **Router Management**: MikroTik API + SSH
- **Hosting (Pilot)**: Supabase (Free) + Render/Railway (Free tier)

### Key Integrations
- **MikroTik**: Queue Trees + PCQ for QoS, Hotspot for captive portal + vouchers
- **Paystack**: Payments + instant transfers for Host payouts

---

## 9. High-Level API Structure

**Base URL:** `/api/v1/`

### Main Groups
- **Authentication** (`/auth/*`)
- **Host Management** (`/hosts/*`)
- **Guest/Session Management** (`/sessions/*`, `/discover`)
- **Payments & Payouts** (`/payments/*`, `/payouts/*`)
- **Router Integration** (`/routers/*`) – mostly internal
- **Admin Operations** (`/admin/*`)
- **Notifications** (`/notifications/*`)

---

## 10. Error Handling & Edge Cases

### Principles
- Consistent error response format
- Proper HTTP status codes
- Graceful degradation
- Clear user messages + detailed logging

### Critical Edge Cases
- Router offline / unreachable
- Paystack webhook delays or failures
- Voucher expiry during active session
- Multiple devices attempting to use same voucher
- Host trying to exceed safe sharing limits
- Failed payouts to Host

---

## 11. Non-Functional Requirements

- **Security**: Encrypt sensitive data, secure router access, webhook signature validation
- **Performance**: API responses < 2s (95th percentile)
- **Reliability**: Handle router offline scenarios gracefully
- **Compliance**: NDPR aligned, clear data minimization
- **Cost Efficiency**: Designed to run on free tiers during pilot

---

## 12. Risks & Mitigation

| Risk                              | Mitigation |
|-----------------------------------|----------|
| ISP partnership delays            | Start with cooperative ISPs + clear legal agreements |
| Host experiences slowdown         | Strict QoS enforcement + conservative defaults |
| Low Host earnings                 | Transparent earnings dashboard + fast payouts |
| MikroTik reliability issues       | Health checks, alerts, fallback behavior |
| Regulatory pushback               | Maintain software-layer positioning + pursue NCC Sandbox |

---

## 13. Testing Strategy

| Type                    | Priority | Focus |
|-------------------------|----------|-------|
| End-to-End Testing      | High     | Critical flows (Host onboarding, Guest purchase + connect) |
| Integration Testing     | High     | Paystack + MikroTik flows |
| Usability Testing       | High     | Host onboarding experience |
| Payment Testing         | High     | Success, failure, payout flows |
| MikroTik Testing        | High     | QoS application, captive portal, provisioning |

---

## 14. Deployment & DevOps Plan

- **Backend**: Render.com or Railway (Free tier)
- **Database**: Supabase (Free tier)
- **Mobile App**: EAS Build + TestFlight / Google Play Internal Testing
- **Monitoring**: Sentry (Free) + UptimeRobot
- **CI/CD**: GitHub Actions (basic lint + test checks)

---

## 15. Documentation Requirements

- API Documentation (Swagger/OpenAPI)
- System Architecture Diagram
- MikroTik Configuration Guide
- Host Onboarding Guide (for support)
- Admin Operations Manual
- Error Codes Reference

---

## 16. 12-Week Development Roadmap

| Phase       | Weeks    | Focus                              | Key Outcome                     |
|-------------|----------|------------------------------------|---------------------------------|
| Phase 0     | 1–2      | Foundations                        | Backend + Database ready        |
| Phase 1     | 3–6      | Host Side + Early Admin            | Hosts can earn                  |
| Phase 2     | 7–9      | Guest Experience                   | Guests can buy & connect        |
| Phase 3     | 10–11    | Hardening & Operations             | System stable                   |
| Phase 4     | 12       | Pilot Launch                       | Ready for first 10–20 hosts     |

---

## Appendix

### Glossary
- **Host**: Fiber subscriber sharing bandwidth
- **Guest**: User buying time-based access
- **ShareKit**: MikroTik router provided to Hosts
- **Voucher**: Time-limited access code

### Future Considerations (Post-Pilot)
- Advanced Host controls
- Deeper ISP integrations
- Mesh networking support
- White-label platform offering
- National scaling across multiple cities

---

**Document prepared for developer handoff – June 2026**