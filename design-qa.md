# Navi Mumbai map recreation QA

final result: passed for the playable map reconstruction

## Targets and interpretation

- `design/palm-beach-circuit-reference.png`: authoritative route reference. Trace its 14 numbered corners and road outline, then scale the sampled centerline to the stated 3.753 km.
- `design/navi-mumbai-map-reference.png`: low-poly scenery reference. Recreate the lake and peninsula, water bodies, Jewel diamond, flamingo sculpture, temple, glass office district, blue-roofed sports academy with running oval/courts, Gymkhana, Karave gateway, residential streets, palms and wooded belts.
- User-selected lighting: retain the existing warm sunset. The reference illustration's bright daylight is intentionally not copied.
- `design/navi-mumbai-overview.png`: actual 3D circuit atlas in the desktop browser. `design/navi-mumbai-race.png`: actual driving scene. `design/navi-mumbai-mobile.png`: 428 x 800 responsive map inspection.

## Visual comparison

The route follows the second image's broad topology: east-west starting straight, northwestern bends and tight west-side sequence, long curved lakeside section, southern hairpin and eastern return. All 14 corner labels, the minimap, racing surface, kerbs, barriers, grid, driving line and AI share the sampled track data. The map is north-up in the minimap.

The first image supplies the architectural vocabulary and relative districts. The new world contains real 3D geometry throughout, including the lake indentation beside the landscaped Jewel peninsula, southern water bodies, park paths, separate urban streets and landmark meshes. The screenshot illustration is stylized and its road geometry differs from the supplied circuit diagram; the circuit diagram takes priority for the race route. Geometry, exact tree distribution, architectural details and landmark scale remain artistic approximations rather than an asset-for-asset or surveyed reconstruction.

## Corrections verified

- Removed overlapping terrain and shore surfaces beneath the water, resolving flickering and triangular bands in the aerial view. Actual terrain holes now surround the water meshes.
- Added an aerial camera with drag orbit, zoom buttons/wheel, optional labels and a return control. Opening it freezes the simulation and closing it restores the prior session.
- Corrected aerial fog distance and sky placement so the full map renders in the portrait camera framing.
- Kept map text within the viewport and reduced the desktop title height to avoid the northern corner labels.
- Added physical numbered corner boards, red/white kerbs, lane dashes, grid boxes and a chequered start line.
- Batched architecture and park furniture by material and instanced foliage, palms, crowds, kerbs and railings.

## Verification

- Eight automated tests passed, including 3.753 km length, ordered corner numbering, straight eight-car starting grid, physics/energy/contact/checkpoint checks, and all eight cars completing a three-lap race without recovery.
- Browser: map entry/return, zoom, label toggle, pointer orbit, 428 x 800 portrait rendering, keyboard acceleration, photo mode and live HUD inspected. Driving capture shows 136 km/h on lap one.
- Browser console: no errors or warnings in the final scene.
- Existing car cameras, lighting options, race formats, sound and driving mechanics are preserved. Physical gamepad hardware was not tested in this update.

## Remaining polish

Individual buildings, tree placements and the illustrative composition can be refined further if more detailed landmark references are supplied. This does not block the playable map or its visual inspection.

## Approved circuit and car visibility repairs — 28 October 2026

- All seven trial-lap findings addressed: academy platform/perimeter clearance, rotated-car barrier contact, high-speed camera framing, background road layering, continuous rail/concrete/kerb bands, constant-width shoreline, and recovery/photo visibility.
- Additional flicker sources addressed: front-wheel spin/steering rotation order, overlapping body stripe/decal layers, and continuously sliding shadow-map texels. Recovery no longer hides the car; its existing collision grace period remains.
- Fourteen tests pass, including a whole-circuit scenery sweep, the actual steered/rolled car footprint, camera projection through 326 km/h at landscape and portrait aspect ratios, all fourteen corners, and the original eight-car three-lap race.
- A temporary browser inspection scene using the production world, car, camera targets and physics completed a full AI-driven test lap in 84.13 simulation seconds. It was removed before packaging.
- Normal game verified by keyboard: acceleration to 151 km/h in Chase Cam with the full car visible, recovery followed by photo mode, and five successive photo captures with the car remaining visible. Browser console reported no errors.
- Race trace, circuit length, landmark positions including the blue glass complex, lighting palette, input bindings, power, grip and ERS tuning retained. Only boundary contact and visual presentation changed.

## Recording follow-up — sidepod flicker

- Decoded the user's 7.27-second recording into 218 frames. The black sidepod vents intermittently disappear into the yellow strips; this is separate from recovery visibility and wheel animation.
- Both box top faces were at model height .79. Raised the vent by .03 so its top is .82, leaving actual geometry separation on both sides and on every car.
- Added a ray-based regression check at three positions per side. It failed against the previous model and passes with the repair. All fifteen tests pass.
- Captured 49 moving Chase frames and a second moving Arcade sequence in the normal game, including 214 km/h in Chase and 154 km/h in Arcade. No disappearing vent patches observed. Controls, circuit and handling are unchanged.

## Manual mobile controls and rendering — 29 October 2026

- Added a proportional steering pad, a combined hold-GAS/slide-up-ERS pad and separate priority brake. All inputs remain manual. Pointer identities are tracked independently; cancellation, pauses, blur, orientation changes and resets clear held inputs.
- Added a compact top HUD, safe-area-aware thumb zones, sensitivity, a recovery button and pause-menu access to settings. Desktop keyboard and gamepad bindings remain unchanged.
- Landscape/fullscreen requests are feature-detected. Portrait starts wait for rotation; rotating during a race pauses it. The rotation prompt makes background controls inert, and landscape return requires Resume.
- Mobile Optimized keeps the original scene palette and models, a local 2048 shadow map, adaptive 3D resolution, separate high-resolution HUD, 30 FPS option and nearby full-detail crowd instances. Distant spectator instances and inactive particle updates are reduced.
- An actual previous-build comparison at the same camera showed High unchanged at 328 draw calls / 972,756 submitted triangles. Mobile Optimized used the same 328 calls / 743,460 triangles (23.6% fewer), with shadow-map area reduced by 75%. This is a render-work comparison on the desktop preview, not a measured Redmi frame-rate guarantee.
- Responsive preview verified at 873 x 393 and 568 x 320; portrait handling at 393 x 873. The car stayed at 0 km/h without GAS; native pointer holds activated GAS and ERS together, reaching 290 km/h in the final straight-line boost run. Release cleared the pressed states. Browser console reported no errors.
- Nineteen automated checks cover the existing circuit/physics/race, pointer combinations and cancellation, adaptive resolution and restoration of full crowd detail. Physical Android/iPhone multi-touch, fullscreen permissions and sustained thermal performance still require device testing.
