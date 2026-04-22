# g-heal-claw Requirements Document

> Self-Healing Production Monitoring System
>
> Version: 1.0.0 | Date: 2026-04-22

---

## 1. Project Overview

g-heal-claw is a self-healing production monitoring system designed to:

1. Provide a lightweight browser SDK for frontend error capture
2. Collect and manage sourcemaps generated during CI/CD builds
3. Resolve minified stack traces to original source code locations
4. Leverage AI (LLM) to diagnose errors and generate actionable solutions in Markdown
5. Automatically generate code fixes, create pull requests, and trigger deployments after human approval
6. Provide an admin dashboard for exception management, analytics, and team collaboration

---

## 2. System Architecture

```
[User App + SDK] --> [Ingestion Gateway] --> [Message Queue (BullMQ/Redis)]
                                                      |
                          +---------------------------+---------------------------+
                          |                           |                           |
                   [Error Processor]          [Sourcemap Service]          [Notification Service]
                   (dedup, fingerprint,       (upload, storage,
                    classify, group)           resolution)
                          |                           |
                          +-------------+-------------+
                                        |
                                [AI Diagnosis Engine]
                                        |
                                +-------+-------+
                                |               |
                         [Solution Store]  [Auto-Fix Pipeline]
                                |               |
                         [Admin Dashboard] [Git + CI/CD Trigger]
```

### 2.1 Service Catalog

| Service | Package | Responsibility |
|---|---|---|
| SDK | `@g-heal-claw/sdk` | Capture errors, context, breadcrumbs from browser |
| CLI | `@g-heal-claw/cli` | Upload sourcemaps during CI/CD |
| Vite Plugin | `@g-heal-claw/vite-plugin` | Auto-upload sourcemaps after Vite build |
| Webpack Plugin | `@g-heal-claw/webpack-plugin` | Auto-upload sourcemaps after Webpack build |
| Ingestion Gateway | `apps/gateway` | Receive events, authenticate, rate-limit, enqueue |
| Sourcemap Service | `apps/sourcemap-service` | Store sourcemaps, resolve minified stack traces |
| Error Processor | `apps/error-processor` | Deduplicate, fingerprint, classify, group into Issues |
| AI Diagnosis Engine | `apps/ai-engine` | Analyze errors with LLM, generate Markdown solutions |
| Auto-Fix Pipeline | `apps/auto-fix-worker` | Clone repo, apply AI patch, create PR |
| Notification Service | `apps/notification-service` | Alert via email/Slack/DingTalk/webhook |
| Dashboard API | `apps/dashboard-api` | REST API for admin dashboard |
| Dashboard Web | `apps/dashboard-web` | React SPA for issue management and analytics |

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared packages, parallel builds |
| SDK | TypeScript + tsup (ESM/CJS/UMD) | Small bundle, tree-shakeable, framework-agnostic |
| Gateway | Node.js (Fastify) | High throughput, low latency |
| Queue | Redis + BullMQ | Simple for MVP, reliable job processing |
| Sourcemap | Node.js + `source-map` library | Native JS sourcemap parsing |
| AI Engine | Node.js + Anthropic/OpenAI SDK | LLM provider flexibility |
| Database | PostgreSQL (primary) | Relational CRUD for all core entities |
| Analytics DB | ClickHouse (Phase 4) | Columnar aggregation for 100M+ events |
| Cache | Redis | Session, rate limiting, dedup fingerprints |
| Object Storage | MinIO (dev) / S3 (prod) | Sourcemap file storage |
| Dashboard Frontend | React + Vite + TailwindCSS + Ant Design | Modern, component-rich UI |
| Charts | ECharts | Rich interactive visualization |
| Auth | JWT + refresh tokens | Stateless, standard |
| Container | Docker + Docker Compose | Containerized local dev and deployment |

---

## 4. Monorepo Structure

```
g-heal-claw/
  packages/
    sdk/                    # @g-heal-claw/sdk - Browser SDK
    cli/                    # @g-heal-claw/cli - CLI for sourcemap upload
    shared/                 # @g-heal-claw/shared - Shared types, Zod schemas, utils
    vite-plugin/            # @g-heal-claw/vite-plugin
    webpack-plugin/         # @g-heal-claw/webpack-plugin
  apps/
    gateway/                # Ingestion API server (Fastify)
    error-processor/        # BullMQ worker service
    sourcemap-service/      # Sourcemap storage & resolution API
    ai-engine/              # AI diagnosis & fix generation service
    notification-service/   # Notification dispatch service
    auto-fix-worker/        # Git clone, patch, PR creation worker
    dashboard-api/          # Dashboard REST API server
    dashboard-web/          # React SPA
  infra/
    docker/                 # Dockerfiles per service
    migrations/             # Database migrations
  docs/                     # Documentation
  docker-compose.yml
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .env.example
```

---

## 5. Data Models

### 5.1 Project

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| name | string | Project display name |
| dsn | string | Client key for SDK authentication |
| platform | string | Platform type (web/node/react-native) |
| repo_url | string? | Git repository URL |
| repo_access_token | string? | Encrypted repo access token |
| owner_id | UUID | FK to User |
| settings | JSON | Project-level configuration |
| created_at | timestamp | Creation time |
| updated_at | timestamp | Last update time |

### 5.2 SourcemapUpload

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| project_id | UUID | FK to Project |
| release_version | string | Release/build version tag |
| file_path | string | Original JS file path |
| storage_key | string | S3/MinIO object key |
| uploaded_at | timestamp | Upload time |

### 5.3 ErrorEvent

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| project_id | UUID | FK to Project |
| release_version | string | Release version |
| timestamp | timestamp | When the error occurred |
| error_type | string | Error class (TypeError, ReferenceError, etc.) |
| message | string | Error message |
| stack_trace | text | Raw minified stack trace |
| resolved_stack_trace | text? | Sourcemap-resolved stack trace |
| browser | string | Browser name and version |
| os | string | Operating system |
| url | string | Page URL where error occurred |
| user_id | string? | Application user ID |
| extra_context | JSON | Custom context data |
| breadcrumbs | JSON | Breadcrumb trail |
| fingerprint | string | Deterministic hash for grouping |

### 5.4 Issue (grouped errors)

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| project_id | UUID | FK to Project |
| fingerprint | string | Unique fingerprint (indexed) |
| title | string | Issue title (error type + message summary) |
| first_seen | timestamp | First occurrence |
| last_seen | timestamp | Most recent occurrence |
| event_count | integer | Total event count |
| status | enum | open / resolved / ignored / auto-fixed |
| severity | enum | critical / error / warning / info |
| assigned_to | UUID? | FK to User |
| resolved_in_version | string? | Release version that resolved the issue |

### 5.5 AIDiagnosis

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| issue_id | UUID | FK to Issue |
| model_used | string | LLM model identifier |
| prompt_hash | string | Hash of the prompt for dedup |
| root_cause | text | Root cause analysis (Markdown) |
| solution | text | Suggested solution (Markdown) |
| code_suggestion | text? | Code fix as unified diff |
| confidence_score | float | AI confidence (0-1) |
| feedback_rating | enum? | helpful / not_helpful / partial |
| token_usage | integer | Tokens consumed |
| created_at | timestamp | Diagnosis time |

### 5.6 AutoFixAttempt

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| issue_id | UUID | FK to Issue |
| diagnosis_id | UUID | FK to AIDiagnosis |
| branch_name | string | Git branch name |
| pr_url | string? | Pull request URL |
| status | enum | pending / pr_created / approved / deployed / failed |
| patch_diff | text | Applied patch in unified diff |
| created_at | timestamp | Attempt time |
| reviewed_by | UUID? | FK to User who reviewed |
| reviewed_at | timestamp? | Review time |

### 5.7 User

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| email | string | Unique email |
| name | string | Display name |
| password_hash | string | Bcrypt hash |
| role | enum | admin / member / viewer |
| created_at | timestamp | Registration time |

### 5.8 NotificationRule

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| project_id | UUID | FK to Project |
| channel | enum | email / slack / dingtalk / webhook |
| config | JSON | Channel-specific config (URL, token, etc.) |
| trigger | enum | new_issue / regression / severity_change / auto_fix_ready |
| conditions | JSON? | Optional conditions (severity >= X, count >= Y) |
| enabled | boolean | Active flag |

### 5.9 DeployTrigger

| Field | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| auto_fix_attempt_id | UUID | FK to AutoFixAttempt |
| ci_provider | string | github_actions / gitlab_ci / webhook |
| pipeline_url | string? | CI pipeline URL |
| status | enum | triggered / running / success / failed |
| triggered_at | timestamp | Trigger time |

---

## 6. Phased Delivery Plan

### Phase 1: Foundation & MVP (Weeks 1-6)

**Goal**: SDK captures errors, backend ingests and processes them, sourcemaps resolve stack traces, basic dashboard displays issues.

#### M1.1 Project Scaffolding

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M1.1.1 | Monorepo initialization | pnpm workspace, Turborepo, base tsconfig, ESLint/Prettier | P0 | 2d |
| M1.1.2 | Docker Compose | PostgreSQL, Redis, MinIO, all service containers for local dev | P0 | 2d |
| M1.1.3 | Database schema & migrations | Drizzle ORM setup, initial migration for all Phase 1 tables | P0 | 3d |
| M1.1.4 | Shared types/utils package | Zod schemas for all API payloads, common utilities (fingerprint hash, timestamp normalization) | P0 | 2d |

#### M1.2 SDK Core

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M1.2.1 | Global error capture | `window.onerror` + `window.onunhandledrejection` handlers; capture message, stack, timestamp, URL | P0 | 3d |
| M1.2.2 | SDK init & config | `GHealClaw.init({ dsn, release, environment, beforeSend })` API; DSN parsing; sampling rate | P0 | 2d |
| M1.2.3 | Context collection | Browser, OS, screen size, URL, user-agent; `setUser()`, `setExtra()` APIs | P0 | 2d |
| M1.2.4 | Transport layer | HTTP POST batching (5s / 10 events), retry with exponential backoff, Beacon API for unload | P0 | 3d |
| M1.2.5 | Manual capture API | `captureException(error)`, `captureMessage(msg, level)` | P1 | 1d |
| M1.2.6 | Breadcrumbs | Auto-track console, DOM clicks, XHR/fetch, navigation (last 100 entries) | P1 | 3d |
| M1.2.7 | Build & publish | tsup build: ESM + CJS + UMD, type declarations, target < 10KB gzipped | P0 | 2d |

#### M1.3 Ingestion Gateway

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M1.3.1 | Events endpoint | `POST /api/v1/events` — Zod validation, DSN authentication | P0 | 2d |
| M1.3.2 | Rate limiting | Redis token bucket, per-project configurable limits, 429 response | P0 | 2d |
| M1.3.3 | Event enqueueing | Push validated events to BullMQ `error-events` queue | P0 | 1d |
| M1.3.4 | Health & metrics | `GET /health`, `GET /metrics` (Prometheus-compatible) | P1 | 1d |

#### M1.4 Sourcemap Service

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M1.4.1 | Upload API | `POST /api/v1/sourcemaps` — multipart upload, store to MinIO/S3 | P0 | 3d |
| M1.4.2 | CLI tool | `npx @g-heal-claw/cli upload-sourcemaps --release X --path ./dist` | P0 | 2d |
| M1.4.3 | Build plugins | Vite and Webpack plugins: auto-upload sourcemaps after build, optionally delete local maps | P1 | 3d |
| M1.4.4 | Stack trace resolution | Resolve minified frames to original source via `source-map` lib; cache results in Redis | P0 | 4d |
| M1.4.5 | Storage lifecycle | 90-day retention policy, automatic cleanup cron, storage usage tracking per project | P2 | 2d |

#### M1.5 Error Processor

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M1.5.1 | Event consumer | BullMQ worker consuming `error-events` queue, parallel across projects | P0 | 2d |
| M1.5.2 | Error fingerprinting | Deterministic hash from error type + normalized top 5 stack frames | P0 | 3d |
| M1.5.3 | Issue grouping | Match fingerprint to existing open Issue (increment count) or create new Issue | P0 | 2d |
| M1.5.4 | Stack trace resolution | Call Sourcemap Service to resolve raw trace, store `resolved_stack_trace` | P0 | 2d |
| M1.5.5 | Severity classification | Auto-classify by error type, frequency, and user impact; configurable rules | P1 | 2d |

#### M1.6 Admin Dashboard MVP

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M1.6.1 | Authentication | Register, login, JWT sessions, refresh tokens, password reset | P0 | 3d |
| M1.6.2 | Project management | CRUD projects, display DSN, manage team members | P0 | 3d |
| M1.6.3 | Issue list view | Paginated, sortable (last_seen, event_count, severity), filterable (status, severity, date) | P0 | 3d |
| M1.6.4 | Issue detail view | Resolved stack trace, breadcrumbs, browser/OS breakdown, event timeline chart | P0 | 4d |
| M1.6.5 | Issue status management | Resolve/ignore, resolve with version, auto-reopen on regression | P0 | 2d |

---

### Phase 2: AI Diagnosis & Notifications (Weeks 7-10)

**Goal**: Errors are automatically analyzed by AI with Markdown solutions; stakeholders are notified via multiple channels.

#### M2.1 AI Diagnosis Engine

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M2.1.1 | LLM provider abstraction | Support Claude (Anthropic) and GPT (OpenAI); configurable model/params per project | P0 | 3d |
| M2.1.2 | Diagnosis prompt engineering | Construct prompt: error + resolved stack + source code + breadcrumbs + context -> structured Markdown output | P0 | 4d |
| M2.1.3 | Source code context retrieval | Get surrounding code (20 lines) from sourcemap `sourcesContent` or git clone at release tag | P0 | 3d |
| M2.1.4 | Diagnosis trigger & queue | New Issue creation triggers diagnosis job; throttle + skip if matches ignore rules | P0 | 2d |
| M2.1.5 | Diagnosis display | Markdown rendering on Issue detail page with syntax-highlighted code blocks | P0 | 2d |
| M2.1.6 | Feedback loop | Users rate diagnosis (helpful / not helpful / partial); feedback stored for prompt improvement | P2 | 2d |
| M2.1.7 | Cost tracking | Track token usage per diagnosis; monthly budget per project; pause when exceeded | P1 | 2d |

#### M2.2 Notification Service

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M2.2.1 | Rule engine | Define per-project rules: trigger + channel + conditions; CRUD via API and dashboard | P0 | 3d |
| M2.2.2 | Email notifications | HTML email via SMTP/SendGrid with issue summary and dashboard link | P0 | 2d |
| M2.2.3 | Slack integration | Rich messages via incoming webhook; interactive buttons (resolve/ignore) | P1 | 2d |
| M2.2.4 | Generic webhook | JSON POST to arbitrary URL; HMAC signature; 3x retry with backoff | P1 | 1d |
| M2.2.5 | DingTalk integration | Robot webhook with Markdown-formatted message | P2 | 1d |
| M2.2.6 | Dedup & throttling | Cooldown per issue (default 1h); burst aggregation into summary | P1 | 2d |

---

### Phase 3: Auto-Fix Pipeline (Weeks 11-16)

**Goal**: System automatically generates code fixes, creates pull requests, and triggers deployment after human approval.

#### M3.1 Git Integration

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M3.1.1 | Repository connection | Connect to GitHub/GitLab via OAuth or PAT; validate access; encrypted storage | P0 | 3d |
| M3.1.2 | Source code checkout | Shallow clone at release tag; cache recent clones; cleanup old clones | P0 | 2d |
| M3.1.3 | File retrieval API | Fetch single file via GitHub/GitLab API without full clone | P1 | 2d |

#### M3.2 Auto-Fix Engine

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M3.2.1 | AI fix generation | LLM generates unified diff from diagnosis + source; validate patch applies cleanly; retry on failure | P0 | 5d |
| M3.2.2 | Fix validation | Run ESLint, tsc, project-configured checks on patched code; reject if validation fails | P0 | 3d |
| M3.2.3 | Sandboxed execution | Docker-isolated environment for fix generation/validation; CPU/memory/time limits; no external network | P0 | 4d |
| M3.2.4 | PR creation | Create branch `g-heal-claw/fix/{issue-id}`, commit, push, open PR with diagnosis as description | P0 | 3d |
| M3.2.5 | Fix review workflow | Dashboard diff viewer; owner approve/reject; approval triggers deployment; rejection stores feedback | P0 | 3d |

#### M3.3 Deployment Trigger

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M3.3.1 | GitHub Actions | Trigger workflow via API on PR merge; monitor status; report success/failure | P0 | 2d |
| M3.3.2 | GitLab CI | Same as above for GitLab CI pipelines | P1 | 2d |
| M3.3.3 | Generic CI webhook | Fire webhook with configurable payload for other CI systems | P2 | 1d |
| M3.3.4 | Deployment tracking | Track full lifecycle: triggered -> running -> success/failed; update Issue status | P0 | 2d |

---

### Phase 4: Analytics, Polish & Scale (Weeks 17-22)

**Goal**: Rich analytics and charts, performance at scale, production hardening.

#### M4.1 Analytics & Charts

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M4.1.1 | Error trend charts | Time-series of error counts by project/issue/severity; configurable ranges (1h-30d) | P0 | 3d |
| M4.1.2 | Browser/OS breakdown | Pie/bar charts of error distribution by browser, OS, device type | P1 | 2d |
| M4.1.3 | User impact metrics | Affected users per issue; error-free session percentage | P1 | 2d |
| M4.1.4 | Release comparison | Compare error rates between releases; highlight regressions | P1 | 3d |
| M4.1.5 | AI effectiveness metrics | Auto-fix acceptance rate, diagnosis helpfulness, time-to-resolution comparison | P2 | 2d |
| M4.1.6 | Custom dashboards | Drag-and-drop widget layout; save and share configurations | P2 | 5d |

#### M4.2 Performance & Scale

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M4.2.1 | Ingestion optimization | 10k events/s per gateway; connection pooling; payload compression; p99 < 100ms | P1 | 3d |
| M4.2.2 | ClickHouse integration | Stream events to ClickHouse; materialized views for analytics; sub-500ms queries on 100M+ rows | P1 | 5d |
| M4.2.3 | Data retention | Configurable retention per project; archive to cold storage (S3); keep aggregated stats | P1 | 3d |
| M4.2.4 | Multi-region | Deploy gateways in multiple regions; route to nearest; replicate to primary | P2 | 8d |

#### M4.3 Production Hardening

| ID | Requirement | Description | Priority | Est. |
|---|---|---|---|---|
| M4.3.1 | Encryption | TLS everywhere; encrypt sensitive fields at rest; sourcemaps encrypted in storage | P0 | 3d |
| M4.3.2 | Audit logging | Log all admin actions; immutable audit trail; queryable | P1 | 2d |
| M4.3.3 | RBAC refinement | Roles: Owner / Admin / Developer / Viewer with granular permissions | P1 | 2d |
| M4.3.4 | API documentation | OpenAPI 3.0 spec; Swagger UI at `/docs`; SDK JSDoc reference | P0 | 3d |
| M4.3.5 | Test suite | Unit (90%+ coverage), integration (API endpoints), E2E (SDK to dashboard flow) | P0 | 8d |

---

## 7. Dependency Graph

```
Phase 1:
  M1.1 (Scaffold) --> M1.2 (SDK)
       |-> M1.3 (Gateway) --> M1.5 (Error Processor) --> M1.6 (Dashboard)
       |-> M1.4 (Sourcemap) -------^

Phase 2: (depends on Phase 1)
  M2.1 (AI Diagnosis) -- depends on M1.5 + M1.4
  M2.2 (Notifications) -- depends on M1.5

Phase 3: (depends on Phase 2)
  M3.1 (Git) --> M3.2 (Auto-Fix) --> M3.3 (Deploy)
  M3.2 depends on M2.1 (AI Diagnosis)

Phase 4: (depends on Phase 1-3 data flowing)
  M4.1 (Analytics), M4.2 (Scale), M4.3 (Harden) can run in parallel
```

---

## 8. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| AI-generated patches break production code | Critical | Sandboxed validation + mandatory human review + staged rollout |
| Sourcemap parsing CPU-intensive at scale | High | Cache resolved traces in Redis; horizontal scale workers |
| LLM API cost overruns | Medium | Per-project token budgets; cache identical diagnoses; smaller model for triage |
| SDK bundle size too large | Medium | Tree-shaking; lazy loading; target < 10KB gzipped core |
| Sensitive source code sent to LLM | Critical | Self-hosted LLM option; data masking for secrets; user consent per project |
| Rate limiting bypass or over-throttling | Medium | Per-project configurable limits; monitoring + alerting on anomalies |

---

## 9. Verification & Acceptance Criteria

### Phase 1 Acceptance
- SDK captures uncaught error in test app
- Event arrives at gateway and returns 202
- Error processor creates Issue with resolved stack trace
- Dashboard displays Issue with original source locations

### Phase 2 Acceptance
- New Issue triggers AI diagnosis within 60s
- Markdown solution displayed on Issue detail page
- Notification sent to configured Slack/email/DingTalk channel

### Phase 3 Acceptance
- AI generates unified diff fix for a diagnosed issue
- Fix passes sandboxed validation (lint + type check)
- PR created in connected repository with diagnosis description
- Owner approves via dashboard -> deployment triggered

### Phase 4 Acceptance
- Analytics charts render with real event data
- Load test confirms 10k events/s ingestion throughput
- ClickHouse analytics queries return within 500ms on 100M+ events
- All API endpoints documented in Swagger UI

---

## 10. Summary

| Metric | Value |
|---|---|
| Total Requirements | 62 |
| Phases | 4 |
| Estimated Duration | ~22 weeks |
| Recommended Team | 3-4 engineers |
| MVP (Phase 1) | Self-contained functional monitoring system |
| Key Differentiator | AI-powered diagnosis + auto-fix pipeline |
