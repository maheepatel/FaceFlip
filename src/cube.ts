// Cube orientation model.
// World axes match CSS: +x right, +y down, +z toward the viewer.
// An orientation is a 3x3 rotation matrix (row-major) mapping cube-local
// vectors to world vectors. A cube has exactly 24 orientations, and each one
// shows a unique (front face, in-plane rotation) pair, so matching a card is an
// exact orientation comparison.

export type Vec = [number, number, number];
export type Mat = number[]; // 9 entries, row-major

export type Move = 'up' | 'down' | 'left' | 'right' | 'cw' | 'ccw';
export const MOVES: Move[] = ['up', 'down', 'left', 'right', 'cw', 'ccw'];

// Each face: right, down, normal in local coords (right x down = normal).
export const FACE_BASIS: { r: Vec; d: Vec; n: Vec }[] = [
  { r: [1, 0, 0], d: [0, 1, 0], n: [0, 0, 1] }, // 0 front
  { r: [-1, 0, 0], d: [0, 1, 0], n: [0, 0, -1] }, // 1 back
  { r: [0, 0, -1], d: [0, 1, 0], n: [1, 0, 0] }, // 2 right
  { r: [0, 0, 1], d: [0, 1, 0], n: [-1, 0, 0] }, // 3 left
  { r: [1, 0, 0], d: [0, 0, 1], n: [0, -1, 0] }, // 4 top
  { r: [1, 0, 0], d: [0, 0, -1], n: [0, 1, 0] }, // 5 bottom
];

// World-frame move matrices (applied on the left: R' = M * R).
const MOVE_MAT: Record<Move, Mat> = {
  up: [1, 0, 0, 0, 0, -1, 0, 1, 0], // front face rolls upward
  down: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  left: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  right: [0, 0, 1, 0, 1, 0, -1, 0, 0],
  cw: [0, -1, 0, 1, 0, 0, 0, 0, 1], // clockwise on screen
  ccw: [0, 1, 0, -1, 0, 0, 0, 0, 1],
};

export const IDENTITY: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat, b: Mat): Mat {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
}

export function apply(m: Mat, v: Vec): Vec {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function applyMove(m: Mat, move: Move): Mat {
  return mul(MOVE_MAT[move], m);
}

const key = (m: Mat) => m.join(',');

// Enumerate all 24 orientations by BFS from identity.
export const ORIENTS: Mat[] = (() => {
  const seen = new Map<string, Mat>([[key(IDENTITY), IDENTITY]]);
  const queue = [IDENTITY];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const mv of MOVES) {
      const nx = applyMove(cur, mv);
      if (!seen.has(key(nx))) {
        seen.set(key(nx), nx);
        queue.push(nx);
      }
    }
  }
  return [...seen.values()];
})();

const INDEX = new Map(ORIENTS.map((m, i) => [key(m), i]));
export const indexOf = (m: Mat) => INDEX.get(key(m))!;

/** What the viewer sees: which face is in front and its clockwise rotation (0..3 quarter turns). */
export interface View {
  face: number;
  rot: number;
}

export function viewOf(m: Mat): View {
  for (let f = 0; f < 6; f++) {
    const n = apply(m, FACE_BASIS[f].n);
    if (n[2] === 1) {
      const d = apply(m, FACE_BASIS[f].d);
      // down (0,1) -> rot 0; left (-1,0) -> 1; up (0,-1) -> 2; right (1,0) -> 3
      const rot = d[1] === 1 ? 0 : d[0] === -1 ? 1 : d[1] === -1 ? 2 : 3;
      return { face: f, rot };
    }
  }
  throw new Error('invalid orientation');
}

export const VIEWS: View[] = ORIENTS.map(viewOf);
export const orientIndexForView = (v: View) =>
  VIEWS.findIndex((w) => w.face === v.face && w.rot === v.rot);

// Transition table and all-pairs shortest move counts.
export const NEXT: number[][] = ORIENTS.map((m) => MOVES.map((mv) => indexOf(applyMove(m, mv))));

export const DIST: number[][] = ORIENTS.map((_, s) => {
  const d = new Array(24).fill(-1);
  d[s] = 0;
  const q = [s];
  while (q.length) {
    const c = q.shift()!;
    for (const n of NEXT[c]) if (d[n] < 0) { d[n] = d[c] + 1; q.push(n); }
  }
  return d;
});

/** Shortest move sequence from orientation a to b. */
export function solvePath(a: number, b: number): Move[] {
  const path: Move[] = [];
  let cur = a;
  while (cur !== b) {
    const k = NEXT[cur].findIndex((n) => DIST[n][b] === DIST[cur][b] - 1);
    path.push(MOVES[k]);
    cur = NEXT[cur][k];
  }
  return path;
}

/** CSS matrix3d (column-major) for an orientation. */
export function cssMatrix(m: Mat): string {
  return `matrix3d(${m[0]},${m[3]},${m[6]},0,${m[1]},${m[4]},${m[7]},0,${m[2]},${m[5]},${m[8]},0,0,0,0,1)`;
}

export const PERMS4: number[][] = (() => {
  const out: number[][] = [];
  const rec = (a: number[], rest: number[]) => {
    if (!rest.length) return out.push(a);
    rest.forEach((x, i) => rec([...a, x], rest.filter((_, j) => j !== i)));
  };
  rec([], [0, 1, 2, 3]);
  return out;
})();

/** Minimum number of pairwise swaps to realise a permutation. */
export function swapCount(p: number[]): number {
  const seen = new Array(p.length).fill(false);
  let swaps = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    for (let j = i; !seen[j]; j = p[j]) { seen[j] = true; len++; }
    swaps += len - 1;
  }
  return swaps;
}

/**
 * Best plan to turn the board into the target: which cube goes to which slot
 * (perm[slot] = cube index) minimising rotations + swaps.
 */
export function bestPlan(board: number[], target: number[], swapCost = 1) {
  let best = { perm: [0, 1, 2, 3], cost: Infinity, moves: 0 };
  for (const p of PERMS4) {
    let moves = 0;
    for (let s = 0; s < 4; s++) moves += DIST[board[p[s]]][target[s]];
    const cost = moves + swapCount(p) * swapCost;
    if (cost < best.cost) best = { perm: p, cost, moves };
  }
  return best;
}
