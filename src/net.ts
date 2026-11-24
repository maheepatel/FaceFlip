// Peer-to-peer 1v1 over WebRTC (PeerJS public broker, no game server).
// The host is authoritative: it deals cards, keeps a replica of the guest's
// board (by replaying the guest's moves in order) and judges every bell ring.
//
// Nothing from the other browser is trusted. Every message is validated and
// rebuilt by parseMsg() before the game sees it, each side only accepts the
// message types its role should receive, and a flood of messages is dropped.
import Peer, { type DataConnection } from 'peerjs';
import { parseMsg, newCode, cleanCode, type Msg } from './protocol.ts';
export { newCode, cleanCode, cleanName, CODE_LEN, type Msg } from './protocol.ts';

const PREFIX = 'faceflip-v1-';
const HELLO_TIMEOUT = 8000;
const JOIN_TIMEOUT = 15000;
/** Token bucket: a fast human makes ~10 moves a second; allow bursts, drop floods. */
const RATE = 40, BURST = 80, ABUSE_LIMIT = 400;

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

function wrap(role: Net['role'], code: string, peer: Peer, conn: DataConnection): Net {
  const net: Net = {
    role, code, peer, conn,
    send: (m) => { if (conn.open) { try { conn.send(m); } catch { /* channel closing */ } } },
    onMsg: null,
    onClose: null,
    close: () => { try { conn.send({ t: 'bye' }); } catch { /* ignore */ } setTimeout(() => peer.destroy(), 150); },
  };
  let closed = false;
  const lost = () => { if (!closed) { closed = true; net.onClose?.(); setTimeout(() => peer.destroy(), 150); } };
  let tokens = BURST, last = performance.now(), dropped = 0;
  conn.on('data', (d) => {
    const now = performance.now();
    tokens = Math.min(BURST, tokens + ((now - last) / 1000) * RATE);
    last = now;
    if (tokens < 1) { if (++dropped > ABUSE_LIMIT) { try { conn.close(); } catch { /* ignore */ } lost(); } return; }
    tokens -= 1;
    const m = parseMsg(d, role);
    if (!m) return;
    if (m.t === 'bye') lost();
    else { try { net.onMsg?.(m); } catch (e) { console.error('FaceFlip: bad message', e); } }
  });
  conn.on('close', lost);
  conn.on('error', lost);
  // the broker link only matters for new joins; the game channel is direct
  peer.on('disconnected', () => { if (!closed && !peer.destroyed) { try { peer.reconnect(); } catch { /* ignore */ } } });
  return net;
}

function peerError(e: { type?: string }): string {
  switch (e.type) {
    case 'browser-incompatible': return 'This browser cannot play online. Try Chrome, Edge, Firefox or Safari.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'Could not reach the game network. Check your internet and try again.';
    case 'webrtc': return 'Your network blocked the connection. Try another Wi-Fi or mobile data.';
    default: return `Connection problem (${e.type ?? 'unknown'}). Try again.`;
  }
}

/** Open a room and wait for one friend. A taken code is retried with a fresh one. */
export function hostRoom(handlers: { onReady: (code: string) => void; onGuest: (net: Net, hello: Extract<Msg, { t: 'hello' }>) => void; onError: (msg: string) => void }) {
  let peer: Peer | null = null;
  let stopped = false;
  const open = (attempt: number) => {
    const code = newCode();
    const p = new Peer(PREFIX + code, { debug: 0 });
    peer = p;
    let taken = false;
    p.on('open', () => { if (!stopped) handlers.onReady(code); });
    p.on('error', (e: { type?: string }) => {
      if (stopped) return;
      if (e.type === 'unavailable-id' && attempt < 4) { p.destroy(); open(attempt + 1); return; }
      if (e.type === 'peer-unavailable') return; // irrelevant for a host
      if (!taken) handlers.onError(peerError(e));
    });
    p.on('connection', (conn) => {
      if (taken || stopped) { conn.on('open', () => { try { conn.send({ t: 'bye' }); } catch { /* ignore */ } setTimeout(() => conn.close(), 100); }); return; }
      taken = true;
      // a joiner that never says hello must not hold the room forever
      const t = setTimeout(() => { conn.off('data', first); try { conn.close(); } catch { /* ignore */ } taken = false; }, HELLO_TIMEOUT);
      function first(d: unknown) {
        const m = parseMsg(d, 'host');
        if (!m || m.t !== 'hello') return;
        clearTimeout(t);
        conn.off('data', first);
        handlers.onGuest(wrap('host', code, p, conn), m);
      }
      conn.on('data', first);
    });
  };
  open(0);
  return () => { stopped = true; peer?.destroy(); };
}

/** Join a friend's room. */
export function joinRoom(rawCode: string, hello: Extract<Msg, { t: 'hello' }>, handlers: { onJoined: (net: Net) => void; onError: (msg: string) => void }) {
  const code = cleanCode(rawCode);
  const peer = new Peer({ debug: 0 });
  let done = false;
  const fail = (msg: string) => { if (!done) { done = true; clearTimeout(timer); handlers.onError(msg); peer.destroy(); } };
  const timer = setTimeout(() => fail('Could not reach that room. Check the code and that your friend still has it open.'), JOIN_TIMEOUT);
  peer.on('error', (e: { type?: string }) => fail(e.type === 'peer-unavailable' ? 'Room not found. Check the code, or ask your friend to create a new room.' : peerError(e)));
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, { reliable: true });
    let first = true;
    conn.on('data', function gate(d) {
      // a full room answers with bye straight away
      if (first && parseMsg(d, 'guest')?.t === 'bye') fail('That room is already full.');
      first = false;
      conn.off('data', gate);
    });
    conn.on('open', () => {
      // give a full room a moment to say bye before we commit
      setTimeout(() => {
        if (done) return;
        clearTimeout(timer);
        done = true;
        conn.send(hello);
        handlers.onJoined(wrap('guest', code, peer, conn));
      }, 250);
    });
  });
  return () => { clearTimeout(timer); if (!done) { done = true; peer.destroy(); } };
}
