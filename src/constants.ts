/**
 * ================================================================================
 * FILE: constants.ts - APPLICATION CONFIGURATION CONSTANTS
 * ================================================================================
 */

// ========== CAMERA CONFIG ==========
export const CAMERA_CONFIG = {
  VIDEO_CONSTRAINTS: {
    facingMode: 'user',
    width: { ideal: 3840, min: 1920 },
    height: { ideal: 2160, min: 1080 },
    frameRate: { ideal: 60, min: 30 },
  },
  SCROLL_SPEED_MULTIPLIER: 2,
} as const;

// ========== API CONFIG ==========
export const API_CONFIG = {
  UPLOAD_URL: import.meta.env.DEV
    ? '/api/zooimage/upload.php'
    : 'https://svsinfotech.in/zooimage/upload.php',
  UPLOADS_BASE_URL: 'https://svsinfotech.in/zooimage/uploads/',
  MAX_FILE_SIZE_MB: 10,
  ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  UPLOAD_TIMEOUT_MS: 30000,
} as const;
