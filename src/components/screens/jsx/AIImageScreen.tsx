import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';

interface ImglyModule {
  default?: (blob: Blob, config: any) => Promise<Blob>;
  removeBackground?: (blob: Blob, config: any) => Promise<Blob>;
  preload?: (config: any) => Promise<void>;
}

function App(): React.JSX.Element {
  // Segmentation tuning variables (change these and rebuild as needed)
  const MASK_THRESHOLD = 0.7; // 0.0 to 1.0 (lowered for better edge detection)
  const MASK_EDGE_BLUR_PX = 4; // Reduced blur for sharper edges
  const FINAL_REMOVAL_MODEL = 'medium'; // Use 'medium' for better compatibility (isnet requires local hosting)
  const FINAL_REMOVAL_DEVICE = 'cpu'; // Use CPU for better compatibility
  const FINAL_OUTPUT_MIME = 'image/png';
  const FINAL_OUTPUT_QUALITY = 1;
  const ENABLE_IMGLY_PRELOAD = true;
  const FLIP_HORIZONTAL = true; // mirror camera like a selfie
  const MEDIAPIPE_BASE_URL = '/models/';
  const MEDIAPIPE_ASSET_VERSION = '2026-02-16';

  const [timer, setTimer] = useState<number>(0); // 0 = not taking photo
  const [isFlashing, setIsFlashing] = useState<boolean>(false); // For the white flash effect
  const [isProcessingCapture, setIsProcessingCapture] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [activeBackgroundName, setActiveBackgroundName] = useState<string | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeBackgroundRef = useRef<HTMLImageElement | null>(null);
  const rawMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thresholdMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imglyModuleRef = useRef<ImglyModule | null>(null);
  const processingStartRef = useRef<number | null>(null);

  const backgroundList = useMemo(() => {
    const backgrounds = import.meta.glob('../../../assets/Frames/AI_Frame/*.{jpg,jpeg,png,webp}', {
      eager: true,
      as: 'url'
    });
    return Object.values(backgrounds).sort();
  }, []);

  // Function to load a new background (memoized)
  const loadBackground = useCallback((filename: string): void => {
    const img = new Image();
    img.src = filename;
    img.onload = (): void => {
      activeBackgroundRef.current = img; // Update active image used by draw loop
      setActiveBackgroundName(filename);
    };
    img.onerror = (): void => {
      console.error(`Failed to load background: ${filename}`);
    };
  }, []);

  const waitForPaint = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 1): Promise<Blob> =>
    new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas export failed.'));
          return;
        }
        resolve(blob);
      }, type, quality);
    });

  const blobToImage = (blob: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode foreground image.'));
      };
      img.src = url;
    });

  const captureRawVideoFrameBlob = async (): Promise<Blob> => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2) {
      throw new Error('Camera frame is not ready.');
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;

    const frameCtx = frameCanvas.getContext('2d');
    if (!frameCtx) {
      throw new Error('Could not create frame context.');
    }
    if (FLIP_HORIZONTAL) {
      frameCtx.translate(width, 0);
      frameCtx.scale(-1, 1);
    }
    frameCtx.drawImage(video, 0, 0, width, height);
    return canvasToBlob(frameCanvas, FINAL_OUTPUT_MIME, FINAL_OUTPUT_QUALITY);
  };

  const downloadCanvas = (canvas: HTMLCanvasElement): void => {
    const link = document.createElement('a');
    link.download = `selfie_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const downloadBlob = (blob: Blob): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `selfie_${Date.now()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const composeForegroundWithBackground = async (foregroundBlob: Blob): Promise<HTMLCanvasElement> => {
    const foregroundImage = await blobToImage(foregroundBlob);
    const width = foregroundImage.naturalWidth || foregroundImage.width || 640;
    const height = foregroundImage.naturalHeight || foregroundImage.height || 480;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;

    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      throw new Error('Could not create export context.');
    }

    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = 'high';

    const activeBackground = activeBackgroundRef.current;

    // Draw background first
    if (activeBackground) {
      exportCtx.drawImage(activeBackground, 0, 0, width, height);
    } else {
      exportCtx.fillStyle = '#00FF00';
      exportCtx.fillRect(0, 0, width, height);
    }

    // Draw foreground (cutout person) on top
    exportCtx.drawImage(foregroundImage, 0, 0, width, height);
    return exportCanvas;
  };

  const getImglyModule = useCallback(async (): Promise<ImglyModule> => {
    if (!imglyModuleRef.current) {
      imglyModuleRef.current = await import('@imgly/background-removal') as any;
    }
    return imglyModuleRef.current!;
  }, []);

  const getThresholdMask = useCallback((segmentationMask: CanvasImageSource, width: number, height: number): HTMLCanvasElement => {
    if (!rawMaskCanvasRef.current) rawMaskCanvasRef.current = document.createElement('canvas');
    if (!thresholdMaskCanvasRef.current) thresholdMaskCanvasRef.current = document.createElement('canvas');

    const rawMaskCanvas = rawMaskCanvasRef.current;
    const thresholdMaskCanvas = thresholdMaskCanvasRef.current;

    if (rawMaskCanvas.width !== width || rawMaskCanvas.height !== height) {
      rawMaskCanvas.width = width;
      rawMaskCanvas.height = height;
    }
    if (thresholdMaskCanvas.width !== width || thresholdMaskCanvas.height !== height) {
      thresholdMaskCanvas.width = width;
      thresholdMaskCanvas.height = height;
    }

    const rawMaskCtx = rawMaskCanvas.getContext('2d', { willReadFrequently: true });
    const thresholdMaskCtx = thresholdMaskCanvas.getContext('2d');
    if (!rawMaskCtx || !thresholdMaskCtx) return thresholdMaskCanvas;

    rawMaskCtx.clearRect(0, 0, width, height);
    rawMaskCtx.drawImage(segmentationMask, 0, 0, width, height);

    const maskImageData = rawMaskCtx.getImageData(0, 0, width, height);
    const pixels = maskImageData.data;
    const thresholdByte = Math.max(0, Math.min(255, Math.round(MASK_THRESHOLD * 255)));

    for (let i = 0; i < pixels.length; i += 4) {
      const confidence = pixels[i];
      const alpha = confidence >= thresholdByte ? 255 : 0;
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = alpha;
    }

    thresholdMaskCtx.clearRect(0, 0, width, height);
    thresholdMaskCtx.putImageData(maskImageData, 0, 0);
    return thresholdMaskCanvas;
  }, [MASK_THRESHOLD]);

  // 2. The Drawing Loop
  const onResults = useCallback((results: Results): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    if (FLIP_HORIZONTAL) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    // Draw thresholded/feathered mask
    const thresholdMask = getThresholdMask(results.segmentationMask, width, height);
    if (MASK_EDGE_BLUR_PX > 0) {
      ctx.filter = `blur(${MASK_EDGE_BLUR_PX}px)`;
    }
    ctx.drawImage(thresholdMask, 0, 0, width, height);
    ctx.filter = 'none';

    // Keep only the person
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(results.image, 0, 0, width, height);

    // Draw the background behind the person
    ctx.globalCompositeOperation = 'destination-over';
    
    // Un-flip transform for background so it appears normal (not mirrored)
    if (FLIP_HORIZONTAL) {
      ctx.scale(-1, 1);
      ctx.translate(-width, 0);
    }
    
    const activeBackground = activeBackgroundRef.current;
    if (activeBackground) {
      ctx.drawImage(activeBackground, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#00FF00'; 
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }, [getThresholdMask, MASK_EDGE_BLUR_PX, FLIP_HORIZONTAL]);

  // 1. Initialize MediaPipe (Same as before)
  useEffect(() => {
    const selfieSegmentation = new SelfieSegmentation({
      locateFile: (file: string) => `${MEDIAPIPE_BASE_URL}${file}?v=${MEDIAPIPE_ASSET_VERSION}`,
    });

    selfieSegmentation.setOptions({
      modelSelection: 1, // Landscape (Fast)
      selfieMode: false,
    });

    selfieSegmentation.onResults(onResults);

    let camera: Camera | undefined;
    let cancelled = false;
    let isActive = true;

    const startCameraWhenReady = (): void => {
      if (cancelled) return;
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2) {
        requestAnimationFrame(startCameraWhenReady);
        return;
      }

      camera = new Camera(video, {
        onFrame: async (): Promise<void> => {
          if (cancelled || !isActive) return;
          const frame = webcamRef.current?.video;
          if (frame) {
            await selfieSegmentation.send({ image: frame });
          }
        },
        width: 1920,
        height: 1080
      });
      camera.start();
    };

    startCameraWhenReady();
    
    return () => {
      cancelled = true;
      isActive = false;
      if (camera) camera.stop();
      if (typeof selfieSegmentation.close === 'function') {
        selfieSegmentation.close();
      }
    };
  }, [onResults]);

  // Load the first background when component mounts
  useEffect(() => {
    if (backgroundList.length === 0) return;
    loadBackground(backgroundList[0]);
  }, [backgroundList, loadBackground]);

  useEffect(() => {
    if (!ENABLE_IMGLY_PRELOAD) return;

    let cancelled = false;
    const preloadImgly = async (): Promise<void> => {
      try {
        const imglyModule = await getImglyModule();
        const preload = imglyModule?.preload;
        if (cancelled || typeof preload !== 'function') return;
        await preload({
          model: FINAL_REMOVAL_MODEL,
          device: FINAL_REMOVAL_DEVICE
        });
      } catch (error) {
        console.warn('IMG.LY preload failed. Will load on first capture.', error);
      }
    };

    preloadImgly();
    return (): void => {
      cancelled = true;
    };
  }, [ENABLE_IMGLY_PRELOAD, FINAL_REMOVAL_DEVICE, FINAL_REMOVAL_MODEL, getImglyModule]);

  const startPhotoProcess = (): void => {
    setTimer(3); // Start at 3 seconds

    const countdown: NodeJS.Timeout = setInterval((): void => {
      setTimer((prev) => {
        if (prev === 1) {
          clearInterval(countdown);
          captureAndSave();
          return 0; // Reset timer
        }
        return prev - 1;
      });
    }, 1000);
  };

  const captureAndSave = async (): Promise<void> => {
    const previewCanvas = canvasRef.current;
    if (!previewCanvas) return;

    setIsFlashing(true);
    setIsProcessingCapture(true);
    setCaptureError(null);
    setProcessingTimeMs(null);
    processingStartRef.current = performance.now();

    try {
      await waitForPaint();
      const rawFrameBlob = await captureRawVideoFrameBlob();
      const imglyModule = await getImglyModule();
      const removeBackground = imglyModule?.default || imglyModule?.removeBackground;

      if (typeof removeBackground !== 'function') {
        throw new Error('IMG.LY removeBackground API is unavailable.');
      }

      const config = {
        model: FINAL_REMOVAL_MODEL,
        device: FINAL_REMOVAL_DEVICE,
        output: {
          format: 'image/png',
          quality: FINAL_OUTPUT_QUALITY,
          type: 'foreground'
        },
        progress: undefined // Disable progress callback for better performance
      };

      let foregroundBlob;
      try {
        foregroundBlob = await removeBackground(rawFrameBlob, config);
      } catch (gpuError) {
        if (FINAL_REMOVAL_DEVICE !== 'gpu') throw gpuError;
        foregroundBlob = await removeBackground(rawFrameBlob, {
          ...config,
          device: 'cpu'
        });
      }

      // Composite the cutout with the selected background
      const finalCanvas = await composeForegroundWithBackground(foregroundBlob);
      downloadCanvas(finalCanvas);
    } catch (error) {
      console.error('Foreground capture failed.', error);
      setCaptureError('Masking failed. Please try again.');
    } finally {
      setTimeout(() => setIsFlashing(false), 120);
      setIsProcessingCapture(false);
      if (processingStartRef.current !== null) {
        setProcessingTimeMs(Math.round(performance.now() - processingStartRef.current));
        processingStartRef.current = null;
      }
    }
  };

  return (
    <>
      <div className="ai-capture-screen">
        <header className="ai-capture-header">
          <h1 className="ai-capture-title">Selfie Booth</h1>
          <p className="ai-capture-subtitle">Live cutout with custom backgrounds</p>
        </header>
      
      {/* Hidden Webcam */}
      <Webcam ref={webcamRef} className="ai-capture-webcam" width={640} height={480} />

      {/* Main Display + Overlays */}
      <div className="ai-capture-stage">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="ai-capture-canvas"
        ></canvas>

        {/* COUNTDOWN OVERLAY */}
        {timer > 0 && (
          <div className="ai-capture-countdown">
            {timer}
          </div>
        )}

        {/* FLASH OVERLAY */}
        {isFlashing && (
          <div className="ai-capture-flash"></div>
        )}
      </div>

      {/* Background Selector Gallery */}
      <div className="ai-capture-gallery">
        {backgroundList.map((bg) => (
          <img 
            key={bg}
            src={bg} 
            alt={bg.split('/').pop() || 'Background'}
            onClick={() => loadBackground(bg)}
            className={
              activeBackgroundName === bg
                ? 'ai-capture-thumb selected'
                : 'ai-capture-thumb'
            }
            onMouseOver={(e) => (e.target as HTMLImageElement).style.transform = 'scale(1.1)'}
            onMouseOut={(e) => (e.target as HTMLImageElement).style.transform = 'scale(1.0)'}
          />
        ))}
      </div>

      <div className="ai-capture-actions">
      <button 
        onClick={startPhotoProcess} 
        disabled={timer > 0 || isProcessingCapture} // Disable while counting down or processing
        className="ai-capture-button"
      >
        {timer > 0 ? 'Get Ready...' : isProcessingCapture ? 'Processing...' : 'SNAP!'}
      </button>
    </div>

      <p className="ai-capture-hint">Click an image above to change the scenery.</p>
      {processingTimeMs !== null && (
        <p className="ai-capture-processing">Processed in {(processingTimeMs / 1000).toFixed(2)}s</p>
      )}
      {captureError && <p className="ai-capture-error">{captureError}</p>}
      </div>
    </>
  );
}

export default App;