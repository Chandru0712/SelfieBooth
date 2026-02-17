/**
 * ================================================================================
 * FILE: useCamera.ts - CAMERA STATE MANAGEMENT HOOK
 * ================================================================================
 * 
 * React hook for managing camera state, permissions, and device selection
 * Phase 1 MVP Implementation (US-001, US-002, US-003)
 * 
 * STRUCTURE:
 * 1.0 IMPORTS & EXPORTS
 * 2.0 STATE & REF MANAGEMENT
 * 3.0 CAMERA INITIALIZATION (ON MOUNT)
 * 4.0 CAMERA CLEANUP (ON UNMOUNT)
 * 5.0 DEVICE SWITCHING & MANAGEMENT
 * 6.0 HOOK RETURN
 * 
 * ================================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cameraService } from '../services/cameraService';

interface UseCameraOptions {
  constraints?: Record<string, any>;
}

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  selectedDevice: MediaDeviceInfo | null;
  switchDevice: (deviceId: string) => Promise<void>;
  captureFrame: (width: number, height: number) => Promise<any>;
  stop: () => void;
  restart: () => Promise<void>;
  requestPermissionAgain: () => Promise<void>;
}

// ========== 1.0 & 2.0 COMPONENT IMPLEMENTATION ==========
export const useCamera = (options: UseCameraOptions = {}): UseCameraReturn => {
  // ========== STATE & REFS ==========
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<MediaDeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMountedRef = useRef(true);

  // ========== 3.0 CAMERA INITIALIZATION (ON MOUNT) ==========
  /**
   * Initialize camera on mount
   */
  useEffect(() => {
    isMountedRef.current = true;

    const initCamera = async () => {
      try {
        setIsLoading(true);

        // Get available devices
        const mediaDevices = await cameraService.getDevices();
        if (!isMountedRef.current) return;

        setDevices(mediaDevices);

        // Prefer front-facing camera or first device
        const frontCamera = mediaDevices.find((d) => (d as any).facingMode === 'user');
        const camera = frontCamera || mediaDevices[0];

        if (!camera) {
          setError('No camera device found');
          setIsLoading(false);
          return;
        }

        setSelectedDevice(camera);

        // Initialize camera
        const result = await cameraService.initialize(options.constraints, videoRef.current!);

        if (!isMountedRef.current) return;

        if (result.success) {
          setIsInitialized(true);
          setError(null);
        } else {
          setError(result.error || 'Unknown error');
          setIsInitialized(false);

          // Log error for debugging
          console.warn(`Camera initialization failed: ${result.errorType}`);
        }
      } catch (err: any) {
        if (isMountedRef.current) {
          setError(`Unexpected error: ${err.message}`);
          setIsInitialized(false);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initCamera();

    // ========== 4.0 CAMERA CLEANUP (ON UNMOUNT) ==========
    return () => {
      console.log('useCamera cleanup: stopping camera');
      isMountedRef.current = false;
      cameraService.stop();
    };
  }, [options.constraints]);

  // ========== 5.0 DEVICE SWITCHING & MANAGEMENT ==========
  /**
   * Request camera permission again (after denial)
   */
  const requestPermissionAgain = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await cameraService.initialize(options.constraints, videoRef.current!);

    if (result.success) {
      setIsInitialized(true);
      setError(null);
    } else {
      setError(result.error || 'Unknown error');
    }

    setIsLoading(false);
  }, [options.constraints]);

  /**
   * Switch to different camera device
   */
  const switchDevice = useCallback(
    async (deviceId: string) => {
      try {
        setIsLoading(true);

        const result = await cameraService.switchDevice(deviceId);

        if (result.success) {
          const device = devices.find((d) => d.deviceId === deviceId);
          setSelectedDevice(device || null);
          setError(null);
        } else {
          setError(result.error || 'Unknown error');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    [devices]
  );

  /**
   * Capture frame from video stream
   */
  const captureFrame = useCallback(
    async (width: number, height: number) => {
      if (!width || !height) {
        throw new Error('Capture size not provided');
      }

      if (!videoRef.current) {
        throw new Error('Video element not available');
      }

      return await cameraService.captureFrame(videoRef.current, width, height);
    },
    []
  );

  /**
   * Stop camera
   */
  const stop = useCallback(() => {
    cameraService.stop();
    setIsInitialized(false);
  }, []);

  /**
   * Restart camera
   */
  const restart = useCallback(async () => {
    console.log('Restarting camera...');
    stop();
    // Wait longer to ensure camera stream is fully released
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return requestPermissionAgain();
  }, [stop, requestPermissionAgain]);

  // ========== 6.0 HOOK RETURN ==========
  return {
    // Refs
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,

    // State
    isInitialized,
    isLoading,
    error,
    devices,
    selectedDevice,

    // Methods
    switchDevice,
    captureFrame,
    stop,
    restart,
    requestPermissionAgain,
  };
};
