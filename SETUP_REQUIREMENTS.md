# Selfie Booth - Setup Requirements

## MediaPipe Models & WASM Files

The application requires MediaPipe Selfie Segmentation models and WASM files to function properly.

### Automatic Setup (Recommended)

The models are automatically downloaded when you run:
```bash
npm install
```

This triggers the `postinstall` script which runs `download-models.mjs`.

### Manual Download

If you need to re-download the models:
```bash
node download-models.mjs
```

### Files Downloaded

The following files will be downloaded to `public/models/`:

**TFLite Models:**
- `selfie_segmentation.tflite` (~400 KB)
- `selfie_segmentation_landscape.tflite` (~400 KB)

**Graph/Asset Files:**
- `selfie_segmentation.binarypb` (~120 KB)
- `selfie_segmentation_solution_simd_wasm_bin.data` (~2 MB)

**WASM Files:**
- `selfie_segmentation_solution_simd_wasm_bin.js` (~1 MB)
- `selfie_segmentation_solution_simd_wasm_bin.wasm` (~3 MB)
- `selfie_segmentation_solution_wasm_bin.js` (~1 MB)
- `selfie_segmentation_solution_wasm_bin.wasm` (~3 MB)

Total: ~4-5 MB

### Troubleshooting

If you see errors like:
```
Failed to load resource: the server responded with a status of 404
(Not Found) selfie_segmentation_solution_simd_wasm_bin.js
```

**Solution:**
1. Run `node download-models.mjs` to download missing files
2. Verify files exist in `public/models/`
3. Restart the dev server with `npm run dev`

### Directory Structure

After setup, your `public/models/` should look like:
```
public/
  └── models/
      ├── selfie_segmentation.tflite
      ├── selfie_segmentation_landscape.tflite
      ├── selfie_segmentation.binarypb
      ├── selfie_segmentation_solution_simd_wasm_bin.data
      ├── selfie_segmentation_solution_simd_wasm_bin.js
      ├── selfie_segmentation_solution_simd_wasm_bin.wasm
      ├── selfie_segmentation_solution_wasm_bin.js
      └── selfie_segmentation_solution_wasm_bin.wasm
```

### Network Requirements

- Models are downloaded from CDN (jsDelivr): https://cdn.jsdelivr.net
- Make sure you have internet access for the first `npm install`
- Files are cached after download (not re-downloaded on subsequent installs)

---

**Updated:** Feb 16, 2026
