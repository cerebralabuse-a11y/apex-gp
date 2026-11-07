# Authenticated beta timing database

`supabase/schema.sql` is the source for the initial migration. The private `apex_private` schema contains profiles, attempt tickets and accepted lap records. All tables enable RLS with no browser-role policies. `anon`, `authenticated` and `PUBLIC` have no table/schema access or RPC execute rights. Only the backend's `service_role` may call the six public RPCs. Functions use `SECURITY INVOKER` and an empty search path; the standings view uses `security_invoker=true`.

The backend must authenticate each access token with Supabase Auth and supply that verified user's UUID. A UUID, name, JWT payload or user metadata supplied by a browser is never authorization. The service secret stays on the server. RPC arguments are parameters, not interpolated SQL.

| RPC | Inputs | Result |
| --- | --- | --- |
| `apex_profile_get` | `p_user_id` | `{profile:{driverName}|null,best:{rank,timeTicks,timeMs,recordedAt}|null}` |
| `apex_profile_set` | `p_user_id`, `p_driver_name` | `{driverName}` |
| `apex_begin_attempt` | `p_user_id`, `p_ruleset`, `p_track_id` | `{attemptId,startedAt,expiresAt,ruleset,trackId}` |
| `apex_claim_attempt` | `p_user_id`, `p_attempt_id`, `p_recording_hash`, `p_total_ticks` | `{state:'claimed'}` or `{state:'accepted',receipt}` |
| `apex_finish_attempt` | `p_user_id`, `p_attempt_id`, `p_recording_hash`, `p_result`, `p_rejection=null` | Saved/rejected receipt |
| `apex_leaderboard` | none | `{ruleset,trackId,updatedAt,entries:[{rank,driver,timeTicks,timeMs,recordedAt}]}` |

Driver names contain 3–20 ASCII letters, digits, underscores or dashes, with case-insensitive uniqueness. Emails and UUIDs are not included in public standings. There is one entry per driver's best accepted lap, capped at 50 entries per response. Equal `timeTicks` share the same competition rank; timestamp/UUID provide stable display ordering. Prize tie resolution remains a contest-policy decision.

An attempt is issued using the database clock, lasts ten minutes and belongs to one driver. Starts lock the driver's profile row to enforce at least ten seconds between starts and at most 20 starts in a rolling hour. A new start cancels older pending attempts. The current ruleset is `verification-original-balanced-v1`, original track `palm-beach-3753-v2`, 120 Hz and at most 57,600 total ticks.

Before replaying physics, the backend claims the attempt using a SHA-256 recording hash and frame count. This atomically changes pending to checking. Claim rejects submissions whose elapsed server time is less than the input duration minus a two-second tolerance. Duplicate checking requests return `attempt_in_progress`; the same recording may reclaim a checking attempt after a 60-second lease so a crashed verifier does not strand it. A different recording or frame count cannot reuse that ticket. Accepted attempts return the original receipt idempotently even after expiry.

After independent replay, the backend passes its computed result to finish. The transaction locks the profile and then the attempt, matching the order used by begin, validates map/ruleset, tick ranges, 28 corner gates, 31 crossings and numeric final state, computes milliseconds from ticks, inserts the lap and saves a receipt. Profile locking serializes personal-best comparisons. A unique `(ruleset,recording_hash)` constraint rejects an exact recording reused by another ticket. A `replay_duplicate` SQL exception rolls back that finish; the backend should then call finish with `p_result:null,p_rejection:'replay_duplicate'` to consume the invalid attempt. Failed physics replay uses the same null-result path. Rejected tickets cannot later be accepted.

Successful receipt: `{saved:true,personalBest,result,prizeEligible:false}`. Rejected receipt: `{saved:false,rejected:true,reason,prizeEligible:false}`. Controlled SQL errors use `P0001` messages: `invalid_driver_name`, `name_taken`, `profile_required`, `unsupported_ruleset`, `rate_limited`, `invalid_recording`, `attempt_not_found`, `attempt_used`, `attempt_expired`, `attempt_in_progress`, `attempt_too_early`, `invalid_result` and `replay_duplicate`. Never send raw unexpected database errors or secrets to the browser.

This milestone stores compact hashes and verifier receipts, not full input recordings. Retention for old attempt tickets, best-lap replay storage, robust bot controls, live input provenance, deployed runtime parity and prize eligibility remain launch gates. The wall-clock check raises the cost of fast fabricated uploads but cannot prove human input or stop a prerecorded/bot-driven recording submitted after waiting.

`tests/competition-database.test.mjs` executes the schema in real PostgreSQL compiled to WASM (PGlite), including service/browser roles, invoker grants, RLS and the attempt lifecycle. It does not simulate multiple PostgreSQL connections; hosted concurrency and Supabase Auth/PostgREST integration need their own checks.

`supabase/smoke-test.sql` is a hosted SQL check to run as `postgres` after the migration. It creates synthetic Auth users inside a `BEGIN`/`ROLLBACK` transaction, switches to the actual browser/service roles, checks grants and the profile/start/claim/finish/ranking path, then rolls every test row back. It does not send mail or create sessions. The same script is executed and checked for zero residual rows by the local PostgreSQL test.
