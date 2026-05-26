import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stories } from '../remotion/data/videoData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const expectedWide = Object.values(stories).map((story) => ({
  slug: story.slug,
  duration: story.duration,
  file: path.join(root, 'assets', 'videos', `${story.slug}.mp4`),
  poster: path.join(root, 'assets', 'videos', 'posters', `${story.slug}.webp`),
}));

const readBoxDuration = (buffer) => {
  const marker = Buffer.from('mvhd');
  const index = buffer.indexOf(marker);
  if (index < 4) {
    return null;
  }

  const body = index + 4;
  const version = buffer.readUInt8(body);

  if (version === 1) {
    const timescale = buffer.readUInt32BE(body + 20);
    const duration = Number(buffer.readBigUInt64BE(body + 24));
    return duration / timescale;
  }

  const timescale = buffer.readUInt32BE(body + 12);
  const duration = buffer.readUInt32BE(body + 16);
  return duration / timescale;
};

const assertFile = async (file, minSize = 20000) => {
  const fileStat = await stat(file);
  if (fileStat.size < minSize) {
    throw new Error(`File too small: ${path.relative(root, file)} (${fileStat.size} bytes)`);
  }
  return fileStat;
};

for (const video of expectedWide) {
  await assertFile(video.file, 50000);
  await assertFile(video.poster, 8000);

  const duration = readBoxDuration(await readFile(video.file));
  if (!duration || Math.abs(duration - video.duration) > 1) {
    throw new Error(
      `Unexpected duration for ${video.slug}: expected ${video.duration}s, got ${duration ?? 'unknown'}s`,
    );
  }

  for (const variant of ['square', 'story']) {
    await assertFile(path.join(root, 'assets', 'videos', 'social', `${video.slug}-${variant}.mp4`), 50000);
  }
}

const rootSource = await readFile(path.join(root, 'remotion', 'Root.jsx'), 'utf8');
const brandSource = await readFile(path.join(root, 'remotion', 'components', 'BrandFrame.jsx'), 'utf8');
const home = await readFile(path.join(root, 'index.html'), 'utf8');
const proof = await readFile(path.join(root, 'proof-center.html'), 'utf8');
const treuhand = await readFile(path.join(root, 'branchen', 'treuhand.html'), 'utf8');

for (const marker of ['Object.entries(stories)', 'Object.entries(variants)', 'durationInFrames']) {
  if (!rootSource.includes(marker)) {
    throw new Error(`Missing Remotion root marker: ${marker}`);
  }
}

if (!brandSource.includes('data-brand-logo')) {
  throw new Error('Brand logo smoke marker missing from BrandFrame.');
}

const embedChecks = [
  [home, 'assets/videos/aidsec-hardening-flow.mp4'],
  [proof, 'assets/videos/aidsec-proof-center.mp4'],
  [treuhand, 'assets/videos/aidsec-treuhand-security.mp4'],
];

for (const [html, needle] of embedChecks) {
  if (!html.includes(needle)) {
    throw new Error(`Missing website video embed: ${needle}`);
  }
}

console.log('Video checks passed.');
