/**
 * useCamera Hook - React hook for camera state management
 * Phase 1 MVP Implementation (US-001, US-002, US-003)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cameraService } from '../services/cameraService';

export const useCamera = (options = {}) => {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs
  const videoRef = useRef(null);
  const isMountedRef = useRef(true);

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
        const frontCamera = mediaDevices.find((d) => d.facingMode === 'user');
        const camera = frontCamera || mediaDevices[0];

        if (!camera) {
          setError('No camera device found');
          setIsLoading(false);
          return;
        }

        setSelectedDevice(camera);

        // Initialize camera
        const result = await cameraService.initialize(options.constraints, videoRef.current);

        if (!isMountedRef.current) return;

        if (result.success) {
          setIsInitialized(true);
          setError(null);
        } else {
          setError(result.error);
          setIsInitialized(false);

          // Log error for debugging
          console.warn(`Camera initialization failed: ${result.errorType}`);
        }
      } catch (err) {
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

    // Cleanup
    return () => {
      console.log('useCamera cleanup: stopping camera');
      isMountedRef.current = false;
      cameraService.stop();
    };
  }, []);

  /**
   * Request camera permission again (after denial)
   */
  const requestPermissionAgain = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await cameraService.initialize(options.constraints, videoRef.current);

    if (result.success) {
      setIsInitialized(true);
      setError(null);
    } else {
      setError(result.error);
    }

    setIsLoading(false);
  }, [options.constraints]);

  /**
   * Switch to different camera device
   */
  const switchDevice = useCallback(
    async (deviceId) => {
      try {
        setIsLoading(true);

        const result = await cameraService.switchDevice(deviceId);

        if (result.success) {
          const device = devices.find((d) => d.deviceId === deviceId);
          setSelectedDevice(device);
          setError(null);
        } else {
          setError(result.error);
        }
      } catch (err) {
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
    async (width, height) => {
      if (!width || !height) {
        throw new Error('Capture size not provided');
      }

      // For IP camera, the image element will be found in the service
      // For webcam, use videoRef
      if (!cameraService.isIPCamera && !videoRef.current) {
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

  return {
    // Refs
    videoRef,

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
