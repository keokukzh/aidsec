#!/usr/bin/env node
/**
 * AidSec Image Optimizer
 * Converts large images to optimized WebP format
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'images');
const ROOT_DIR = path.join(__dirname, '..');

const optimizations = [
  {
    input: path.join(ROOT_DIR, 'logonoback.PNG'),
    output: path.join(ASSETS_DIR, 'logonoback.webp'),
    options: {
      width: 800,
      quality: 80,
      effort: 4
    },
    description: 'Logo (1.2MB → ~50KB WebP)'
  },
  {
    input: path.join(ROOT_DIR, 'logowhite.png'),
    output: path.join(ASSETS_DIR, 'logowhite.webp'),
    options: {
      width: 200,
      quality: 85,
      effort: 4
    },
    description: 'Nav Logo (371KB → ~15KB WebP)'
  },
  {
    input: path.join(ASSETS_DIR, 'VeniceAI_poster.jpg'),
    output: path.join(ASSETS_DIR, 'VeniceAI_poster-optimized.webp'),
    options: {
      width: 1200,
      quality: 80,
      effort: 4
    },
    description: 'Hero Image (197KB → ~80KB WebP)'
  }
];

async function optimizeImage(config) {
  const { input, output, options, description } = config;
  
  if (!fs.existsSync(input)) {
    console.log(`⚠️  Skipping: ${description}`);
    console.log(`    File not found: ${input}`);
    return;
  }

  const inputStats = fs.statSync(input);
  const inputSize = (inputStats.size / 1024).toFixed(1);

  console.log(`\n📦 Optimizing: ${description}`);
  console.log(`   Input: ${inputSize} KB`);

  try {
    await sharp(input)
      .resize(options.width, null, {
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ quality: options.quality, effort: options.effort })
      .toFile(output);

    const outputStats = fs.statSync(output);
    const outputSize = (outputStats.size / 1024).toFixed(1);
    const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);

    console.log(`   ✅ Output: ${outputSize} KB (${savings}% smaller)`);
    console.log(`   Saved: ${(inputStats.size - outputStats.size).toFixed(0)} KB`);
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

async function main() {
  console.log('🖼️  AidSec Image Optimizer');
  console.log('='.repeat(50));

  // Ensure output directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  for (const config of optimizations) {
    await optimizeImage(config);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Optimization complete!');
  console.log('\nNext steps:');
  console.log('1. Review the optimized WebP files in assets/images/');
  console.log('2. Update HTML to use new WebP files');
  console.log('3. Keep original PNG/JPG as fallback');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { optimizeImage };
