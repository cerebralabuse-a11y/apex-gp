# Lap-verification foundation

Scope: first milestone only. Preserve the public game, maps, controls and practice records. Build a local browser recording lab, headless Node verification endpoint and guarded Cloudflare adapter. No accounts, official leaderboard, paid resources or prizes are activated.

Shared verification core: fixed 120 Hz input quantization applied before simulation; original numeric track snapshot; Balanced setup; standing start plus outlap and one flying lap. Replay server computes its own gates/time/state. Reject malformed, oversized, wrong-version, truncated and extra recordings. Browser and server use the same numeric track and core.

Complete for this milestone: browser-recorded full attempt matched independent Node and local Cloudflare workerd replays. 37 tests passed, including actual HTTP boundaries and original game regressions. Build passed. See verification-evidence.md for measured differences, commands and remaining limits. Firefox/Safari, physical phones and deployed edge validation remain gates before prize launch. Work stays on its separate branch; production gameplay is unchanged.
