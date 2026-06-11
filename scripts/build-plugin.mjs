/**
 * Baut das auslieferbare WordPress-Plugin-ZIP aus wp-plugin/.
 *
 *   node scripts/build-plugin.mjs
 *   → assets/downloads/aidsec-security.zip
 *
 * Dependency-freier ZIP-Writer (Store-Methode, keine Kompression — die
 * Plugin-Dateien sind wenige KB gross). Layout im Archiv:
 *   aidsec-security/aidsec-security.php
 *   aidsec-security/readme.txt
 *   aidsec-security/includes/*.php
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginSource = path.join(projectRoot, 'wp-plugin');
const outputDir = path.join(projectRoot, 'assets', 'downloads');
const outputFile = path.join(outputDir, 'aidsec-security.zip');

// ── CRC32 ──
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

function buildZip(entries) {
  const { time, day } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

// ── Dateien einsammeln ──
const entries = [
  {
    name: 'aidsec-security/aidsec-security.php',
    data: readFileSync(path.join(pluginSource, 'aidsec-security.php')),
  },
  {
    name: 'aidsec-security/readme.txt',
    data: readFileSync(path.join(pluginSource, 'aidsec-security', 'readme.txt')),
  },
  ...readdirSync(path.join(pluginSource, 'aidsec-security', 'includes'))
    .filter((file) => file.endsWith('.php'))
    .sort()
    .map((file) => ({
      name: `aidsec-security/includes/${file}`,
      data: readFileSync(path.join(pluginSource, 'aidsec-security', 'includes', file)),
    })),
];

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputFile, buildZip(entries));

const versionMatch = entries[0].data.toString('utf8').match(/Version:\s*([\d.]+)/);
console.log(`✓ ${path.relative(projectRoot, outputFile)} (v${versionMatch?.[1] || '?'}, ${entries.length} Dateien)`);
