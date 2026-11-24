import './style.css';
import { Board, PALETTE, faceGrid } from './board.ts';
import { Bot, type Difficulty } from './bots.ts';
import { makeDeck, type Card } from './cards.ts';
import { bestPlan, solvePath, type Move } from './cube.ts';
import { tileSVG, FACE_NAMES } from './art.ts';
import { sfx, isMuted, setMuted } from './audio.ts';
import { hostRoom, joinRoom, newCode, type Net, type Msg } from './net.ts';

type Mode = 'bots' | 'duo' | 'sprint' | 'attack' | 'zen' | 'online';

interface Settings {
  bots: number;
  level: Difficulty;
  target: number;
  color: number;
  color2: number;
  autoRing: boolean;
  hints: boolean;
}

const DEFAULTS: Settings = { bots: 3, level: 'medium', target: 7, color: 0, color2: 2, autoRing: false, hints: false };

function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ff-settings') || '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(s: Settings) {
  try { localStorage.setItem('ff-settings', JSON.stringify(s)); } catch { /* ignore */ }
}
function getBest(k: string): number | null {
  try { const v = localStorage.getItem('ff-best-' + k); return v ? Number(v) : null; } catch { return null; }
}
function setBest(k: string, v: number) {
  try { localStorage.setItem('ff-best-' + k, String(v)); } catch { /* ignore */ }
}

const app = document.getElementById('app')!;
const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const fmt = (ms: number) => (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + 's';
const BOT_NAMES = ['Pip', 'Ziggy', 'Momo'];

let settings = loadSettings();
let teardown: (() => void) | null = null;

function mount(el: HTMLElement, cleanup?: () => void) {
  teardown?.();
  teardown = cleanup ?? null;
  window.scrollTo(0, 0);
  app.replaceChildren(el);
}

// ─────────────────────────────── Home ───────────────────────────────

function home() {
  leaveOnline();
  const s = settings;
  const el = h(`
  <main class="home">
    <div class="home-hero">
      <div class="logo" aria-label="FaceFlip">
        <span class="l1">Face</span><span class="l2">Flip</span>
      </div>
      <p class="tag">Roll, spin and swap four blocks to build the face on the card. First to ring the bell wins it.</p>
      <div class="demo-stage">
        <div class="demo-card"></div>
        <div class="demo-arrow">➜</div>
        <div class="demo-board"></div>
      </div>
    </div>

    <section class="modes">
      <article class="mode-card primary">
        <h2>Race the bots</h2>
        <p>The classic bell race. Up to 4 players, first to the card target wins.</p>
        <div class="opts">
          <label>Opponents</label>
          <div class="seg" data-k="bots">${[1, 2, 3].map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div>
          <label>Bot speed</label>
          <div class="seg" data-k="level">${['easy', 'medium', 'hard', 'genius'].map((n) => `<button data-v="${n}">${n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</div>
          <label>First to</label>
          <div class="seg" data-k="target">${[5, 7, 10].map((n) => `<button data-v="${n}">${n} cards</button>`).join('')}</div>
          <label>Your blocks</label>
          <div class="swatches" data-k="color">${PALETTE.map((p, i) => `<button data-v="${i}" style="--c:${p.base}" aria-label="${p.name}"></button>`).join('')}</div>
          <label>Little kids</label>
          <div class="toggles">
            <label class="tog"><input type="checkbox" data-t="autoRing"> Auto-ring bell</label>
            <label class="tog"><input type="checkbox" data-t="hints"> Show matching blocks</label>
          </div>
        </div>
        <button class="btn big go" data-mode="bots">Play</button>
      </article>

      <article class="mode-card friend">
        <h2>Play a friend</h2>
        <p>Race a friend 1v1 online with a room code, or share one screen.</p>
        <button class="btn online-btn" data-act="online">Online 1v1</button>
        <div class="keys-mini"><span><b>Same screen</b></span><span><b>P1</b> 1-4 · WASD · Q/E · Space</span><span><b>P2</b> 7-0 · Arrows · U/O · Enter</span></div>
        <button class="btn ghost go" data-mode="duo">Play on one screen</button>
      </article>

      <article class="mode-card">
        <h2>Solo</h2>
        <p>No bell. The next card flips the moment your face matches.</p>
        <div class="solo-list">
          <button class="btn ghost go" data-mode="sprint"><b>Sprint 10</b><small>10 faces, fastest time${getBest('sprint') ? ' · best ' + fmt(getBest('sprint')!) : ''}</small></button>
          <button class="btn ghost go" data-mode="attack"><b>90-second rush</b><small>Faces in 90s${getBest('attack') ? ' · best ' + getBest('attack') : ''}</small></button>
          <button class="btn ghost go" data-mode="zen"><b>Practice</b><small>No clock, hints on, see optimal moves</small></button>
        </div>
      </article>
    </section>
    <footer class="home-foot">
      <button class="link" data-act="help">How to play</button>
      <button class="link" data-act="mute">${isMuted() ? 'Sound off' : 'Sound on'}</button>
    </footer>
  </main>`);

  // settings controls
  const sync = () => {
    el.querySelectorAll<HTMLElement>('.seg, .swatches').forEach((seg) => {
      const k = seg.dataset.k as keyof Settings;
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', String(s[k]) === b.dataset.v));
    });
    el.querySelectorAll<HTMLInputElement>('input[data-t]').forEach((i) => (i.checked = !!s[i.dataset.t as 'autoRing' | 'hints']));
  };
  el.querySelectorAll<HTMLElement>('.seg, .swatches').forEach((seg) =>
    seg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const k = seg.dataset.k as keyof Settings;
      const v = b.dataset.v!;
      (s as unknown as Record<string, unknown>)[k] = k === 'level' ? v : Number(v);
      if (k === 'color' && s.color2 === s.color) s.color2 = (s.color + 2) % 4;
      saveSettings(s);
      sfx.tick();
      sync();
    }),
  );
  el.querySelectorAll<HTMLInputElement>('input[data-t]').forEach((i) =>
    i.addEventListener('change', () => { (s as unknown as Record<string, boolean>)[i.dataset.t!] = i.checked; saveSettings(s); }),
  );
  sync();

  el.querySelectorAll<HTMLElement>('.go').forEach((b) => b.addEventListener('click', () => startMatch(b.dataset.mode as Mode)));
  el.querySelector('[data-act=help]')!.addEventListener('click', () => showHelp());
  el.querySelector('[data-act=online]')!.addEventListener('click', () => showLobby());
  const muteBtn = el.querySelector<HTMLElement>('[data-act=mute]')!;
  muteBtn.addEventListener('click', () => { setMuted(!isMuted()); muteBtn.textContent = isMuted() ? 'Sound off' : 'Sound on'; });

  // live demo: a bot builds faces forever
  const demoBoard = new Board({ color: s.color, interactive: false });
  el.querySelector('.demo-board')!.append(demoBoard.el);
  const demoCardEl = el.querySelector<HTMLElement>('.demo-card')!;
  let deck = makeDeck();
  let alive = true;
  let demoTimer = 0;
  const demoBot = new Bot(demoBoard, 'medium', () => {
    demoBoard.flash('win');
    demoTimer = window.setTimeout(nextDemo, 1400);
  }, () => alive);
  const silentDemo = () => {
    // demo should never make noise
    demoBoard.move = ((orig) => (slot: number, mv: Move) => orig(slot, mv, true))(demoBoard.move.bind(demoBoard));
    demoBoard.swap = ((orig) => (a: number, b: number) => orig(a, b, true))(demoBoard.swap.bind(demoBoard));
  };
  silentDemo();
  function nextDemo() {
    if (!alive) return;
    if (!deck.length) deck = makeDeck();
    const c = deck.pop()!;
    demoCardEl.replaceChildren(cardFace(c));
    demoBot.start(c.targets);
  }
  nextDemo();

  mount(el, () => { alive = false; demoBot.stop(); clearTimeout(demoTimer); });
}

function cardFace(c: Card, big = false) {
  const pal = PALETTE[c.color];
  return h(`<div class="card-face ${big ? 'big' : ''}" style="--c:${pal.base};--cl:${pal.light}">
    <div class="stitch"></div>${faceGrid(c.views, pal.shade)}</div>`);
}

// ─────────────────────────────── Help ───────────────────────────────

function sidesStrip(color: number) {
  const pal = PALETTE[color];
  return `<div class="sides">${FACE_NAMES.map((n, i) => `
    <figure><div class="side-tile" style="--c:${pal.base};--cl:${pal.light}">${tileSVG(i, 0, pal.shade)}</div><figcaption>${n}</figcaption></figure>`).join('')}</div>`;
}

function showHelp(onClose?: () => void) {
  const ov = h(`<div class="overlay" role="dialog" aria-modal="true" aria-label="How to play">
    <div class="sheet help">
      <button class="x" aria-label="Close">✕</button>
      <h2>How to play</h2>
      <ol class="rules">
        <li><b>Each player gets 4 blocks.</b> All four are the same, and every block has these 6 sides:</li>
      </ol>
      ${sidesStrip(settings.color)}
      <ol class="rules" start="2">
        <li><b>A card flips over.</b> Its face is made of four quarters, one per block.</li>
        <li><b>Build it.</b> Roll each block to the right side, then spin it so it points the right way. Swap blocks if that's quicker.</li>
        <li><b>Ring the bell</b> the moment your face matches. Correct: you win the card. Wrong: you lose a card and freeze for 2 seconds.</li>
        <li><b>First to the card target wins.</b> Your blocks stay as they are between cards, so start from where you left off.</li>
      </ol>
      <div class="controls-help">
        <div><h3>Mouse / touch</h3>
          <p><kbd>Swipe</kbd> a block to roll it that way</p>
          <p><kbd>Tap</kbd> to spin clockwise · <kbd>Right-click</kbd> or <kbd>Shift+tap</kbd> to spin back</p>
          <p><kbd>Scroll</kbd> over a block to spin it</p>
          <p><kbd>Hold</kbd> a block, then drag it onto another to swap</p>
        </div>
        <div><h3>Keyboard</h3>
          <p><kbd>1</kbd>–<kbd>4</kbd> pick a block (or hover it)</p>
          <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows roll · <kbd>Q</kbd><kbd>E</kbd> spin</p>
          <p><kbd>Shift</kbd>+direction swaps with the neighbour</p>
          <p><kbd>Space</kbd> rings the bell</p>
        </div>
      </div>
      <button class="btn go-close">Got it</button>
    </div></div>`);
  const close = () => { ov.remove(); onClose?.(); };
  ov.querySelector('.x')!.addEventListener('click', close);
  ov.querySelector('.go-close')!.addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  document.body.append(ov);
}

// ─────────────────────────────── Match ───────────────────────────────

interface Player {
  name: string;
  color: number;
  human: boolean;
  board: Board;
  bot?: Bot;
  won: number;
  frozenUntil: number;
  panel: HTMLElement;
  status: HTMLElement;
  pips: HTMLElement;
  pile: HTMLElement;
  bellBtn?: HTMLElement;
  stats: { moves: number; roundMoves: number; optimal: number; times: number[]; effMoves: number; effOpt: number; wrong: number };
}

const KEYMAPS = {
  p1: { sel: ['1', '2', '3', '4'], up: ['w'], down: ['s'], left: ['a'], right: ['d'], cw: ['e'], ccw: ['q'], bell: [' '] },
  p2: { sel: ['7', '8', '9', '0'], up: ['arrowup', 'i'], down: ['arrowdown', 'k'], left: ['arrowleft', 'j'], right: ['arrowright', 'l'], cw: ['o'], ccw: ['u'], bell: ['enter'] },
  solo: { sel: ['1', '2', '3', '4'], up: ['w', 'arrowup'], down: ['s', 'arrowdown'], left: ['a', 'arrowleft'], right: ['d', 'arrowright'], cw: ['e', 'x'], ccw: ['q', 'z'], bell: [' ', 'enter'] },
};

// ─────────────────────────────── Online 1v1 ───────────────────────────────

type StartMsg = Extract<Msg, { t: 'start' }>;
let liveNet: Net | null = null;
let matchHandler: ((m: Msg) => void) | null = null;
let matchOver: () => boolean = () => true;
let guestHello: Extract<Msg, { t: 'hello' }> | null = null;

const myName = () => { try { return localStorage.getItem('ff-name') || ''; } catch { return ''; } };
const rand4 = () => Array.from({ length: 4 }, () => Math.floor(Math.random() * 24));
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`).slice(0, 16);

function attachNet(net: Net) {
  liveNet = net;
  net.onMsg = (m) => {
    if (m.t === 'start' && net.role === 'guest') {
      document.querySelectorAll('.overlay').forEach((o) => o.remove());
      startMatch('online', { net, start: m });
      return;
    }
    if (m.t === 'rematch' && net.role === 'host') { if (matchOver()) hostStart(net); return; }
    matchHandler?.(m);
  };
  net.onClose = () => {
    if (liveNet !== net) return;
    liveNet = null;
    matchHandler = null;
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
    const ov = h(`<div class="overlay"><div class="sheet results"><div class="trophy">👋</div><h2>Your friend left</h2>
      <p class="sub">The connection to the other player closed.</p><div class="row"><button class="btn">Back to menu</button></div></div></div>`);
    ov.querySelector('button')!.addEventListener('click', () => { ov.remove(); home(); });
    document.body.append(ov);
  };
}

function hostStart(net: Net) {
  const hello = guestHello ?? { t: 'hello' as const, name: 'Friend', color: 2 };
  const gc = hello.color === settings.color ? (settings.color + 2) % 4 : hello.color;
  const start: StartMsg = {
    t: 'start', target: settings.target,
    names: [esc(myName() || 'Host'), esc(hello.name || 'Friend')],
    colors: [settings.color, gc], boards: [rand4(), rand4()],
  };
  net.send(start);
  startMatch('online', { net, start });
}

function leaveOnline() {
  matchHandler = null;
  if (liveNet) { const n = liveNet; liveNet = null; n.close(); }
}

function showLobby(prefill = '') {
  let cancel: (() => void) | null = null;
  const link = (code: string) => `${location.origin}${location.pathname}?room=${code}`;
  const ov = h(`<div class="overlay" role="dialog" aria-modal="true" aria-label="Play a friend online">
    <div class="sheet lobby">
      <button class="x" aria-label="Close">✕</button>
      <h2>Play a friend online</h2>
      <p class="sub">1v1 over the internet. One of you creates a room, the other joins with the code.</p>
      <label class="field"><span>Your name</span><input data-k="name" maxlength="16" placeholder="e.g. Mahi" value="${esc(myName())}"></label>
      <div class="lobby-cols">
        <section class="lobby-box">
          <h3>Create a room</h3>
          <div data-k="host"><button class="btn" data-a="create">Create room</button></div>
        </section>
        <section class="lobby-box">
          <h3>Join a room</h3>
          <form data-k="join" class="join-row"><input data-k="code" maxlength="5" placeholder="CODE" autocapitalize="characters" spellcheck="false" value="${esc(prefill)}"><button class="btn" type="submit">Join</button></form>
          <p class="lobby-msg" data-k="jmsg"></p>
        </section>
      </div>
      <p class="fine">Peer-to-peer: moves go straight between your two browsers. Both players need to keep this tab open.</p>
    </div></div>`);
  const $ = <T extends HTMLElement>(k: string) => ov.querySelector<T>(`[data-k=${k}]`)!;
  const nameIn = $<HTMLInputElement>('name');
  const saveName = () => { try { localStorage.setItem('ff-name', nameIn.value.trim()); } catch { /* ignore */ } };
  nameIn.addEventListener('change', saveName);
  const close = () => { cancel?.(); ov.remove(); history.replaceState(null, '', location.pathname); };
  ov.querySelector('.x')!.addEventListener('click', close);

  ov.querySelector('[data-a=create]')!.addEventListener('click', () => {
    saveName();
    cancel?.();
    const code = newCode();
    const box = $('host');
    box.innerHTML = `<p class="lobby-msg">Opening room…</p>`;
    cancel = hostRoom(code, {
      onReady: () => {
        box.innerHTML = `<div class="room-code">${code}</div>
          <div class="share"><input readonly value="${link(code)}"><button class="btn ghost" data-a="copy">Copy link</button></div>
          <p class="lobby-msg wait"><span class="dots"></span> Waiting for your friend to join…</p>`;
        box.querySelector('[data-a=copy]')!.addEventListener('click', async (e) => {
          const b = e.currentTarget as HTMLElement;
          try { await navigator.clipboard.writeText(link(code)); b.textContent = 'Copied!'; }
          catch { (box.querySelector('input') as HTMLInputElement).select(); b.textContent = 'Press Ctrl+C'; }
        });
      },
      onGuest: (net, hello) => {
        cancel = null;
        guestHello = hello;
        attachNet(net);
        ov.remove();
        hostStart(net);
      },
      onError: (msg) => { box.innerHTML = `<p class="lobby-msg bad">${msg}</p><button class="btn" data-a="create2">Try again</button>`; box.querySelector('[data-a=create2]')!.addEventListener('click', () => (ov.querySelector('[data-a=create]') as HTMLElement | null)?.click() ?? showLobbyRetry()); },
    });
  });
  const showLobbyRetry = () => { close(); showLobby(); };

  $('join').addEventListener('submit', (e) => {
    e.preventDefault();
    saveName();
    const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
    const msg = $('jmsg');
    if (code.length !== 5) { msg.className = 'lobby-msg bad'; msg.textContent = 'Room codes have 5 characters.'; return; }
    msg.className = 'lobby-msg wait';
    msg.innerHTML = '<span class="dots"></span> Connecting…';
    cancel?.();
    cancel = joinRoom(code, { t: 'hello', name: nameIn.value.trim() || 'Friend', color: settings.color }, {
      onJoined: (net) => { cancel = null; attachNet(net); msg.innerHTML = '<span class="dots"></span> Connected! Starting…'; },
      onError: (m) => { msg.className = 'lobby-msg bad'; msg.textContent = m; },
    });
  });
  document.body.append(ov);
  (prefill ? $<HTMLInputElement>('code') : nameIn).focus();
}

function startMatch(mode: Mode, online?: { net: Net; start: StartMsg }) {
  const s = settings;
  const solo = mode === 'sprint' || mode === 'attack' || mode === 'zen';
  const net = online?.net ?? null;
  const isHost = !net || net.role === 'host';
  const meIdx = net?.role === 'guest' ? 1 : 0;
  const target = mode === 'sprint' ? 10 : online ? online.start.target : s.target;
  const titles: Record<Mode, string> = { bots: `First to ${target}`, duo: `Duo · first to ${target}`, sprint: 'Sprint 10', attack: '90-second rush', zen: 'Practice', online: `Online 1v1 · first to ${target} · room ${net?.code ?? ''}` };

  const el = h(`
  <main class="game mode-${mode}">
    <header class="hud">
      <button class="icon" data-act="home" aria-label="Back to menu">‹ Menu</button>
      <div class="hud-title">${titles[mode]}</div>
      <div class="hud-right">
        <button class="icon" data-act="sides" aria-label="Show block sides">Sides</button>
        <button class="icon" data-act="mute" aria-label="Toggle sound">${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon" data-act="help" aria-label="How to play">?</button>
      </div>
    </header>
    <section class="opponents"></section>
    <section class="center">
      <div class="deck"><div class="deck-stack"></div><span class="deck-count"></span></div>
      <div class="card-stage"><div class="card-slot"></div><div class="card-name"></div></div>
      <div class="center-side"></div>
    </section>
    <div class="sides-drawer" hidden></div>
    <section class="mine"></section>
    <div class="toast" aria-live="polite"></div>
  </main>`);

  const opp = el.querySelector<HTMLElement>('.opponents')!;
  const mine = el.querySelector<HTMLElement>('.mine')!;
  const centerSide = el.querySelector<HTMLElement>('.center-side')!;
  const cardSlot = el.querySelector<HTMLElement>('.card-slot')!;
  const cardName = el.querySelector<HTMLElement>('.card-name')!;
  const deckCount = el.querySelector<HTMLElement>('.deck-count')!;
  const toast = el.querySelector<HTMLElement>('.toast')!;
  const drawer = el.querySelector<HTMLElement>('.sides-drawer')!;
  drawer.innerHTML = sidesStrip(s.color);
  if (mode === 'zen') drawer.hidden = false;

  let phase: 'flip' | 'play' | 'resolve' | 'over' = 'flip';
  let deck = makeDeck();
  let card: Card | null = null;
  let roundStart = 0;
  let matchStart = performance.now();
  let solvedCount = 0;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  let raf = 0;
  let paused = false;

  // players
  const players: Player[] = [];
  const humanColors = mode === 'duo' ? [s.color, s.color2] : [s.color];
  const humanNames = mode === 'duo' ? ['Player 1', 'Player 2'] : ['You'];
  const botColors = [0, 1, 2, 3].filter((c) => c !== s.color);

  const makePlayer = (name: string, color: number, human: boolean, idx: number, initial?: number[], remote = false): Player => {
    const p = {} as Player;
    const board = new Board({
      color,
      interactive: human,
      canAct: () => phase === 'play' && !paused && performance.now() > p.frozenUntil,
      onAction: (kind, a, b) => onHumanAction(p, kind, a, b),
    }, initial);
    const panel = h(`<div class="player ${human ? 'human' : remote ? 'bot remote' : 'bot'}" style="--c:${PALETTE[color].base};--cl:${PALETTE[color].light};--ink:${PALETTE[color].ink}">
      <div class="p-head"><span class="p-dot"></span><span class="p-name">${name}</span><span class="p-status"></span></div>
      <div class="p-board"></div>
      <div class="p-foot"><div class="pips"></div><div class="pile" aria-label="cards won"></div></div>
    </div>`);
    panel.querySelector('.p-board')!.append(board.el);
    Object.assign(p, {
      name, color, human, board, won: 0, frozenUntil: 0, panel,
      status: panel.querySelector('.p-status')!, pips: panel.querySelector('.pips')!, pile: panel.querySelector('.pile')!,
      stats: { moves: 0, roundMoves: 0, optimal: 0, times: [], effMoves: 0, effOpt: 0, wrong: 0 },
    });
    if (!human && !remote) {
      p.bot = new Bot(board, s.level, () => ring(p), () => phase === 'play' && !paused);
    }
    if (human && !solo) {
      const kb = mode === 'duo' ? (idx === 0 ? 'Space' : 'Enter') : 'Space';
      const bell = h(`<button class="bell" aria-label="Ring the bell (${kb})"><span class="bell-dome"></span><span class="bell-base"></span><span class="bell-key">${kb}</span></button>`);
      bell.addEventListener('pointerdown', (e) => { e.preventDefault(); ring(p); });
      p.bellBtn = bell;
      panel.querySelector('.p-foot')!.prepend(bell);
    }
    return p;
  };

  if (online) {
    // index 0 = host, 1 = guest on both machines
    const st = online.start;
    [0, 1].forEach((i) => players.push(makePlayer(i === meIdx ? 'You' : st.names[i], st.colors[i], i === meIdx, 0, st.boards[i], i !== meIdx)));
  } else humanNames.forEach((n, i) => players.push(makePlayer(n, humanColors[i], true, i)));
  if (mode === 'bots') for (let i = 0; i < s.bots; i++) players.push(makePlayer(BOT_NAMES[i], botColors[i], false, i));
  players.filter((p) => p.human).forEach((p) => mine.append(p.panel));
  players.filter((p) => !p.human).forEach((p) => opp.append(p.panel));
  if (!players.some((p) => !p.human)) opp.remove();

  // solo HUD
  if (solo) {
    centerSide.innerHTML = `<div class="solo-hud"><div class="big-num" data-k="clock">0.00s</div><div class="sub" data-k="count"></div><div class="sub dim" data-k="best"></div></div>`;
  }
  const renderPips = () => {
    for (const p of players) {
      if (solo) { p.pips.innerHTML = ''; continue; }
      p.pips.innerHTML = Array.from({ length: target }, (_, i) => `<i class="${i < p.won ? 'on' : ''}"></i>`).join('');
      p.pile.textContent = p.won ? String(p.won) : '';
      p.pile.classList.toggle('has', p.won > 0);
    }
    deckCount.textContent = `${deckLeft ?? deck.length}`;
  };
  let deckLeft: number | null = null;

  const say = (msg: string, kind = '') => {
    toast.textContent = msg;
    toast.className = 'toast show ' + kind;
    clearTimeout(Number(toast.dataset.t));
    toast.dataset.t = String(window.setTimeout(() => (toast.className = 'toast'), 1500));
  };

  function nextCard(given?: Card) {
    if (phase === 'over' && given === undefined && net) return;
    if (given) card = given;
    else {
      if (!isHost) return; // the guest waits for the host to deal
      if (!deck.length) deck = makeDeck();
      card = deck.pop()!;
      net?.send({ t: 'card', card, left: deck.length });
    }
    phase = 'flip';
    players.forEach((p) => { p.status.textContent = ''; p.panel.classList.remove('winner'); });
    sfx.flip();
    const flip = h(`<div class="card-flip"><div class="card-inner"><div class="card-back"><span>FF</span></div></div></div>`);
    const front = cardFace(card, true);
    front.classList.add('card-front');
    flip.querySelector('.card-inner')!.append(front);
    cardSlot.replaceChildren(flip);
    cardName.textContent = '';
    renderPips();
    requestAnimationFrame(() => requestAnimationFrame(() => flip.classList.add('open')));
    later(() => {
      if (!card) return;
      cardName.textContent = card.name;
      phase = 'play';
      roundStart = performance.now();
      for (const p of players) {
        p.stats.roundMoves = 0;
        p.stats.optimal = Math.round(bestPlan(p.board.orients, card.targets).cost);
        p.board.setHintTargets(s.hints || mode === 'zen' ? card.targets : null);
        if (p.bot) { p.status.textContent = 'thinking…'; p.bot.start(card.targets); }
      }
      if (mode === 'zen') say(`Best possible: ${players[0].stats.optimal} move${players[0].stats.optimal === 1 ? '' : 's'}`);
      // a face can already match by luck
      players.filter((p) => p.human).forEach((p) => checkAuto(p));
    }, 620);
  }

  function onHumanAction(p: Player, kind: 'move' | 'swap', a: number, b: Move | number) {
    if (!p.human) return;
    if (net) net.send(kind === 'move' ? { t: 'mv', slot: a, mv: b as string } : { t: 'sw', a, b: b as number });
    p.stats.moves++;
    p.stats.roundMoves++;
    checkAuto(p);
  }

  function checkAuto(p: Player) {
    if (phase !== 'play' || !card || !p.board.matches(card.targets)) return;
    if (solo) soloSolved(p);
    else if (s.autoRing) later(() => ring(p), 120);
  }

  function soloSolved(p: Player) {
    phase = 'resolve';
    const t = performance.now() - roundStart;
    p.stats.times.push(t);
    p.stats.effMoves += p.stats.roundMoves;
    p.stats.effOpt += p.stats.optimal;
    solvedCount++;
    sfx.point();
    p.board.flash('win');
    if (mode === 'zen') {
      const extra = p.stats.roundMoves - p.stats.optimal;
      say(extra <= 0 ? `Perfect! ${p.stats.roundMoves} moves` : `Solved in ${p.stats.roundMoves} (best was ${p.stats.optimal})`, 'good');
    }
    flyCard(p);
    renderSolo();
    if (mode === 'sprint' && solvedCount >= 10) return later(() => gameOver(), 500);
    later(() => nextCard(), mode === 'zen' ? 1100 : 380);
  }

  function ring(p: Player) {
    if (phase !== 'play' || !card || paused) return;
    const now = performance.now();
    if (now < p.frozenUntil) return;
    sfx.bell();
    p.bellBtn?.classList.remove('hit');
    void p.bellBtn?.offsetWidth;
    p.bellBtn?.classList.add('hit');
    if (!isHost) { net!.send({ t: 'ring' }); return; } // the host judges
    const who = players.indexOf(p);
    if (p.board.matches(card.targets)) {
      const ms = now - roundStart;
      net?.send({ t: 'win', who, ms });
      return winRound(p, ms);
    }
    net?.send({ t: 'false', who });
    falseRing(p);
  }

  function falseRing(p: Player) {
    const now = performance.now();
    p.stats.wrong++;
    p.frozenUntil = now + 2000;
    p.board.flash('wrong');
    later(() => sfx.buzz(), 120);
    p.panel.classList.add('frozen');
    later(() => p.panel.classList.remove('frozen'), 2000);
    if (p.won > 0) {
      p.won--;
      deck.unshift(makeDeck(1)[0]);
      say(`${p.name === 'You' ? 'Not yet!' : p.name + ' rang too early!'} −1 card`, 'bad');
    } else say(`${p.name === 'You' ? 'Not yet!' : p.name + ' rang too early!'} Frozen 2s`, 'bad');
    renderPips();
  }

  function winRound(p: Player, ms?: number) {
    phase = 'resolve';
    players.forEach((q) => q.bot?.stop());
    const t = ms ?? performance.now() - roundStart;
    p.won++;
    p.stats.times.push(t);
    p.stats.effMoves += p.stats.roundMoves;
    p.stats.effOpt += p.stats.optimal;
    p.panel.classList.add('winner');
    p.board.flash('win');
    p.status.textContent = fmt(t);
    players.forEach((q) => { if (q !== p && q.bot) q.status.textContent = ''; });
    const me = players.filter((q) => q.human);
    if (p.human) later(() => sfx.point(), 250); else later(() => sfx.lose(), 250);
    say(p.name === 'You' ? `You got it in ${fmt(t)}!` : `${p.name} got it in ${fmt(t)}`, p.human ? 'good' : '');
    flyCard(p);
    later(renderPips, 600);
    if (p.won >= target) return later(() => gameOver(p), 1300);
    if (isHost) later(() => nextCard(), me.length && !p.human ? 1900 : 1500);
  }

  function flyCard(p: Player) {
    const src = cardSlot.querySelector<HTMLElement>('.card-front');
    if (!src) return;
    const a = src.getBoundingClientRect();
    const b = (solo ? deckCount : p.pile).getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.classList.add('card-ghost');
    Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    document.body.append(ghost);
    src.style.visibility = 'hidden';
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const sc = Math.max(0.12, Math.min(b.width, 40) / a.width);
    ghost.animate(
      [{ transform: 'none' }, { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 60}px) rotate(-8deg) scale(.8)`, offset: 0.4 }, { transform: `translate(${dx}px, ${dy}px) rotate(12deg) scale(${sc})`, opacity: 0.2 }],
      { duration: 620, easing: 'cubic-bezier(.4,.1,.3,1)' },
    ).onfinish = () => ghost.remove();
  }

  function renderSolo() {
    if (!solo) return;
    const count = el.querySelector<HTMLElement>('[data-k=count]')!;
    const best = el.querySelector<HTMLElement>('[data-k=best]')!;
    if (mode === 'sprint') { count.textContent = `${solvedCount} / 10 faces`; const b = getBest('sprint'); best.textContent = b ? `Best ${fmt(b)}` : ''; }
    if (mode === 'attack') { count.textContent = `${solvedCount} faces`; const b = getBest('attack'); best.textContent = b ? `Best ${b}` : ''; }
    if (mode === 'zen') {
      const st = players[0].stats;
      count.textContent = `${solvedCount} solved`;
      best.textContent = st.effMoves ? `Efficiency ${Math.round((100 * st.effOpt) / Math.max(st.effMoves, 1))}%` : '';
    }
  }

  const ATTACK_MS = 90_000;
  function tick() {
    raf = requestAnimationFrame(tick);
    if (!solo || phase === 'over') return;
    const clock = el.querySelector<HTMLElement>('[data-k=clock]')!;
    const elapsed = performance.now() - matchStart;
    if (mode === 'sprint') clock.textContent = fmt(elapsed);
    if (mode === 'zen') clock.textContent = phase === 'play' ? fmt(performance.now() - roundStart) : clock.textContent;
    if (mode === 'attack') {
      const left = Math.max(0, ATTACK_MS - elapsed);
      clock.textContent = fmt(left);
      clock.classList.toggle('hurry', left < 10_000);
      if (left <= 0) gameOver();
    }
  }

  function gameOver(winner?: Player) {
    phase = 'over';
    players.forEach((p) => p.bot?.stop());
    const elapsed = performance.now() - matchStart;
    let headline = '';
    let sub = '';
    let record = false;
    if (mode === 'sprint') {
      headline = `10 faces in ${fmt(elapsed)}`;
      const b = getBest('sprint');
      if (!b || elapsed < b) { setBest('sprint', elapsed); record = true; }
      sub = record ? 'New personal best!' : `Best ${fmt(getBest('sprint')!)}`;
    } else if (mode === 'attack') {
      headline = `${solvedCount} face${solvedCount === 1 ? '' : 's'} in 90 seconds`;
      const b = getBest('attack');
      if (b === null || solvedCount > b) { setBest('attack', solvedCount); record = solvedCount > 0; }
      sub = record ? 'New personal best!' : `Best ${getBest('attack')}`;
    } else if (mode === 'zen') {
      headline = `${solvedCount} faces practised`;
    } else if (winner) {
      headline = winner.name === 'You' ? 'You win!' : `${winner.name} wins!`;
      sub = winner.human ? 'Fastest face in the house.' : 'So close. Rematch?';
    }
    const humanWon = !winner || winner.human;
    (humanWon ? sfx.fanfare : sfx.lose)();
    if (humanWon && mode !== 'zen') confetti();

    const rows = solo ? players : [...players].sort((a, b) => b.won - a.won);
    const stat = (p: Player) => {
      const st = p.stats;
      const avg = st.times.length ? fmt(st.times.reduce((a, b) => a + b, 0) / st.times.length) : '–';
      const fast = st.times.length ? fmt(Math.min(...st.times)) : '–';
      const eff = p.human && st.effMoves ? Math.round((100 * st.effOpt) / Math.max(st.effMoves, 1)) + '%' : '–';
      return `<tr style="--c:${PALETTE[p.color].base}"><td><span class="p-dot"></span>${p.name}</td>${solo ? '' : `<td>${p.won}</td>`}<td>${avg}</td><td>${fast}</td><td>${eff}</td></tr>`;
    };
    const ov = h(`<div class="overlay"><div class="sheet results ${humanWon ? 'happy' : ''}">
      <div class="trophy">${humanWon ? '🏆' : '🔔'}</div>
      <h2>${headline}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}
      <table><thead><tr><th>Player</th>${solo ? '' : '<th>Cards</th>'}<th>Avg face</th><th>Fastest</th><th title="Optimal moves ÷ your moves">Efficiency</th></tr></thead>
      <tbody>${rows.map(stat).join('')}</tbody></table>
      <div class="row"><button class="btn" data-a="again">Play again</button><button class="btn ghost" data-a="menu">Menu</button></div>
    </div></div>`);
    const againBtn = ov.querySelector<HTMLButtonElement>('[data-a=again]')!;
    againBtn.addEventListener('click', () => {
      if (!net) { ov.remove(); startMatch(mode); return; }
      if (isHost) { ov.remove(); hostStart(net); return; }
      net.send({ t: 'rematch' });
      againBtn.disabled = true;
      againBtn.textContent = 'Waiting for host…';
    });
    ov.querySelector('[data-a=menu]')!.addEventListener('click', () => { ov.remove(); home(); });
    later(() => document.body.append(ov), solo ? 300 : 200);
  }

  // keyboard
  const humans = players.filter((p) => p.human);
  const maps = mode === 'duo' ? [KEYMAPS.p1, KEYMAPS.p2] : [KEYMAPS.solo];
  const NEIGHBOR: Record<string, (s: number) => number> = {
    up: (x) => (x >= 2 ? x - 2 : -1), down: (x) => (x < 2 ? x + 2 : -1),
    left: (x) => (x % 2 ? x - 1 : -1), right: (x) => (x % 2 ? -1 : x + 1),
  };
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.overlay')) return;
    const k = e.key.toLowerCase();
    maps.forEach((m, i) => {
      const p = humans[i];
      if (!p) return;
      const b = p.board;
      const can = phase === 'play' && performance.now() > p.frozenUntil;
      const si = m.sel.indexOf(k);
      if (si >= 0) { b.select(si); e.preventDefault(); return; }
      if (m.bell.includes(k)) { e.preventDefault(); if (!solo) ring(p); return; }
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        if (m[dir].includes(k)) {
          e.preventDefault();
          if (!can) return;
          if (e.shiftKey) { const n = NEIGHBOR[dir](b.selected); if (n >= 0) { b.swap(b.selected, n); b.select(n); } }
          else b.move(b.selected, dir);
          return;
        }
      }
      if (m.cw.includes(k)) { e.preventDefault(); if (can) b.move(b.selected, 'cw'); }
      if (m.ccw.includes(k)) { e.preventDefault(); if (can) b.move(b.selected, 'ccw'); }
      if (k === 'tab' && i === 0) { e.preventDefault(); b.select((b.selected + (e.shiftKey ? 3 : 1)) % 4); }
    });
  };
  window.addEventListener('keydown', onKey);

  // header actions
  el.querySelector('[data-act=home]')!.addEventListener('click', () => home());
  el.querySelector('[data-act=sides]')!.addEventListener('click', () => { drawer.hidden = !drawer.hidden; });
  const muteBtn = el.querySelector<HTMLElement>('[data-act=mute]')!;
  muteBtn.addEventListener('click', () => { setMuted(!isMuted()); muteBtn.textContent = isMuted() ? '🔇' : '🔊'; });
  el.querySelector('[data-act=help]')!.addEventListener('click', () => {
    if (net) return showHelp(); // the online clock can't pause
    paused = true;
    const pausedAt = performance.now();
    showHelp(() => {
      const d = performance.now() - pausedAt;
      roundStart += d;
      matchStart += d;
      paused = false;
    });
  });

  mount(el, () => {
    phase = 'over';
    players.forEach((p) => p.bot?.stop());
    timers.forEach(clearTimeout);
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    document.querySelectorAll('.overlay, .card-ghost, .confetti').forEach((n) => n.remove());
  });

  if (net) {
    const remote = players[1 - meIdx];
    matchOver = () => phase === 'over';
    matchHandler = (m) => {
      switch (m.t) {
        case 'card': deckLeft = m.left; nextCard(m.card); break;
        case 'mv': remote.board.move(m.slot, m.mv as Move, true); break;
        case 'sw': remote.board.swap(m.a, m.b, true); break;
        case 'ring': if (isHost) ring(remote); break;
        case 'win': if (!isHost) winRound(players[m.who], m.ms); break;
        case 'false': if (!isHost) falseRing(players[m.who]); break;
      }
    };
  }

  renderPips();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ff = { card: () => card, phase: () => phase, players, solvePath, ring };
  renderSolo();
  tick();
  // first visit: show the rules once
  let seen = false;
  try { seen = localStorage.getItem('ff-seen-help') === '1'; localStorage.setItem('ff-seen-help', '1'); } catch { /* ignore */ }
  if (!seen && !net) { paused = true; showHelp(() => { paused = false; matchStart = performance.now(); later(() => nextCard(), 300); }); }
  else later(() => nextCard(), net ? 900 : 500);
}

function confetti() {
  const wrap = h(`<div class="confetti" aria-hidden="true"></div>`);
  const colors = PALETTE.map((p) => p.base).concat('#ffffff');
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = Math.random() * 0.6 + 's';
    c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    c.style.setProperty('--r', Math.random() * 720 - 360 + 'deg');
    c.style.setProperty('--x', Math.random() * 160 - 80 + 'px');
    wrap.append(c);
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 4200);
}

home();
{
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    history.replaceState(null, '', location.pathname);
    showLobby(room.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
  }
}
