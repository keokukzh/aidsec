import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { stories } from '../remotion/data/videoData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const entry = path.join(root, 'remotion', 'Root.jsx');
const remotionBin = process.platform === 'win32'
  ? path.join(root, 'node_modules', '.bin', 'remotion.cmd')
  : path.join(root, 'node_modules', '.bin', 'remotion');

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'cmd.exe' : command,
      process.platform === 'win32' ? ['/d', '/s', '/c', command, ...args] : args,
      {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        REMOTION_DISABLE_UPDATE_CHECK: '1',
      },
      },
    );

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} exited with ${code}`));
    });
  });

await import('./prepare-remotion-assets.mjs');

await mkdir(path.join(root, 'assets', 'videos', 'posters'), { recursive: true });
await mkdir(path.join(root, 'assets', 'videos', 'social'), { recursive: true });
await mkdir(path.join(root, 'remotion', 'renders'), { recursive: true });

for (const [storyKey, story] of Object.entries(stories)) {
  const wideId = `${storyKey}Wide`;
  const wideOutput = path.join(root, 'assets', 'videos', `${story.slug}.mp4`);
  const posterOutput = path.join(root, 'assets', 'videos', 'posters', `${story.slug}.webp`);
  const posterPng = path.join(root, 'remotion', 'renders', `${story.slug}-poster.png`);

  await run(remotionBin, [
    'still',
    entry,
    wideId,
    posterPng,
    '--frame=60',
    '--image-format=png',
    '--public-dir=remotion/public',
  ]);
  await sharp(posterPng).webp({ quality: 82 }).toFile(posterOutput);

  await run(remotionBin, [
    'render',
    entry,
    wideId,
    wideOutput,
    '--codec=h264',
    '--pixel-format=yuv420p',
    '--crf=32',
    '--audio-codec=aac',
    '--log=warn',
    '--public-dir=remotion/public',
  ]);

  for (const variant of ['Square', 'Story']) {
    await run(remotionBin, [
      'render',
      entry,
      `${storyKey}${variant}`,
      path.join(root, 'assets', 'videos', 'social', `${story.slug}-${variant.toLowerCase()}.mp4`),
      '--codec=h264',
      '--pixel-format=yuv420p',
      '--crf=33',
      '--audio-codec=aac',
      '--log=warn',
      '--public-dir=remotion/public',
    ]);
  }
}

console.log('AidSec video renders complete.');
