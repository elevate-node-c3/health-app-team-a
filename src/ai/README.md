# AI conversations

## Architecture

The controller handles HTTP, identity cookies and SSE. `AiService` implements conversation use cases using injected `AI_REPOSITORY`, `AI_UNIT_OF_WORK`, `AI_PROVIDER`, and the existing `SPECIALTY_REPOSITORY` ports. Domain models and ports contain no TypeORM or provider SDK dependencies. DTO validation lives in `dto/`. TypeORM entities, mappers, repository adapters and the transaction implementation live under `infrastructure/`, matching the appointment and payment modules. Only the unit of work opens database transactions; its repository bundle and outbox events share one EntityManager. The provider adapter handles the server-only HTTP API. Tests substitute domain ports without database mocks.

Run `npm run migration:run` before starting the backend. Configure `AI_API_KEY` in server secrets, `AI_MODEL` (default `gpt-4o-mini`), and optionally `AI_BASE_URL` (HTTPS OpenAI-compatible Chat Completions endpoint). No key is returned to clients. Missing configuration produces a safe failure. The provider must support streamed chat completions and `stream_options.include_usage`.

Set `AI_INPUT_COST_PER_MILLION` and `AI_OUTPUT_COST_PER_MILLION` to your model's current USD rates. Cost and tokens are null when rates or provider usage are unavailable; never interpret them as zero. Every terminal response stores outcome, latency, usage availability, tokens and cost; normal completions also store model. Errors retain generated content and append a generic localized message. Provider error bodies are neither returned nor logged.

## Client protocol

- `POST /ai/conversations` creates a conversation; `GET /ai/conversations` lists the newest 100.
- `GET /ai/conversations/:id` returns persisted history (up to 200 exchanges).
- `POST /ai/conversations/:id/messages` accepts `{ "requestId": "client-generated UUID", "content": "symptoms" }` and returns SSE. Keep the request ID for retries.
- `GET /ai/conversations/:id/messages/:messageId/stream` reconnects without generating anything.

Use credentialed fetch with the existing auth cookies. POST streaming requires fetch/ReadableStream rather than native EventSource. `snapshot` events contain the entire current message; replace displayed text, do not append snapshots. `done` contains terminal content, suggestion and metrics. A repeated POST with the same request ID replays the same message without quota charges or provider calls; changing its content is a 409. Each conversation permits one active response. The stream flushes compression buffers and disables proxy buffering. Generation continues after disconnect and each visible provider delta is committed before clients can read it. Multiple server instances read the same persisted snapshots.

## Search handoff

Completed suggestions include `specialty`, `nearMe`, `availability`, `requiresLocation`, and `search: { method: "GET", path: "/search", query: { specialty: "catalog UUID", availability: ["Today"] } }`. The client passes this query to Sprint 2 search after user confirmation. Near-me suggestions require client geolocation and the existing `/search/map` DTO; coordinates are never invented. Suggestions cannot invoke booking, cancellation or rescheduling: this module imports no appointment or payment service and supplies no provider tools.

## Ownership, limits and recovery

An unpredictable 256-bit HttpOnly SameSite cookie identifies a guest device. Ownership checks use the authenticated account when present and otherwise the guest capability; missing or foreign IDs return 404. On the first authenticated AI request, all conversations for the supplied guest capability transfer atomically to that account and the capability rotates. This is the integration point for AUTH-6; registration alone does not claim data before a valid authenticated session exists. Other devices cannot claim the same conversations after transfer. Clearing cookies creates a new device identity, as with other cookie-based guest quotas.

Atomic PostgreSQL upserts enforce 10 guest or 50 authenticated message attempts per calendar day in Africa/Cairo, across all conversations and server replicas. Failed attempts count; replays do not. Guest quota does not move into the account quota. Locks serialize requests and migration. Conversations stop at 200 exchanges; create a new conversation afterward.

Provider history contains only the latest eight completed user/assistant pairs, with at most 16,000 JavaScript UTF-16 code units total, plus the system instruction and latest input (at most 4,000 code units). Oldest pairs are discarded; failed/partial replies and internal suggestion JSON are excluded. Output is capped at 1,500 provider completion tokens and 24,000 raw characters. The catalog is capped at 200 specialties. This is a deterministic character bound, not a claimed tokenizer-specific token count.

Provider calls time out after 90 seconds. A process crash preserves all committed partial content; reopening after 120 seconds marks unfinished responses interrupted and emits their terminal event. No automatic retry or full regeneration occurs. Open a new request explicitly to retry. Database failure may prevent saving the last provider delta; already committed deltas remain durable. The durable outbox emits `ai.conversation.started` and `ai.message.answered`, with IDs and operational metrics rather than symptom text.

Arabic language matching, specialty relevance and emergency guidance are instructed in the provider prompt. Validate these with the configured live model before release; deterministic tests cannot guarantee model clinical or linguistic quality.
