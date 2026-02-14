import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allows access from network devices
    proxy: {
      // This creates a virtual path /cam-proxy that points to your phone
      '/cam-proxy': {
        target: 'http://192.168.1.22:8080', // Replace with your camera's IP
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cam-proxy/, ''),
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      },
    },
  },
})
