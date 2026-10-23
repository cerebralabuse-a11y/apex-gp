# APEX GP

A complete browser-based 3D open-wheel racer on the original 2.6 km Valle Rossa circuit. Three.js is vendored locally; there is no dependency installation or build step.

Run with Node.js:

```sh
npm run dev
```

Open http://localhost:4173. Run the physics and full-field race tests with `npm test`.

## Driving

- **W / ↑** accelerate; **S / ↓** brake, then reverse.
- **A D / ← →** steer; **Shift** deploy rechargeable ERS.
- **C** cycles chase, cockpit, and broadcast cameras.
- **R** recovers the car to the nearest point on the circuit.
- **Esc / P** pauses. **M** toggles synthesized engine audio.
- Gamepad: left stick, RT, LT, A for ERS, Y for camera, Start to pause.
- Touch controls appear on devices with coarse pointers.

Grand Prix has eight drivers and three laps. Time Trial records personal bests in browser storage. Free Drive has no finish limit. Race setup offers three difficulty levels, lighting, graphics quality, audio, and a braking guidance line. The garage changes the player's livery.

Vehicle handling includes speed-dependent steering, lateral tire grip, braking and drag, off-road grip loss, contact impulses, slipstreaming, an automatic gearbox, and energy recovery. AI cars use the same vehicle simulation as the player, with braking anticipation and passing lanes. Four sequential checkpoints per lap and a distance jump guard protect lap counting.

This is an original independent racing game, with fictional drivers, teams, and circuit. It has no official Formula 1 branding or affiliation. The renderer is Three.js under the MIT license (see `dist/vendor/THREE-LICENSE.txt`). Fonts are served by Google Fonts, with local fallbacks.
