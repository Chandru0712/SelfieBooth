import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';
import { v4 as uuidv4 } from 'uuid';
import PreviewScreen from './PreviewScreen';
import '../styles/screens.css';
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
  const FINAL_OUTPUT_MIME = 'image/jpeg';
  const FINAL_OUTPUT_QUALITY = 0.95;
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
  const [previewDimensions, setPreviewDimensions] = useState({ width: "80%", height: "auto" });

  useEffect(() => {
    const computeDimensions = () => {
      const { width: frameWidth, height: frameHeight } = frameDimensions;
      if (!frameWidth || !frameHeight) return;
      
      const ratio = frameWidth / frameHeight;
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      const verticalReserve = 380;
      const horizontalPadding = 40; 

      const maxW = screenWidth - horizontalPadding;
      const maxH = screenHeight - verticalReserve;

      let targetW = maxW;
      let targetH = targetW / ratio;

      if (targetH > maxH) {
        targetH = maxH;
        targetW = targetH * ratio;
      }

      const minH = 250;
      if (targetH < minH) {
         targetH = minH;
         targetW = targetH * ratio;
      }

      setPreviewDimensions({
        width: `${Math.round(targetW)}px`,
        height: `${Math.round(targetH)}px`,
      });
    };

    computeDimensions();
    
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(computeDimensions, 150);
    };
    
    window.addEventListener("resize", debouncedResize);
    window.addEventListener("orientationchange", computeDimensions);
    return () => {
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("orientationchange", computeDimensions);
      clearTimeout(resizeTimeout);
    };
  }, [frameDimensions.width, frameDimensions.height]);
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
  const frameScrollRef = useRef<HTMLDivElement>(null);

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

  // Auto-select the first background on mount
  useEffect(() => {
    if (backgroundList.length > 0 && !activeBackgroundName) {
      loadBackground(backgroundList[0] as string);
    }
  }, [backgroundList, activeBackgroundName, loadBackground]);

  // Scroll to selected background whenever it changes
  useEffect(() => {
    if (!frameScrollRef.current || !activeBackgroundName) return;
    const track = frameScrollRef.current;
    const selected = track.querySelector('.frame-item.is-selected') as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeBackgroundName]);

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

  const captureRawVideoFrameBlob = async (dims: { width: number; height: number }): Promise<Blob> => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState < 2) {
      throw new Error('Camera frame is not ready.');
    }

    // Capture using maximal bounds instead of display/frame bounds
    const width = dims.width;
    const height = dims.height;
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
            }, 'image/jpeg', quality);
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

  const composeForegroundWithBackground = async (foregroundBlob: Blob, dims: { width: number; height: number }): Promise<HTMLCanvasElement> => {
    const foregroundImage = await blobToImage(foregroundBlob);
    
    // Fill to the maximal captured resolution bounds
    const width = dims.width;
    const height = dims.height;

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
        width: 3840,
        height: 2160
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

  const getCaptureDimensions = (): { width: number; height: number } => {
    const video = webcamRef.current?.video;
    if (!video || !video.videoWidth || !video.videoHeight || !frameDimensions.width || !frameDimensions.height) {
       return frameDimensions;
    }
    const aspect = frameDimensions.width / frameDimensions.height;
    let height = video.videoHeight;
    let width = height * aspect;

    if (width > video.videoWidth) {
       width = video.videoWidth;
       height = width / aspect;
    }
    return { width: Math.round(width), height: Math.round(height) };
  };

  const captureAndSave = async (): Promise<void> => {
    const previewCanvas = canvasRef.current;
    if (!previewCanvas) return;

    // Step 1: Trigger the white camera flash
    setIsFlashing(true);
    setCaptureError(null);
    setProcessingTimeMs(null);

    // Step 2: Wait for flash animation to complete (300ms), then show processing overlay
    await new Promise(resolve => setTimeout(resolve, 350));
    setIsFlashing(false);
    setIsProcessingCapture(true);
    processingStartRef.current = performance.now();

    try {
      await waitForPaint();
      const dims = getCaptureDimensions();
      const rawFrameBlob = await captureRawVideoFrameBlob(dims);
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
      const finalCanvas = await composeForegroundWithBackground(foregroundBlob, dims);
      const finalBlob = await canvasToBlob(finalCanvas, FINAL_OUTPUT_MIME, FINAL_OUTPUT_QUALITY);
      
      // Show preview instead of downloading immediately
      setCapturePreviewBlob(finalBlob);
      setPreviewUrl(URL.createObjectURL(finalBlob));
      setShowCapturePreview(true);
    } catch (error) {
      console.error('Foreground capture failed.', error);
      setCaptureError('Masking failed. Please try again.');
    } finally {
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
      // Compress image to under 8MB to preserve native 4K quality
      const compressedBlob = await compressImage(capturePreviewBlob, 8);
      // Generate UUID v4 filename
      const fileName = `${uuidv4()}.jpg`;
      
      // Create image data object for preview screen
      const imageData = {
        url: previewUrl || URL.createObjectURL(compressedBlob),
        blob: compressedBlob,
        metadata: {
          id: uuidv4(),
          frameId: '',
          capturedAt: new Date().toISOString(),
          width: getCaptureDimensions().width,
          height: getCaptureDimensions().height,
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
    <div className="capture-screen-modern">
      {/* SECTION 1: Top Header */}
      <div className="layout-header">
        <button className="back-circle-btn" onClick={onBack}>
          <svg width="75" height="75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="category-title">AI Background</h1>
        <div style={{ width: 44 }} /> 
      </div>

      {/* SECTION 2: Control Panel (Timer, Capture, Zoom) */}
      <div className="layout-controls" style={{ flexDirection: "column", gap: 20 }}>
        <button className="main-shutter-btn" onClick={startPhotoProcess} disabled={timer > 0 || isProcessingCapture}>
          <div className="shutter-inner" />
        </button>

        <div className="control-group" ref={dropdownRef} style={{ marginTop: 50}}>
          <button className="sub-control-btn" onClick={() => setIsCountdownDropdownOpen(!isCountdownDropdownOpen)} disabled={timer > 0 || isProcessingCapture}>
            <small>TIMER</small>
            <strong>{selectedCountdown}s</strong>
          </button>
          {isCountdownDropdownOpen && (
            <div className="popup-overlay" style={{ maxHeight: 'none', overflowY: 'visible', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[5, 10, 15, 20, 25, 30].map(v => (
                <button 
                  key={v} 
                  className={selectedCountdown === v ? "active-option" : ""}
                  onClick={() => {setSelectedCountdown(v); setIsCountdownDropdownOpen(false);}}
                  style={{ width: '50%' }}
                >
                  {v}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: Dynamic Preview Container */}
      <div className="layout-preview-area">
        <div 
          className="camera-wrapper"
          style={{ 
            width: previewDimensions.width, 
            height: previewDimensions.height, 
            position: "relative",
            margin: "0 auto",
            flexShrink: 0
          }}
        >
          <div 
            className="camera-box" 
            style={{ width: "100%", height: "100%" }}
          >
            {/* Hidden Webcam */}
            <Webcam 
              ref={webcamRef} 
              style={{ display: 'none' }} 
              width={frameDimensions.width} 
              height={frameDimensions.height} 
              videoConstraints={{
                width: { ideal: 3840, min: 1920 },
                height: { ideal: 2160, min: 1080 },
                facingMode: "user"
              }}
            />

            {/* Main Display Canvas */}
            <canvas
              ref={canvasRef}
              width={frameDimensions.width}
              height={frameDimensions.height}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            ></canvas>

            {isFlashing && <div className="screen-flash" />}
            {/* PROCESSING OVERLAY - Image Mask Processing */}
            {isProcessingCapture && (
              <div className="processing-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0a0a1a" }}>
                <div className="processing-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner"/>
                  <div className="processing-text" style={{ color: "white", fontSize: "5rem", marginTop: 20 }}>Processing...</div>
                  <div className="processing-subtext" style={{ color: "white", fontSize: "2rem", marginTop: 10 }}>Background Mask</div>
                </div>
              </div>
            )}
          </div>
          {timer > 0 && <div key={timer} className="countdown-text">{timer}</div>}
        </div>
      </div>

      {/* SECTION 4: Frame Selector */}
      <div className="layout-frame-selector">
        <div className="frame-track" ref={frameScrollRef}>
          {backgroundList.map((bg) => (
            <button
              key={bg}
              className={`frame-item ${activeBackgroundName === bg ? "is-selected" : ""}`}
              onClick={() => setTimeout(() => loadBackground(bg), 0)}
            >
              <img src={bg} alt={bg.split('/').pop() || 'Frame'} draggable="false" />
            </button>
          ))}
        </div>
      </div>

      {processingTimeMs !== null && (
        <p className="ai-capture-processing" style={{ display: 'none' }}>Processed in {(processingTimeMs / 1000).toFixed(2)}s</p>
      )}
      {captureError && <p className="ai-capture-error" style={{ display: 'none' }}>{captureError}</p>}

      <PreviewScreen
        imageData={capturePreviewBlob ? {
          url: previewUrl || '',
          blob: capturePreviewBlob,
          metadata: {
            id: uuidv4(),
            frameId: '',
            capturedAt: new Date().toISOString(),
            width: getCaptureDimensions().width,
            height: getCaptureDimensions().height,
            size: capturePreviewBlob.size,
            fileName: `${uuidv4()}.jpg`,
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
    </div>
  );
}

export default App;