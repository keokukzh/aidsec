import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'remotion', 'public');

const assets = [
  ['assets/images/logowhite.webp', 'images/logowhite.webp'],
  ['assets/images/logo-dark.webp', 'images/logo-dark.webp'],
  ['assets/images/hero_security_check_swiss_office.webp', 'images/hero_security_check_swiss_office.webp'],
  ['assets/images/industry_kanzlei_security.webp', 'images/industry_kanzlei_security.webp'],
  ['assets/images/industry_praxis_security.webp', 'images/industry_praxis_security.webp'],
  ['assets/images/industry_treuhand_security.webp', 'images/industry_treuhand_security.webp'],
  ['assets/images/proof_center_dashboard_preview.webp', 'images/proof_center_dashboard_preview.webp'],
  ['assets/images/roi_risk_snapshot.webp', 'images/roi_risk_snapshot.webp'],
  ['assets/Scene_pingpong.mp4', 'media/Scene_pingpong.mp4'],
  ['css/fonts/instrument-serif-latin-400-normal.woff2', 'fonts/instrument-serif-latin-400-normal.woff2'],
  ['css/fonts/plus-jakarta-sans-latin-400-normal.woff2', 'fonts/plus-jakarta-sans-latin-400-normal.woff2'],
  ['css/fonts/plus-jakarta-sans-latin-700-normal.woff2', 'fonts/plus-jakarta-sans-latin-700-normal.woff2'],
];

const exists = async (file) => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

const copyAsset = async ([source, target]) => {
  const sourcePath = path.join(root, source);
  const targetPath = path.join(publicDir, target);

  if (!(await exists(sourcePath))) {
    throw new Error(`Remotion asset missing: ${source}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
};

const writeAmbientWav = async () => {
  const output = path.join(publicDir, 'audio', 'aidsec-ambient.wav');
  await mkdir(path.dirname(output), { recursive: true });

  const sampleRate = 44100;
  const seconds = 40;
  const samples = sampleRate * seconds;
  const channels = 1;
  const bytesPerSample = 2;
  const dataSize = samples * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const tones = [146.83, 196, 246.94, 293.66];
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const fadeIn = Math.min(1, t / 3);
    const fadeOut = Math.min(1, (seconds - t) / 4);
    const pulse = 0.72 + Math.sin(t * Math.PI * 0.25) * 0.18;
    const signal =
      tones.reduce((sum, freq, index) => {
        const partial = Math.sin(2 * Math.PI * freq * t + index * 0.7) * (0.2 / (index + 1));
        return sum + partial;
      }, 0) * fadeIn * fadeOut * pulse;
    const value = Math.max(-1, Math.min(1, signal)) * 0.18;
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }

  await writeFile(output, buffer);
};

await mkdir(publicDir, { recursive: true });
await Promise.all(assets.map(copyAsset));
await writeAmbientWav();

console.log(`Remotion assets prepared in ${path.relative(root, publicDir)}`);
