# APEX GP

The **original 3.753 km map is the default**. Choose **Navi Mumbai city · BETA** in Race Setup (or use `?map=city`) to test the work-in-progress geographic map. The title screen also has a map shortcut. Loading a map starts a fresh session; personal bests stay separate. The original map makes no Mapbox SDK, style or tile requests.

## City Map Beta

A browser-based 3D open-wheel racer using the user's selected Mapbox city area around Jewel Lake, Navi Mumbai. The current street-aligned circuit measures approximately 3.626 km. Cars, asphalt, kerbs, barriers and the mapped mall model share Mapbox's WebGL canvas and camera. Buildings, roads, shorelines and park surroundings come from the supplied live Mapbox style. Warm sunset lighting and the existing arcade HUD and driving controls are retained. Three.js is vendored locally; the static game runs directly from `dist/`.

The selected footprint is saved in `dist/city-area.geojson`: `[73.002858,19.018653,73.021193,19.035861]` (approximately 3.69 km²). The route in `dist/city-circuit.geojson` follows mapped connected streets, replacing the old image coordinate system. Metres remain the physics unit. The new track has its own personal-best key; old 3.753 km lap records are not compared with it.

Mapbox GL JS 3.33.0, style and tiles require an internet connection. The user's public token is intentionally client-side. Mapbox/OpenStreetMap attribution stays visible and clickable. Mapbox geometry supplies the city's initial fidelity; it is not a surveyed or certified racing circuit. The Nexus Seawoods podium and two blue-glass towers use their mapped footprints and heights. Native objects are cleared from the racing corridor and outside the selected area with a scoped clip layer; tile loading remains managed by Mapbox and is not an offline city export.

The original hand-built 3.753 km map is the root-URL default and is also available at `?map=classic` and is also offered if the live city fails to load. The existing title screen, three game modes, AI, 120 Hz vehicle simulation, wall collisions, ERS rules, manual mobile gestures, pause and recovery remain in place.

Run with Node.js:

```sh
npm run dev
```

Open http://localhost:4173. Run the physics and full-field race tests with `npm test`.

## Mobile racing

Touchscreens get manual two-thumb controls and the **Mobile Optimized** graphics preset by default. Race in landscape: slide the left pad to steer, hold the lower GAS region to accelerate, and slide the same finger upward into ERS to boost while keeping the throttle open. Move to the separate BRAKE button to slow down; lift off both pedals to coast. Touch braking overrides throttle and boost. There is no auto-acceleration.

Settings includes steering sensitivity, touch control visibility and a 30 FPS battery-saver option. The compact HUD keeps both thumb zones clear. Pause, focus loss, cancelled touches and rotation clear held inputs. Supported phone browsers request fullscreen and landscape locking on Play; other browsers show a rotation prompt. Returning from portrait requires an explicit resume.

On the city map, Mobile Optimized keeps buildings and facades, uses 1024-pixel car/track shadows, disables native 3D trees, and adapts the shared 3D canvas within a 1.4-megapixel budget. High enables 3D trees and 2048-pixel car/track shadows. Performance disables facade detail and shadows. Canvas scaling uses the public Mapbox resize API; a second independently rendered 3D canvas is not layered over the map. The HUD stays independent of the 3D resolution. These settings do not change the 120 Hz vehicle simulation or ERS rules. Physical-device performance varies; responsive browser checks do not certify every phone.

## Vercel Analytics

`npm ci` installs `@vercel/analytics`. `npm run build` copies its browser SDK/license into `dist/vendor/` and writes the separate analytics entry. `vercel.json` runs that build and serves `dist/`. Vercel builds (`VERCEL=1`) enable pageview tracking and use Vercel's supplied observability client configuration when present. Local and Sites builds leave collection disabled.

Enable **Web Analytics** in the Vercel project's Analytics tab, then redeploy. No API key is required in the game. The integration records pageviews; it does not send player names, lap times or custom gameplay events. The current Vercel URL is https://apex-gp-kohl.vercel.app/.

## Driving

- **W / ↑** accelerate; **S / ↓** brake, then reverse.
- **A D / ← →** steer; **Shift** deploy rechargeable ERS.
- **C** cycles the elevated arcade, cockpit, and chase cameras.
- **R** recovers the car to the nearest point on the circuit.
- **Esc / P** pauses. **M** toggles synthesized engine audio.
- **B / MAP** opens the interactive 3D circuit atlas. Drag to orbit, scroll or use + / − to zoom, and toggle landmark/corner labels. The race freezes while the map is open and resumes when it closes.
- **V** toggles a clean, frozen photo view from the grid or during a race.
- **G** opens the garage, **O** opens race setup, and **H** opens help.
- Gamepad: left stick, RT, LT, A for ERS, Y for camera, Start to pause.
- Touch controls appear on devices with coarse pointers.

Grand Prix has eight drivers and three laps. Time Trial records circuit-specific personal bests in browser storage. Free Drive has no finish limit. Race setup offers three difficulty levels, lighting, graphics quality, audio, and an optional driving line. The garage changes the player's livery. The raised gantry fades near the player to keep the elevated camera clear.

Vehicle handling includes speed-dependent steering, lateral tire grip, braking and drag, contact impulses, street-wall collision, slipstreaming, an automatic gearbox, and energy recovery. AI cars use the same vehicle simulation as the player, with braking anticipation and passing lanes. Four sequential checkpoints per lap and a distance jump guard protect lap counting. Runnable tests cover the original handling and full-field Grand Prix checks, mobile gestures, adaptive rendering, car geometry/flickering fixes, and the georeferenced map's bounds, conversion, grid and a complete AI lap without recovery.

The following artwork details describe the preserved **original map** at `?map=classic`:

The reference images, aerial recreation, driving view, and mobile verification are saved in `design/`. The 3D scenery includes the Jewel diamond and flamingo sculptures, landscaped peninsula, four water bodies, Nerul Gymkhana, a tiered temple, glass business complex, sports academy with running track and courts, Karave gateway, palm-lined roads, housing and wooded belts. Buildings, vegetation and park furniture use batched or instanced geometry. The route is scaled to the reference's stated 3.753 km. This is an artistic reconstruction from images, not a GPS survey; building shapes, landmark positions and proportions are approximate. See `design-qa.md` for comparison evidence and verification.

This is an original independent racing game, with fictional drivers and teams on a circuit reconstructed from the supplied map. It has no official Formula 1 branding or affiliation. The renderer is Three.js under the MIT license (see `dist/vendor/THREE-LICENSE.txt`). Fonts are served by Google Fonts, with local fallbacks.
