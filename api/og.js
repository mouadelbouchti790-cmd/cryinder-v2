/**
 * Cryinder — dynamic Open Graph image generator.
 *
 * Serverless (Vercel) endpoint that renders a 1200x630 PNG with the
 * Cryinder brand mark, wordmark and tagline, matching the app's dark
 * theme (#050505) and accent (#C4B5A0).
 *
 * GET /api/og                  -> static brand card (default social preview)
 * GET /api/og?t=<token>        -> dynamic token card (logo + symbol + sparkline)
 * GET /api/og?sparkline=<json> -> helper: renders a sparkline SVG (no PNG)
 *
 * Rendered with sharp (libvips) — pure Node ESM, no JSX/WASM/require quirks.
 * The brand fonts are bundled locally in api/fonts/ so no runtime fetch.
 */

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const config = { runtime: 'nodejs', maxDuration: 30 };

// ─── Brand tokens ───────────────────────────────────────────────────────

const WIDTH = 1200;
const HEIGHT = 630;
const ACCENT = '#C4B5A0';
const ON_DARK = '#F5F2EC';
const MUTED = '#A79F94';
const BG = '#050505';

const FONT_DIR = join(process.cwd(), 'api', 'fonts');
const FONT_MEDIUM = readFileSync(join(FONT_DIR, 'SpaceGrotesk-Medium.ttf'));
const FONT_BOLD = readFileSync(join(FONT_DIR, 'SpaceGrotesk-Bold.ttf'));

const LOGO_URL = 'https://cryinder.xyz/logo.png';

/** Escape XML special chars for SVG text. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Fetch a remote image into a Buffer, with a timeout. */
async function loadImage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`empty image: ${url}`);
    return buf;
  } finally {
    clearTimeout(t);
  }
}

/** Decode an image buffer to RGBA (fallback to a brand-colored tile on error). */
async function decodeImage(buf) {
  try {
    const { data, info } = await sharp(buf)
      .resize(256, 256, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height };
  } catch {
    const tile = Buffer.alloc(256 * 256 * 3, 0x05);
    return { data: tile, w: 256, h: 256 };
  }
}

/** Composite a raw RGBA logo onto the SVG (as an embedded PNG data URI). */
async function embedLogo(pngBuffer, size, circular, x, y) {
  const rgba = await decodeImage(pngBuffer);
  const mask = await sharp(rgba.data, { raw: { width: rgba.w, height: rgba.h, channels: 3 } })
    .png()
    .toBuffer();
  const sized = await sharp(mask)
    .resize(size, size, { fit: 'cover' })
    .composite([
      {
        input: Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          ${circular
            ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#000"/>`
            : `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.28)}" fill="#000"/>`}
        </svg>`),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  const b64 = sized.toString('base64');
  return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${b64}" />`;
}

/**
 * Base brand card as SVG. `center` is extra SVG markup placed above the
 * wordmark block (token spotlight) or omitted for the default card.
 */
function baseSvg(center = '') {
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="52%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="42%" stop-color="${ACCENT}" stop-opacity="0.05"/>
      <stop offset="72%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.07"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <rect y="${HEIGHT - 190}" width="${WIDTH}" height="190" fill="url(#floor)"/>

  ${center}

  <g text-anchor="middle">
    <text x="${WIDTH / 2}" y="${HEIGHT - 118}" font-family="'Space Grotesk', sans-serif" font-weight="700" font-size="72" letter-spacing="6" fill="${ON_DARK}">CRYINDER</text>
    <text x="${WIDTH / 2}" y="${HEIGHT - 62}" font-family="'Space Grotesk', sans-serif" font-weight="500" font-size="28" letter-spacing="12" text-transform="uppercase" fill="${ACCENT}">Swipe. Buy. Earn.</text>
  </g>
</svg>`;
}

/** Render the SVG to a PNG with the bundled brand fonts. */
async function renderPng(svg) {
  return sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT)
    .png()
    .toBuffer();
}

function cacheHeaders(maxAge = 300) {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * GET /api/og
 *   default        -> brand card
 *   ?t=<token>     -> token spotlight card
 *   ?sparkline=<j> -> sparkline SVG helper
 */
export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get('t');
    const sparkParam = url.searchParams.get('sparkline');

    // Sparkline helper (SVG, used by the token card as an embedded image).
    if (sparkParam) {
      let points = [];
      try {
        points = JSON.parse(sparkParam);
      } catch {
        /* ignore */
      }
      if (!Array.isArray(points) || points.length < 2) points = [0, 0.3, 0.2, 0.6, 0.4, 0.9, 0.7];
      const step = 360 / (points.length - 1);
      const coords = points
        .map((p, i) => `${(i * step).toFixed(1)},${(54 - Math.max(0, Math.min(1, p)) * 44).toFixed(1)}`)
        .join(' ');
      const svg = `<svg width="360" height="64" viewBox="0 0 360 64" xmlns="http://www.w3.org/2000/svg">
  <polyline points="${coords}" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;
      return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' },
      });
    }

    // Token spotlight card.
    if (tokenParam) {
      let tok = {};
      try {
        tok = JSON.parse(tokenParam);
      } catch {
        /* ignore */
      }
      const symbol = esc(tok.symbol || tok.name || 'Token').toUpperCase();
      const name = esc(tok.name || symbol);
      const spark = Array.isArray(tok.sparkline) && tok.sparkline.length > 1
        ? tok.sparkline
        : [0, 0.3, 0.2, 0.6, 0.4, 0.9, 0.7];

      let logoImg = '';
      try {
        const logoBuf = tok.logo
          ? await loadImage(tok.logo)
          : await loadImage(LOGO_URL);
        logoImg = await embedLogo(logoBuf, 150, false, (WIDTH - 150) / 2, 92);
      } catch {
        logoImg = `<rect x="${(WIDTH - 150) / 2}" y="92" width="150" height="150" rx="40" fill="#111"/>`;
      }

      const step = 360 / (spark.length - 1);
      const coords = spark
        .map((p, i) => `${(i * step).toFixed(1)},${(54 - Math.max(0, Math.min(1, p)) * 44).toFixed(1)}`)
        .join(' ');
      const sparkSvg = `<svg width="360" height="64" viewBox="0 0 360 64" xmlns="http://www.w3.org/2000/svg">
  <polyline points="${coords}" fill="none" stroke="${ACCENT}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

      const center = `
  ${logoImg}
  <text x="${WIDTH / 2}" y="${320}" font-family="'Space Grotesk', sans-serif" font-weight="700" font-size="56" letter-spacing="2" fill="${ON_DARK}" text-anchor="middle">${symbol}</text>
  <text x="${WIDTH / 2}" y="${360}" font-family="'Space Grotesk', sans-serif" font-weight="500" font-size="24" fill="${MUTED}" text-anchor="middle">${name}</text>
  <image x="${(WIDTH - 360) / 2}" y="380" width="360" height="64" href="data:image/svg+xml;base64,${Buffer.from(sparkSvg).toString('base64')}" />`;

      const png = await renderPng(baseSvg(center));
      return new Response(png, { headers: cacheHeaders(60) });
    }

    // Default brand card.
    let logoImg = '';
    try {
      const logoBuf = await loadImage(LOGO_URL);
      logoImg = await embedLogo(logoBuf, 250, true, (WIDTH - 250) / 2, 100);
    } catch {
      logoImg = `<rect x="${(WIDTH - 250) / 2}" y="100" width="250" height="250" rx="72" fill="#111"/>`;
    }

    const png = await renderPng(baseSvg(logoImg));
    return new Response(png, { headers: cacheHeaders(300) });
  } catch (err) {
    return new Response(`OG render error: ${err.message}`, { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
