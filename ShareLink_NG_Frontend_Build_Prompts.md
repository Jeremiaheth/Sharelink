# ShareLink NG – Frontend Build Blueprint & LLM Implementation Prompts

**Project:** ShareLink NG Mobile App (iOS + Android)  
**Platform:** React Native (TypeScript)  
**Status:** Backend is complete. Focus is now on building the frontend client.  
**Approach:** Test-Driven Development (TDD) with small, incremental, fully integrated steps.

---

## Build Philosophy

- **Test-Driven Development**: Write failing tests first for logic and critical flows.
- **Incremental Integration**: Every step must result in working, integrated code.
- **Small Steps**: Each prompt should be completable in 2–6 hours.
- **Early Value**: Prioritize getting Host earnings visible and Guest purchase working quickly.
- **No Orphaned Code**: Every new feature must be wired into the existing app.
- **Best Practices**: TypeScript strict mode, clean component structure, proper error handling, and accessibility.

---

## High-Level Phased Blueprint

| Phase | Focus                        | Goal                                      | Est. Duration |
|-------|------------------------------|-------------------------------------------|---------------|
| 0     | Project Setup & Foundations  | Navigation, API client, Authentication    | 1 week        |
| 1     | Host Domain                  | Onboarding, Dashboard, Earnings, Payouts  | 2.5 weeks     |
| 2     | Guest Domain                 | Discovery, Purchase, Session Management   | 2 weeks       |
| 3     | Integrations & Polish        | Paystack, Real-time, Notifications, Error handling | 1.5 weeks |
| 4     | Final Integration & Testing  | End-to-end flows + deployment prep        | 1 week        |

---

## Detailed Step-by-Step LLM Prompts

Each prompt below is designed to be used directly with a code-generation LLM. Follow them in order.

---

### Phase 0: Project Setup & Foundations

#### Prompt 1: Initialize React Native Project + Core Structure

```markdown
**Context:**  
We are building the ShareLink NG mobile app using React Native (TypeScript). The backend is already complete and exposes REST APIs + WebSocket support.

**Task:**  
Initialize a new React Native project with TypeScript and set up a clean folder structure:
- `src/screens`
- `src/components`
- `src/navigation`
- `src/services` (API client)
- `src/hooks`
- `src/context`
- `src/types`
- `src/utils`

Install and configure:
- React Navigation v6
- TypeScript strict mode
- Axios for API calls
- React Query (or TanStack Query) for data fetching
- AsyncStorage + react-native-keychain for secure token storage

**Requirements:**
- Create a clean `App.tsx` with NavigationContainer
- Set up environment variable handling (react-native-config or similar)
- Create a basic API client with Axios interceptors for auth tokens

**Test-Driven Approach:**
- No tests required yet. Focus on clean scaffolding.

**Deliverable:** A well-structured React Native project ready for feature development.
```

#### Prompt 2: Setup Navigation + Authentication Context

```markdown
**Context:**  
We now have the basic project structure.

**Task:**  
Implement navigation and authentication:
- Create a stack navigator with screens: Welcome, Login (OTP), Role Selection, HostDashboard, GuestHome, etc.
- Build an `AuthContext` that manages user token, role (Host/Guest), and login/logout.
- Create protected route logic (redirect unauthenticated users).
- Store JWT securely using react-native-keychain.

**Requirements:**
- Use React Navigation's `createNativeStackNavigator`
- Implement a simple auth flow with dummy OTP verification for now (we'll connect to backend later)
- Add loading states during auth checks

**Test-Driven Approach:**
- Write unit tests for the AuthContext (login, logout, token storage).
- Test that protected screens redirect properly when not authenticated.

**Deliverable:** Working navigation + authentication system with token management.
```

#### Prompt 3: API Client + Backend Integration Layer

```markdown
**Context:**  
The backend is ready. We need a clean way to talk to it.

**Task:**  
Create a robust API service layer:
- Configure Axios with base URL from environment
- Add request/response interceptors for auth tokens and error handling
- Create typed API functions for key endpoints (auth, hosts, sessions, payments)
- Set up React Query hooks for data fetching and mutations

**Requirements:**
- Create `src/services/api.ts`
- Add proper error types and handling
- Create reusable hooks like `useHostProfile`, `useGuestSessions`, etc.

**Test-Driven Approach:**
- Write tests for API client error handling and token attachment.
- Mock API responses and test React Query hooks.

**Deliverable:** Clean, typed API integration layer ready for feature development.
```

---

### Phase 1: Host Domain

#### Prompt 4: Host Onboarding Flow (UI + State)

```markdown
**Context:**  
We now have navigation and API layer.

**Task:**  
Build the Host onboarding screens and logic:
- Multi-step onboarding (ISP selection → Router setup → Bandwidth confirmation)
- Use React Hook Form + Zod for form validation
- Store temporary onboarding state (can use a simple context or Zustand)
- On final step, call backend onboarding API and update user/host status

**Requirements:**
- Create screens: `HostOnboardingStep1`, `HostOnboardingStep2`, etc.
- Add progress indicator
- Handle loading and error states gracefully

**Test-Driven Approach:**
- Write component tests for form validation.
- Write integration test for the final onboarding submission.

**Deliverable:** Fully functional Host onboarding flow integrated with backend.
```

#### Prompt 5: Host Dashboard + Earnings Display

```markdown
**Context:**  
Host onboarding is complete.

**Task:**  
Build the main Host Dashboard:
- Display current earnings (today / this month)
- Show recent guest sessions
- Display router status (Online / Offline)
- Add "Pause Sharing" toggle that calls the backend

**Requirements:**
- Use React Query to fetch earnings and sessions
- Create reusable `EarningsCard` and `SessionListItem` components
- Handle loading and empty states

**Test-Driven Approach:**
- Write tests for earnings calculation display logic.
- Test dashboard rendering with different data states.

**Deliverable:** Working Host Dashboard showing real earnings from backend.
```

#### Prompt 6: Payout Request Feature

```markdown
**Context:**  
Hosts need to be able to request payouts.

**Task:**  
Implement the payout flow:
- Show available balance
- "Request Payout" button (only enabled if balance ≥ ₦5,000)
- Confirmation modal
- Call backend payout request API
- Show payout history list

**Requirements:**
- Add proper validation and user feedback
- Update balance optimistically after successful request

**Test-Driven Approach:**
- Test payout request validation and success/failure states.
- Test that balance updates correctly after payout request.

**Deliverable:** Complete payout request feature integrated with backend.
```

---

### Phase 2: Guest Domain

#### Prompt 7: Map Discovery Screen

```markdown
**Context:**  
We now move to the Guest side.

**Task:**  
Build the main discovery screen for Guests:
- Show interactive map with nearby Hosts and HubSpots (use `react-native-maps`)
- Add list view toggle
- Fetch data from backend `/discover` endpoint
- Show price, estimated speed, and status on pins/items

**Requirements:**
- Handle location permission
- Add loading states and empty state ("No hosts nearby")
- Make pins tappable to go to detail screen

**Test-Driven Approach:**
- Write tests for map component rendering and data fetching.
- Test permission handling flows.

**Deliverable:** Working map/list discovery screen connected to backend.
```

#### Prompt 8: Guest Purchase Flow + Paystack Integration

```markdown
**Context:**  
Discovery is working.

**Task:**  
Build the full purchase experience:
- Pass selection screen (Hourly vs Daily)
- Integrate Paystack for payment
- On successful payment, create session via backend and show voucher
- Display connection instructions

**Requirements:**
- Use official Paystack React Native integration
- Handle payment success, failure, and pending states
- Show voucher code clearly with copy functionality

**Test-Driven Approach:**
- Mock Paystack and test full payment → session creation flow.
- Test error states during payment.

**Deliverable:** End-to-end working purchase flow for Guests.
```

#### Prompt 9: Active Session Management

```markdown
**Context:**  
Payment and session creation are working.

**Task:**  
Build the Active Session screen:
- Large countdown timer
- "Extend Pass" functionality (calls backend + Paystack again)
- Connection quality indicator
- Auto end session when time expires (via polling or WebSocket)

**Requirements:**
- Use real-time updates where possible (Socket.io)
- Handle session expiry gracefully

**Test-Driven Approach:**
- Test timer countdown logic.
- Test extend pass and session expiry flows.

**Deliverable:** Fully functional active session experience.
```

---

### Phase 3: Integrations & Polish

#### Prompt 10: Real-time Updates with Socket.io

```markdown
**Context:**  
We want Hosts to see live updates when guests connect.

**Task:**  
Integrate Socket.io client:
- Connect to backend WebSocket on app start (when authenticated)
- Listen for events like `new_guest_connected`, `session_ended`, `earnings_updated`
- Update relevant screens in real-time (especially Host Dashboard)

**Requirements:**
- Handle connection/disconnection gracefully
- Reconnect automatically on network recovery

**Test-Driven Approach:**
- Mock Socket.io and test event handling.
- Test that dashboard updates in real-time.

**Deliverable:** Real-time updates working across the app.
```

#### Prompt 11: Push Notifications + Error Handling Polish

```markdown
**Context:**  
We need good user communication and robust error handling.

**Task:**  
- Set up push notifications (using Expo Notifications or react-native-firebase)
- Create a global error boundary and toast notification system
- Improve error messages across the app (especially for network and payment failures)

**Requirements:**
- Show useful notifications (e.g., "New guest connected", "Payout completed")
- Consistent error UI patterns

**Test-Driven Approach:**
- Test notification permission flows.
- Test global error handling.

**Deliverable:** Polished error handling and notification system.
```

---

### Phase 4: Final Integration

#### Prompt 12: End-to-End Testing & Final Integration

```markdown
**Context:**  
All major features are built.

**Task:**  
Perform full integration and testing:
- Test complete Host journey: Onboard → See earnings → Request payout
- Test complete Guest journey: Discover → Buy pass → Connect → Extend
- Fix any integration issues between frontend and backend
- Add final error handling and loading states
- Prepare app for internal testing / pilot launch

**Requirements:**
- Create a simple end-to-end testing checklist
- Ensure no broken flows remain

**Deliverable:** A stable, integrated MVP frontend ready for pilot testing.
```

---

## Final Recommendations

- Always run existing tests before starting a new prompt.
- Prefer small, focused components and hooks.
- After each phase, ensure the app can still be built and run.
- Document any backend API changes needed during development.

---

**End of Frontend Build Prompts**

You can now feed these prompts one by one into a code-generation LLM to build the ShareLink NG mobile app in a safe, test-driven, and incremental way.