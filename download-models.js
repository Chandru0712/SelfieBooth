#!/usr/bin/env node

/**
 * Download MediaPipe Selfie Segmentation models
 * Required for AIImageScreen component
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, 'public', 'models');

// Ensure models directory exists
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

// MediaPipe model URLs
const models = [
  {
    name: 'selfie_segmentation.tflite',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.tflite'
  },
  {
    name: 'selfie_segmentation_landscape.tflite',
    url: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation_landscape.tflite'
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
        console.log(`✓ Downloaded: ${path.basename(filePath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete incomplete file
      reject(err);
    });
  });
}

async function downloadAllModels() {
  console.log('Downloading MediaPipe models...\n');
  
  try {
    for (const model of models) {
      const filePath = path.join(MODELS_DIR, model.name);
      
      if (fs.existsSync(filePath)) {
        console.log(`✓ Already exists: ${model.name}`);
        continue;
      }
      
      await downloadFile(model.url, filePath);
    }
    
    console.log('\n✓ All models downloaded successfully!');
    console.log(`Models location: ${MODELS_DIR}`);
  } catch (error) {
    console.error('✗ Error downloading models:', error.message);
    process.exit(1);
  }
}

downloadAllModels();
