# F4, driving feel and garage verification

## Changes and scope

Original map remains default; City Map Beta stays opt-in. Maps, input bindings, steering sensitivity, game modes and existing Balanced performance are preserved. Car appearance uses authored Mygale M21-F4-inspired proportions rather than a claimed exact factory model. Reference links are in README.md.

Garage adds orbit by pointer or arrows/Home, auto rotation, front/side/rear views, six liveries, and three actual grip/drag presets. Setups lock during a running session and personal best keys are separated by map/setup. Legacy Balanced times retain their key. Garage renders lazily at1xDPR within700k pixels,512px shadows. Main-world draw loop pauses while the garage is shown.

Driving feedback uses a bounded, nonaccumulating camera offset, eased FOV/pullback, initial ERS kick, peripheral streaks and synthesized wind/boost sound. Full/Subtle/Off and OS reduced motion are supported. Camera code never mutates vehicle state. Empty ERS must be released before redeployment, preventing repeated launch effects on individual regen ticks. Boost audio has a gated bus so pause/mute suppress an in-progress transient.

## Checks run

- `node --test tests/*.test.mjs`:26passed,0failed. Includes full eight-car three-lap original-circuit race, city AI lap, existing mobile gestures/cancellation, geometry/decals, steered/rolling wheels, full camera framing, wall/shore continuity, setup default/tradeoffs and storage isolation, depleted ERS rearming, bounded boost/decay/off feedback.
- `node build.mjs`: production static assets built. Local analytics remains disabled; Vercel enables its existing analytics integration during deployment.
- JS syntax checks and `git diff --check`.
- Browser: original boots without Mapbox; beta boots with its3.626km label/attribution, no console errors. New garage opens on both.
- Desktop1280x720, phone landscape873x393 and narrow layout inspected. Landscape garage keeps complete car, view buttons and exit in view; setup panel scrolls independently. Presets/liveries apply and persist. Running-session presets disable correctly.
- Actual input acceleration, ERS, braking, camera cycling, recovery and pause exercised. Active touch-boost capture shows42km/h, ERS97%, lit combined gas/ERS pad. Synthetic camera checks establish magnitude/decay more reliably than a still image. No new full manual trial lap is claimed.

## Render evidence and tradeoffs

Old car80meshes/4,744triangles; new car27meshes/10,070triangles, measured directly from both factories. Static bodywork is merged per material; wheel pivots remain independent. Existing full collision proxy remains conservative.

Garage31draws/10,584triangles/31geometries/2textures in the instrumented preview. Sample original active view214draws/~977k triangles; mobile sample275draws/~748k triangles. These whole-world samples exceed the skill's starting mobile/triangle budgets; the dense original environment dominates the totals. This pass reduces vehicle mesh submissions but does not claim a whole-world optimization or a measured phone FPS improvement. No physical Redmi measurement was performed. No game-wide premium score is claimed for this scoped upgrade.

## Local raw captures

Ignored raw QA files remain in `artifacts/f4-upgrade/`:garage-final.png,garage-mobile.png,garage-narrow.png,city-garage.png,accelerating.png,mobile-boost-02.png and motion frames. Some exploratory speed-motion frames show wall contact or capture before actual deployment; they are not presented as proof of sustained boost. `model-cost.json` contains the factory comparison.

No screenshot-diff harness was added: the affected model geometry/camera regressions are deterministic tests, while live particles, user input and the network-fed beta scene make broad pixel baselines noisy. Raw desktop/mobile captures accompany the behavior tests.
