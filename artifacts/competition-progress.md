# Authenticated leaderboard milestone

Preserve the original playable game, maps, inputs and browser practice records. Add an opt-in verified beta mode: signed-in player, public driver alias, server-issued single-use attempt, one outlap plus one flying lap, server replay, durable best lap and global standings. Prizes stay inactive. Ghosts and rooms remain separate milestones.

Dedicated Supabase project: APEX GP (`ozrvhsykznybckjimczj`), Mumbai, organization snehasliding. User approved creation only at $0; connector quoted $0/month and creation succeeded. No paid plan or add-on was selected.

For this beta, the portable Fetch API runs in Supabase Edge Functions using built-in server credentials. Vercel continues serving the game. This avoids copying a database secret into another host before multiplayer needs Cloudflare.

Implemented: private Postgres schema/RPCs, browser auth/leaderboard UI, authenticated Edge API and opt-in game recording. The hosted SQL smoke test passed and rolled back all synthetic data. Public status/standings return 200; unauthenticated mutations return 401; foreign browser origins return 403; direct browser RPC execution is denied. A 49-test full suite passed, followed by the additional client retry regression (50 checks total). Production build and frozen physics hashes pass.

Auth site URL and five exact callback URLs were saved for the existing Vercel domain and localhost ports 4173/5188. The user reported signing into the game. The final automated signed-in driving test remains incomplete: computer use stopped because it could not reliably identify Chrome's page. No test lap is claimed as saved. These changes remain on `codex/authenticated-leaderboard`, based on the verifier foundation, for review; no production frontend merge.

Known launch gates: SMTP/provider configuration for public sign-up; signed-in end-to-end lap and physical-phone/Firefox/Safari/Deno replay evidence; review of timing ties, eligibility and contest rules. Physics verification does not establish human input or prevent bots. The beta must not advertise prize eligibility.

Supabase security advisors returned only three informational notices for RLS without policies on the intentionally private tables. No browser-role policies are provided because direct browser access is denied; the service backend alone calls the RPCs. Performance advisors returned no findings. The local migration filename matches the hosted migration version `20261107183340`.
