// Face art for the six sides of a cube. Every side is one quarter of an emoji.
// Art is drawn in a 100x100 box at rotation 0; cards and cubes rotate it in
// quarter turns. Mouth pieces are built so that turning them gives the other
// half (teeth piece is top-bottom symmetric; the open mouth is symmetric about
// its diagonal), so four identical cubes can build symmetric faces.

export const FACE_NAMES = ['Googly eye', 'Star eye', 'Heart eye', 'Sleepy eye', 'Teeth grin', 'Big mouth'];

const INK = '#231815';
const SW = 4.2; // stroke width

function star(cx: number, cy: number, ro: number, ri: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

let uid = 0;

/** Inner SVG markup for a face (no <svg> wrapper). `shade` is a darker tone of the block colour. */
export function faceArt(face: number, shade: string): string {
  const id = `c${uid++}`;
  switch (face) {
    case 0: // googly eye looking down-right, with glint
      return `
        <circle cx="50" cy="50" r="28" fill="#fff" stroke="${INK}" stroke-width="${SW}"/>
        <circle cx="59.5" cy="59.5" r="13" fill="${INK}"/>
        <circle cx="64" cy="54" r="4.2" fill="#fff"/>
        <circle cx="38" cy="36" r="3" fill="#fff" opacity=".9"/>`;
    case 1: // star eye, one point up
      return `
        <circle cx="50" cy="51" r="29" fill="#fff" stroke="${INK}" stroke-width="${SW}"/>
        <polygon points="${star(50, 53, 22, 9.5)}" fill="#ffc928" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
        <circle cx="45" cy="46" r="2.6" fill="#fff"/>`;
    case 2: // heart eye
      return `
        <path d="M50 80 C 22 60, 16 42, 26 31 C 35 21, 47 26, 50 36 C 53 26, 65 21, 74 31 C 84 42, 78 60, 50 80 Z"
          fill="#ff3d6e" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>
        <ellipse cx="34" cy="36" rx="6" ry="4" transform="rotate(-35 34 36)" fill="#fff" opacity=".85"/>`;
    case 3: // sleepy / grumpy eye: lid slanting down to the right
      return `
        <defs><clipPath id="${id}"><circle cx="50" cy="52" r="26"/></clipPath></defs>
        <circle cx="50" cy="52" r="26" fill="#fff"/>
        <circle cx="50" cy="62" r="11.5" fill="${INK}" clip-path="url(#${id})"/>
        <circle cx="54" cy="58" r="3.4" fill="#fff"/>
        <polygon points="0,0 100,0 100,58 0,36" fill="${shade}" clip-path="url(#${id})"/>
        <line x1="22" y1="40" x2="78" y2="52.5" stroke="${INK}" stroke-width="${SW}" stroke-linecap="round" clip-path="url(#${id})"/>
        <circle cx="50" cy="52" r="26" fill="none" stroke="${INK}" stroke-width="${SW}"/>
        <path d="M16 26 L 70 34" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    case 4: // left half of a teeth grin, flush with the right edge, centred vertically
      return `
        <path d="M100 30 H 40 A 20 20 0 0 0 40 70 H 100 Z" fill="#fff"/>
        <line x1="26" y1="50" x2="100" y2="50" stroke="${INK}" stroke-width="3"/>
        <line x1="58" y1="31" x2="58" y2="69" stroke="${INK}" stroke-width="3"/>
        <line x1="79" y1="31" x2="79" y2="69" stroke="${INK}" stroke-width="3"/>
        <path d="M100 30 H 40 A 20 20 0 0 0 40 70 H 100" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`;
    case 5: // quarter of a big open mouth centred on the top-right corner
      return `
        <path d="M100 0 L 34 0 A 66 66 0 0 0 100 66 Z" fill="#7a1d24"/>
        <path d="M100 66 A 66 66 0 0 1 34 0 L 50 0 A 50 50 0 0 0 100 50 Z" fill="#ff7a8a"/>
        <path d="M58 0 A 42 42 0 0 0 100 42" fill="none" stroke="#c43a4c" stroke-width="2.5" opacity=".6"/>
        <path d="M34 0 A 66 66 0 0 0 100 66" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linecap="round"/>`;
  }
  return '';
}

/** A full <svg> tile. */
export function tileSVG(face: number, rot: number, shade: string, extraClass = ''): string {
  return `<svg class="tile ${extraClass}" viewBox="0 0 100 100" aria-hidden="true">
    <g transform="rotate(${rot * 90} 50 50)">${faceArt(face, shade)}</g></svg>`;
}
