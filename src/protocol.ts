// Wire protocol for online play: message types, room codes and the validator
// that rebuilds every incoming message. No PeerJS here so it can be unit tested.
import type { Card } from './cards.ts';
import { MOVES, orientIndexForView, type Move } from './cube.ts';

export type Msg =
  | { t: 'hello'; name: string; color: number }
  | { t: 'start'; target: number; names: [string, string]; colors: [number, number]; boards: [number[], number[]] }
  | { t: 'card'; card: Card; left: number }
  | { t: 'mv'; slot: number; mv: Move }
  | { t: 'sw'; a: number; b: number }
  | { t: 'ring' }
  | { t: 'win'; who: number; ms: number }
  | { t: 'false'; who: number }
  | { t: 'rematch' }
  | { t: 'bye' };

/** No 0/O, 1/I/L: easy to read out loud and type. 31 symbols, 5 long ≈ 28.6M codes. */
export const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;
const COLORS = 4;
const TARGETS = [5, 7, 10];


/** Cryptographically random room code (Math.random is guessable). */
export function newCode(): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < CODE_LEN) {
    crypto.getRandomValues(buf);
    // rejection sampling keeps every symbol equally likely
    if (buf[0] < 256 - (256 % CODE_ALPHA.length)) out.push(CODE_ALPHA[buf[0] % CODE_ALPHA.length]);
  }
  return out.join('');
}

/** Keep only valid code symbols, uppercased; '' if it can't be a room code. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().split('').filter((c) => CODE_ALPHA.includes(c)).join('').slice(0, CODE_LEN);
}

/** Display names: printable text only, no markup characters, at most 16 chars. */
export function cleanName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const s = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩<>&"'`\\]/g, '').trim();
  return Array.from(s).slice(0, 16).join('') || fallback;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseBoard(v: unknown): number[] | null {
  return Array.isArray(v) && v.length === 4 && v.every((x) => isInt(x, 0, 23)) ? v.slice() : null;
}

function parseCard(v: unknown): Card | null {
  if (!obj(v) || !Array.isArray(v.views) || v.views.length !== 4 || !isInt(v.color, 0, COLORS - 1) || !isInt(v.id, 0, 1e6)) return null;
  const views = [];
  for (const w of v.views) {
    if (!obj(w) || !isInt(w.face, 0, 5) || !isInt(w.rot, 0, 3)) return null;
    views.push({ face: w.face, rot: w.rot });
  }
  const targets = views.map(orientIndexForView);
  if (targets.some((t) => t < 0)) return null;
  // targets are recomputed locally, never taken from the wire
  return { id: v.id, views, targets, color: v.color, name: cleanName(v.name, 'Mystery face').slice(0, 40) };
}

/** Validate an incoming message for this role. Returns null for anything unexpected. */
export function parseMsg(d: unknown, role: 'host' | 'guest'): Msg | null {
  if (!obj(d) || typeof d.t !== 'string') return null;
  const fromHost = role === 'guest'; // what a guest receives was sent by the host
  switch (d.t) {
    case 'bye': return { t: 'bye' };
    case 'mv': return isInt(d.slot, 0, 3) && MOVES.includes(d.mv as Move) ? { t: 'mv', slot: d.slot, mv: d.mv as Move } : null;
    case 'sw': return isInt(d.a, 0, 3) && isInt(d.b, 0, 3) && d.a !== d.b ? { t: 'sw', a: d.a, b: d.b } : null;
    // guest → host only
    case 'hello': return fromHost ? null : { t: 'hello', name: cleanName(d.name, 'Friend'), color: isInt(d.color, 0, COLORS - 1) ? d.color : 2 };
    case 'ring': return fromHost ? null : { t: 'ring' };
    case 'rematch': return fromHost ? null : { t: 'rematch' };
    // host → guest only
    case 'card': {
      if (!fromHost || !isInt(d.left, 0, 1000)) return null;
      const card = parseCard(d.card);
      return card ? { t: 'card', card, left: d.left } : null;
    }
    case 'win': return fromHost && isInt(d.who, 0, 1) && typeof d.ms === 'number' && Number.isFinite(d.ms) && d.ms >= 0 ? { t: 'win', who: d.who, ms: d.ms } : null;
    case 'false': return fromHost && isInt(d.who, 0, 1) ? { t: 'false', who: d.who } : null;
    case 'start': {
      if (!fromHost || !TARGETS.includes(d.target as number) || !Array.isArray(d.names) || !Array.isArray(d.colors) || !Array.isArray(d.boards)) return null;
      if (d.names.length !== 2 || d.colors.length !== 2 || d.boards.length !== 2) return null;
      const colors = d.colors.every((c) => isInt(c, 0, COLORS - 1)) ? (d.colors as [number, number]) : null;
      const b0 = parseBoard(d.boards[0]), b1 = parseBoard(d.boards[1]);
      if (!colors || !b0 || !b1) return null;
      return { t: 'start', target: d.target as number, names: [cleanName(d.names[0], 'Host'), cleanName(d.names[1], 'You')], colors: [colors[0], colors[1]], boards: [b0, b1] };
    }
  }
  return null;
}
