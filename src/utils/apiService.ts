/**
 * ================================================================================
 * FILE: apiService.ts - API UTILITIES FOR UPLOAD & QR CODE
 * ================================================================================
 * 
 * Centralized API communication for image upload with robust response parsing
 * Handles multiple API response formats and generates QR codes from image URLs
 * 
 * ================================================================================
 */

import { API_CONFIG } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import imageCompression from 'browser-image-compression';

export interface UploadResponse {
  success?: boolean;
  message?: string;
  filename?: string;
  url?: string;
  path?: string;
  image_name?: string;
  image_path?: string;
  error?: string;
  details?: unknown;
}

// ========== HELPER FUNCTIONS FOR RESPONSE PARSING ==========

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getStringField = (payload: Record<string, unknown>, key: string): string => {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
};

const getOriginalExt = (fileName: string): string => 
  fileName?.match(/(\.[^./\\]+)$/)?.[1] || '';

/**
 * Extract download URL from various API response formats
 */
export const getResponseUrl = (payload: UploadResponse | null, uploadName: string): string => {
  if (!payload) return '';

  const UPLOADS_BASE_URL = API_CONFIG.UPLOADS_BASE_URL || 'https://svsinfotech.in/zooimage/uploads/';

  // Try status field — if status is error/failed, short-circuit
  const statusField = (payload as Record<string, unknown>)['status'];
  if (typeof statusField === 'string' && (statusField === 'error' || statusField === 'failed')) {
    return '';
  }

  if (typeof payload === 'string') {
    return '';
  }

  if (!isRecord(payload)) return '';

  // Try direct URL fields first
  const url = getStringField(payload, 'url') || getStringField(payload, 'path');
  if (url && url.trim()) {
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const fileName = trimmed.split('/').filter(Boolean).pop();
    return `${UPLOADS_BASE_URL}${fileName || trimmed.replace(/^\/+/, '')}`;
  }

  // Try filename fields (PHP often responds with these)
  const name =
    getStringField(payload, 'filename') ||
    getStringField(payload, 'file_name') ||
    getStringField(payload, 'image_name') ||
    getStringField(payload, 'file') ||
    getStringField(payload, 'name');
  if (name && name.trim()) {
    const trimmed = name.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const fileNameOnly = trimmed.split('/').filter(Boolean).pop() || trimmed;
    return `${UPLOADS_BASE_URL}${fileNameOnly}`;
  }

  // Try image_path
  const imagePath = getStringField(payload, 'image_path');
  if (imagePath && imagePath.trim()) {
    const fileName = imagePath.split('/').filter(Boolean).pop();
    if (fileName) {
      return `${UPLOADS_BASE_URL}${fileName}`;
    }
  }

  // Fallback to uploadName
  if (uploadName) {
    return `${UPLOADS_BASE_URL}${uploadName}`;
  }

  return '';
};

// ========== UPLOAD FUNCTION ==========

/**
 * Upload image blob to server with compression and UUID naming
 * @param blob - Image blob to upload
 * @param fileName - Original file name
 * @returns Upload response with image URL for QR code generation
 */
export const uploadImageAndGenerateQR = async (
  blob: Blob,
  fileName: string
): Promise<{ success: boolean; imageUrl?: string; error?: string }> => {
  try {
    // Validate file type
    if (!API_CONFIG.ALLOWED_FORMATS.includes(blob.type as typeof API_CONFIG.ALLOWED_FORMATS[number])) {
      return {
        success: false,
        error: 'Invalid file format. Allowed: JPEG, PNG, WebP',
      };
    }

    console.log('📦 Starting upload process...', { fileName, originalSize: `${(blob.size / 1024 / 1024).toFixed(2)}MB` });

    // Generate UUID v4 and create upload name
    const uid = uuidv4();
    const originalExt = getOriginalExt(fileName);
    const uploadName = `img_${uid}${originalExt}`;

    // Compress image to stay within PHP server's upload limits (optimized for speed)
    const compressionOptions = {
      maxSizeMB: 1.8,
      maxWidthOrHeight: 2400,
      initialQuality: 0.88,
      useWebWorker: true,
      fileType: "image/jpeg",
    };

    console.log('🗜️  Compressing image for upload...');
    const compressedBlob = await imageCompression(blob as unknown as File, compressionOptions);
    console.log('✅ Compression complete:', `${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`);

    // Create FormData
    const formData = new FormData();
    const compressedFile = new File([compressedBlob], uploadName.replace(/\.[^/.]+$/, ".jpg"), {
      type: "image/jpeg",
    });
    formData.append('image', compressedFile);
    formData.append('uid', uid);

    console.log('📤 Uploading to:', API_CONFIG.UPLOAD_URL);

    // Upload with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      API_CONFIG.UPLOAD_TIMEOUT_MS
    );

    const response = await fetch(API_CONFIG.UPLOAD_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
    });

    clearTimeout(timeoutId);

    console.log('📊 API Response:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Response not OK:', { status: response.status, body: errorText });
      return {
        success: false,
        error: `Server error: ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let responseData: UploadResponse | null = null;

    if (isJson) {
      responseData = await response.json();
      console.log('✅ JSON response received:', responseData);

      // Handle PHP-style status field { status: "error", message: "..." }
      const phpStatus = (responseData as any)?.status;
      if (phpStatus === 'error' || phpStatus === 'failed') {
        const phpMsg = (responseData as any)?.message || 'Upload rejected by server';
        console.error('❌ PHP error response:', phpMsg);
        return { success: false, error: phpMsg };
      }
    } else {
      // Non-JSON response - treat as success
      const textResponse = await response.text();
      responseData = {
        success: true,
        message: `Upload successful: ${uploadName}`,
        filename: uploadName,
        url: `${API_CONFIG.UPLOADS_BASE_URL}${uploadName}`,
      };
      console.log('✅ Non-JSON response:', textResponse, '| Constructed response:', responseData);
    }

    // Parse response and extract URL
    const imageUrl = getResponseUrl(responseData, uploadName);

    if (!imageUrl) {
      console.warn('⚠️ Upload successful but no image URL found in response');
      return {
        success: true,
        imageUrl: `${API_CONFIG.UPLOADS_BASE_URL}${uploadName}`, // Fallback to expected URL
      };
    }

    console.log('✅ Upload successful! Image URL:', imageUrl);

    return {
      success: true,
      imageUrl,
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Upload error:', {
        name: error.name,
        message: error.message,
      });
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Upload timeout. Please try again.',
        };
      }
      return {
        success: false,
        error: `Upload failed: ${error.message}`,
      };
    }
    console.error('❌ Unknown upload error:', error);
    return {
      success: false,
      error: 'Unknown error during upload',
    };
  }
};

/**
 * Download image from URL (utility function)
 */
export const downloadImageFromUrl = (url: string, fileName: string): void => {
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to download image:', error);
    throw error;
  }
};
