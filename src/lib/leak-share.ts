import { BAND_COPY, Band } from './leak-test';

/**
 * The shareable result card: a 1080 x 1350 image drawn in the browser, so it
 * needs no server and works offline. It carries only the headline result (score,
 * band, archetype and biggest leak), never the owner's name or any answers.
 */

export interface ShareCardInput {
  total: number;
  band: Band;
  archetype: string;
  leakiest: string;
}

const W = 1080;
const H = 1350;
const FONT = 'system-ui, -apple-system, "Segoe UI Variable Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = FONT;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#1E1B16';
  ctx.fillRect(0, 0, W, H);

  // Brand mark and name.
  ctx.fillStyle = '#A24712';
  ctx.beginPath();
  ctx.roundRect(80, 80, 56, 56, 14);
  ctx.fill();
  ctx.fillStyle = '#F5F1E6';
  ctx.font = `600 34px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Breadmaker Systems', 158, 110);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#DFB392';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText('BUSINESS LEAK TEST', 80, 300);

  // Score.
  ctx.fillStyle = '#F5F1E6';
  ctx.font = `600 300px ${SERIF}`;
  ctx.fillText(String(input.total), 70, 580);
  const scoreWidth = ctx.measureText(String(input.total)).width;
  ctx.fillStyle = '#B9B4A8';
  ctx.font = `700 90px ${FONT}`;
  ctx.fillText('/100', 80 + scoreWidth, 580);

  // Band.
  ctx.fillStyle = '#F5F1E6';
  ctx.font = `600 84px ${SERIF}`;
  ctx.fillText(BAND_COPY[input.band].title, 80, 720);

  // Divider.
  ctx.fillStyle = '#3A352C';
  ctx.fillRect(80, 790, W - 160, 3);

  ctx.fillStyle = '#B9B4A8';
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText('MY ARCHETYPE', 80, 870);
  ctx.fillStyle = '#F5F1E6';
  ctx.font = `600 64px ${SERIF}`;
  ctx.fillText(input.archetype, 80, 945);

  ctx.fillStyle = '#B9B4A8';
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText('MY BIGGEST LEAK', 80, 1040);
  ctx.fillStyle = '#DFB392';
  ctx.font = `600 64px ${SERIF}`;
  wrap(ctx, input.leakiest, W - 160)
    .slice(0, 2)
    .forEach((line, i) => ctx.fillText(line, 80, 1115 + i * 74));

  // Footer.
  ctx.fillStyle = '#B9B4A8';
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText('Find where your business is leaking in 4 minutes', 80, 1270);
  ctx.fillStyle = '#F5F1E6';
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('breadmakersystems.com/leak-test', 80, 1314);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image.'))), 'image/png');
  });
}

export const SHARE_URL = 'https://breadmakersystems.com/leak-test';
export const shareText = (input: ShareCardInput) =>
  `I scored ${input.total}/100 on the Business Leak Test. I'm ${input.archetype}, and my biggest leak is ${input.leakiest}. Find yours in 4 minutes:`;
