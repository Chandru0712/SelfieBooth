/**
 * ================================================================================
 * FILE: constants.ts - APPLICATION CONFIGURATION CONSTANTS
 * ================================================================================
 * 
 * Centralized configuration for UI/UX, camera settings, and magic numbers
 * Single source of truth for application-wide settings
 * 
 * SECTIONS:
 * 1.0 APP_CONFIG - UI/UX, animations, colors, timers
 * 2.0 CAMERA_CONFIG - Camera constraints, optimization settings
 * 
 * ================================================================================
 */

// ========== 1.0 APP_CONFIG - UI/UX & APPLICATION SETTINGS ==========
export const APP_CONFIG = {
  // UI/UX Configuration
  ZOOM_LEVELS: [0.5, 1, 1.5, 2, 2.5, 3],
  TIMER_OPTIONS: [1, 3, 5, 10],

  // Frame Configuration
  FRAME_CATEGORIES: ['children', 'adult', 'proverb', 'personalized', 'collage'],
  DEFAULT_CATEGORY: null,
  DEFAULT_FRAME: 'none',

  // Scroll/Selection
  SCROLL_THRESHOLD: 5, // pixels before triggering frame selection
  SCROLL_TIMEOUT_MS: 300, // time to reset programmatic scroll flag

  // Animations
  FLASH_DURATION_MS: 200, // camera flash overlay duration
  SMOOTH_SCROLL_BEHAVIOR: 'smooth',

  // Colors (from CSS variables)
  PRIMARY_COLOR: '#6366f1',
  ACCENT_COLOR: '#f43f5e',
  BACKGROUND_COLOR: '#000',
} as const;

// ========== 2.0 CAMERA_CONFIG - CAMERA CONSTRAINTS & OPTIMIZATION ==========
export const CAMERA_CONFIG = {
  // WebRTC constraints for optimal speed and quality
  VIDEO_CONSTRAINTS: {
    facingMode: 'user',
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 120, min: 60 },
  },

  // Scroll interaction
  SCROLL_SPEED_MULTIPLIER: 2, // Right-click drag speed multiplier
} as const;

// ========== 3.0 API_CONFIG - IMAGE UPLOAD & QR CODE GENERATION ==========
export const API_CONFIG = {
  // Use proxy in development, direct URL in production
  UPLOAD_URL: import.meta.env.DEV 
    ? "/api/zooimage/upload.php" 
    : "https://svsinfotech.in/zooimage/upload.php",
  
  // Base URL for accessing uploaded images
  UPLOADS_BASE_URL: "https://svsinfotech.in/zooimage/uploads/",
  
  // Upload constraints
  MAX_FILE_SIZE_MB: 10,
  ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  
  // Timeout for upload request (ms)
  UPLOAD_TIMEOUT_MS: 30000,
} as const;

export const ERROR_MESSAGES = {
  CAMERA_PERMISSION_DENIED: 'Camera permission was denied. Please enable camera access in your browser settings.',
  CAMERA_NOT_FOUND: 'No camera device found. Please connect a camera and try again.',
  CAMERA_NO_STREAM: 'Could not access camera stream. Try reloading the page.',
  CANVAS_ERROR: 'Failed to process image. Please try again.',
  FRAME_LOAD_ERROR: 'Failed to load frame image.',
} as const;

export const SUCCESS_MESSAGES = {
  PHOTO_CAPTURED: 'Photo captured successfully!',
  PHOTO_SAVED: 'Photo saved to your gallery.',
} as const;

/**
 * Canvas/Image Processing Constants
 */
export const IMAGE_CONFIG = {
  // Export settings
  EXPORT_FORMAT: 'image/png',
  EXPORT_QUALITY: 1.0, // 0-1 for lossy formats

  // File naming
  FILE_PREFIX: 'selfie',
  FILE_EXTENSION: 'png',

  // Memory optimization
  BLOB_URL_CLEANUP_DELAY_MS: 100, // Wait before revoking blob URLs
} as const;

/**
 * Responsive Design Breakpoints
 */
export const BREAKPOINTS = {
  MOBILE: 600,
  TABLET: 1024,
  DESKTOP: 1440,
} as const;

/**
 * Z-index Stack (maintainable layering)
 */
export const Z_INDEX = {
  BASE: 0,
  CONTENT: 10,
  OVERLAY: 50,
  MODAL: 100,
  DROPDOWN: 1000,
  TOOLTIP: 2000,
  ERROR_BOUNDARY: 9999,
} as const;
