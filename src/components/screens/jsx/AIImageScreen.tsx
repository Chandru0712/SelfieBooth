import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';
import { v4 as uuidv4 } from 'uuid';
import PreviewScreen from './PreviewScreen';
import '../styles/AIImageScreen.css';

interface ImglyModule {
  default?: (blob: Blob, config: any) => Promise<Blob>;
  removeBackground?: (blob: Blob, config: any) => Promise<Blob>;
  preload?: (config: any) => Promise<void>;
}

interface AIImageScreenProps {
  onBack?: () => void;
  onGenerate?: (imageData: any) => void;
  isLoading?: boolean;
}

function App({ onBack = () => {}, onGenerate, isLoading }: AIImageScreenProps): React.JSX.Element {
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
  const [selectedCountdown, setSelectedCountdown] = useState<number>(5); // Countdown timer in seconds
  const [isCountdownDropdownOpen, setIsCountdownDropdownOpen] = useState<boolean>(false); // Dropdown state
  const [isFlashing, setIsFlashing] = useState<boolean>(false); // For the white flash effect
  const [isProcessingCapture, setIsProcessingCapture] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [activeBackgroundName, setActiveBackgroundName] = useState<string | null>(null);
  const [frameDimensions, setFrameDimensions] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const [showCapturePreview, setShowCapturePreview] = useState<boolean>(false);
  const [capturePreviewBlob, setCapturePreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeBackgroundRef = useRef<HTMLImageElement | null>(null);
  const rawMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thresholdMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imglyModuleRef = useRef<ImglyModule | null>(null);
  const processingStartRef = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      // Update canvas dimensions based on frame size
      setFrameDimensions({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
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

    // Use frame dimensions for capture to match the selected background
    const width = frameDimensions.width;
    const height = frameDimensions.height;
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

  const downloadBlob = (blob: Blob, fileName?: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = fileName || `selfie_${Date.now()}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const compressImage = async (blob: Blob, maxSizeMB: number = 2): Promise<Blob> => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (blob.size <= maxSizeBytes) return blob;

    let quality = 0.9;
    let compressedBlob = blob;

    while (compressedBlob.size > maxSizeBytes && quality > 0.1) {
      compressedBlob = await new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((result) => {
              URL.revokeObjectURL(url);
              resolve(result || blob);
            }, 'image/png', quality);
          } else {
            resolve(blob);
          }
        };
        img.src = url;
      });
      quality -= 0.1;
    }

    return compressedBlob;
  };

  const composeForegroundWithBackground = async (foregroundBlob: Blob): Promise<HTMLCanvasElement> => {
    const foregroundImage = await blobToImage(foregroundBlob);
    // Use frame dimensions instead of foreground image dimensions
    const width = frameDimensions.width;
    const height = frameDimensions.height;

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCountdownDropdownOpen(false);
      }
    };

    if (isCountdownDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCountdownDropdownOpen]);

  const startPhotoProcess = (): void => {
    setTimer(selectedCountdown); // Start at selected countdown value

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

      // Remove background using imgly library
      const foregroundBlob = await removeBackground(rawFrameBlob, config);

      // Composite the cutout with the selected background
      const finalCanvas = await composeForegroundWithBackground(foregroundBlob);
      const finalBlob = await canvasToBlob(finalCanvas, FINAL_OUTPUT_MIME, FINAL_OUTPUT_QUALITY);
      
      // Show preview instead of downloading immediately
      setCapturePreviewBlob(finalBlob);
      setPreviewUrl(URL.createObjectURL(finalBlob));
      setShowCapturePreview(true);
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

  const handleContinueCapture = async (): Promise<void> => {
    if (!capturePreviewBlob) return;

    try {
      setIsProcessingCapture(true);
      // Compress image to under 2MB
      const compressedBlob = await compressImage(capturePreviewBlob, 2);
      // Generate UUID v4 filename
      const fileName = `${uuidv4()}.png`;
      
      // Create image data object for preview screen
      const imageData = {
        url: previewUrl || URL.createObjectURL(compressedBlob),
        blob: compressedBlob,
        metadata: {
          id: uuidv4(),
          frameId: '',
          capturedAt: new Date().toISOString(),
          width: frameDimensions.width,
          height: frameDimensions.height,
          size: compressedBlob.size,
          fileName: fileName,
        },
      };

      // Preview screen will handle upload and QR code display
      // Just mark it as visible
    } catch (error) {
      console.error('Failed to process image:', error);
      setCaptureError('Failed to process image. Please try again.');
    } finally {
      setIsProcessingCapture(false);
    }
  };

  const handleRetakeCapture = (): void => {
    setShowCapturePreview(false);
    setCapturePreviewBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  return (
    <div className="capture-screen">
      {/* Header with Back Button and Title */}
      <header className="capture-header">
        <button
          className="btn-icon btn-back"
          onClick={onBack}
          aria-label="Go back to selection"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="capture-title">AI Background</h1>
          <p className="ai-capture-subtitle">SELECT FRAME</p>
        </div>
        <div className="btn-icon-spacer"></div>
      </header>

      <main className="capture-main">
        {/* Controls at the top */}
        <div className="control-panel-vertical">
          {/* Circular Capture Button */}
          <button
            onClick={startPhotoProcess}
            disabled={timer > 0 || isProcessingCapture}
            className="btn-capture-circle"
            aria-label="Take photo"
          >
            <div className="capture-ring"></div>
          </button>

          {/* Timer Dropdown Selector */}
          <div ref={dropdownRef} className="timer-dropdown-container">
            <button
              onClick={() => setIsCountdownDropdownOpen(!isCountdownDropdownOpen)}
              disabled={timer > 0 || isProcessingCapture}
              className="timer-dropdown-btn"
              aria-label="Select timer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="13" r="8"></circle>
                <path d="M12 9v4l2 2"></path>
                <path d="M16 2l-4 4M8 2l4 4"></path>
              </svg>
              <span>{selectedCountdown}s</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points={isCountdownDropdownOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}></polyline>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {isCountdownDropdownOpen && (
              <div className="timer-dropdown-menu">
                {[5, 10, 15, 20, 25, 30].map((seconds) => (
                  <button
                    key={seconds}
                    onClick={() => {
                      setSelectedCountdown(seconds);
                      setIsCountdownDropdownOpen(false);
                    }}
                    className={`timer-dropdown-option ${selectedCountdown === seconds ? 'selected' : ''}`}
                  >
                    {seconds} seconds
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Camera Preview in the middle */}
        <div className="preview-container-wrapper">
          <div className="preview-inner-container" style={{ aspectRatio: `${frameDimensions.width} / ${frameDimensions.height}` }}>
            {/* Hidden Webcam */}
            <Webcam ref={webcamRef} style={{ display: 'none' }} width={frameDimensions.width} height={frameDimensions.height} />

            {/* Main Display Canvas */}
            <canvas
              ref={canvasRef}
              width={frameDimensions.width}
              height={frameDimensions.height}
              className="camera-preview-canvas"
            ></canvas>

            {/* COUNTDOWN OVERLAY */}
            {timer > 0 && (
              <div className="countdown-overlay">
                <div className="countdown-number">{timer}</div>
              </div>
            )}

            {/* FLASH OVERLAY */}
            {isFlashing && (
              <div>
                <div className="flash-effect"></div>
                {/* Processing Info Overlay on White Screen - Centered */}
                <div className="flash-info-overlay">
                  {/* Animated Spinner Circle */}
                  <div className="spinner-container">
                    {/* Outer rotating ring */}
                    <div className="spinner-ring"/>
                    {/* Inner pulse circle */}
                    <div className="spinner-pulse"/>
                  </div>
                  {/* Processing Text */}
                  <div className="flash-processing-text">
                    Processing...
                  </div>
                  {/* Subtext */}
                  <div className="flash-processing-subtext">
                    Creating AI Background Mask
                  </div>
                  {/* Animated dots */}
                  <div className="animated-dots-container">
                    {[0, 1, 2].map((index) => (
                      <div
                        key={index}
                        className="animated-dot"
                        style={{ animationDelay: `${index * 0.2}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PROCESSING OVERLAY - Image Mask Processing */}
            {isProcessingCapture && (
              <div className="processing-overlay">
                <div className="processing-content">
                  {/* Spinner Animation */}
                  <div className="spinner"/>
                  {/* Processing Text */}
                  <div className="processing-text">
                    Processing...
                  </div>
                  {/* Subtext */}
                  <div className="processing-subtext">
                    Creating AI Background Mask
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Frame Selector at the bottom */}
        <section className="frame-selector-section capture-main-section">
          <div className="frame-selector-scroll">
            {backgroundList.map((bg) => (
              <button
                key={bg}
                onClick={() => loadBackground(bg)}
                className={`frame-option ${
                  activeBackgroundName === bg ? 'selected' : ''
                }`}
                aria-label={`Select frame ${bg.split('/').pop()}`}
              >
                <img
                  src={bg}
                  alt={bg.split('/').pop() || 'Frame'}
                  className="frame-thumbnail"
                />
              </button>
            ))}
          </div>
        </section>

        {/* Status Messages */}
        {processingTimeMs !== null && (
          <p className="ai-capture-processing">Processed in {(processingTimeMs / 1000).toFixed(2)}s</p>
        )}
        {captureError && <p className="ai-capture-error">{captureError}</p>}

        {/* Capture Preview Overlay - Using Common PreviewScreen */}
        <PreviewScreen
          imageData={capturePreviewBlob ? {
            url: previewUrl || '',
            blob: capturePreviewBlob,
            metadata: {
              id: uuidv4(),
              frameId: '',
              capturedAt: new Date().toISOString(),
              width: frameDimensions.width,
              height: frameDimensions.height,
              size: capturePreviewBlob.size,
              fileName: `${uuidv4()}.png`,
            },
          } : null}
          isVisible={showCapturePreview}
          isLoading={isProcessingCapture}
          onRetake={handleRetakeCapture}
          onContinue={() => {
            // Preview screen handles upload and QR code
          }}
          showAsOverlay={true}
        />
      </main>
    </div>
  );
}

export default App;