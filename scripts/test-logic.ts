import { ORIENTS, VIEWS, DIST, solvePath, NEXT, MOVES, bestPlan, swapCount, orientIndexForView } from '../src/cube.ts';
import { allCardFaces, makeDeck } from '../src/cards.ts';
import { parseMsg, newCode, cleanCode, cleanName, CODE_ALPHA, CODE_LEN } from '../src/protocol.ts';

let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } };

check(ORIENTS.length === 24, `24 orientations (got ${ORIENTS.length})`);
const viewKeys = new Set(VIEWS.map((v) => `${v.face}:${v.rot}`));
check(viewKeys.size === 24, 'each orientation shows a unique face+rotation');

// Moves: inverses cancel, four of the same returns home.
const inv: Record<string, string> = { up: 'down', down: 'up', left: 'right', right: 'left', cw: 'ccw', ccw: 'cw' };
for (let s = 0; s < 24; s++)
  MOVES.forEach((m, k) => {
    const back = NEXT[NEXT[s][k]][MOVES.indexOf(inv[m] as never)];
    check(back === s, `inverse of ${m} from ${s}`);
    let c = s; for (let i = 0; i < 4; i++) c = NEXT[c][k];
    check(c === s, `4x ${m} is identity from ${s}`);
  });

// Spin rotates the visible art clockwise without changing the face.
for (let s = 0; s < 24; s++) {
  const v = VIEWS[s], w = VIEWS[NEXT[s][MOVES.indexOf('cw')]];
  check(v.face === w.face && w.rot === (v.rot + 1) % 4, `cw spins art from ${s}`);
}
// Tumbling up from identity shows the bottom face (5).
check(VIEWS[NEXT[0][MOVES.indexOf('up')]].face === 5, 'up shows bottom face');
check(VIEWS[NEXT[0][MOVES.indexOf('left')]].face === 2, 'left shows right face');

let maxD = 0;
for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) {
  maxD = Math.max(maxD, DIST[a][b]);
  const p = solvePath(a, b);
  let c = a; for (const m of p) c = NEXT[c][MOVES.indexOf(m)];
  check(c === b && p.length === DIST[a][b], `path ${a}->${b}`);
}
console.log('max moves between any two orientations:', maxD);

check(swapCount([0, 1, 2, 3]) === 0 && swapCount([1, 0, 2, 3]) === 1 && swapCount([1, 2, 3, 0]) === 3, 'swap counts');
const t = [3, 7, 11, 15];
check(bestPlan([15, 11, 7, 3], t).moves === 0, 'best plan finds pure swaps');

const faces = allCardFaces();
check(faces.length === 192, `192 card faces (got ${faces.length})`);
check(new Set(faces.map((f) => f.targets.join())).size === 192, 'card faces are distinct');
check(faces.every((f) => f.targets.every((x) => x >= 0)), 'every card target is a real orientation');
check(orientIndexForView({ face: 0, rot: 0 }) === 0, 'identity shows face 0 upright');


// ── Online protocol: room codes ──
const codes = new Set<string>();
for (let i = 0; i < 2000; i++) {
  const c = newCode();
  codes.add(c);
  check(c.length === CODE_LEN && [...c].every((x) => CODE_ALPHA.includes(x)), `room code ${c} uses the safe alphabet`);
}
check(codes.size > 1990, `room codes are random (${codes.size}/2000 unique)`);
check(cleanCode(' ab-c d9z ') === 'ABCD9', 'codes are trimmed, uppercased and filtered');
check(cleanCode('<script>') === 'SCRPT', 'code input drops markup');

// ── Names: no markup can survive ──
check(cleanName('<img src=x onerror=alert(1)>', 'F') === 'img src=x onerror=alert(1)'.slice(0, 16), 'name strips < and >');
check(!/[<>&"'`]/.test(cleanName(`"'><svg/onload=1>&`, 'F')), 'name has no HTML special chars');
check(cleanName('‮evil\u0000', 'F') === 'evil', 'name drops control and bidi chars');
check(cleanName(42, 'Friend') === 'Friend' && cleanName('   ', 'Friend') === 'Friend', 'bad names fall back');
check(Array.from(cleanName('x'.repeat(500), 'F')).length === 16, 'names are capped at 16');

// ── Messages: role gating and shape checks ──
const deck = makeDeck(3);
const wire = (x: unknown) => JSON.parse(JSON.stringify(x));
check(parseMsg(wire({ t: 'card', card: deck[0], left: 2 }), 'guest')?.t === 'card', 'guest accepts a real card');
check(parseMsg(wire({ t: 'card', card: deck[0], left: 2 }), 'host') === null, 'host ignores cards sent by the guest');
check(parseMsg({ t: 'win', who: 1, ms: 900 }, 'host') === null, 'host ignores a guest claiming a win');
check(parseMsg({ t: 'false', who: 0 }, 'host') === null, 'host ignores a guest faking a false ring');
check(parseMsg({ t: 'start', target: 5 }, 'host') === null, 'host ignores start from the guest');
check(parseMsg({ t: 'ring' }, 'guest') === null && parseMsg({ t: 'ring' }, 'host')?.t === 'ring', 'only the host receives rings');
check(parseMsg({ t: 'mv', slot: 9, mv: 'up' }, 'host') === null, 'move with bad slot rejected');
check(parseMsg({ t: 'mv', slot: 1, mv: 'constructor' }, 'host') === null, 'move with bad direction rejected');
check(parseMsg({ t: 'mv', slot: 1.5, mv: 'up' }, 'host') === null, 'fractional slot rejected');
check(parseMsg({ t: 'sw', a: 1, b: 1 }, 'host') === null && parseMsg({ t: 'sw', a: 0, b: 3 }, 'host')?.t === 'sw', 'swap validated');
check(parseMsg({ t: 'win', who: 5, ms: 1 }, 'guest') === null && parseMsg({ t: 'win', who: 1, ms: Infinity }, 'guest') === null, 'win validated');
check(parseMsg(null, 'host') === null && parseMsg('hi', 'host') === null && parseMsg([1], 'guest') === null, 'non-objects rejected');
const evilCard = wire(deck[0]);
evilCard.views[0].rot = '1) translate(0 0)"><script>';
check(parseMsg({ t: 'card', card: evilCard, left: 1 }, 'guest') === null, 'card with injected art values rejected');
const badColor = wire(deck[0]); badColor.color = 99;
check(parseMsg({ t: 'card', card: badColor, left: 1 }, 'guest') === null, 'card with unknown colour rejected');
const forged = wire(deck[0]); forged.targets = [0, 0, 0, 0]; forged.name = '<b>x</b>';
const fixed = parseMsg({ t: 'card', card: forged, left: 1 }, 'guest');
check(fixed?.t === 'card' && fixed.card.targets.join() === deck[0].targets.join(), 'card targets are recomputed, not trusted');
check(fixed?.t === 'card' && !/[<>]/.test(fixed.card.name), 'card name is cleaned');
const start = parseMsg({ t: 'start', target: 7, names: ['<i>A', 'B'], colors: [0, 1], boards: [[0, 1, 2, 3], [4, 5, 6, 7]] }, 'guest');
check(start?.t === 'start' && start.names[0] === 'iA', 'start names are cleaned');
check(parseMsg({ t: 'start', target: 999, names: ['A', 'B'], colors: [0, 1], boards: [[0, 1, 2, 3], [4, 5, 6, 7]] }, 'guest') === null, 'start with odd target rejected');
check(parseMsg({ t: 'start', target: 5, names: ['A', 'B'], colors: [0, 1], boards: [[0, 1, 2, 99], [4, 5, 6, 7]] }, 'guest') === null, 'start with bad board rejected');
check(parseMsg({ t: 'hello', name: 'Zo', color: 77 }, 'host')?.t === 'hello', 'hello with odd colour still joins (colour reset)');
check(parseMsg({ t: '__proto__' }, 'host') === null, 'unknown message types ignored');

console.log(fails ? `${fails} failures` : 'all logic checks passed');
(globalThis as { process?: { exit(n: number): void } }).process?.exit(fails ? 1 : 0);
