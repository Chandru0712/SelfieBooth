import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';
import { v4 as uuidv4 } from 'uuid';
import PreviewScreen from './PreviewScreen';
import CubeSpinner from '../../CubeSpinner';

interface BackgroundRemovalModule {
  default?: (blob: Blob, config: any) => Promise<Blob>;
  removeBackground?: (blob: Blob, config: any) => Promise<Blob>;
  preload?: (config: any) => Promise<void>;
}

interface AIImageScreenProps {
  category?: string;
  onBack?: () => void;
  onGenerate?: (imageData: any) => void;
  isLoading?: boolean;
}

function AIImageScreen({ category = 'Wild Life', onBack = () => {}, onGenerate, isLoading }: AIImageScreenProps): React.JSX.Element {
  // Segmentation tuning variables (change these and rebuild as needed)
  const MASK_THRESHOLD = 0.7; // 0.0 to 1.0 (lowered for better edge detection)
  const MASK_EDGE_BLUR_PX = 3; // Reduced blur for sharper edges and faster processing
  const FINAL_REMOVAL_MODEL = 'medium'; // Use IMG.LY's medium model preset
  const FINAL_REMOVAL_DEVICE = 'cpu'; // CPU processing
  const FINAL_OUTPUT_MIME = 'image/jpeg';
  const FINAL_OUTPUT_QUALITY = 0.88; // Balanced quality/speed
  const ENABLE_REMOVAL_PRELOAD = true;
  const MAX_PROCESSING_WIDTH = 1920; // Cap resolution for faster processing
  const FLIP_HORIZONTAL = true; // mirror camera like a selfie
  const MEDIAPIPE_BASE_URL = '/models/';
  const MEDIAPIPE_ASSET_VERSION = '2026-02-16';

  const [timer, setTimer] = useState<number>(0);
  const [selectedCountdown, setSelectedCountdown] = useState<number>(5);
  const [isCountdownDropdownOpen, setIsCountdownDropdownOpen] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isProcessingCapture, setIsProcessingCapture] = useState<boolean>(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [activeBackgroundName, setActiveBackgroundName] = useState<string | null>(null);
  const [frameDimensions, setFrameDimensions] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const [previewDimensions, setPreviewDimensions] = useState({ width: "80%", height: "auto" });
  const [isFrameDragging, setIsFrameDragging] = useState(false);
  const [frameDragStart, setFrameDragStart] = useState(0);
  const [frameDragStartScroll, setFrameDragStartScroll] = useState(0);

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
  const backgroundRemovalModuleRef = useRef<BackgroundRemovalModule | null>(null);
  const processingStartRef = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const frameScrollRef = useRef<HTMLDivElement>(null);

  const backgroundList = useMemo(() => {
    const backgrounds = import.meta.glob('../../../assets/Frames/WildLife/*.{jpg,jpeg,png,webp}', {
      eager: true,
      query: '?url'
    });
    return Object.values(backgrounds).map((bg: any) => bg.default || bg).sort();
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
    const container = frameScrollRef.current;
    const selected = container.querySelector('.frame-item-selected') as HTMLElement;
    if (selected) {
      const containerWidth = container.offsetWidth;
      const btnLeft = selected.offsetLeft;
      const btnWidth = selected.offsetWidth;
      container.scrollTo({ left: Math.max(0, btnLeft + btnWidth / 2 - containerWidth / 2), behavior: 'smooth' });
    }
  }, [activeBackgroundName]);

  // Native (non-passive) wheel → horizontal scroll on the frame strip
  useEffect(() => {
    const el = frameScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY || e.deltaX;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag-to-scroll handlers for frame strip
  const handleFrameDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsFrameDragging(true);
    setFrameDragStart(e.clientX);
    setFrameDragStartScroll(frameScrollRef.current?.scrollLeft || 0);
  };

  const handleFrameDragMove = useCallback((e: MouseEvent) => {
    if (!frameScrollRef.current || !isFrameDragging) return;
    const diff = e.clientX - frameDragStart;
    frameScrollRef.current.scrollLeft = frameDragStartScroll - diff;
  }, [frameDragStart, frameDragStartScroll, isFrameDragging]);

  const handleFrameDragEnd = useCallback(() => setIsFrameDragging(false), []);

  useEffect(() => {
    if (!isFrameDragging) return;
    window.addEventListener('mousemove', handleFrameDragMove);
    window.addEventListener('mouseup', handleFrameDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleFrameDragMove);
      window.removeEventListener('mouseup', handleFrameDragEnd);
    };
  }, [isFrameDragging, handleFrameDragMove, handleFrameDragEnd]);

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

  const getBackgroundRemovalModule = useCallback(async (): Promise<BackgroundRemovalModule> => {
    if (!backgroundRemovalModuleRef.current) {
      backgroundRemovalModuleRef.current = await import('@imgly/background-removal') as any;
    }
    return backgroundRemovalModuleRef.current!;
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
    if (!ENABLE_REMOVAL_PRELOAD) return;

    let cancelled = false;
    const preloadRemovalModel = async (): Promise<void> => {
      try {
        const backgroundRemovalModule = await getBackgroundRemovalModule();
        const preload = backgroundRemovalModule?.preload;
        if (cancelled || typeof preload !== 'function') return;
        await preload({
          model: FINAL_REMOVAL_MODEL,
          device: FINAL_REMOVAL_DEVICE
        });
      } catch (error) {
        console.warn('Background removal preload failed. Will load on first capture.', error);
      }
    };

    preloadRemovalModel();
    return (): void => {
      cancelled = true;
    };
  }, [ENABLE_REMOVAL_PRELOAD, FINAL_REMOVAL_DEVICE, FINAL_REMOVAL_MODEL, getBackgroundRemovalModule]);

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

    // Cap resolution for faster AI processing
    if (width > MAX_PROCESSING_WIDTH) {
      width = MAX_PROCESSING_WIDTH;
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
      const backgroundRemovalModule = await getBackgroundRemovalModule();
      const removeBackground = backgroundRemovalModule?.default || backgroundRemovalModule?.removeBackground;

      if (typeof removeBackground !== 'function') {
        throw new Error('Background removal API is unavailable.');
      }

      const config = {
        model: FINAL_REMOVAL_MODEL,
        device: FINAL_REMOVAL_DEVICE,
        proxyToWorker: true, // Offload to worker thread
        output: {
          format: 'image/png',
          quality: FINAL_OUTPUT_QUALITY,
          type: 'foreground'
        },
        progress: undefined // Disable progress callback for better performance
      };

      // Remove background using IMG.LY
      const foregroundBlob = await removeBackground(rawFrameBlob, config);

      // Composite the cutout with the selected background
      const finalCanvas = await composeForegroundWithBackground(foregroundBlob, dims);
      const finalBlob = await canvasToBlob(finalCanvas, FINAL_OUTPUT_MIME, FINAL_OUTPUT_QUALITY);
      
      // Show preview instead of downloading immediately
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
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


  const handleRetakeCapture = (): void => {
    setShowCapturePreview(false);
    setCapturePreviewBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden relative">

      {/* ── HEADER ── */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 bg-gradient-to-r from-[rgba(120,40,200,0.12)] to-[rgba(60,0,120,0.16)] border-b border-[rgba(168,85,247,0.20)] shrink-0">
        <button
          className="w-[125px] h-[125px] rounded-full flex items-center justify-center text-[#f0e6ff] bg-[rgba(60,0,120,0.5)] border-[4px] border-[#a855f7] transition-all duration-300 hover:bg-[rgba(168,85,247,0.22)] hover:text-white"
          style={{ boxShadow: '0 0 15px rgba(168,85,247,0.4), inset 0 0 10px rgba(168,85,247,0.4)' }}
          onClick={onBack}
        >
          <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 0 5px rgba(224,64,251,0.8))' }}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="font-[Arial] text-[10rem] uppercase tracking-[2px] text-[#f0e6ff] m-0">{category}</h1>
        <div style={{ width: 44 }} />
      </div>

      {/* ── CONTROLS ── */}
      <div className="relative z-30 flex flex-col items-center gap-5 px-[50px] py-4 mt-[20px] shrink-0">
        {/* Shutter button */}
        <button
          className="w-[150px] h-[150px] rounded-full p-[5px] transition-all duration-300 disabled:opacity-50 active:scale-[0.96] shutter-btn-animate"
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
          }}
          onClick={startPhotoProcess}
          disabled={timer > 0 || isProcessingCapture}
        >
          <div className="w-full h-full rounded-full" style={{ background: 'linear-gradient(135deg, #1e1430 0%, #130d1e 100%)', boxShadow: '0 0 24px rgba(168,85,247,0.45), inset 0 0 12px rgba(168,85,247,0.12)' }} />
        </button>

        {/* Timer dropdown */}
        <div className="relative mt-[50px]" ref={dropdownRef}>
          <button
            className="flex flex-col items-center min-w-[250px] px-6 py-4 rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.6)] text-[#f0e6ff] font-black transition-all duration-300 hover:bg-[rgba(168,85,247,0.18)] hover:text-white disabled:opacity-50"
            style={{ boxShadow: '0 0 8px rgba(168,85,247,0.18)', border: '1px solid #a855f7' }}
            onClick={() => setIsCountdownDropdownOpen((prev) => !prev)}
            disabled={timer > 0 || isProcessingCapture}
          >
            <small className="text-[1.1rem] text-[#b8a4d4] uppercase tracking-widest">TIMER</small>
            <strong className="text-[2rem]">{selectedCountdown}s</strong>
          </button>
          {isCountdownDropdownOpen && (
            <div className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-[120] flex flex-col min-w-[250px] rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.97)] overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(168,85,247,0.22)' }}>
              {[5, 10, 15, 20, 25, 30].map(v => (
                <button
                  key={v}
                  className={`w-full py-4 text-[1.5rem] font-semibold border-none transition-all duration-200 ${selectedCountdown === v ? 'bg-[rgba(168,85,247,0.15)] text-white' : 'text-[#a855f7] hover:bg-[rgba(168,85,247,0.15)] hover:text-white'}`}
                  onClick={() => { setSelectedCountdown(v); setIsCountdownDropdownOpen(false); }}
                >
                  {v}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CAMERA PREVIEW ── */}
      <div className="relative z-10 flex items-start justify-center relative px-[10px] mt-[10px]">
        <div style={{ width: previewDimensions.width, height: previewDimensions.height, position: 'relative', margin: '0 auto', flexShrink: 0 }}>
          <div className="relative rounded-[24px] overflow-hidden bg-black w-full h-full" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
            {/* Hidden Webcam */}
            <Webcam
              ref={webcamRef}
              style={{ display: 'none' }}
              width={frameDimensions.width}
              height={frameDimensions.height}
              videoConstraints={{ width: { ideal: 3840, min: 1920 }, height: { ideal: 2160, min: 1080 }, facingMode: "user" }}
            />
            {/* Main Display Canvas */}
            <canvas
              ref={canvasRef}
              width={frameDimensions.width}
              height={frameDimensions.height}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {isFlashing && <div className="screen-flash" />}
          </div>
          {timer > 0 && <div key={timer} className="countdown-text">{timer}</div>}
        </div>
      </div>

      {/* ── FRAME / BACKGROUND SELECTOR ── */}
      <div
        className="relative z-10 mt-[50px] mb-[50px] min-h-[160px] w-full overflow-x-auto"
        style={{ scrollbarWidth: 'none', cursor: isFrameDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        ref={frameScrollRef}
        onMouseDown={handleFrameDragStart}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="flex gap-[30px] min-w-full w-max mx-auto px-[40px] py-[28px]">
          {backgroundList.map((bg) => {
            const isSelected = activeBackgroundName === bg;
            return (
              <button
                key={bg}
                className={`h-[200px] w-auto shrink-0 rounded-sm overflow-hidden bg-transparent p-0 flex items-center justify-center transition-transform duration-200 ${
                  isSelected ? 'frame-item-selected border-[3px]' : 'border-[3px] border-transparent'
                }`}
                onClick={() => setTimeout(() => loadBackground(bg), 0)}
              >
                <img src={bg} alt={bg.split('/').pop() || 'Frame'} draggable="false" className="h-full w-auto object-contain block" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Processing overlay full screen */}
      {isProcessingCapture && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center flex-col bg-[#0c0812]" style={{ backdropFilter: 'blur(20px)' }}>
          <CubeSpinner />
          <div className="text-white text-[5rem] mt-5 font-bold tracking-widest z-10 pt-20" style={{ textShadow: '0 0 20px rgba(168,85,247,0.8)' }}>PROCESSING...</div>
        </div>
      )}

      {/* Hidden status readouts */}
      {processingTimeMs !== null && <p className="hidden">Processed in {(processingTimeMs / 1000).toFixed(2)}s</p>}
      {captureError && <p className="hidden">{captureError}</p>}

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

export default AIImageScreen;
