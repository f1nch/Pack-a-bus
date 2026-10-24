# Pack-a-Bus

A web clone of the "Bus Jam / People Jam" mobile puzzle genre, written in TypeScript (Vite + Canvas 2D, no runtime dependencies).

## How to play

- Tap a bus to drive it out of the lot in the direction of its arrow. If something is in the way it bumps back (no penalty).
- Buses that get out park in a spot at the top. Passengers at the front of the line board the parked bus of their color.
- A full bus drives away and frees its spot.
- You lose if every spot holds a bus nobody at the front of the line can board, or the bomb timer runs out.
- `?` buses hide their color until nothing blocks their way out.
- Boosters (one each per level): **VIP** airlifts any bus straight to the VIP spot; **+Spot** unlocks an extra parking spot.

## Development

```bash
npm install
npm run dev       # local dev server
npm test          # level generator tests (validity + solvability)
npm run build     # typecheck + production build in dist/
```

Levels are generated procedurally from the level number, so they are endless and deterministic. Every level is checked by a simulation to be solvable with fewer parking spots than the player gets. Progress is saved in `localStorage`.

## Code map

- `src/level.ts`: level generator and solvability simulation
- `src/grid.ts`: lot grid helpers (occupancy, path probing)
- `src/game.ts`: game state, input, bus movement, boarding, win/lose rules
- `src/render.ts`: Canvas drawing
- `src/main.ts`: bootstrap, HUD, modals, resize and loop
- `src/audio.ts`: synthesized sound effects
