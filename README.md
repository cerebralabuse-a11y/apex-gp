# APEX GP

A browser-based 3D open-wheel racer on a 3.753 km Palm Beach Road circuit around Jewel Lake, Navi Mumbai. The current route is hand-traced from the supplied 14-corner circuit map, with scenery modeled from the supplied low-poly Navi Mumbai illustration. The graphics recreate the supplied reference's low-poly sunset art direction: waterfront, diamond sculpture, city skyline, crowds, colorful cars, lattice railings, voxel exhaust, and corner-mounted arcade instruments. The scene uses real, drivable 3D geometry. Three.js is vendored locally; there is no dependency installation or build step.

Run with Node.js:

```sh
npm run dev
```

Open http://localhost:4173. Run the physics and full-field race tests with `npm test`.

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

Vehicle handling includes speed-dependent steering, lateral tire grip, braking and drag, contact impulses, street-wall collision, slipstreaming, an automatic gearbox, and energy recovery. AI cars use the same vehicle simulation as the player, with braking anticipation and passing lanes. Four sequential checkpoints per lap and a distance jump guard protect lap counting. Eight runnable tests cover handling, energy, time-step consistency, contact, checkpoint integrity, wall collision, a complete eight-car Grand Prix, and the traced circuit length/corner order/start grid.

The reference images, aerial recreation, driving view, and mobile verification are saved in `design/`. The 3D scenery includes the Jewel diamond and flamingo sculptures, landscaped peninsula, four water bodies, Nerul Gymkhana, a tiered temple, glass business complex, sports academy with running track and courts, Karave gateway, palm-lined roads, housing and wooded belts. Buildings, vegetation and park furniture use batched or instanced geometry. The route is scaled to the reference's stated 3.753 km. This is an artistic reconstruction from images, not a GPS survey; building shapes, landmark positions and proportions are approximate. See `design-qa.md` for comparison evidence and verification.

This is an original independent racing game, with fictional drivers and teams on a circuit reconstructed from the supplied map. It has no official Formula 1 branding or affiliation. The renderer is Three.js under the MIT license (see `dist/vendor/THREE-LICENSE.txt`). Fonts are served by Google Fonts, with local fallbacks.
