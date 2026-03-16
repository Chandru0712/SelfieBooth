import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { SelfieSegmentation, Results } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';
import { v4 as uuidv4 } from 'uuid';
import PreviewScreen from './PreviewScreen';
import CubeSpinner from '../../CubeSpinner';

interface AIImageScreenProps {
  category?: string;
  onBack?: () => void;
  onGenerate?: (imageData: any) => void;
  isLoading?: boolean;
}

type BgModuleLoader = () => Promise<{ default?: string } | string>;

function AIImageScreen({ category = 'Wild Life', onBack = () => {}, onGenerate, isLoading }: AIImageScreenProps): React.JSX.Element {
  // Segmentation tuning variables (change these and rebuild as needed)
  const MASK_THRESHOLD = 0.2; // 0.0 to 1.0 (lowered for better edge detection)
  const MASK_SOFTNESS = 0.1; // small transition band around threshold for smoother hair/edge detail
  const MASK_EDGE_BLUR_PX = 1;
  const FINAL_REMOVAL_MODEL = 'medium';
  const FINAL_OUTPUT_MIME = 'image/jpeg';
  const FINAL_OUTPUT_QUALITY = 0.98;
  const FLIP_HORIZONTAL = true; // mirror camera like a selfie
  const MEDIAPIPE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/';
  const MEDIAPIPE_ASSET_VERSION = '2026-02-16';
  const PROCESSING_WIDTH = 2560;
  const PROCESSING_HEIGHT = 1440;
  const MAX_EXPORT_WIDTH = 2560;
  const REMOVAL_MAX_DIMENSION = 1280;
  const CINEMATIC_BACKGROUND_FILTER = 'contrast(1.08) saturate(1.08) brightness(0.94)';
  const CINEMATIC_SUBJECT_FILTER = 'contrast(1.05) saturate(1.06) brightness(1.02)';
  const CINEMATIC_VIGNETTE_ALPHA = 0.24;
  const CINEMATIC_HIGHLIGHT_ALPHA = 0.12;

  const [timer, setTimer] = useState<number>(0);
  const [selectedCountdown, setSelectedCountdown] = useState<number>(5);
  const [isCountdownDropdownOpen, setIsCountdownDropdownOpen] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [isProcessingCapture, setIsProcessingCapture] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const [processingCountdownKey, setProcessingCountdownKey] = useState<number>(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [activeBackgroundName, setActiveBackgroundName] = useState<string | null>(null);
  const [backgroundList, setBackgroundList] = useState<string[]>([]);
  const [captureDimensions, setCaptureDimensions] = useState<{ width: number; height: number } | null>(null);
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
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingCountdownReelRef = useRef<HTMLDivElement | null>(null);
  const activeBackgroundRef = useRef<HTMLImageElement | null>(null);
  const rawMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const thresholdMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizedBackgroundCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSegmentationBusyRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingCallbacksRef = useRef<Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>>(new Map());
  const pendingCallbackIdRef = useRef<number>(0);
  const isCapturingRef = useRef(false);
  const processingStartRef = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const frameScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isProcessingCapture) return;

    const reel = processingCountdownReelRef.current;
    if (!reel) return;

    const STEP_HEIGHT = 56;
    reel.style.transform = 'translateY(0px)';

    const animation = reel.animate(
      [
        { transform: 'translateY(0px)' },
        { transform: `translateY(-${STEP_HEIGHT * 60}px)` },
      ],
      {
        duration: 60000,
        easing: 'steps(60, end)',
        fill: 'forwards',
      }
    );

    return () => {
      animation.cancel();
    };
  }, [isProcessingCapture, processingCountdownKey]);

  useEffect(() => {
    let cancelled = false;
    const loaders = import.meta.glob('../../../assets/Frames/WildLife/*.{webp,png}', {
      query: '?url'
    }) as Record<string, BgModuleLoader>;

    const loadBackgroundUrls = async (): Promise<void> => {
      const loaderList = Object.values(loaders);
      for (const loader of loaderList) {
        const loaded = await loader();
        if (cancelled) return;
        const nextUrl = (loaded as { default?: string }).default || (loaded as string);
        setBackgroundList((prev) => [...prev, nextUrl].sort());
      }
    };

    loadBackgroundUrls();
    return () => {
      cancelled = true;
    };
  }, []);

  // Function to load a new background (memoized)
  const loadBackground = useCallback((filename: string): void => {
    const img = new Image();
    img.decoding = 'async';
    img.src = filename;
    img.onload = (): void => {
      activeBackgroundRef.current = img; // Update active image used by draw loop
      setActiveBackgroundName(filename);
      // Update canvas dimensions based on frame size
      const frameWidth = img.naturalWidth || img.width;
      const frameHeight = img.naturalHeight || img.height;
      setFrameDimensions({ width: frameWidth, height: frameHeight });

      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = PROCESSING_WIDTH;
      resizedCanvas.height = PROCESSING_HEIGHT;
      const resizedCtx = resizedCanvas.getContext('2d');
      if (resizedCtx) {
        resizedCtx.drawImage(img, 0, 0, PROCESSING_WIDTH, PROCESSING_HEIGHT);
        resizedBackgroundCanvasRef.current = resizedCanvas;
      }
    };
    img.onerror = (): void => {
      console.error(`Failed to load background: ${filename}`);
    };
  }, [PROCESSING_HEIGHT, PROCESSING_WIDTH]);

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

  const blobToDrawable = async (blob: Blob): Promise<ImageBitmap | HTMLImageElement> => {
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(blob);
    }
    return await blobToImage(blob);
  };

  const closeDrawable = (drawable: ImageBitmap | HTMLImageElement): void => {
    if ('close' in drawable && typeof drawable.close === 'function') {
      drawable.close();
    }
  };

  const getRemovalDimensions = (dims: { width: number; height: number }): { width: number; height: number } => {
    const longestSide = Math.max(dims.width, dims.height);
    if (longestSide <= REMOVAL_MAX_DIMENSION) {
      return dims;
    }

    const scale = REMOVAL_MAX_DIMENSION / longestSide;
    return {
      width: Math.max(2, Math.round(dims.width * scale)),
      height: Math.max(2, Math.round(dims.height * scale)),
    };
  };

  const resizeBlob = async (blob: Blob, dims: { width: number; height: number }): Promise<Blob> => {
    const drawable = await blobToDrawable(blob);
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      closeDrawable(drawable);
      throw new Error('Could not create resize context.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawable, 0, 0, dims.width, dims.height);
    closeDrawable(drawable);
    return canvasToBlob(canvas, 'image/png', 1);
  };

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
    const videoAspect = video.videoWidth / video.videoHeight;
    const targetAspect = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;

    if (videoAspect > targetAspect) {
      sourceWidth = video.videoHeight * targetAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else {
      sourceHeight = video.videoWidth / targetAspect;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }

    frameCtx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    // Use PNG (lossless) as model input — avoids JPEG artefacts in the alpha mask
    return canvasToBlob(frameCanvas, 'image/png', 1);
  };

  const composeForegroundWithBackground = async (
    foregroundBlob: Blob,
    sourceBlob: Blob,
    dims: { width: number; height: number }
  ): Promise<HTMLCanvasElement> => {
    const [foregroundImage, sourceImage] = await Promise.all([
      blobToDrawable(foregroundBlob),
      blobToDrawable(sourceBlob),
    ]);
    
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
    const subjectCanvas = document.createElement('canvas');
    subjectCanvas.width = width;
    subjectCanvas.height = height;
    const subjectCtx = subjectCanvas.getContext('2d');
    if (!subjectCtx) {
      closeDrawable(foregroundImage);
      closeDrawable(sourceImage);
      throw new Error('Could not create subject context.');
    }

    subjectCtx.imageSmoothingEnabled = true;
    subjectCtx.imageSmoothingQuality = 'high';
    subjectCtx.filter = 'blur(0.6px)';
    subjectCtx.drawImage(foregroundImage, 0, 0, width, height);
    subjectCtx.filter = 'none';
    subjectCtx.globalCompositeOperation = 'source-in';
    subjectCtx.drawImage(sourceImage, 0, 0, width, height);
    subjectCtx.globalCompositeOperation = 'source-over';

    // Draw background first
    exportCtx.save();
    exportCtx.filter = CINEMATIC_BACKGROUND_FILTER;
    if (activeBackground) {
      exportCtx.drawImage(activeBackground, 0, 0, width, height);
    } else {
      exportCtx.fillStyle = '#00FF00';
      exportCtx.fillRect(0, 0, width, height);
    }
    exportCtx.restore();

    exportCtx.save();
    exportCtx.globalAlpha = 0.18;
    exportCtx.filter = 'blur(18px)';
    exportCtx.drawImage(subjectCanvas, 0, Math.round(height * 0.012), width, height);
    exportCtx.restore();

    // Draw full-resolution subject with a subtle cinematic grade.
    exportCtx.save();
    exportCtx.filter = CINEMATIC_SUBJECT_FILTER;
    exportCtx.drawImage(subjectCanvas, 0, 0, width, height);
    exportCtx.restore();

    const highlight = exportCtx.createRadialGradient(
      width * 0.5,
      height * 0.18,
      0,
      width * 0.5,
      height * 0.18,
      Math.max(width, height) * 0.8,
    );
    highlight.addColorStop(0, `rgba(255, 214, 168, ${CINEMATIC_HIGHLIGHT_ALPHA})`);
    highlight.addColorStop(0.45, 'rgba(255, 183, 120, 0.04)');
    highlight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    exportCtx.fillStyle = highlight;
    exportCtx.fillRect(0, 0, width, height);

    const vignette = exportCtx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      Math.min(width, height) * 0.22,
      width * 0.5,
      height * 0.45,
      Math.max(width, height) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.72, 'rgba(8, 7, 12, 0.04)');
    vignette.addColorStop(1, `rgba(6, 4, 10, ${CINEMATIC_VIGNETTE_ALPHA})`);
    exportCtx.fillStyle = vignette;
    exportCtx.fillRect(0, 0, width, height);

    closeDrawable(foregroundImage);
    closeDrawable(sourceImage);
    return exportCanvas;
  };

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
    const softnessByte = Math.max(1, Math.round(MASK_SOFTNESS * 255));
    const softStart = Math.max(0, thresholdByte - softnessByte);
    const softEnd = Math.min(255, thresholdByte + softnessByte);

    for (let i = 0; i < pixels.length; i += 4) {
      const confidence = pixels[i];
      let alpha = 0;
      if (confidence <= softStart) {
        alpha = 0;
      } else if (confidence >= softEnd) {
        alpha = 255;
      } else {
        alpha = Math.round(((confidence - softStart) / (softEnd - softStart)) * 255);
      }
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = alpha;
    }

    thresholdMaskCtx.clearRect(0, 0, width, height);
    thresholdMaskCtx.putImageData(maskImageData, 0, 0);
    return thresholdMaskCanvas;
  }, [MASK_THRESHOLD, MASK_SOFTNESS]);

  // 2. The Drawing Loop
  const onResults = useCallback((results: Results): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
    
    const resizedBackground = resizedBackgroundCanvasRef.current;
    const activeBackground = activeBackgroundRef.current;
    if (resizedBackground) {
      ctx.drawImage(resizedBackground, 0, 0, width, height);
    } else if (activeBackground) {
      ctx.drawImage(activeBackground, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#00FF00'; 
      ctx.fillRect(0, 0, width, height);
    }

    ctx.restore();
  }, [getThresholdMask, MASK_EDGE_BLUR_PX, FLIP_HORIZONTAL]);

  // 1. Initialize MediaPipe (Same as before)
  useEffect(() => {
    if (!isCameraActive) return;

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
    let rafId: number | null = null;

    const startCameraWhenReady = (): void => {
      if (cancelled) return;
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2) {
        rafId = requestAnimationFrame(startCameraWhenReady);
        return;
      }

      camera = new Camera(video, {
        onFrame: async (): Promise<void> => {
          if (cancelled || !isActive || isSegmentationBusyRef.current) return;
          const frame = webcamRef.current?.video;
          if (frame) {
            isSegmentationBusyRef.current = true;
            try {
              await selfieSegmentation.send({ image: frame });
            } finally {
              isSegmentationBusyRef.current = false;
            }
          }
        },
        width: PROCESSING_WIDTH,
        height: PROCESSING_HEIGHT
      });
      camera.start();
    };

    startCameraWhenReady();
    
    return () => {
      cancelled = true;
      isActive = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (camera) camera.stop();
      if (typeof selfieSegmentation.close === 'function') {
        selfieSegmentation.close();
      }
    };
  }, [isCameraActive, PROCESSING_HEIGHT, PROCESSING_WIDTH, onResults]);

  // Initialise Web Worker once — all ONNX inference runs off the main thread.
  useEffect(() => {
    const worker = new Worker(
      new URL('../../../workers/bgRemoval.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent) => {
      const { id, type, arrayBuffer, mimeType, error } = e.data;
      const cb = pendingCallbacksRef.current.get(id);
      if (!cb) return;
      pendingCallbacksRef.current.delete(id);
      if (type === 'remove_ok') {
        cb.resolve(new Blob([arrayBuffer], { type: mimeType }));
      } else {
        cb.reject(new Error(error ?? 'Background removal failed'));
      }
    };

    worker.onerror = (e) => console.error('bgRemoval worker error:', e);
    workerRef.current = worker;

    // Warm-up: pre-load ONNX model in the worker while user sees live preview.
    worker.postMessage({ id: 0, type: 'preload', model: 'medium' });

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingCallbacksRef.current.forEach((cb) => cb.reject(new Error('Worker terminated')));
      pendingCallbacksRef.current.clear();
    };
  }, []);

  const removeBackgroundInWorker = useCallback(async (blob: Blob): Promise<Blob> => {
    return new Promise(async (resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Background removal worker unavailable.'));
        return;
      }
      const id = ++pendingCallbackIdRef.current;
      pendingCallbacksRef.current.set(id, { resolve, reject });
      const arrayBuffer = await blob.arrayBuffer();
      workerRef.current.postMessage(
        {
          id,
          type: 'remove',
          arrayBuffer,
          mimeType: blob.type,
          config: {
            model: FINAL_REMOVAL_MODEL,
            device: 'cpu',
            output: { format: 'image/png', quality: 1, type: 'foreground' },
          },
        },
        [arrayBuffer],
      );
    });
  }, [FINAL_REMOVAL_MODEL]);

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
    if (timer > 0 || isProcessingCapture) return;
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setTimer(selectedCountdown); // Start at selected countdown value

    countdownIntervalRef.current = setInterval((): void => {
      setTimer((prev) => {
        if (prev === 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          captureAndSave();
          return 0; // Reset timer
        }
        return prev - 1;
      });
    }, 1000);
  };

  const getCaptureDimensions = (): { width: number; height: number } => {
    const video = webcamRef.current?.video;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return { width: PROCESSING_WIDTH, height: PROCESSING_HEIGHT };
    }
    const aspect =
      frameDimensions.width && frameDimensions.height
        ? frameDimensions.width / frameDimensions.height
        : video.videoWidth / video.videoHeight;

    let width = Math.min(video.videoWidth, MAX_EXPORT_WIDTH);
    let height = Math.round(width / aspect);

    if (height > video.videoHeight) {
      height = video.videoHeight;
      width = Math.round(height * aspect);
    }

    return { width: Math.round(width), height: Math.round(height) };
  };

  const captureAndSave = async (): Promise<void> => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    const previewCanvas = canvasRef.current;
    if (!previewCanvas) { isCapturingRef.current = false; return; }

    // Step 1: Trigger the white camera flash
    setIsFlashing(true);
    setCaptureError(null);
    setProcessingTimeMs(null);

    // Step 2: Wait for flash animation to complete (300ms), then show processing overlay
    await new Promise(resolve => setTimeout(resolve, 0));
    setIsFlashing(false);
    setIsProcessingCapture(true);
    setProcessingCountdownKey((prev) => prev + 1);

    processingStartRef.current = performance.now();

    try {
      await waitForPaint();

      const dims = getCaptureDimensions();
      setCaptureDimensions(dims);

      const rawFrameBlob = await captureRawVideoFrameBlob(dims);
      const removalInputBlob = await resizeBlob(rawFrameBlob, getRemovalDimensions(dims));

      // Pause camera feed while heavy background-removal inference runs in the Worker.
      setIsCameraActive(false);

      // Run ONNX inference off the main thread — prevents "Page Unresponsive" dialog.
      const foregroundBlob = await removeBackgroundInWorker(removalInputBlob);

      // Composite the cutout with the selected background
      const finalCanvas = await composeForegroundWithBackground(foregroundBlob, rawFrameBlob, dims);
      const finalBlob = await canvasToBlob(finalCanvas, FINAL_OUTPUT_MIME, FINAL_OUTPUT_QUALITY);
      
      // Show preview instead of downloading immediately
      setCapturePreviewBlob(finalBlob);
      setPreviewUrl(URL.createObjectURL(finalBlob));
      setShowCapturePreview(true);
    } catch (error) {
      console.error('Foreground capture failed.', error);
      setCaptureError('Masking failed. Please try again.');
    } finally {
      isCapturingRef.current = false;
      setIsCameraActive(true);
      setIsProcessingCapture(false);
      if (processingStartRef.current !== null) {
        setProcessingTimeMs(Math.round(performance.now() - processingStartRef.current));
        processingStartRef.current = null;
      }
    }
  };


  const handleRetakeCapture = (): void => {
    setIsCameraActive(true);
    setShowCapturePreview(false);
    setCapturePreviewBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const previewImageData = React.useMemo(() => {
    if (!capturePreviewBlob || !previewUrl) return null;
    const dims = captureDimensions || getCaptureDimensions();
    const id = uuidv4();
    return {
      url: previewUrl,
      blob: capturePreviewBlob,
      metadata: {
        id,
        frameId: '',
        capturedAt: new Date().toISOString(),
        width: dims.width,
        height: dims.height,
        size: capturePreviewBlob.size,
        fileName: `${id}.jpg`,
      },
    };
  }, [capturePreviewBlob, previewUrl, captureDimensions]);

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
      <div className="relative z-[50] flex flex-col items-center gap-5 px-[50px] py-4 mt-[20px] shrink-0">
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
            onClick={() => setIsCountdownDropdownOpen(!isCountdownDropdownOpen)}
            disabled={timer > 0 || isProcessingCapture}
          >
            <small className="text-[1.1rem] text-[#b8a4d4] uppercase tracking-widest">TIMER</small>
            <strong className="text-[2rem]">{selectedCountdown}s</strong>
          </button>
          {isCountdownDropdownOpen && (
            <div className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 flex flex-col min-w-[250px] rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.97)] overflow-hidden" style={{ zIndex: 9999, boxShadow: '0 8px 32px rgba(168,85,247,0.22)' }}>
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
      <div className="relative z-10 flex items-start justify-center px-[10px] mt-[10px]">
        <div style={{ width: previewDimensions.width, height: previewDimensions.height, position: 'relative', margin: '0 auto', flexShrink: 0 }}>
          <div className="relative rounded-[24px] overflow-hidden bg-black w-full h-full" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
            {/* Hidden Webcam – unmounts during processing to physically turn off camera */}
            {isCameraActive && (
              <Webcam
                ref={webcamRef}
                style={{ display: 'none' }}
                width={PROCESSING_WIDTH}
                height={PROCESSING_HEIGHT}
                videoConstraints={{ width: { ideal: PROCESSING_WIDTH }, height: { ideal: PROCESSING_HEIGHT }, facingMode: "user" }}
              />
            )}
            {/* Main Display Canvas */}
            <canvas
              ref={canvasRef}
              width={PROCESSING_WIDTH}
              height={PROCESSING_HEIGHT}
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
                <img src={bg} alt={bg.split('/').pop() || 'Frame'} draggable="false" loading="lazy" decoding="async" className="h-full w-auto object-contain block" />
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
          <div className="z-10 mt-8 overflow-hidden" style={{ height: '56px' }}>
            <div
              ref={processingCountdownReelRef}
              className="text-white text-[3rem] font-bold tracking-wider"
              style={{
                textShadow: '0 0 16px rgba(168,85,247,0.7)',
                willChange: 'transform',
              }}
            >
              {Array.from({ length: 61 }, (_, i) => 60 - i).map((value) => (
                <div key={value} className="h-[56px] leading-[56px] text-center">
                  {value}s
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden status readouts */}
      {processingTimeMs !== null && <p className="hidden">Processed in {(processingTimeMs / 1000).toFixed(2)}s</p>}
      {captureError && <p className="hidden">{captureError}</p>}

      <PreviewScreen
        imageData={previewImageData}
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