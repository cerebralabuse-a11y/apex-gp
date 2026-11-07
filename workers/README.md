# Verification feasibility adapter

`verification.mjs` reuses the Fetch API handler in `server/verification-handler.mjs` and the same numeric replay core used by the browser. It is a milestone-one prototype, not an authenticated competition service.

The Worker is **disabled by default**. Enabling it requires both `VERIFICATION_LAB_ENABLED=true` and a secret `VERIFICATION_LAB_TOKEN` of at least 32 characters. Requests must supply that secret in an `Authorization: Bearer` header. Store this token as a Worker secret, never in browser code, a URL, committed configuration, or logs. No Cloudflare resources have been provisioned by this change.

For local Node development, the parent server mounts the handler on loopback only. `GET /api/verification/status` describes the unranked lab; `POST /api/verification/replay` accepts a bounded JSON recording and returns the independently calculated result with `ranked:false`.

The body reader checks actual streamed bytes, even without Content-Length. Cross-origin browser requests are rejected, replay requests have a small in-isolate lab rate limit, and responses are not cached. This rate limit is neither durable nor global and must not be treated as production anti-abuse protection.

This verifies feasible physics, not human input, live timing, account ownership, one-time attempt ownership, prize eligibility, or leaderboard admission. Supabase authentication, durable single-use tickets, contest deadlines, production abuse controls, and independently tested cross-runtime consistency are later gates. Do not expose this as a ranked submission endpoint.
