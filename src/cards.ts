import { orientIndexForView, type View } from './cube.ts';

// Slot order: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
export interface Card {
  id: number;
  views: View[];
  targets: number[]; // orientation index per slot
  color: number; // card colour index
  name: string;
}

const EYES: (View & { tag: string })[] = [
  { face: 0, rot: 0, tag: 'peek' },
  { face: 0, rot: 1, tag: 'peek' },
  { face: 0, rot: 2, tag: 'peek' },
  { face: 0, rot: 3, tag: 'peek' },
  { face: 1, rot: 0, tag: 'star' },
  { face: 2, rot: 0, tag: 'love' },
  { face: 3, rot: 0, tag: 'grump' },
  { face: 3, rot: 2, tag: 'smug' },
];

// [bottom-left, bottom-right]
const MOUTHS: { l: View; r: View; tag: string }[] = [
  { l: { face: 4, rot: 0 }, r: { face: 4, rot: 2 }, tag: 'grin' },
  { l: { face: 5, rot: 0 }, r: { face: 5, rot: 3 }, tag: 'laugh' },
  { l: { face: 5, rot: 1 }, r: { face: 5, rot: 2 }, tag: 'shout' },
];

const NAMES: Record<string, string[]> = {
  'love-laugh': ['Smitten', 'Head over heels'],
  'star-laugh': ['Superstar', 'Starstruck'],
  'grump-shout': ['Furious', 'Steaming'],
  'smug-grin': ['Sly fox', 'Up to something'],
  'peek-laugh': ['Giggles', 'Sunny'],
  'peek-grin': ['Awkward', 'Oops'],
  'peek-shout': ['Gasp!', 'Spooked'],
  'love-grin': ['Shy crush'],
  'star-grin': ['Showtime'],
  'love-shout': ['Lovesick'],
  'star-shout': ['Wow!'],
  'grump-grin': ['Gritted teeth'],
  'grump-laugh': ['Evil laugh'],
  'smug-laugh': ['Smug'],
  'smug-shout': ['Unimpressed'],
};

/** Every distinct card face that can be built (8 x 8 x 3 = 192). */
export function allCardFaces(): Omit<Card, 'id' | 'color'>[] {
  const out: Omit<Card, 'id' | 'color'>[] = [];
  for (const a of EYES)
    for (const b of EYES)
      for (const m of MOUTHS) {
        const views = [
          { face: a.face, rot: a.rot },
          { face: b.face, rot: b.rot },
          m.l,
          m.r,
        ];
        const eyeTag = a.tag === b.tag ? a.tag : a.face === 0 && b.face === 0 ? 'peek' : `${a.tag}`;
        const pool = a.tag === b.tag || (a.face === 0 && b.face === 0) ? NAMES[`${eyeTag}-${m.tag}`] : null;
        const name = pool ? pool[(a.rot + b.rot) % pool.length] : mixName(a.tag, b.tag, m.tag);
        out.push({ views, targets: views.map(orientIndexForView), name });
      }
  return out;
}

function mixName(a: string, b: string, m: string) {
  const pair = [a, b].sort().join('+');
  const table: Record<string, string> = {
    'grump+smug': 'Suspicious',
    'love+star': 'Dazzled',
    'grump+love': 'Conflicted',
    'peek+star': 'Wink wink',
    'love+peek': 'Daydreaming',
    'grump+peek': 'Side-eye',
    'peek+smug': 'Cheeky',
    'grump+star': 'Determined',
    'smug+star': 'Show-off',
    'love+smug': 'Charmer',
  };
  const base = table[pair] ?? 'Mixed feelings';
  return m === 'shout' ? `${base}!` : base;
}

export function shuffle<T>(arr: T[], rnd = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A 72-card deck like the boxed game, drawn from the 192 buildable faces. */
export function makeDeck(size = 72): Card[] {
  return shuffle(allCardFaces())
    .slice(0, size)
    .map((c, i) => ({ ...c, id: i, color: i % 4 }));
}
