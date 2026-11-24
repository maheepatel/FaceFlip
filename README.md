# FaceFlip

A digital take on the "face change blocks" party game (4 players × 4 wooden blocks, 72 emoji cards, a bell).

```
npm install
npm run dev     # http://localhost:5310
npm test        # cube maths + card checks
npm run build
```

## Rules (as in the boxed game)
- Every player has 4 identical blocks. Each block has 6 sides, each one quarter of an emoji
  (googly eye, star eye, heart eye, sleepy eye, teeth grin, big mouth).
- A card flips. Build its face in your 2×2 tray by rolling, spinning and swapping blocks.
- Ring the bell when it matches. Right: win the card. Wrong: lose a card and freeze 2s.
- First to the target (5 / 7 / 10 cards) wins. Blocks stay as they are between cards.

## Modes
Race the bots (1–3 bots, Easy → Genius) · **Online 1v1 with a room code** · 2 players on one screen · Sprint 10 · 90-second rush · Practice (hints + optimal-move feedback).

## How it works
- `src/cube.ts`: a block is one of 24 orientations (rotation matrices). Each orientation shows a unique side + spin,
  so matching is exact. BFS gives shortest paths (any target is ≤ 3 moves away); `bestPlan` also weighs swaps.
- `src/art.ts`: side art. Mouth pieces are built so a half-turn gives the other half, so 4 identical blocks make symmetric faces.
- `src/cards.ts`: 8 eye options × 8 × 3 mouths = 192 buildable faces; a 72-card deck is drawn from them.
- `src/bots.ts`: human-like bots (read card, pick up a block, scan for the side, turn it, occasional slips) that re-plan every move.
- `src/board.ts`: CSS 3D blocks; every move animates as a true quarter turn about its world axis.

## Online 1v1
Peer-to-peer over WebRTC using the free PeerJS broker, so it runs on static hosting with no game server.
One player creates a room and shares the code or link; the host deals the cards, keeps a copy of the guest's
board by replaying their moves in order, and judges every bell ring. A few strict networks (some mobile carriers,
office firewalls) block direct peer connections; if a join times out, try another network.
