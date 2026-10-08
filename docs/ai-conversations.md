# AI conversations

## Architecture

The controller handles HTTP and SSE using the shared authentication guard device identity. `AiService` implements conversation use cases using injected `AI_REPOSITORY`, `AI_UNIT_OF_WORK`, `AI_PROVIDER`, and the existing `SPECIALTY_REPOSITORY` ports. Domain models and ports contain no TypeORM or provider SDK dependencies. DTO validation lives in `dto/`. TypeORM entities, mappers, repository adapters and the transaction implementation live under `infrastructure/`, matching the appointment and payment modules. Only the unit of work opens database transactions; its repository bundle and outbox events share one EntityManager. The provider adapter handles the server-only HTTP API. Tests substitute domain ports without database mocks.

Run `npm run migration:run` before starting the backend. Configure `AI_API_KEY` in server secrets, `AI_MODEL` (default `gpt-4o-mini`), and optionally `AI_BASE_URL` (HTTPS OpenAI-compatible Chat Completions endpoint). No key is returned to clients. Missing configuration produces a safe failure. The provider must support streamed chat completions and `stream_options.include_usage`.

Set `AI_INPUT_COST_PER_MILLION` and `AI_OUTPUT_COST_PER_MILLION` to your model's current USD rates. Cost and tokens are null when rates or provider usage are unavailable; never interpret them as zero. Every terminal response stores outcome, latency, usage availability, tokens and cost; normal completions also store model. Errors retain generated content and append a generic localized message. Provider error bodies are neither returned nor logged.

## Client protocol

- `POST /ai/conversations` creates a conversation; `GET /ai/conversations` lists the newest 100.
- `GET /ai/conversations/:id` returns persisted history (up to 200 exchanges).
- `POST /ai/conversations/:id/messages` accepts `{ "requestId": "client-generated UUID", "content": "symptoms" }` and returns SSE. Keep the request ID for retries.
- `GET /ai/conversations/:id/messages/:messageId/stream` reconnects without generating anything.

Use credentialed fetch with the existing auth cookies. POST streaming requires fetch/ReadableStream rather than native EventSource. `snapshot` events contain the entire current message; replace displayed text, do not append snapshots. `done` contains terminal content, suggestion and metrics. A repeated POST with the same request ID replays the same message without quota charges or provider calls; changing its content is a 409. Each conversation permits one active response. The stream flushes compression buffers and disables proxy buffering. Generation continues after disconnect and each visible provider delta is committed before clients can read it. Multiple server instances read the same persisted snapshots.

## Search handoff

Completed suggestions include `specialty`, `nearMe`, `availability`, `requiresLocation`, and `search: { method: "GET", path: "/search", query: { specialty: "catalog UUID", availability: ["Today"] } }`. The client passes this query to Sprint 2 search after user confirmation. Near-me suggestions require client geolocation and the existing `/search/map` DTO; coordinates are never invented. Suggestions cannot invoke booking, cancellation or rescheduling. The module imports read-only repositories to retrieve factual data but executes no state-changing actions.

## Safety & Capability Layer

The AI operates under a strict safety and capability boundary:

- **Reviewed artefact:** every safety rule lives in `src/ai/domain/safety-rules.json`, carrying a version, a review date, and a clinical sign-off. Code holds no safety wording of its own; changing the file requires clinical review before merge.
- **Emergency Bypass:** an emergency keyword in the input bypasses normal generation entirely — the model is never called — returns the artefact's urgent-care response, suppresses the search suggestion, and emits `ai.emergency.detected`. Matching runs on normalised text, so curled apostrophes from phone keyboards and Arabic hamza/ta-marbuta variants cannot slip past a keyword.
- **Prohibited requests:** diagnosis, medication-choice, and dosage requests are declined in code before the provider is called, from the artefact's wording. The patterns are request-shaped: a patient volunteering history ("I was diagnosed with asthma") still reaches normal triage.
- **Capabilities & Tool Calling:** factual doctor profiles, fees, availability schedules, and policy snippets come from the platform via tool calling (`get_doctors`, `get_availability`, `get_appointments`, `get_policy_snippets`). Policy text is selected from the artefact, never authored in code.
- **Invented doctors are removed:** the prompt forbids inventing doctors, but enforcement does not rely on it. Any sentence naming a doctor that no capability call returned is stripped from the final response; if that empties the answer, the artefact's fallback text is returned.
- **Identity Trust:** `get_appointments` declares no patient-identifier parameter at all and resolves identity from the owner key the controller derives from the authenticated session. A model-generated or prompt-injected patient ID therefore has nothing to bind to. Guests are refused appointment access outright.
- **Medical disclaimer:** attached by the system on every path — normal answers, rule-based replies, and failures — and stripped again before an answer is replayed to the model as history.
- **Cost and liveness ceilings:** at most four tool rounds and a 100s cumulative budget per answer; the staleness window is held above that budget so a long multi-round answer is never discarded mid-flight.
- **Under-18 Restrictions:** the AI refuses medical guidance when the user states they are under 18, prompting them to consult a parent or guardian. This rule is interpolated into the system prompt from the artefact. It is the one rule that is *not* deterministically enforced: the platform stores no date of birth, so age cannot be resolved from the session the way patient identity is.

## Ownership, limits and recovery

The authentication guard supplies the shared `deviceId` cookie and request identity. Ownership checks use the authenticated account when present and otherwise that device ID; missing or foreign conversation IDs return 404. Authenticated AI requests atomically transfer that device's guest conversations to the account. AI routes do not create or rotate their own cookie. Clearing cookies creates a new device identity, as with other cookie-based guest quotas.

Atomic PostgreSQL upserts enforce 10 guest or 50 authenticated message attempts per calendar day in Africa/Cairo, across all conversations and server replicas. Failed attempts count; replays do not. Guest quota does not move into the account quota. Locks serialize requests and migration. Conversations stop at 200 exchanges; create a new conversation afterward.

Provider history contains only the latest eight completed user/assistant pairs, with at most 16,000 JavaScript UTF-16 code units total, plus the system instruction and latest input (at most 4,000 code units). Oldest pairs are discarded; failed/partial replies and internal suggestion JSON are excluded. Output is capped at 1,500 provider completion tokens and 24,000 raw characters. The catalog is capped at 200 specialties. This is a deterministic character bound, not a claimed tokenizer-specific token count.

Provider calls time out after 90 seconds. A process crash preserves all committed partial content; reopening after 120 seconds marks unfinished responses interrupted and emits their terminal event. No automatic retry or full regeneration occurs. Open a new request explicitly to retry. Database failure may prevent saving the last provider delta; already committed deltas remain durable. The durable outbox emits `ai.conversation.started` and `ai.message.answered`, with IDs and operational metrics rather than symptom text.

Arabic language matching, specialty relevance and emergency guidance are instructed in the provider prompt. Validate these with the configured live model before release; deterministic tests cannot guarantee model clinical or linguistic quality.
