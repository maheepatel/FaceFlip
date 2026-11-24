import { ORIENTS, VIEWS, DIST, solvePath, NEXT, MOVES, bestPlan, swapCount, orientIndexForView } from '../src/cube.ts';
import { allCardFaces } from '../src/cards.ts';

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

console.log(fails ? `${fails} failures` : 'all logic checks passed');
(globalThis as { process?: { exit(n: number): void } }).process?.exit(fails ? 1 : 0);
