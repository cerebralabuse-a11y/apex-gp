# Graphics recreation QA

final result: passed for playable art-direction recreation

This result does not certify pixel-identical fidelity. The provided image contains no original 3D assets, camera data, or scene file; this implementation uses new meshes and an original drivable course.

## Evidence and comparison conditions

- Source: `design/reference.png`, 1024 × 572 pixels.
- Recreation: `design/recreation.png`, captured in the in-app browser at a 1024 × 572 CSS viewport.
- Both images were opened in the same comparison input. Source shows a moving race; the recreation's clean photo view shows the starting grid. Lap, position, engine readings, car positions, and exhaust therefore differ with game state.
- Responsive check: 428 × 800 CSS viewport. The game fills the viewport; the race controls, map, gauges, start button, and menus remain usable.

## Corrections made after comparison

1. Replaced the original Italian circuit, pit buildings, and grandstands with a lakeside street course, promenades, diamond monument, skyline, spectators, benches, and lamps.
2. Corrected reversed road-surface triangle winding, which initially exposed the ground through the road.
3. Matched the elevated rear-quarter framing and full-screen corner HUD. Removed website chrome from the game screen.
4. Replaced smooth/PBR presentation with faceted foliage, matte colors, rainbow liveries, a warm sky, low sun, water ripples, and a sunset reflection.
5. Corrected foliage and spectator colors that were being darkened twice by base-material and instance-color multiplication.
6. Adjusted the monument's position and scale, opened the three-prong pedestal, increased skyline height, and added actual window geometry.
7. Added real lattice railings and crisp long shadows. Near-camera decorative crowns use an unshadowed pass so the road remains readable.
8. Added a proximity fade to the overhead gantry after a driving test showed it occluding the player.
9. Kept the wall collision envelope inside the visible concrete barriers. Finished rivals no longer inject collision impulses after their simulation stops.

## Interaction and implementation checks

- Seven simulation tests passed, including the complete eight-car, three-lap race on the new circuit.
- Browser test: fresh countdown, acceleration to approximately 148 km/h while remaining on lap one, visible exhaust particles, animated RPM/speed instruments, cockpit camera, pause, and restart.
- Desktop and phone-sized layouts inspected.
- Browser console had no warnings or errors during the final rendering and driving checks.
- Keyboard driving, camera, pause, recovery, garage, setup, help, and clean photo view remain available. Existing gamepad and touch bindings remain in place; no physical controller was available for a hardware test.

## Remaining fidelity differences

- The course outline and minimap, detailed architecture, exact tree distribution, pedestrian models, and sculpture mesh differ from the source image.
- Vegetation and water use a simpler procedural treatment. The result matches the requested low-poly sunset direction, landmark, waterfront theme, framing, colorful cars, and arcade HUD, but is not an exact asset replica.
- Numeric HUD values follow the actual race rather than the static values in the source.
