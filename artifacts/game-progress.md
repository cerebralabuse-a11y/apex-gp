# F4 model, driving feedback and garage

Preserve both maps (original default, city beta), warm sunset, input bindings and the existing balanced driving model. Replace rainbow placeholder vehicle with authored Mygale M21-F4-inspired geometry, not a claimed official CAD asset. RPPL's public series release identifies the M21-F4 Generation 2; use manufacturer photos for form.

Implemented: authored car, lazy lit turntable garage, six liveries, three grip/drag setups; camera-only boost/acceleration feel, existing HUD streak improvement, wind and deployment audio. Setup changes only before a session; personal bests saved per map and setup, preserving balanced legacy key. No paid or power upgrades. Independent review found depleted-battery boost pulsing; fixed with release-to-rearm and a regression check.

Verified: all 26 tests passed, including full eight-car three-lap race, geometry/decals/wheel roll/camera bounds, setup tradeoffs and default regression, camera impulse/decay/off mode. Browser checks cover desktop and landscape phone garage, persisted setup/livery selection, session setup lock, acceleration, ERS and braking, pause/recovery, original and city beta boot. Local preview http://127.0.0.1:5188/. See final-evidence.md for limits and captures. Publication pending final source commit and Vercel status.
