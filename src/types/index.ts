/**
 * Shared type definitions for the SelfieBooth application
 */

/**
 * Image data captured during the photo taking process
 */
export interface ImageData {
  url: string;
  blob: Blob;
  metadata: {
    id: string;
    frameId: string;
    capturedAt: string;
    width: number;
    height: number;
    size: number;
    fileName: string;
  };
}

/**
 * Frame data for photo frames that can be applied to images
 */
export interface Frame {
  id: string;
  name: string;
  image: string;
  path: string;
  category: string;
}

/**
 * Category for selecting frames
 */
export interface Category {
  id: string;
  name: string;
  label?: string;
  icon?: string;
  description?: string;
  emoji?: string;
}
