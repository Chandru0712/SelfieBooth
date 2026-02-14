/**
 * Camera Service - Handles all camera operations
 * Phase 1 MVP Implementation
 */

import { CAMERA_CONFIG } from '../constants';

class CameraService {
  constructor() {
    this.stream = null;
    this.mediaStream = null;
    this.videoElement = null;
    this.isIPCamera = false;
    this.isInitializing = false;
  }

  /**
   * Initialize camera with webcam or IP camera
   * US-001: Camera Initialization
   */
  async initialize(constraints = {}, videoElement = null) {
    try {
      // Prevent concurrent initializations
      if (this.isInitializing) {
        console.warn('Camera initialization already in progress, waiting...');
        // Wait a bit and return current state
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.mediaStream) {
          return { success: true, stream: this.mediaStream, isIPCamera: this.isIPCamera };
        }
      }

      this.isInitializing = true;

      // Stop any existing stream first to prevent "camera in use" errors
      this.stop();

      this.videoElement = videoElement;

      // Check if IP camera is enabled
      if (CAMERA_CONFIG.USE_IP_CAMERA) {
        console.log('Using IP camera mode...');
        const ipResult = await this.initializeIPCamera();
        return ipResult;
      }

      // Use device camera (original code)
      const result = await this.initializeDeviceCamera(constraints, videoElement);

      // If overconstrained, retry with basic settings
      if (!result.success && result.errorType === 'OVERCONSTRAINED') {
        console.log('Retrying with basic camera settings...');
        return await this.initializeDeviceCamera({ video: true }, videoElement);
      }

      return result;
    } catch (error) {
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
   * Initialize IP camera (e.g., IP Webcam app)
   * IP camera uses img tag, not video element
   */
  async initializeIPCamera() {
    this.isIPCamera = true;

    const endpoint = CAMERA_CONFIG.IP_CAMERA_URL || '/cam-proxy/video';
    console.log(`Using IP camera endpoint: ${endpoint}`);

    // IP camera doesn't use mediaStream - it uses img tag in the UI
    // Just return success and let the component render the img tag
    return {
      success: true,
      stream: null,
      isIPCamera: true,
      endpoint: endpoint,
    };
  }

  /**
   * Initialize device camera (original implementation)
   */
  async initializeDeviceCamera(constraints = {}, videoElement = null) {
    try {
      this.isIPCamera = false;

      // Merge with default constraints
      const mergedConstraints = {
        video: {
          facingMode: 'user',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          ...constraints.video,
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
        await new Promise((resolve, reject) => {
          let timeout;
          let metadataHandler;
          let errorHandler;

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

          errorHandler = (err) => {
            console.error('Video element error:', err);
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
          // Force play attribute is already set, but try play() for extra assurance
          const playPromise = videoElement.play();
          if (playPromise) {
            await playPromise;
            console.log('✓ Video playing');
          }
        } catch (playError) {
          // Autoplay might be restricted, but this is OK if the video stream is loaded
          console.warn('Video play warning:', playError.message);
        }
      } else {
        console.warn('No video element provided, stream initialized without video element');
      }

      this.stream = this.mediaStream;
      return {
        success: true,
        stream: this.mediaStream,
        isIPCamera: false,
      };
    } catch (error) {
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
  async getDevices() {
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
  async switchDevice(deviceId) {
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

      return await this.initialize(constraints, this.videoElement);
    } catch (error) {
      console.error('Failed to switch camera:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Capture frame from video stream or IP camera as blob
   * US-013: Image Capture with Frame Compositing
   */
  async captureFrame(sourceElement = null, targetWidth, targetHeight) {
    try {
      if (!targetWidth || !targetHeight) {
        throw new Error('Capture size not provided');
      }

      const getSourceSize = (element) => {
        if (!element) return null;
        if (element.tagName === 'VIDEO') {
          return { width: element.videoWidth, height: element.videoHeight };
        }
        if (element.tagName === 'IMG') {
          return { width: element.naturalWidth || element.width, height: element.naturalHeight || element.height };
        }
        return { width: element.width, height: element.height };
      };

      const getCoverRect = (srcWidth, srcHeight, dstWidth, dstHeight) => {
        if (!srcWidth || !srcHeight) {
          return null;
        }
        const srcAspect = srcWidth / srcHeight;
        const dstAspect = dstWidth / dstHeight;

        if (srcAspect > dstAspect) {
          const sWidth = srcHeight * dstAspect;
          const sx = (srcWidth - sWidth) / 2;
          return { sx, sy: 0, sWidth, sHeight: srcHeight };
        }

        const sHeight = srcWidth / dstAspect;
        const sy = (srcHeight - sHeight) / 2;
        return { sx: 0, sy, sWidth: srcWidth, sHeight };
      };

      let source = sourceElement;

      // For IP camera, always fetch from snapshot endpoint or img element
      if (this.isIPCamera) {
        const snapshotUrl = CAMERA_CONFIG.IP_CAMERA_SNAPSHOT;
        if (snapshotUrl) {
          console.log('Using snapshot endpoint:', snapshotUrl);

          // Create a temporary img to load the snapshot
          const snapshotImg = new Image();
          snapshotImg.crossOrigin = 'anonymous';

          return new Promise((resolve, reject) => {
            snapshotImg.onload = async () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');

                // Calculate crop to cover
                const sRect = getCoverRect(
                  snapshotImg.naturalWidth,
                  snapshotImg.naturalHeight,
                  targetWidth,
                  targetHeight
                );

                if (sRect) {
                  ctx.drawImage(
                    snapshotImg,
                    sRect.sx, sRect.sy, sRect.sWidth, sRect.sHeight,
                    0, 0, canvas.width, canvas.height
                  );
                } else {
                  ctx.drawImage(snapshotImg, 0, 0, canvas.width, canvas.height);
                }

                // Convert to blob
                canvas.toBlob(
                  (blob) => {
                    if (!blob) {
                      throw new Error('Failed to create blob from canvas');
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
              } catch (err) {
                reject(err);
              }
            };

            snapshotImg.onerror = () => {
              console.error('Failed to load snapshot from IP camera at:', snapshotUrl);
              reject(new Error('Failed to load snapshot from IP camera. Make sure the endpoint ' + snapshotUrl + ' is available.'));
            };

            // Add timestamp to prevent caching
            snapshotImg.src = snapshotUrl + '?t=' + Date.now();
          });
        } else {
          // No snapshot URL, try to use img element
          source = document.querySelector('.camera-stream') ||
            document.querySelector('img[alt="IP Camera Stream"]');

          if (!source) {
            throw new Error('IP camera image element not found and no snapshot URL configured');
          }
        }
      }

      // For webcam, use the provided video element
      if (!this.isIPCamera && !source) {
        throw new Error('Camera source element not provided');
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');

      // Draw frame from source with proper crop-to-cover
      try {
        if (!this.isIPCamera && source && source.tagName === 'VIDEO') {
          // For video: calculate proper crop to match preview display
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
        } else {
          // For IP camera or other images: draw with crop
          const srcSize = getSourceSize(source); // Helper defined above
          const sRect = getCoverRect(
            srcSize.width, srcSize.height,
            canvas.width, canvas.height
          );

          if (sRect) {
            ctx.drawImage(
              source,
              sRect.sx, sRect.sy, sRect.sWidth, sRect.sHeight,
              0, 0, canvas.width, canvas.height
            );
          } else {
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
          }
        }
        console.log('✓ Image drawn to canvas successfully');
      } catch (drawError) {
        console.error('Canvas draw error:', drawError);
        throw new Error('Failed to capture image: ' + drawError.message);
      }

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
    } catch (error) {
      console.error('Failed to capture frame:', error);
      throw error;
    }
  }

  /**
   * Stop camera stream and cleanup
   */
  stop() {
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
        if (this.isIPCamera) {
          this.videoElement.pause();
          this.videoElement.src = '';
        } else {
          this.videoElement.pause();
          this.videoElement.srcObject = null;
        }
        // Remove event listeners
        this.videoElement.onloadedmetadata = null;
        this.videoElement.onerror = null;
      }

      // Clear all references
      this.stream = null;
      this.mediaStream = null;
      this.isIPCamera = false;
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
  isActive() {
    return !!this.mediaStream && this.mediaStream.getTracks().some(track => track.readyState === 'live');
  }

  /**
   * Get current camera status
   */
  getStatus() {
    return {
      isActive: this.isActive(),
      isInitializing: this.isInitializing,
      isIPCamera: this.isIPCamera,
      hasStream: !!this.mediaStream,
    };
  }
}

// Singleton instance
export const cameraService = new CameraService();
