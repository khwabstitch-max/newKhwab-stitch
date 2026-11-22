# High-level design

Updated 2026-11-10 for the owner's explicit GitHub + Vercel deployment target. This document describes current repository architecture, not a production deployment or fresh provider verification. [Project status](project-status.md), the [requirement matrix](requirement-matrix.md), [verification](review-verification.md) and [production readiness](production-readiness.md) distinguish implementation from configuration. Previous Render deployment instructions are superseded for the current rollout; the standalone entry remains for compatibility. Use [Vercel deployment](deployment-vercel.md).

## System shape

Khwab Stitch is a React/Vite frontend and an Express modular monolith using Mongoose/MongoDB. GitHub is the intended source and Vercel serves the built frontend plus one Node serverless API entry. `vercel.json` routes `/api` and health requests to `api/index.js`; filesystem assets are resolved before the React SPA fallback. MongoDB and ImageKit provide durable business and image storage. The API owns authorization, validation, availability, prices, transactions and state changes. Browser state is never authoritative for roles, ownership or money.

```mermaid
flowchart LR
  Customer[Customer browser / React] -->|HTTPS REST and application Bearer JWT| API[Express / Vercel Node function]
  Admin[Authorized admin browser / React] -->|Same API and current database role| API
  API -->|Transactions and ownership| DB[(MongoDB)]
  API -->|Validated public/private image bytes| IK[ImageKit]
  API -->|Optional Google credential verification| Google[Google fixed public-key endpoint]
  API -->|Optional one-use action email| Mail[Resend]
  Source[GitHub reviewed source] --> Static[Vercel static Vite dist]
  Source --> API
  Static --> Customer
  Static --> Admin
```

Frontend routes are grouped into public catalogue, request configuration, customer account/order, worker and administrator areas. Shared styling and reusable option cards/dialogs apply across the existing brand identity. Fonts use local/system fallbacks rather than a new external font dependency. English/Hindi presentation changes labels and optional authored content, not API enums, ownership or submitted values.

The frontend API base is build-time public configuration. Database credentials, JWT signing material, ImageKit private credentials and mail credentials are server-only. Use independent credentials, databases, storage configuration and origins per environment.

## Domain boundaries

| Boundary | Responsibility and principal implementation |
|---|---|
| Authentication | Local accounts, password hashing, short-lived JWTs, current-user/role checks; optional Google subject linking and emailed actions. `auth.js`, `credentials.js`, `routes-auth.js`, `routes-google.js`, `routes-security.js` |
| Public catalogue | Published designs, compatible active options, settings and matched published guides. `routes-public.js`, `visual-catalogue.js` |
| Trusted pricing | Current catalogue defaults, independent component adjustments, zero sleeve-length fee, pending work, transport legs and configuration fingerprint. `pricing.js` |
| Drafts and submission | Owned versioned drafts, explicit submission, reference validation, retry keys and immutable request/estimate snapshots. `routes-drafts.js`, `routes-orders.js` |
| Order operations | Versioned quotes, fresh customer acceptance, production transitions and separately attributable logistics facts. `routes-admin.js`, `domain.js` |
| Account and care | Profiles, measurement profiles, contextual conversations, assistance/complaints and customer-accepted draft proposals. Account/support/proposal route modules |
| Approved work | Applications, separate worker/assistance capabilities, individual assignments and restricted job projections. `routes-workers.js` |
| Visual administration | Option/guide CRUD, publication/archive/reference checks, images and provenance. `routes-admin.js`, `visual-catalogue.js` |
| Media | Authenticated validation/upload, provider metadata checks, public/private purpose separation, access links and reference lifecycle. `routes-media.js`, `media-storage.js`, `imagekit.js` |
| Benefits and credits | Disabled-by-default configured offers, referral claims, immutable credit ledger, quote-benefit commitment/reversal and delivery rewards. `commerce-input.js`, `commerce-models.js`, `commerce-service.js`, `commerce-routes.js` |
| Serverless lifecycle and limits | Cached application/connection initialization, bounded MongoDB pool, required index checks and shared production request counters. `serverless.js`, `rate-limits.js`, `deployment-indexes.js` |

The same model factory creates the core and extension collections. Domain modules use the same MongoDB transaction boundary rather than introducing a second identity or order store. Index creation and data migrations are explicit operator steps; application startup does not reset or seed customer data.

## Identity and trust

Email/password and application JWTs remain authoritative. Optional Google Identity Services credentials are accepted only at exchange/link endpoints, verified by fixed-source RS256 keys and issuer/audience/expiry/subject, then exchanged for the same application JWT. A matching Google email cannot claim an existing password account: linking additionally requires the existing user's current password. Firebase is not an active authentication dependency; retained legacy identifiers do not authorize a request.

```mermaid
sequenceDiagram
  actor User
  participant UI as React
  participant API as Express
  participant DB as MongoDB
  User->>UI: Enter credentials or enabled Google sign-in
  UI->>API: Register/login or verified Google exchange
  API->>DB: Resolve current local identity
  API-->>UI: Safe profile and 30-minute application JWT
  UI->>UI: Keep access token in sessionStorage
  UI->>API: Bearer JWT on protected request
  API->>API: Verify signature, claims and expiry
  API->>DB: Check current user, disabled flag, authVersion and role
  API-->>UI: Authorized resource projection
```

There are no refresh tokens or authentication cookies. Successful server logout, password reset/change and trusted access changes revoke older JWTs through `authVersion`. Local logout clears immediately and uses the captured old token for bounded remote revocation; an old completion cannot erase a newer account/draft. Temporary verification failures preserve the session and allow retry without redirecting or unmounting an already verified private form. Credential rejection is distinct from JWT rejection. See [authentication](authentication.md). Optional reset/verification actions use expiring one-use hashed tokens and configured email delivery; absent configuration is not a verified email/recovery service. Google-only account passwords remain with Google.

Customer IDs and references are checked on the API, including upload finalization and order transactions. Customer resources are owner scoped. Workers require current approval/capability and assignment; approval does not grant admin rights. Support context is shared by explicit customer consent and worker assignment/permission is rechecked. Notifications avoid copying private bodies.

## Configuration, pricing and measurement flow

A catalogue request can preserve **Same as shown** or customize only chosen components. Each component can retain the original, use a published option, follow an owned private reference or request guidance. Mixed sources remain supported. Switching a part does not erase unrelated details. A draft can retain parked choices for recovery while the submitted effective configuration excludes suppressed instructions.

The backend resolves configuration against current published designs/options. Included components and included extras are not billed again. Front-neck, back-neck and sleeve-design adjustments are separate, missing prices remain pending, garment charges scale by quantity and transport charges apply once per leg. The initial estimate is separate from optional benefits on an itemized final quote. Commerce is implemented but disabled by default; no programme rates or eligibility terms are invented or activated.

Every sleeve-length preference adds zero. UI controls, input normalization, public projections and trusted new-estimate calculation enforce this independently of stored legacy amounts. Sleeve design has a separate configured price that cannot increase silently with length. Compatibility is a feasibility constraint: unknown rules need review and explicit incompatible rules block a selection. Existing accepted quotes and submitted orders are preserved.

Measurements distinguish the person taking them (`self`, `tailor`, `assistance`) from what is measured (`body`, `garment`, or legacy/explicit assistance). Guide matching uses garment, body/garment method and interface language, with language-neutral fallback. The same rule serves self and own-tailor measurements. No matching guide yields a clear help fallback; another garment's image is not substituted. Illustrative values never prefill actual measurements.

## Draft persistence and submission

Guest drafts have an opaque device-local identifier. Ordinary design choices persist in local storage for 30 days; personal measurements, addresses, notes and private reference details remain in tab session storage. This is a recoverable browser draft, not a cross-device guest account. Authenticated cloud drafts are owner scoped, revisioned MongoDB records. Private uploads require authentication.

Login continuation carries an internal route/draft identifier and restores the request without submitting it. Final submission is explicit. The API rechecks service/design/option availability, ownership of private media, used guide compatibility, policy version and acknowledged estimate/draft revisions inside the order transaction.

```mermaid
sequenceDiagram
  actor Customer
  participant UI as Request wizard
  participant API as Orders API
  participant DB as MongoDB
  Customer->>UI: Review configuration, measurements, transport and terms
  UI->>API: Explicit submission with stable Idempotency-Key
  API->>API: Validate input and resolve current trusted estimate
  API->>DB: Transaction: account fence, references, order snapshot, draft linkage
  DB-->>API: Unique saved request
  API-->>UI: Actual order number and receipt
```

An identical retry returns the saved request; changed payload with the same key conflicts. Stale revisions, prices or policies require review. The browser does not automatically retry mutations. Changes to catalogue entries, profiles and measurement profiles do not rewrite submitted order snapshots.

## Quotes, operations and care

Administrators review requests and send versioned final quotes with exact row totals. Only a response to the current quote/version/revision accepts it. The accepted snapshot is immutable; generic status changes cannot skip acceptance. Production progresses through recorded fabric receipt, stitching, ready, dispatch and delivery. Logistics facts and completion/delay notes are separate from the operational stage and accepted price.

When an administrator enables a defined programme, a customer may save an eligible offer/credit selection against the current itemized quote. A pending selection does not debit a wallet. Explicit current-quote acceptance revalidates availability, terms, offer limits and balance inside the order transaction, records the ledger/use and snapshots gross amount, discount, credits and net amount in `acceptedQuote`. Benefits apply to identified stitching rows, never transport. Cancellation/rejection restores committed credits and offer capacity once; a recorded qualifying delivery can issue configured referral/milestone rewards once. Unique events, conditional balances and owner fences prevent repeated redemption/rewards. See [commerce](commerce.md).

Contextual support/conversations are persistent records. A reply, human first response and resolution are distinct. Configured support calendars establish response targets, not guaranteed callbacks or correction completion times. Staff can propose component changes only to an editable owned shared draft; explicit current customer acceptance and price/revision checks apply.

Worker progress is a proposal for admin review rather than an automatic customer status update. Reviews require an eligible delivered owned order, are unique per order and need public-display consent before moderation/publication. Public selected testimonials are not a complete-review or aggregate-rating claim.

## Visual inventory and storage responsibilities

The prepared inventory accounts for 62 supplied files and preserves originals. Seven contact sheets, duplicate/ambiguity notes, source hashes and crop metadata are under [artifacts/visual-import](../artifacts/visual-import/). Supplied individual files have whole-image coordinates; no missing parent-board coordinates or designs are invented.

The historical configured import run recorded 31 option drafts and 3 garment-guide drafts using 47 public catalogue assets; repeat import recorded zero additional uploads. These are prior-run records, not a fresh connection, import, current remote count or publication claim in this review. No environment files or live providers were inspected for the current work. Preparation manifest flags describe staging. Garment applicability, compatibility and actual prices require owner approval. The clipped ruffle-front image remains quarantined. Body guides were not supplied.

MongoDB stores public catalogue metadata, revisions, provenance and media references; ImageKit stores uploaded image bytes. Draft option records are unlisted configuration, while their public catalogue image bytes are not a secrecy boundary. Customer images are a different private purpose and never enter that public import path. Existing bundled approved board/brand assets remain static application files with allowlisted media support.

Orders snapshot selected option labels, media references, pricing and immutable used-guide instructions/method/image IDs, and pin referenced images. Shared-media reference counts, exact public pin records, target reference fences and usage checks protect current and historical associations against concurrent deletion. Permanent deletion is restricted to unused records; archival preserves meaning.

## Deployment and operational boundaries

The Vercel entry imports the serverless handler without calling `listen` or loading environment files. It uses hosting-provided configuration. A pending application/connection initialization is shared within each warm instance; failed initialization clears the pending cache so later requests can recover. The pool is bounded to five connections with no minimum idle pool. This cache is not shared business state and is not a global connection cap across scaled instances. Required indexes must already exist. Startup failure returns a safe 503. MongoDB transactions require a compatible deployment. Function disk/memory is not durable order, ledger or image storage. Health readiness does not verify every external provider.

CORS uses explicit configured origins; the default same-origin `/api` avoids a separate browser API host. Production request limits use MongoDB `RequestLimit` buckets, unique counter keys and TTL cleanup, shared across function instances. Failure to update the durable limit fails closed. Password/image concurrency gates remain per-instance CPU protection, while daily upload quotas live in MongoDB. Same-origin JavaScript can read session storage, so XSS prevention remains essential. Browser image preparation keeps files within the3 MiB proxy budget; the server still decodes and enforces privacy. See [ImageKit/media](imagekit.md).

ImageKit operations cannot share a database transaction. Failed upload compensation or deletion requires operator reconciliation rather than a claimed atomic provider success. Private media fails closed until the operator verifies the provider's unsigned-original/transformation policy.

The retained standalone Node entry and `render.yaml` are compatibility/history, not the current rollout target. Commercial hosting requires a Vercel plan that permits this use; no purchase or deployment is claimed. Real orders still require approved prices/guides/programme terms, provider privacy/auth/mail checks, backups/restore, alerts and a deployed smoke test. See [Vercel deployment](deployment-vercel.md), [capacity](capacity-plan.md), [operations](operations.md) and [readiness](production-readiness.md). Courier booking, cash payments/refunds, payroll and future craft adapters are not simulated.

## Real-Time Customer Chat Architecture & Security Hardening

Added as an independent, WhatsApp-free customer communication module. It connects website customers directly with the KhwabStitch Atelier admin dashboard in real time without exposing the owner's personal phone number or requiring mandatory customer account registration.

### System Architecture

```mermaid
flowchart TD
  subgraph Clients["Frontend Layer (React / Vite)"]
    CustWidget["Customer Chat Widget<br/>(Floating / Draggable / Responsive)"]
    AdminDash["Admin Chat Dashboard<br/>(Live Inbox / Thread / Quick Replies)"]
  end

  subgraph Gateway["Transport & Proxy Layer"]
    ViteProxy["Vite Dev Server Proxy<br/>(/socket.io with ws: true & /api)"]
    HelmetCORS["Express Security & CORS<br/>(Helmet, Origin Allowlist, Rate Limits)"]
  end

  subgraph RealTimeServer["Real-Time Core (Node.js / Express / Socket.IO)"]
    SocketAuth["Handshake Auth<br/>(Admin JWT & Customer Guest Token/Cookie)"]
    RoomRouter["Socket Room Router<br/>(conversation:customerId & admin:inbox)"]
    ChatRoutes["REST APIs<br/>(/api/chat/* & /api/admin/chat/*)"]
  end

  subgraph Storage["Storage & Media Layer"]
    MongoChat[("MongoDB Collections<br/>ChatCustomer, ChatConversation, ChatMessage")]
    ImageKitStorage["ImageKit CDN<br/>(Sharp 24Mpx limit, WebP 85%)"]
  end

  CustWidget -->|WebSocket / Polling| ViteProxy
  AdminDash -->|WebSocket / Polling| ViteProxy
  ViteProxy --> HelmetCORS
  HelmetCORS --> SocketAuth
  SocketAuth --> RoomRouter
  CustWidget -->|REST HTTP POST/GET/PATCH| ChatRoutes
  AdminDash -->|REST HTTP POST/GET/PATCH| ChatRoutes
  ChatRoutes --> MongoChat
  ChatRoutes --> ImageKitStorage
  RoomRouter -->|Real-time emit| CustWidget
  RoomRouter -->|Real-time emit| AdminDash
```

### Real-Time Messaging Sequence

```mermaid
sequenceDiagram
  autonumber
  actor Customer as Customer (Widget)
  participant CSocket as Customer Socket
  participant Server as Socket.IO Server
  participant DB as MongoDB
  participant ASocket as Admin Socket
  actor Admin as Admin (Dashboard)

  Customer->>CSocket: Connect with guestToken / Cookie
  CSocket->>Server: Handshake Auth (SHA-256 token hash)
  Server->>DB: Find ChatCustomer
  DB-->>Server: Customer validated
  Server-->>CSocket: Connection established
  Server->>Server: Auto-join conversation:cust_xxx

  Customer->>Customer: Typing message...
  CSocket->>Server: emit typing_start (room-scoped)
  Server->>ASocket: to(conversation:cust_xxx) emit typing_start
  ASocket-->>Admin: Show "Customer is typing..."

  Customer->>Customer: Type message & click send (Optimistic single tick ✓)
  Customer->>Server: POST /api/chat/messages (clientMessageId, text/attachment)
  Server->>DB: Deduplicate & save ChatMessage (deliveryStatus: 'delivered') & ChatConversation
  Server->>Server: broadcastChatMessage() to conversation:cust_xxx AND admin:inbox
  Server-->>CSocket: HTTP 200 response with deliveryStatus: 'delivered'
  CSocket-->>Customer: Update to double grey checkmark ✓✓ (Delivered)
  Server-->>ASocket: to(admin:inbox) emit inbox_update (sidebar list & counter update)
  Server-->>ASocket: to(conversation:cust_xxx) emit new_message (live thread update)
  ASocket-->>Admin: Render incoming customer message immediately without refresh

  Admin->>ASocket: emit mark_read { customerId: "cust_xxx" }
  ASocket->>Server: Update deliveryStatus to read
  Server->>DB: Bulk update messages to read
  Server-->>CSocket: to(conversation:cust_xxx) emit messages_read
  CSocket-->>Customer: Update to double teal checkmark ✓✓ (Read receipt)
```

### Message Delivery Receipt Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Sent: Customer hits Send / Submits Image (Optimistic UI)
  note right of Sent: Rendered with single grey checkmark (✓)\nTemporary clientMessageId assigned
  
  Sent --> Delivered: Backend saves to MongoDB & acknowledges
  note right of Delivered: Rendered with double grey checkmark (✓✓)\nDelivered timestamp recorded
  
  Delivered --> Read: Tailor/Admin views thread or calls mark_read
  note right of Read: Rendered with double teal checkmark (✓✓)\nReal-time socket event: messages_read
  
  Read --> [*]
```

### Admin Socket Connection Architecture & Token Resolution

```mermaid
flowchart TD
  subgraph AdminAuthContext["Client Auth Layer (React)"]
    AuthProvider["AuthProvider / useAuth()"]
    UserProfile["user: { _id, name, email, role }<br/>(Notice: No token property!)"]
    SessionStore["sessionStore (sessionStorage)<br/>Holds authoritative { token, expiresAt }"]
    AuthProvider --> UserProfile
    SessionStore -.->|Subscribes to changes| AdminDash["AdminChatDashboard.jsx"]
  end

  subgraph SocketConnection["Socket.IO Client Layer"]
    TokenResolve["Token Resolution:<br/>const token = sessionStore.get()?.token;"]
    ConnectCall["connectChatSocket({ role: 'admin', token })"]
    SocketEmit["Handshake Auth { token }"]
    AdminDash --> TokenResolve
    TokenResolve --> ConnectCall
    ConnectCall --> SocketEmit
  end

  subgraph ServerGateway["Node.js Socket.IO Server"]
    HandshakeAuth["verifyAdminToken(socket.handshake.auth.token)"]
    JoinInbox["socket.join('admin:inbox')"]
    Ready["Emit inbox_ready & setSocketConnected(true)"]
    SocketEmit --> HandshakeAuth
    HandshakeAuth -->|Valid Admin JWT| JoinInbox
    JoinInbox --> Ready
  end
```

### First-Time Automated Greeting Sequence

```mermaid
sequenceDiagram
  autonumber
  actor Customer as Customer (Widget)
  participant API as Express API (/api/chat/messages)
  participant DB as MongoDB Atlas
  participant Socket as Socket.IO Server
  actor Admin as Tailor / Admin Dashboard

  Customer->>API: POST /api/chat/messages (first customer message or prompt chip tap)
  API->>DB: Save Customer ChatMessage (deliveryStatus: 'delivered')
  API->>DB: Count prior messages in conversation (count === 0)
  API->>DB: Check SiteSettings.chatAutoGreeting (enabled: true)
  API->>DB: Create auto-greeting ChatMessage (sender: 'KhwabStitch Atelier')
  API->>DB: Update ChatConversation.lastMessage & unreadCountCustomer
  API-->>Customer: HTTP 201 { data: { message, autoGreeting } }
  API->>Socket: broadcastChatMessage(autoGreeting) to conversation:cust_xxx AND admin:inbox
  Socket-->>Customer: Display instant warm welcome message in widget
  Socket-->>Admin: Update inbox list & display greeting in active thread
```

### Admin Chat Dashboard UI Architecture

```mermaid
flowchart LR
  subgraph TopBar["Top Navigation & Status Bar"]
    BackAtelier["< ArrowLeft > Back to Atelier Dashboard (/admin)"]
    LiveStatus["Live & Connected Badge (Pulsing Emerald Dot)"]
    QuickRepliesBtn["Chat Automation & Quick Replies Settings Modal"]
  end

  subgraph Layout["WhatsApp-Styled Responsive Workspace"]
    Sidebar["Customer Inbox Sidebar<br/>- Customer Avatar Initials<br/>- Active/Closed/Unread filters<br/>- Snippet & unread counters"]
    ChatArea["WhatsApp-Style Active Chat Panel<br/>- Wallpaper background (#efeae2)<br/>- Date divider pills<br/>- LEFT: Customer white bubbles<br/>- RIGHT: Admin WhatsApp green bubbles (#d9fdd3)<br/>- Delivery ticks: sent, delivered, read<br/>- Interactive quick reply bar & settings modal<br/>- Rich composer with ImageKit upload"]
    DetailsDrawer["Collapsible Customer Drawer<br/>- Display name & customerId<br/>- Associated order lookup<br/>- Private tailor notes (auto-saved)"]
  end

  TopBar --> Layout
```

### Resolved Architectural & Real-Time Issues

1. **Admin Real-Time Inbox Disconnection Root Cause**:
   - *Problem*: `AdminChatDashboard.jsx` previously checked `if (!user?.token) return;`. In the application's auth design, `useAuth().user` stores the sanitized user profile (`{ _id, name, email, role }`) and intentionally excludes the token to prevent accidental serialization. The real JWT lives in `sessionStore.get()?.token`. As a result, the admin socket never initiated connection, leaving the admin disconnected and preventing live message delivery.
   - *Resolution*: Updated the dashboard to retrieve `sessionStore.get()?.token`, subscribe to `sessionStore.subscribe()`, and connect the admin socket to room `admin:inbox`. The live status pill displays a pulsing green dot when connected.

2. **Delivery Receipt Lifecycle (Single Tick vs Double Tick vs Read Tick)**:
   - *Sent (Single Tick ✓)*: Rendered immediately upon customer message submission while the network request is in-flight.
   - *Delivered (Double Grey Tick ✓✓)*: Updated as soon as the Express backend saves the message to MongoDB and returns HTTP 200 with `deliveryStatus: "delivered"`.
   - *Read (Double Teal Tick ✓✓)*: Updated via real-time WebSocket event `messages_read` when the admin views the customer conversation.

3. **Admin Chat Dashboard Ergonomics & Back Navigation**:
   - Added a top navigation breadcrumb with `< ArrowLeft > Back to Atelier Dashboard` linking cleanly back to `/admin`.
   - Added a persistent, prominent `< ChevronLeft > Back to list` button in the active conversation header, allowing single-click return to the inbox list on both mobile and desktop views.
   - Added visual customer avatar badges with initials across the conversation list and chat header for instant identification.
   - Added a collapsible Customer Details & Private Notes drawer that auto-saves tailor notes to MongoDB without exposing them to customer transcripts.

4. **WebSocket Proxy Resolution**: Configured `/socket.io` with `ws: true` in `client/vite.config.js` to ensure the Vite dev server forwards WebSocket upgrade requests to the backend server at port 3000 without 404 connection drops.
5. **Socket URL Resolution**: Implemented `resolveSocketUrl()` in `client/src/lib/chat-socket.js` to connect to `VITE_API_BASE_URL` origin when configured or fallback to same-origin proxy.
6. **Continuous Connection Stability**: Decoupled socket lifecycles from ephemeral UI toggles (`isOpen` in the customer widget and `selectedCustomerId` in the admin dashboard). The master sockets stay continuously connected to prevent connection drops, lost messages, or reconnect delays.
7. **Room Switching Without Disconnection**: The admin socket now uses `admin_join_conversation` and `admin_leave_conversation` events to switch rooms seamlessly without terminating the master connection.
8. **Real-Time Inbox Synchronization**: `broadcastChatMessage()` sends `new_message` to both `conversation:customerId` AND `admin:inbox`, guaranteeing that active threads and sidebar lists update instantly across all open admin tabs.
9. **Guest Session Protection**: Guest authentication supports `HttpOnly`, `SameSite=Lax`, and `Secure` cookies with SHA-256 hashed storage. Sessions are never wiped on network dropouts or 500 errors; only explicit HTTP 401 triggers session renewal.
10. **Customer Privacy & IDOR Prevention**: Conversation queries, socket events, and transcript exports strictly enforce customer ownership. Private tailor notes (`ChatCustomer.notes`) are excluded from customer views and transcripts.
11. **Configurable Quick Replies**: Tailor quick replies are stored dynamically in `SiteSettings.chatQuickReplies` with Zod validation, replacing hardcoded arrays while preserving defaults.
12. **Accessible Draggable UX**: Chat widget dragging is clamped to viewport bounds, auto-recalculated on resize/orientation change, supports global Escape-key dismissal, and restores focus to the launcher button.

## Authentication Architecture, Login Security & 503 Resiliency

### Root Cause Analysis of 503 ("The atelier service is temporarily unavailable. Please try again.")

During server bootstrap in `server/src/serverless.js` and `server/src/index.js`, the startup pipeline validates existing MongoDB collection indexes via `assertEnhancementIndexes(models)` and `assertCredentialIndexes(models)`. 

```mermaid
flowchart TD
  subgraph BootstrapError["Root Cause (Before Remediation)"]
    ExtSchemas["models-extension.js<br/>defines Conversation & Message<br/>(Support Ticket System)"]
    ChatSchemas["chat-models.js<br/>exported Conversation & Message<br/>(Customer Live Chat)"]
    Assign["models.js Object.assign()<br/>OVERWROTE Support schemas!"]
    IndexFail["assertEnhancementIndexes()<br/>detected index mismatch on Message<br/>Expected unique {conversation:1, sender:1, clientId:1}<br/>Got chat index {conversationId:1, clientMessageId:1}"]
    StartupErr["StartupError('feature_indexes')<br/>Serverless Handler returns HTTP 503<br/>code: FEATURE_INDEXES_REQUIRED"]
    ClientErr["client/src/lib/api.js throws ApiError<br/>'The atelier service is temporarily unavailable. Please try again.'<br/>Blocks POST /api/auth/login and GET /api/me!"]

    ExtSchemas --> Assign
    ChatSchemas --> Assign
    Assign --> IndexFail
    IndexFail --> StartupErr
    StartupErr --> ClientErr
  end
```

### Permanent Resolution & Domain Model Disambiguation

To ensure zero index collisions, full backward compatibility with legacy customer support tickets, and flawless startup health, the customer chat models are strictly isolated:

```mermaid
classDiagram
  class SupportConversation {
    +ObjectId owner
    +String kind: support | application | assignment | order
    +ObjectId contextId
    +Date lastMessageAt
    +Object readAt
  }
  class SupportMessage {
    +ObjectId conversation
    +ObjectId sender
    +String clientId
    +String text
    +Array attachmentIds
    +String requestHash
  }
  class ChatCustomer {
    +String customerId
    +String displayName
    +String guestTokenHash
    +Date lastSeenAt
    +String notes
  }
  class ChatConversation {
    +String customerId
    +String status: active | closed
    +Object lastMessage
    +Date lastMessageAt
    +Number unreadCountAdmin
    +Number unreadCountCustomer
    +String relatedOrderReference
  }
  class ChatMessage {
    +ObjectId conversationId
    +String customerId
    +String clientMessageId
    +String senderType: customer | admin | system
    +String senderId
    +String senderName
    +String messageType: text | image
    +String content
    +Object attachment
    +String deliveryStatus: sent | delivered | read
  }

  SupportConversation "1" <-- "*" SupportMessage : references
  ChatCustomer "1" <-- "1" ChatConversation : customerId
  ChatConversation "1" <-- "*" ChatMessage : conversationId
```

1. Customer live chat models are renamed to `ChatCustomer`, `ChatConversation`, and `ChatMessage`.
2. Existing support ticket models `Conversation` and `Message` in `server/src/models-extension.js` remain completely intact.
3. `assertEnhancementIndexes(models)` passes without error during startup because `Message` indexes `{ conversation: 1, sender: 1, clientId: 1 }` match MongoDB Atlas.
4. `server/src/startup.js` initializes seamlessly, returning HTTP 200 on all authentication and profile endpoints.

### Complete Login & Session Verification Flow

```mermaid
sequenceDiagram
  autonumber
  actor User as Customer / Tailor Admin
  participant UI as React Login Page
  participant AuthStore as SessionStore (sessionStorage)
  participant API as Express Auth Router (/api/auth/login)
  participant Gate as PasswordWorkGate (Concurrency Limit: 2)
  participant DB as MongoDB Atlas (User Collection)

  User->>UI: Submit Email & Password
  UI->>UI: Client validation (Email format, byte length <= 72, control char check)
  UI->>API: POST /api/auth/login { email, password }
  API->>Gate: Acquire execution slot
  Gate->>DB: User.findOne({ email, passwordHash: { $type: "string" } }) with collation strength 2
  DB-->>Gate: User document (including +passwordHash)
  Gate->>Gate: bcrypt.compare(password, user.passwordHash) [Cost: 12]
  Note over Gate: Even if user is missing, dummy bcrypt hash prevents timing attacks
  Gate-->>API: Authentication verified, generate tokenService.issue(user)
  API-->>UI: HTTP 200 { data: { token, expiresAt, user: safeProfile } }
  UI->>AuthStore: Save { token, expiresAt } in sessionStorage
  UI->>UI: Update AuthProvider context state
  UI-->>User: Navigate to returnTo or /orders / /admin

  User->>UI: Reload page or navigate to protected view
  UI->>API: GET /api/me (Authorization: Bearer token)
  API->>API: Verify token HMAC-SHA256, issuer, audience, and 30-min expiry
  API->>DB: Check User.findById(claims.sub) and match claims.version === authVersion
  DB-->>API: Active user profile & emailVerified flag
  API-->>UI: HTTP 200 { data: profile }
  UI-->>User: Render personalized atelier dashboard
```

### Authentication Security & Hardening Highlights

- **Timing Attack Protection**: Password comparison uses constant-time bcrypt execution against a precomputed dummy hash if the email is not found, guaranteeing identical response latency regardless of account existence.
- **CPU Exhaustion Defense**: `passwordWorkGate(2)` caps concurrent bcrypt hashing operations to prevent server starvation under brute-force attacks, while Express rate limiting enforces max 30 attempts per 15 minutes per IP.
- **Session Expiration & Auto-Revocation**: JWTs are strictly time-bounded (30 minutes). Password changes or logouts increment `authVersion` in MongoDB, immediately invalidating all previously issued tokens globally.
- **Zero Local Secrets**: Storage is confined to `sessionStorage` (tab-scoped) rather than persistent `localStorage`, insulating session tokens against cross-tab access and persistent device compromise.
- **Bilingual Error Clarity**: Login errors gracefully render in both English and Hindi with 100% dictionary coverage, never exposing raw database exceptions or internal stack traces to the customer.

### Direct Standalone Customer Chat (`/chat`) & Real-Time WhatsApp Architecture

KhwabStitch Atelier includes an independent, WhatsApp-like customer messaging system that operates without external WhatsApp API dependencies, preserving privacy while enabling direct communication.

```mermaid
flowchart TD
  subgraph CustomerExperience["Customer Experience"]
    DirectRoute["Standalone Web URL: /chat<br>(Shareable, no app needed)"]
    FloatingWidget["Floating Launcher Button<br>(Desktop & Mobile)"]
    DirectRoute --> CustomerSocket["Customer Socket.IO Session"]
    FloatingWidget --> CustomerSocket
  end

  subgraph RealTimeHub["Real-Time Gateway & API"]
    CustomerSocket <-->|conversation:customerId room| SocketGateway["Socket.IO Server Gateway"]
    SocketGateway <-->|admin:inbox notifications| AdminSocket["Admin Master Socket"]
    CustomerAPI["Customer Chat API<br>/api/chat/*"] --> SocketGateway
    AdminAPI["Admin Chat API<br>/api/admin/chat/*"] --> SocketGateway
  end

  subgraph AdminExperience["Admin Experience"]
    AdminDashboard["Admin Chat Dashboard<br>/admin/chat"]
    AdminSocket <--> AdminDashboard
    AdminSettings["Chat Automation & Quick Replies<br>(Greetings & Customer Prompts)"]
    AdminSettings --> AdminAPI
  end

  subgraph Persistence["Storage & Assets"]
    MongoDB[(MongoDB Atlas<br>ChatCustomer, ChatConversation, ChatMessage)]
    ImageKit[(ImageKit Secure Media<br>Max 5MB WebP / JPEG)]
    CustomerAPI --> MongoDB
    AdminAPI --> MongoDB
    CustomerAPI --> ImageKit
    AdminAPI --> ImageKit
  end
```

#### Real-Time Chat Sequence Flow: Customer & Admin Live Interaction

```mermaid
sequenceDiagram
  autonumber
  actor Customer as Customer (Web / Mobile Browser)
  participant CustUI as /chat (Direct Customer Page)
  participant Gateway as Socket.IO & Express Server
  participant DB as MongoDB Atlas
  participant AdminUI as /admin/chat (Admin Dashboard)
  actor Admin as Atelier Master Tailor

  Note over Customer,CustUI: Customer opens https://khwabstitch.com/chat
  CustUI->>Gateway: POST /api/chat/guest (or resume stored guestToken)
  Gateway->>DB: ChatCustomer.create / ChatConversation.create
  Gateway-->>CustUI: { customerId, guestToken, conversationId }
  CustUI->>Gateway: Connect Customer Socket (room: conversation:customerId)

  Customer->>CustUI: Click Prompt Chip ("Custom Stitching Enquiry") or type question
  CustUI->>Gateway: POST /api/chat/messages { content: "Custom Stitching Enquiry" }
  Gateway->>DB: ChatMessage.create (status: delivered)
  Gateway->>DB: Update ChatConversation.lastMessage & unreadCountAdmin
  Gateway->>AdminUI: emit("inbox_update") & emit("new_message")
  AdminUI->>AdminUI: Play tone, bump conversation to top, display on LEFT (incoming)
  
  Note over Gateway: First message triggers configured Auto-Greeting
  Gateway->>DB: Create Automated Greeting from KhwabStitch Atelier
  Gateway->>CustUI: emit("new_message") -> Display greeting on LEFT
  Gateway->>AdminUI: emit("new_message") -> Display greeting on RIGHT

  Admin->>AdminUI: Select customer conversation "ali"
  AdminUI->>Gateway: emit("admin_join_conversation", { customerId })
  AdminUI->>Gateway: emit("mark_read", { customerId })
  Gateway->>CustUI: emit("messages_read") -> Double teal checkmarks (✓✓)
  
  Admin->>AdminUI: Select Quick Reply chip & click Send
  AdminUI->>Gateway: POST /api/admin/chat/conversations/:id/messages
  Gateway->>DB: ChatMessage.create (senderType: admin)
  Gateway->>CustUI: emit("new_message") -> Display Atelier reply on LEFT (white bubble)
  Gateway->>AdminUI: Broadcast confirmation -> Display on RIGHT (WhatsApp green bubble #d9fdd3)
```

#### Key Architectural Highlights

1. **Moveable & Draggable Popup Customer Widget (`CustomerChatWidget`)**:
   - Customers enjoy a refined floating launcher button with real-time unread badges that pops open a moveable dialog window modal.
   - The modal header supports smooth drag-and-drop movement (`handleHeaderPointerDown`) across the entire screen on desktop, with automatic viewport clamping, window resize recalculation, and orientation change handling.
   - On mobile screens, it automatically docks into a full-height responsive modal (`100dvh`).
   - Includes real-time craftsman online indicators, ImageKit photo attachment upload for design inspiration, click-to-lightbox preview with Escape key support, message delivery receipts, display name customization, and official transcript export.
   - Direct header button allows one-tap "Copy Chat Link" to share the chat link (`https://khwabstitch.com/chat`) instantly.

2. **Direct Standalone Web Chat (`/chat`)**:
   - Visiting `/chat` directly acts as an Atelier Concierge landing that automatically pops open the moveable customer chat widget on mount (`open-atelier-chat`).
   - Customers can chat directly via browser without installing any application or leaving their browsing context.
   - Pre-configured interactive question prompt chips ("Custom Stitching Enquiry", "How to provide measurements?", "Price estimate for suit / kurti", "Turnaround and delivery time") allow instant inquiries with a single tap.

3. **WhatsApp-Style Two-Sided Visual Layout**:
   - Outgoing messages strictly aligned to the RIGHT with WhatsApp soft green bubbles (`#d9fdd3`), sender attribution, and message delivery receipts:
     - Single check (✓) = Sent to server
     - Double check (✓✓ grey) = Delivered to recipient
     - Double check (✓✓ teal `#0d9488`) = Read by recipient
   - Incoming messages strictly aligned to the LEFT with clean white bubbles (`#ffffff`) and sender badges.
   - Fully enforced width containment with `.admin-msg-item-wrap` and `.direct-msg-item-wrap` preventing flex shrinking or bubble misalignment.

3. **Admin Response Reliability & Fallback Enrichment**:
   - Safeguarded against plain document serialization using `typeof doc?.toObject === "function" ? doc.toObject() : doc`.
   - Synchronous customer ID tracking via `selectedCustomerIdRef.current = customerId` ensuring incoming socket messages are never dropped during React rendering.
   - Database fallback aggregation in `GET /api/admin/chat/conversations` backfills latest message content from `ChatMessage` if `conversation.lastMessage` is empty, eliminating "No messages yet" discrepancies.
   - Immediate optimistic sidebar updates in `handleSendMessage` reflect outbound replies without network delay.

4. **100% Elimination of WhatsApp API Dependencies**:
   - All customer-facing entry points utilize the internal real-time chat service.
   - Settings label sanitized to "Contact phone number" while preserving backend schema compatibility.
   - Complete 100% bilingual parity across all customer and admin chat views in both English and Hindi.

---

For detailed models, API and consistency rules see [LLD](lld.md), [enhancement API](enhancement-api.md) and [account/support API](account-support-api.md). Customer/admin instructions are in [customer workflow](customer-workflow.md) and [admin guide](admin-guide.md).
