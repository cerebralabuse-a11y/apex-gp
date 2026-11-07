# Verification foundation — first milestone

Implemented on `codex/lap-verification-foundation`. The normal playable game is unchanged. The lab and its Node routes run only on the local development server. No accounts, public API, cloud resources, official leaderboard, or prize results were activated.

## Observed result

The browser reference driver recorded 19,927 fixed 120 Hz control frames, covering the outlap and one flying lap. The JSON recording was 302,998 bytes. Applying quantization before local simulation is part of the shared protocol.

- Browser flying lap: 81,916.667 ms (displayed 1:21.916).
- Node replay: same ticks and time; final position difference 3.75e-12 m, largest heading/speed/energy difference 1.78e-15.
- Cloudflare local workerd replay: same ticks and time; final position, heading, speed and energy differences 0.
- Both replays crossed 28 ordered corner gates, covering 14 in each lap, plus start/finish crossings.

This is a recorded browser run replayed by independent backend processes. The reference driver is automated and accelerated for feasibility testing; this is not evidence of a human competitive lap. Manual acceleration and stop/invalidation were also exercised in the lab. Narrow and desktop layouts were inspected.

## Checks

37 tests passed, including the existing full eight-car race, mobile controls, map boundaries and rendering geometry checks. New tests cover:

- Full outlap/flying-lap replay consistency and exact frozen-track equality with the original game.
- Unknown versions/maps, supplied initial states or claimed times, malformed controls, truncation and trailing frames.
- Track limits, recovery and setup invalidation.
- Actual HTTP Host/origin rejection, method Allow headers, bad JSON, streamed oversize bodies without Content-Length, rate limits and Retry-After.
- Disabled-by-default production Worker and secret-token enforcement.

`node scripts/check-verification.mjs` verifies pinned SHA-256 hashes of physics, setup, verifier and the frozen numeric track. A change requires a new ruleset before re-freezing. `node build.mjs` passed. Wrangler 4.158.0 successfully ran the same verifier in local workerd; no Cloudflare login or paid deployment was used.

Independent review caught missing response headers; the adapter now retains application headers while removing upstream compression/transport headers from decoded JSON. The browser comparison checks all returned vehicle-state fields, timing, ruleset/map IDs and gate counts. No stale successful comparison is retained during a new verification.

## Scope limits before competition

Clock resolution is one 120 Hz tick (8.333 ms), despite formatted millisecond decimals. Sub-tick scoring requires an explicit later ruleset. No authentication, single-use server attempt tickets, wall-clock enforcement, persistent replay protection, prize eligibility or bot detection is implemented in this physics prototype. It must not be exposed as an official leaderboard endpoint. Firefox, Safari, physical Android/iOS and deployed Cloudflare edge execution remain untested; local workerd and the Chromium-based in-app browser are the current runtime evidence.

Raw screenshot: `artifacts/verification-captures/workers-match.png` (ignored local QA artifact).

Next milestone: authenticated attempt lifecycle, persistent verified records and leaderboard, after the remaining runtime/competition-policy gates are addressed.
