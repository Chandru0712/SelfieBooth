/**
 * Application Configuration Constants
 * Centralized place for magic numbers and configuration values
 */

export const APP_CONFIG = {
  // UI/UX Configuration
  ZOOM_LEVELS: [1, 1.5, 2, 2.5, 3],
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
};

export const CAMERA_CONFIG = {
  // WebRTC constraints for optimal quality
  VIDEO_CONSTRAINTS: {
    facingMode: 'user',
    width: { ideal: 1920, max: 2560 },
    height: { ideal: 1080, max: 1440 },
    frameRate: { ideal: 60, min: 30 },
  },

  // Scroll interaction
  SCROLL_SPEED_MULTIPLIER: 2, // Right-click drag speed multiplier

  // IP Camera proxy (update with your IP)
  USE_IP_CAMERA: true, // Set to true to use IP camera
  IP_CAMERA_URL: '/cam-proxy/video', // Proxy endpoint for IP Webcam
  IP_CAMERA_SNAPSHOT: '/cam-proxy/shot.jpg', // Snapshot endpoint for capturing frames
};

export const FILTER_PRESETS = [
  { id: 'none', name: 'Original', class: '' },
  { id: 'sepia', name: 'Vintage', class: 'sepia(1)' },
  { id: 'grayscale', name: 'B&W', class: 'grayscale(1)' },
  { id: 'vivid', name: 'Vivid', class: 'saturate(2) contrast(1.1)' },
  { id: 'cool', name: 'Ice', class: 'hue-rotate(180deg) saturate(1.5)' },
];

export const ERROR_MESSAGES = {
  CAMERA_PERMISSION_DENIED: 'Camera permission was denied. Please enable camera access in your browser settings.',
  CAMERA_NOT_FOUND: 'No camera device found. Please connect a camera and try again.',
  CAMERA_NO_STREAM: 'Could not access camera stream. Try reloading the page.',
  CANVAS_ERROR: 'Failed to process image. Please try again.',
  FRAME_LOAD_ERROR: 'Failed to load frame image.',
};

export const SUCCESS_MESSAGES = {
  PHOTO_CAPTURED: 'Photo captured successfully!',
  PHOTO_SAVED: 'Photo saved to your gallery.',
};

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
};

/**
 * Responsive Design Breakpoints
 */
export const BREAKPOINTS = {
  MOBILE: 600,
  TABLET: 1024,
  DESKTOP: 1440,
};

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
};
