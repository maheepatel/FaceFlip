import { FACE_BASIS, ORIENTS, NEXT, MOVES, VIEWS, apply, cssMatrix, type Move, type Mat } from './cube.ts';
import { tileSVG } from './art.ts';
import { sfx } from './audio.ts';

export const PALETTE = [
  { name: 'Red', base: '#ef4b3f', light: '#ff7466', shade: '#b8302a', ink: '#7d1d18' },
  { name: 'Sunny', base: '#ffb21e', light: '#ffcd5c', shade: '#d98a06', ink: '#8a5600' },
  { name: 'Blue', base: '#36a9ef', light: '#69c3ff', shade: '#1f80c2', ink: '#0f4f7c' },
  { name: 'Green', base: '#77c63a', light: '#9ade63', shade: '#559a22', ink: '#335f12' },
];

interface CubeView {
  orient: number;
  wrap: HTMLElement; // positioned in a slot, used for lift/swap animation
  cube: HTMLElement; // rotates
  faces: HTMLElement[];
}

export interface BoardOptions {
  color: number;
  interactive: boolean;
  onAction?: (kind: 'move' | 'swap', a: number, b: Move | number) => void;
  canAct?: () => boolean;
}

const SWIPE_PX = 16;
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// CSS rotation equal to each world move (see cube.ts MOVE_MAT)
const MOVE_CSS: Record<Move, [string, number]> = {
  up: ['rotateX', 90], down: ['rotateX', -90], left: ['rotateY', -90], right: ['rotateY', 90], cw: ['rotateZ', 90], ccw: ['rotateZ', -90],
};
const LIFT_MS = 300;

export class Board {
  el: HTMLElement;
  slots: HTMLElement[] = [];
  cubes: CubeView[] = [];
  selected = 0;
  opts: BoardOptions;
  hints: boolean[] | null = null;

  constructor(opts: BoardOptions, initial?: number[]) {
    this.opts = opts;
    const pal = PALETTE[opts.color];
    this.el = document.createElement('div');
    this.el.className = 'board' + (opts.interactive ? ' interactive' : '');
    this.el.style.setProperty('--c', pal.base);
    this.el.style.setProperty('--cl', pal.light);
    this.el.style.setProperty('--cs-shade', pal.shade);
    const tray = document.createElement('div');
    tray.className = 'tray';
    this.el.append(tray);
    for (let s = 0; s < 4; s++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.slot = String(s);
      tray.append(slot);
      this.slots.push(slot);
      const orient = initial ? initial[s] : Math.floor(Math.random() * 24);
      const cv = this.buildCube(orient, pal.shade);
      slot.append(cv.wrap);
      this.cubes.push(cv);
      if (opts.interactive) this.bindSlot(slot, s);
    }
    if (opts.interactive) this.select(0);
  }

  private buildCube(orient: number, shade: string): CubeView {
    const wrap = document.createElement('div');
    wrap.className = 'cube-wrap';
    const cube = document.createElement('div');
    cube.className = 'cube';
    wrap.append(cube);
    const faces: HTMLElement[] = [];
    FACE_BASIS.forEach((b, i) => {
      const f = document.createElement('div');
      f.className = 'face';
      const m: Mat = [b.r[0], b.d[0], b.n[0], b.r[1], b.d[1], b.n[1], b.r[2], b.d[2], b.n[2]];
      f.style.transform = `${cssMatrix(m)} translateZ(calc(var(--cs) / 2))`;
      f.innerHTML = tileSVG(i, 0, shade);
      cube.append(f);
      faces.push(f);
    });
    const cv = { orient, wrap, cube, faces };
    this.paint(cv);
    return cv;
  }

  /** Apply orientation transform and fake lighting per face. */
  private paint(cv: CubeView, mv?: Move) {
    const final = cssMatrix(ORIENTS[cv.orient]);
    const lift = 'translateZ(calc(var(--cs) / 2))';
    cv.cube.style.transform = `${lift} ${final}`;
    cv.cube.getAnimations().forEach((a) => a.cancel());
    if (mv && !REDUCED) {
      // rotate about the true world axis, starting one quarter turn back
      const [fn, deg] = MOVE_CSS[mv];
      cv.cube.animate(
        [{ transform: `${lift} ${fn}(${-deg}deg) ${final}` }, { transform: `${lift} ${fn}(0deg) ${final}` }],
        { duration: 230, easing: 'cubic-bezier(.2,.75,.3,1.08)' },
      );
    }
    FACE_BASIS.forEach((b, i) => {
      const n = apply(ORIENTS[cv.orient], b.n);
      // light from top-front-left
      const lum = n[2] === 1 ? 1 : n[1] === -1 ? 1.12 : n[1] === 1 ? 0.62 : n[0] === -1 ? 0.86 : n[0] === 1 ? 0.74 : 0.5;
      cv.faces[i].style.setProperty('--lum', String(lum));
    });
  }

  get orients(): number[] {
    return this.cubes.map((c) => c.orient);
  }

  setOrients(o: number[]) {
    o.forEach((x, i) => { this.cubes[i].orient = x; this.paint(this.cubes[i]); });
  }

  move(slot: number, mv: Move, silent = false) {
    const cv = this.cubes[slot];
    cv.orient = NEXT[cv.orient][MOVES.indexOf(mv)];
    this.paint(cv, mv);
    if (!silent) (mv === 'cw' || mv === 'ccw' ? sfx.spin : sfx.knock)();
    this.opts.onAction?.('move', slot, mv);
    this.refreshHints();
  }

  swap(a: number, b: number, silent = false) {
    if (a === b) return;
    const ra = this.slots[a].getBoundingClientRect();
    const rb = this.slots[b].getBoundingClientRect();
    const A = this.cubes[a], B = this.cubes[b];
    this.cubes[a] = B;
    this.cubes[b] = A;
    this.slots[a].append(B.wrap);
    this.slots[b].append(A.wrap);
    // FLIP animation
    const dx = rb.left - ra.left, dy = rb.top - ra.top;
    for (const [w, x, y] of [[A.wrap, -dx, -dy], [B.wrap, dx, dy]] as const) {
      w.animate(
        [
          { transform: `translate(${x}px, ${y}px) translateZ(0px)` },
          { transform: `translate(${x / 2}px, ${y / 2}px) translateZ(calc(var(--cs) * .9))`, offset: 0.5 },
          { transform: 'translate(0,0) translateZ(0px)' },
        ],
        { duration: 340, easing: 'cubic-bezier(.3,.7,.3,1)' },
      );
    }
    if (!silent) sfx.swap();
    this.opts.onAction?.('swap', a, b);
    this.refreshHints();
  }

  select(s: number) {
    this.selected = s;
    this.slots.forEach((el, i) => el.classList.toggle('selected', i === s));
  }

  /** Optional assist: mark slots that already match. */
  setHintTargets(t: number[] | null) {
    this.hintTargets = t;
    this.refreshHints();
  }
  private hintTargets: number[] | null = null;
  private refreshHints() {
    this.slots.forEach((el, i) => el.classList.toggle('good', !!this.hintTargets && this.cubes[i].orient === this.hintTargets[i]));
  }

  flash(cls: 'win' | 'wrong') {
    this.el.classList.remove('win', 'wrong');
    void this.el.offsetWidth;
    this.el.classList.add(cls);
    setTimeout(() => this.el.classList.remove(cls), 900);
  }

  matches(targets: number[]) {
    return this.cubes.every((c, i) => c.orient === targets[i]);
  }

  // ---- pointer input: swipe = tumble, tap = spin, hold + drag = swap ----
  private bindSlot(slot: HTMLElement, _initial: number) {
    let start: { x: number; y: number; t: number; id: number; btn: number; shift: boolean } | null = null;
    let consumed = false;
    let lifted = false;
    let liftTimer = 0;
    let dropTarget = -1;
    const idx = () => Number(slot.dataset.slot);

    const clearDrop = () => this.slots.forEach((s) => s.classList.remove('drop'));

    slot.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.select(idx()); });
    slot.addEventListener('contextmenu', (e) => e.preventDefault());
    slot.addEventListener('wheel', (e) => {
      if (this.opts.canAct && !this.opts.canAct()) return;
      e.preventDefault();
      this.move(idx(), e.deltaY > 0 ? 'cw' : 'ccw');
    }, { passive: false });

    slot.addEventListener('pointerdown', (e) => {
      if (this.opts.canAct && !this.opts.canAct()) return;
      slot.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, btn: e.button, shift: e.shiftKey };
      consumed = false;
      lifted = false;
      this.select(idx());
      clearTimeout(liftTimer);
      liftTimer = window.setTimeout(() => {
        if (!start || consumed) return;
        lifted = true;
        this.cubes[idx()].wrap.classList.add('lifted');
        navigator.vibrate?.(12);
      }, LIFT_MS);
    });

    slot.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (lifted) {
        const w = this.cubes[idx()].wrap;
        w.style.translate = `${dx}px ${dy}px`;
        dropTarget = -1;
        clearDrop();
        const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).classList?.contains('slot')) as HTMLElement | undefined;
        if (hit && this.slots.includes(hit) && hit !== slot) {
          dropTarget = Number(hit.dataset.slot);
          hit.classList.add('drop');
        }
        return;
      }
      if (consumed) return;
      if (Math.hypot(dx, dy) >= SWIPE_PX) {
        consumed = true;
        clearTimeout(liftTimer);
        const mv: Move = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        this.move(idx(), mv);
      }
    });

    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      clearTimeout(liftTimer);
      const s = idx();
      if (lifted) {
        const w = this.cubes[s].wrap;
        w.classList.remove('lifted');
        w.style.translate = '';
        clearDrop();
        if (dropTarget >= 0 && e.type === 'pointerup') { this.swap(s, dropTarget); this.select(dropTarget); }
      } else if (!consumed && e.type === 'pointerup') {
        const ccw = start.btn === 2 || start.shift;
        this.move(s, ccw ? 'ccw' : 'cw');
      }
      start = null;
      lifted = false;
      dropTarget = -1;
    };
    slot.addEventListener('pointerup', end);
    slot.addEventListener('pointercancel', end);
  }
}

/** Static 2x2 face picture (used for cards and legends). */
export function faceGrid(views: { face: number; rot: number }[], shade: string): string {
  return `<div class="grid2">${views.map((v) => tileSVG(v.face, v.rot, shade)).join('')}</div>`;
}

export { VIEWS };
