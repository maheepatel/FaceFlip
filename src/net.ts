// Peer-to-peer 1v1 over WebRTC (PeerJS public broker, no game server).
// The host is authoritative: it deals cards, keeps a replica of the guest's
// board (by replaying the guest's moves in order) and judges every bell ring.
import Peer, { type DataConnection } from 'peerjs';
import type { Card } from './cards.ts';

export type Msg =
  | { t: 'hello'; name: string; color: number }
  | { t: 'start'; target: number; names: [string, string]; colors: [number, number]; boards: [number[], number[]] }
  | { t: 'card'; card: Card; left: number }
  | { t: 'mv'; slot: number; mv: string }
  | { t: 'sw'; a: number; b: number }
  | { t: 'ring' }
  | { t: 'win'; who: number; ms: number }
  | { t: 'false'; who: number }
  | { t: 'rematch' }
  | { t: 'bye' };

const PREFIX = 'faceflip-v1-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface Net {
  role: 'host' | 'guest';
  code: string;
  peer: Peer;
  conn: DataConnection;
  send(m: Msg): void;
  onMsg: ((m: Msg) => void) | null;
  onClose: (() => void) | null;
  close(): void;
}

export const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

function wrap(role: Net['role'], code: string, peer: Peer, conn: DataConnection): Net {
  const net: Net = {
    role, code, peer, conn,
    send: (m) => { if (conn.open) conn.send(m); },
    onMsg: null,
    onClose: null,
    close: () => { try { conn.send({ t: 'bye' }); } catch { /* ignore */ } setTimeout(() => peer.destroy(), 150); },
  };
  let closed = false;
  const lost = () => { if (!closed) { closed = true; net.onClose?.(); } };
  conn.on('data', (d) => { const m = d as Msg; if (m.t === 'bye') lost(); else net.onMsg?.(m); });
  conn.on('close', lost);
  conn.on('error', lost);
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* ignore */ } });
  return net;
}

/** Open a room and wait for one friend. */
export function hostRoom(code: string, handlers: { onReady: () => void; onGuest: (net: Net, hello: Extract<Msg, { t: 'hello' }>) => void; onError: (msg: string) => void }) {
  const peer = new Peer(PREFIX + code, { debug: 0 });
  let taken = false;
  peer.on('open', () => handlers.onReady());
  peer.on('error', (e: { type?: string }) => handlers.onError(e.type === 'unavailable-id' ? 'That room code is in use. Try again.' : `Connection problem (${e.type ?? 'unknown'}).`));
  peer.on('connection', (conn) => {
    if (taken) { conn.on('open', () => { conn.send({ t: 'bye' }); setTimeout(() => conn.close(), 100); }); return; }
    taken = true;
    conn.on('data', function first(d) {
      const m = d as Msg;
      if (m.t !== 'hello') return;
      conn.off('data', first);
      handlers.onGuest(wrap('host', code, peer, conn), m);
    });
  });
  return () => peer.destroy();
}

/** Join a friend's room. */
export function joinRoom(code: string, hello: Extract<Msg, { t: 'hello' }>, handlers: { onJoined: (net: Net) => void; onError: (msg: string) => void }) {
  const peer = new Peer({ debug: 0 });
  let done = false;
  const fail = (msg: string) => { if (!done) { done = true; handlers.onError(msg); peer.destroy(); } };
  const timer = setTimeout(() => fail('Could not reach that room. Check the code and that your friend still has it open.'), 15000);
  peer.on('error', (e: { type?: string }) => fail(e.type === 'peer-unavailable' ? 'Room not found. Check the code.' : `Connection problem (${e.type ?? 'unknown'}).`));
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true });
    conn.on('open', () => {
      clearTimeout(timer);
      done = true;
      conn.send(hello);
      handlers.onJoined(wrap('guest', code, peer, conn));
    });
  });
  return () => { clearTimeout(timer); if (!done) peer.destroy(); };
}
