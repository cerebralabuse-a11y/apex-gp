# APEX GP

A browser-based 3D open-wheel racer around Jewel Lake, Navi Mumbai. The graphics recreate the supplied reference's low-poly sunset art direction: waterfront, diamond sculpture, city skyline, crowds, colorful cars, lattice railings, voxel exhaust, and corner-mounted arcade instruments. The scene uses real, drivable 3D geometry. Three.js is vendored locally; there is no dependency installation or build step.

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
- **V** toggles a clean, frozen photo view from the grid or during a race.
- **G** opens the garage, **O** opens race setup, and **H** opens help.
- Gamepad: left stick, RT, LT, A for ERS, Y for camera, Start to pause.
- Touch controls appear on devices with coarse pointers.

Grand Prix has eight drivers and three laps. Time Trial records circuit-specific personal bests in browser storage. Free Drive has no finish limit. Race setup offers three difficulty levels, lighting, graphics quality, audio, and an optional driving line. The garage changes the player's livery. The raised gantry fades near the player to keep the elevated camera clear.

Vehicle handling includes speed-dependent steering, lateral tire grip, braking and drag, contact impulses, street-wall collision, slipstreaming, an automatic gearbox, and energy recovery. AI cars use the same vehicle simulation as the player, with braking anticipation and passing lanes. Four sequential checkpoints per lap and a distance jump guard protect lap counting. Seven runnable tests cover handling, energy, time-step consistency, contact, checkpoint integrity, wall collision, and a complete eight-car Grand Prix.

The reference and recreation are saved in `design/`. This is a recreation from one image; the original meshes, exact circuit shape, and exact scene proportions are not available. See `design-qa.md` for comparison evidence and verification.

This is an original independent racing game, with fictional drivers, teams, and circuit. It has no official Formula 1 branding or affiliation. The renderer is Three.js under the MIT license (see `dist/vendor/THREE-LICENSE.txt`). Fonts are served by Google Fonts, with local fallbacks.
