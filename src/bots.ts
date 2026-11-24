import { bestPlan, solvePath, MOVES, type Move } from './cube.ts';
import type { Board } from './board.ts';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'genius';

// Human-like timings (ms). `think` = time to read the card; `scan` = time to
// find the right side of a cube; `move` = one roll or spin; `slip` = chance of
// a wrong turn that has to be undone later.
export const BOT_PROFILE: Record<Difficulty, { think: number; scan: number; move: number; slip: number; jitter: number }> = {
  easy: { think: 1500, scan: 900, move: 760, slip: 0.14, jitter: 0.45 },
  medium: { think: 1000, scan: 560, move: 520, slip: 0.07, jitter: 0.35 },
  hard: { think: 700, scan: 340, move: 360, slip: 0.03, jitter: 0.25 },
  genius: { think: 450, scan: 200, move: 250, slip: 0.01, jitter: 0.15 },
};

type Step = { kind: 'move'; slot: number; mv: Move } | { kind: 'swap'; a: number; b: number };

/**
 * A bot plays one cube at a time like a person would: read the card, swap
 * cubes into place if that saves turns, then roll each cube to the target face.
 * It re-plans after every action, so slips get corrected naturally.
 */
export class Bot {
  private timer = 0;
  private active = false;
  private focus = -1;
  private rnd = Math.random;
  constructor(public board: Board, public level: Difficulty, private onSolved: () => void, private canAct: () => boolean) {}

  start(targets: number[]) {
    this.stop();
    this.active = true;
    this.focus = -1;
    const p = BOT_PROFILE[this.level];
    this.schedule(p.think, targets);
  }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
  }

  private wait(ms: number) {
    const j = BOT_PROFILE[this.level].jitter;
    return ms * (1 - j / 2 + this.rnd() * j);
  }

  private schedule(ms: number, targets: number[]) {
    this.timer = window.setTimeout(() => this.step(targets), this.wait(ms));
  }

  private nextStep(targets: number[]): Step | null {
    const board = this.board.orients;
    const plan = bestPlan(board, targets, 1.2);
    // swaps first (perm[slot] = cube currently in slot perm[slot])
    for (let s = 0; s < 4; s++) {
      if (plan.perm[s] !== s) return { kind: 'swap', a: s, b: plan.perm[s] };
    }
    // finish the cube we are working on before picking another
    const order = [this.focus, 0, 1, 2, 3].filter((s) => s >= 0);
    for (const s of order) {
      if (board[s] !== targets[s]) {
        const path = solvePath(board[s], targets[s]);
        return { kind: 'move', slot: s, mv: path[0] };
      }
    }
    return null;
  }

  private step(targets: number[]) {
    if (!this.active) return;
    if (!this.canAct()) { this.schedule(250, targets); return; }
    const p = BOT_PROFILE[this.level];
    const st = this.nextStep(targets);
    if (!st) {
      this.active = false;
      this.board.select(-1);
      this.timer = window.setTimeout(() => this.onSolved(), this.wait(p.move * 0.6));
      return;
    }
    if (st.kind === 'swap') {
      this.board.swap(st.a, st.b, true);
      this.focus = -1;
      this.schedule(p.move * 1.3, targets);
      return;
    }
    if (st.slot !== this.focus) {
      // picking up a new cube: look for the right side before turning it
      this.focus = st.slot;
      this.board.select(st.slot);
      this.schedule(p.scan, targets);
      return;
    }
    const mv = this.rnd() < p.slip ? MOVES[Math.floor(this.rnd() * MOVES.length)] : st.mv;
    this.board.move(st.slot, mv, true);
    this.schedule(p.move, targets);
  }
}
