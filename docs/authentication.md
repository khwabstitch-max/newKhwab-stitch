# Authentication and session lifecycle

The application retains its existing Express/MongoDB account system. Password sign-in and registration issue the same short-lived application JWTs. Optional Google sign-in/linking exchanges a verified Google credential for an application session; ordinary protected routes still use the application JWT. No second identity store, Firebase migration, refresh-token service or default administrator account is introduced.

## Source and trust boundaries

| Responsibility | Source |
|---|---|
| Password validation, bounded hashing, registration/login/logout | `server/src/credentials.js`, `routes-auth.js` |
| JWT issue/verification and current account/role lookup | `server/src/auth.js` |
| Optional Google verification/linking | `server/src/routes-google.js` |
| Password change, one-use recovery/verification and provider capabilities | `server/src/routes-security.js` |
| Token/expiry storage | `client/src/lib/session.js` |
| Session verification and request ordering | `client/src/lib/auth.jsx` |
| Bearer transport and failure classification | `client/src/lib/api.js` |
| Protected-route loading/recovery | `client/src/components/Layout.jsx` |
| Login/registration and validated continuation | `client/src/pages/Public.jsx`, `client/src/lib/continuation.js` |

The backend validates JWT signature, issuer, audience, age/expiry, account existence, disabled status and `authVersion`. It reads the current role from MongoDB; caller-supplied roles or token role claims cannot grant access. Logout/password reset/privilege changes can revoke existing tokens by changing the account version. Passwords use bounded bcrypt input and are not persisted in browser storage or returned by the API.

Only the token and server-provided expiry are retained in this tab's `sessionStorage`. Profile and role are obtained from a verified API response, not restored from persisted browser identity fields. Storage-blocked browsers can use in-memory sessions. Sessions expire after 30 minutes; reloading the profile verifies the existing token and does not extend its expiry or mint a refresh token.

## Recoverable failures and redirects

- Restoring a saved session calls `/me` before rendering a private identity. A retry remains on the protected route with a loading state; it does not redirect to login while verification is pending.
- Network errors, HTTP5xx and malformed gateway failures preserve the saved token. An already verified account keeps its current private form mounted when a profile refresh temporarily fails, with a retry notice. A never-verified saved session remains blocked until verification succeeds.
- A rejected current-password or Google credential (`INVALID_CREDENTIALS` / `INVALID_GOOGLE_TOKEN`) does not invalidate an otherwise valid existing application JWT. The action displays its own error.
- A session-authentication HTTP401 invalidates only the token used by that request. `ACCOUNT_DISABLED`403 also clears that account locally; an ordinary permission403 does not sign the user out.
- A late response from an earlier account or older profile refresh cannot overwrite the latest verified account/profile. Malformed successful account responses remain recoverable errors rather than authenticated identities.
- The login return destination is validated as an internal application route. Signing in returns to the intended draft/review without automatically submitting an order.

The request helper does not retry mutations automatically. It preserves conflict/error codes and reports uncertain mutation timeouts, so the order flow can use its existing idempotency key and explicit Retry action.

## Logout and draft privacy

Logout immediately clears this browser's session/profile and tab-private draft data. It then sends the captured old token to the existing server revocation endpoint, with a bounded timeout. A slow or failed old logout cannot later remove a newer account's local session or newly created private draft. If revocation cannot be confirmed and no newer session has replaced it, the interface explains that local sign-out succeeded while server revocation is uncertain.

The server's existing logout operation revokes the account's current token version, so a truly concurrent same-account sign-in may need to sign in again if it precedes that revocation. No claim of per-device/token revocation or remote success is made after a network failure. Natural expiry and invalid-session recovery preserve the tab's draft for explicit login continuation; explicit logout applies the private-draft cleanup policy. Ordinary nonprivate design choices follow the existing draft-retention policy.

## Verification in this change

Focused frontend tests reproduce the previous failure modes and cover successful registration/restoration, wrong credentials, current-token revocation, late old-token401, stale profile/account responses, expiry, blocked storage, recovery after503, immediate/offline logout, preserved newer draft/account, disabled versus forbidden403, malformed `/me` success, and open-form preservation during failed refresh. API tests also verify a malformed JSON gateway503 keeps its HTTP status and does not clear the session. Login/continuation regression tests use the same application provider.

All new checks use mocked request boundaries through the repository's isolated test runner. No environment files or external accounts were accessed for this work. Optional provider availability, secret values, real inbox delivery, Google origins, deployed CORS and actual hosted authentication were not verified.
