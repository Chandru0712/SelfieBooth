/**
 * ================================================================================
 * FILE: cameraService.ts - CAMERA OPERATIONS SERVICE
 * ================================================================================
 * 
 * Handles all camera stream management, device enumeration, and frame capture
 * Phase 1 MVP Implementation (US-001, US-002, US-003)
 * 
 * STRUCTURE:
 * 1.0 CLASS SETUP & INITIALIZATION
 * 2.0 DEVICE CAMERA INITIALIZATION
 * 3.0 STREAM MANAGEMENT (START, STOP, SWITCH)
 * 4.0 DEVICE ENUMERATION & DETECTION
 * 5.0 FRAME CAPTURE & CANVAS OPERATIONS
 * 6.0 ERROR HANDLING
 * 7.0 SERVICE EXPORT
 * 
 * ================================================================================
 */

import { CAMERA_CONFIG } from '../constants';

interface CameraResult {
  success: boolean;
  stream?: MediaStream;
  error?: string;
  errorType?: string;
}

interface CaptureFrameResult {
  blob: Blob;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

interface CameraStatus {
  isActive: boolean;
  isInitializing: boolean;
  hasStream: boolean;
}

// ========== 1.0 CLASS SETUP & INITIALIZATION ==========
class CameraService {
  private stream: MediaStream | null = null;
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isInitializing: boolean = false;

  // ========== 2.0 DEVICE CAMERA INITIALIZATION ==========
  /**
   * Initialize camera with webcam or IP camera
   * US-001: Camera Initialization
   */
  async initialize(constraints: Record<string, any> = {}, videoElement: HTMLVideoElement | null = null): Promise<CameraResult> {
    try {
      // Prevent concurrent initializations
      if (this.isInitializing) {
        console.warn('Camera initialization already in progress, waiting...');
        // Wait a bit and return current state
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.mediaStream) {
          return { success: true, stream: this.mediaStream };
        }
      }

      this.isInitializing = true;

      // Stop any existing stream first to prevent "camera in use" errors
      this.stop();

      this.videoElement = videoElement;

      // Use device camera
      const result = await this.initializeDeviceCamera(constraints, videoElement);

      // If overconstrained, retry with basic settings
      if (!result.success && result.errorType === 'OVERCONSTRAINED') {
        console.log('Retrying with basic camera settings...');
        return await this.initializeDeviceCamera({ video: true }, videoElement);
      }

      return result;
    } catch (error: any) {
      console.error('Camera initialization failed:', error);
      return {
        success: false,
        error: `Camera error: ${error.message}`,
        errorType: 'UNKNOWN',
      };
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Initialize device camera
   */
  private async initializeDeviceCamera(constraints: Record<string, any> = {}, videoElement: HTMLVideoElement | null = null): Promise<CameraResult> {
    try {
      // Merge with default constraints
      const mergedConstraints: MediaStreamConstraints = {
        video: {
          ...CAMERA_CONFIG.VIDEO_CONSTRAINTS,
          ...(constraints.video || {}),
        },
        audio: false,
      };

      console.log('Requesting device camera access with constraints:', mergedConstraints);

      // Request camera access
      this.mediaStream = await navigator.mediaDevices.getUserMedia(mergedConstraints);

      console.log('✓ Camera stream obtained');

      if (videoElement) {
        console.log('Setting up video element with mediaStream...');
        videoElement.srcObject = this.mediaStream;

        // Wait for video to be ready to play
        await new Promise<void>((resolve, reject) => {
          let timeout: NodeJS.Timeout | undefined;
          let metadataHandler: (() => void) | undefined;
          let errorHandler: (() => void) | undefined;

          const cleanup = () => {
            if (timeout) clearTimeout(timeout);
            if (metadataHandler) videoElement.removeEventListener('loadedmetadata', metadataHandler);
            if (errorHandler) videoElement.removeEventListener('error', errorHandler);
          };

          timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Video element failed to load stream (timeout after 8s)'));
          }, 8000);

          metadataHandler = () => {
            console.log('✓ Video metadata loaded, videoWidth:', videoElement.videoWidth, 'videoHeight:', videoElement.videoHeight);
            cleanup();
            resolve();
          };

          errorHandler = () => {
            console.error('Video element error');
            cleanup();
            reject(new Error('Could not start video source'));
          };

          // Use addEventListener for better reliability
          videoElement.addEventListener('loadedmetadata', metadataHandler, { once: true });
          videoElement.addEventListener('error', errorHandler, { once: true });

          // If loadedmetadata already fired before we attached listener, resolve
          if (videoElement.readyState >= 1) {
            console.log('✓ Video already has metadata (readyState: ' + videoElement.readyState + ')');
            cleanup();
            resolve();
          }
        });

        // Ensure video plays
        try {
          const playPromise = videoElement.play();
          if (playPromise) {
            await playPromise;
            console.log('✓ Video playing');
          }
        } catch (playError: any) {
          console.warn('Video play warning:', playError.message);
        }
      } else {
        console.warn('No video element provided, stream initialized without video element');
      }

      this.stream = this.mediaStream;
      return {
        success: true,
        stream: this.mediaStream,
      };
    } catch (error: any) {
      console.error('Device camera initialization failed:', error);

      if (error.name === 'NotAllowedError') {
        return {
          success: false,
          error: 'Camera permission denied. Please allow camera access and try again.',
          errorType: 'PERMISSION_DENIED',
        };
      } else if (error.name === 'NotFoundError') {
        return {
          success: false,
          error: 'No camera device found. Please connect a camera and try again.',
          errorType: 'NO_DEVICE',
        };
      } else if (error.name === 'NotReadableError') {
        return {
          success: false,
          error: 'Camera is already in use. Please close other browser tabs or apps using the camera, then click "Try Again".',
          errorType: 'CAMERA_IN_USE',
        };
      } else if (error.name === 'OverconstrainedError') {
        return {
          success: false,
          error: 'Camera does not support the requested settings. Trying with basic settings...',
          errorType: 'OVERCONSTRAINED',
        };
      } else {
        return {
          success: false,
          error: `Camera error: ${error.message}`,
          errorType: 'UNKNOWN',
        };
      }
    }
  }

  /**
   * Get list of available camera devices
   */
  async getDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  }

  /**
   * Switch to different camera device
   */
  async switchDevice(deviceId: string): Promise<CameraResult> {
    try {
      // Stop current stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }

      // Initialize with new device
      const constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      return await this.initialize(constraints, this.videoElement || undefined);
    } catch (error: any) {
      console.error('Failed to switch camera:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Capture frame from video stream as blob
   * US-013: Image Capture with Frame Compositing
   */
  async captureFrame(sourceElement: HTMLVideoElement | null = null, targetWidth: number, targetHeight: number): Promise<CaptureFrameResult> {
    try {
      if (!targetWidth || !targetHeight) {
        throw new Error('Capture size not provided');
      }

      const source = sourceElement;

      // Validate video element
      if (!source || source.tagName !== 'VIDEO') {
        throw new Error('Camera source element not provided or not a video element');
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Calculate proper crop to match preview display
      const srcWidth = source.videoWidth;
      const srcHeight = source.videoHeight;
      const dstWidth = canvas.width;
      const dstHeight = canvas.height;

      // Calculate crop rectangle for object-fit: cover behavior
      const srcRatio = srcWidth / srcHeight;
      const dstRatio = dstWidth / dstHeight;

      let cropX = 0, cropY = 0, cropWidth = srcWidth, cropHeight = srcHeight;

      if (srcRatio > dstRatio) {
        // Source is wider than target: scale by height, crop width from center
        cropWidth = srcHeight * dstRatio;
        cropX = (srcWidth - cropWidth) / 2;
      } else {
        // Source is taller than target: scale by width, crop height from center
        cropHeight = srcWidth / dstRatio;
        cropY = (srcHeight - cropHeight) / 2;
      }

      // Mirror and draw with proper crop
      ctx.save();
      ctx.translate(dstWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, dstWidth, dstHeight);
      ctx.restore();

      console.log('✓ Image drawn to canvas successfully');

      // Convert to blob
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob from canvas'));
              return;
            }
            resolve({
              blob,
              canvas,
              width: canvas.width,
              height: canvas.height,
            });
          },
          'image/png',
          0.95
        );
      });
    } catch (error: any) {
      console.error('Failed to capture frame:', error);
      throw error;
    }
  }

  /**
   * Stop camera stream and cleanup
   */
  stop(): void {
    try {
      // Stop all tracks in the media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => {
          track.stop();
          console.log('Stopped track:', track.kind, track.label);
        });
      }

      // Clear video element
      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.srcObject = null;
        this.videoElement.onloadedmetadata = null;
      }

      // Clear all references
      this.stream = null;
      this.mediaStream = null;
      this.isInitializing = false;

      console.log('Camera service stopped and cleaned up');
    } catch (error) {
      console.error('Error during camera cleanup:', error);
    }
  }

  /**
   * Get current camera constraints
   */
  getConstraints() {
    return CAMERA_CONFIG.VIDEO_CONSTRAINTS;
  }

  /**
   * Check if camera is currently active
   */
  isActive(): boolean {
    return !!this.mediaStream && this.mediaStream.getTracks().some(track => track.readyState === 'live');
  }

  /**
   * Get current camera status
   */
  getStatus(): CameraStatus {
    return {
      isActive: this.isActive(),
      isInitializing: this.isInitializing,
      hasStream: !!this.mediaStream,
    };
  }
}

// ========== 7.0 SERVICE EXPORT ==========
// Singleton instance
export const cameraService = new CameraService();
