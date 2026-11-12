# Verification feasibility adapter

## Private rooms deployment

Deploy `workers/rooms.mjs` with `wrangler.rooms.jsonc`. This provisions the `RaceRoom` Durable Object; its `GAME_ORIGINS` variable is an exact comma-separated allowlist for the production game and the current Vercel branch preview. Keep preview origins exact rather than allowing every `vercel.app` site.

The public `dist/competition-config.json` contains the deployed Worker origin; it is an endpoint, not a secret. `APEX_ROOMS_URL` can override that origin during a Vercel build. Localhost uses the local Worker at `127.0.0.1:8791`.

Before deployment, confirm the Worker's Supabase URL and publishable key match the project's competition function, deploy the Worker, request `/status`, then set `APEX_ROOMS_URL` and rebuild the Vercel preview. Check sign-in, profile lookup, room create/join, ready/start, reconnect, and leaving with two real test accounts. Room results are unranked and do not write leaderboard rows.

`verification.mjs` reuses the Fetch API handler in `server/verification-handler.mjs` and the same numeric replay core used by the browser. It is a milestone-one prototype, not an authenticated competition service.

The Worker is **disabled by default**. Enabling it requires both `VERIFICATION_LAB_ENABLED=true` and a secret `VERIFICATION_LAB_TOKEN` of at least 32 characters. Requests must supply that secret in an `Authorization: Bearer` header. Store this token as a Worker secret, never in browser code, a URL, committed configuration, or logs. No Cloudflare resources have been provisioned by this change.

For local Node development, the parent server mounts the handler on loopback only. `GET /api/verification/status` describes the unranked lab; `POST /api/verification/replay` accepts a bounded JSON recording and returns the independently calculated result with `ranked:false`.

The body reader checks actual streamed bytes, even without Content-Length. Cross-origin browser requests are rejected, replay requests have a small in-isolate lab rate limit, and responses are not cached. This rate limit is neither durable nor global and must not be treated as production anti-abuse protection.

This verifies feasible physics, not human input, live timing, account ownership, one-time attempt ownership, prize eligibility, or leaderboard admission. Supabase authentication, durable single-use tickets, contest deadlines, production abuse controls, and independently tested cross-runtime consistency are later gates. Do not expose this as a ranked submission endpoint.

