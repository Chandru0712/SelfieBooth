#!/usr/bin/env node

/**
 * Download MediaPipe Selfie Segmentation models and WASM files
 * Required for AIImageScreen component and MediaPipe initialization
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, 'public', 'models');
const PACKAGE_DIR = path.join(__dirname, 'node_modules', '@mediapipe', 'selfie_segmentation');
const MIN_FILE_SIZE_BYTES = 1024;

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// MediaPipe files needed for Selfie Segmentation and WASM initialization
const models = [
  {
    name: 'selfie_segmentation.tflite',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.tflite'
  },
  {
    name: 'selfie_segmentation_landscape.tflite',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_landscape.tflite'
  },
  {
    name: 'selfie_segmentation.binarypb',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.binarypb'
  },
  // WASM files for MediaPipe
  {
    name: 'selfie_segmentation_solution_simd_wasm_bin.js',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.js'
  },
  {
    name: 'selfie_segmentation_solution_simd_wasm_bin.wasm',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.wasm'
  },
  {
    name: 'selfie_segmentation_solution_simd_wasm_bin.data',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_solution_simd_wasm_bin.data'
  },
  {
    name: 'selfie_segmentation_solution_wasm_bin.js',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_solution_wasm_bin.js'
  },
  {
    name: 'selfie_segmentation_solution_wasm_bin.wasm',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_solution_wasm_bin.wasm'
  }
];

async function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        const fileSize = fs.statSync(filePath).size;
        console.log(`✓ Downloaded: ${path.basename(filePath)} (${(fileSize / 1024).toFixed(2)} KB)`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete incomplete file
      reject(err);
    });
  });
}

function copyFromPackage(fileName, filePath) {
  const packagePath = path.join(PACKAGE_DIR, fileName);
  if (!fs.existsSync(packagePath)) return false;
  fs.copyFileSync(packagePath, filePath);
  const fileSize = fs.statSync(filePath).size;
  console.log(`✓ Copied: ${fileName} (${(fileSize / 1024).toFixed(2)} KB)`);
  return true;
}

async function downloadAllModels() {
  console.log('Downloading MediaPipe Selfie Segmentation files...\n');
  
  try {
    let skipped = 0;
    let downloaded = 0;
    
    for (const model of models) {
      const filePath = path.join(MODELS_DIR, model.name);
      
      if (fs.existsSync(filePath)) {
        const fileSize = fs.statSync(filePath).size;
        if (fileSize >= MIN_FILE_SIZE_BYTES) {
          console.log(`✓ Already exists: ${model.name} (${(fileSize / 1024).toFixed(2)} KB)`);
          skipped++;
          continue;
        }
      }

      if (copyFromPackage(model.name, filePath)) {
        downloaded++;
        continue;
      }

      await downloadFile(model.url, filePath);
      downloaded++;
    }
    
    console.log(`\n✓ All files processed!`);
    console.log(`  Downloaded: ${downloaded} files`);
    console.log(`  Skipped: ${skipped} files`);
    console.log(`  Models location: ${MODELS_DIR}`);
  } catch (error) {
    console.error('✗ Error downloading models:', error.message);
    process.exit(1);
  }
}

downloadAllModels();
