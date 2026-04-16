import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    host: true,
    https: true,
     // Allows access from network devices
    // WASM files are automatically served with correct MIME type
    proxy: {
      '/api': {
        target: 'https://selfiebooth.aazp.in/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true,
      },
    },
  },
  build: {
    // Target modern browsers so esbuild/Rollup can emit smaller, faster
    // output (native async/await, top-level await, optional chaining, etc.)
    // without expensive ES5/ES2015 down-level transpilation helpers.
    target: 'esnext',
    // Keep CSS split per async chunk so lazy routes only load their own styles.
    cssCodeSplit: true,
    // Bump the warning threshold — the AI/ML vendors (onnxruntime-web,
    // @imgly/background-removal, MediaPipe) are legitimately large and are
    // already isolated into their own cacheable chunks below.
    chunkSizeWarningLimit: 1000,
    // Preload only what the entry actually needs; avoid polyfilling
    // modulepreload for modern (esnext) targets.
    modulePreload: {
      polyfill: false,
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Hashed, predictable file names for long-term caching behind a CDN.
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        // Split vendor bundles so stable dependencies stay cached across
        // deploys and heavy ML libraries don't block the initial paint.
        // Grouping rationale:
        //  - react: framework code, updates infrequently, needed on every screen.
        //  - mediapipe: segmentation + camera utils used only on the AI screen.
        //  - bg-removal: onnxruntime-web + @imgly/background-removal; very large
        //    and loaded via dynamic import() on demand — keep isolated so it
        //    never bloats the main entry.
        //  - webcam: react-webcam used by capture/AI screens.
        //  - qr: qrcode.react used only on the preview screen.
        //  - image-utils: image compression + uuid used by capture/upload flows.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-dom/client'],
          'vendor-mediapipe': [
            '@mediapipe/selfie_segmentation',
            '@mediapipe/camera_utils',
          ],
          'vendor-bg-removal': [
            '@imgly/background-removal',
            'onnxruntime-web',
          ],
          'vendor-webcam': ['react-webcam'],
          'vendor-qr': ['qrcode.react'],
          'vendor-image-utils': ['browser-image-compression', 'uuid'],
        },
      },
    },
  },
  // Pre-bundle hot deps during dev for faster cold starts; exclude the
  // heavy on-demand modules so Vite doesn't eagerly optimize them.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-webcam',
      'qrcode.react',
      'browser-image-compression',
      'uuid',
    ],
    exclude: [
      '@imgly/background-removal',
      'onnxruntime-web',
      '@mediapipe/selfie_segmentation',
      '@mediapipe/camera_utils',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
})
