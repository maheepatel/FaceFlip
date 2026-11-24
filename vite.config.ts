import { defineConfig, type Plugin } from 'vite';

// Content Security Policy for the built site. GitHub Pages can't send headers,
// so it goes in a <meta> tag. Only added to production builds: the dev server
// needs inline scripts and a websocket for hot reload.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // the blocks set colours and transforms through inline style attributes
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  // PeerJS broker: issues ids over https and signals over a websocket
  'connect-src https://0.peerjs.com wss://0.peerjs.com',
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const securityHeaders = (): Plugin => ({
  name: 'faceflip-security-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`,
    ),
});

// relative base so the build works on GitHub Pages under /FaceFlip/
export default defineConfig({ base: './', plugins: [securityHeaders()] });
