import { useState, useRef, useEffect, useCallback } from "react";
import { useCamera } from "../../../hooks/useCamera.ts";
import { v4 as uuidv4 } from "uuid";
import imageCompression from "browser-image-compression";
import PreviewScreen from "./PreviewScreen";
import type { ImageData, Frame } from "../../../types";

const ZOOM_OPTIONS = [1, 1.25, 1.5, 1.75, 2];

interface CaptureScreenProps {
  category?: string;
  frames?: Frame[];
  selectedFrame?: string;
  onSelectFrame?: (frameId: string) => void;
  onCapture?: (imageData: ImageData) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export const CaptureScreen = ({
  category = "children",
  frames = [],
  selectedFrame = "none",
  onSelectFrame = () => {},
  onCapture = () => {},
  onBack = () => {},
  isLoading: parentIsLoading = false,
}: CaptureScreenProps) => {
  const { videoRef, isInitialized, isLoading: cameraLoading, error: cameraError, restart } = useCamera();
  const isLoading = parentIsLoading || cameraLoading;

  const [timerDuration, setTimerDuration] = useState(5);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [isFrameDragging, setIsFrameDragging] = useState(false);
  const [frameDragStart, setFrameDragStart] = useState(0);
  const [frameDragStartScroll, setFrameDragStartScroll] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showTimerPopup, setShowTimerPopup] = useState(false);
  const [showZoomPopup, setShowZoomPopup] = useState(false);
  const [frameAspectRatio, setFrameAspectRatio] = useState(16 / 9);
  const [previewDimensions, setPreviewDimensions] = useState({ width: "80%", height: "auto" });
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [capturedImage, setCapturedImage] = useState<ImageData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const frameScrollRef = useRef<HTMLDivElement>(null);
  const countdownIntervalRef = useRef<any>(null);
  const timerWrapperRef = useRef<HTMLDivElement>(null);
  const zoomWrapperRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef<boolean>(true);
  /** Cache of pre-loaded Image objects keyed by frame id — avoids re-fetch on capture */
  const frameImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  /** Cache of computed {ratio, width, height} keyed by frame id — instant on revisit */
  const frameDimensionsCacheRef = useRef<Map<string, { ratio: number; w: string; h: string }>>(new Map());

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  /** Pre-load every frame image into the cache as soon as frames arrive */
  useEffect(() => {
    const cache = frameImageCacheRef.current;
    frames.forEach(frame => {
      if (!frame.image || cache.has(frame.id)) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = frame.image;
      // Store immediately — the browser will finish loading in the background
      cache.set(frame.id, img);
    });
  }, [frames]);

  useEffect(() => {
    if (!frameScrollRef.current || !selectedFrame) return;
    const track = frameScrollRef.current;
    const selected = track.querySelector('.frame-item-selected') as HTMLElement;
    if (selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedFrame]);

  const getCaptureDimensions = () => {
    const container = previewContainerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const containerWidth = Math.round(rect.width);
    const containerHeight = Math.round(rect.height);
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return { width: containerWidth, height: containerHeight };
    const aspect = containerWidth / containerHeight;
    let captureHeight = video.videoHeight;
    let captureWidth = captureHeight * aspect;
    if (captureWidth > video.videoWidth) { captureWidth = video.videoWidth; captureHeight = captureWidth / aspect; }
    return { width: Math.round(captureWidth), height: Math.round(captureHeight) };
  };

  const handleCaptureClick = async () => {
    if (isCapturing || !isInitialized) return;
    setIsCapturing(true);
    setShowCountdown(true);
    setCountdownValue(timerDuration);

    countdownIntervalRef.current = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);

    setTimeout(async () => {
      if (!isMountedRef.current) return;
      try {
        setShowCountdown(false);
        setIsProcessing(true);
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 600);

        const dimensions = getCaptureDimensions();
        if (!dimensions) throw new Error("Unable to determine capture size");

        const canvas = document.createElement("canvas");
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext("2d");
        const video = videoRef.current;
        if (!video) throw new Error("Video stream not available");

        const vWidth = video.videoWidth, vHeight = video.videoHeight;
        const cWidth = canvas.width, cHeight = canvas.height;
        const r_v = vWidth / vHeight, r_c = cWidth / cHeight;
        let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;
        if (r_v > r_c) { sWidth = vHeight * r_c; sx = (vWidth - sWidth) / 2; }
        else { sHeight = vWidth / r_c; sy = (vHeight - sHeight) / 2; }

        if (zoomLevel !== 1) {
          const zoomedSWidth = sWidth / Math.max(zoomLevel, 0.1);
          const zoomedSHeight = sHeight / Math.max(zoomLevel, 0.1);
          sx = sx + (sWidth - zoomedSWidth) / 2;
          sy = sy + (sHeight - zoomedSHeight) / 2;
          sWidth = zoomedSWidth; sHeight = zoomedSHeight;
        }

        if (ctx) {
          ctx.save();
          ctx.translate(cWidth, 0);
          ctx.scale(-1, 1);
          let dx = 0, dy = 0, dWidth = cWidth, dHeight = cHeight;
          if (zoomLevel < 1) { dWidth = cWidth * zoomLevel; dHeight = cHeight * zoomLevel; dx = (cWidth - dWidth) / 2; dy = (cHeight - dHeight) / 2; }
          ctx.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
          ctx.restore();
        }

        if (selectedFrame !== "none") {
          const frameEl = document.querySelector(".frame-layer") as HTMLImageElement;
          if (frameEl && frameEl.complete && ctx) {
            ctx.drawImage(frameEl, 0, 0, cWidth, cHeight);
          } else {
            const selectedFrameData = frames.find((f) => f.id === selectedFrame);
            if (selectedFrameData?.image) {
              // Use the pre-loaded cached Image if available
              const cachedImg = frameImageCacheRef.current.get(selectedFrame);
              const img = (cachedImg && cachedImg.complete) ? cachedImg : new Image();
              if (!cachedImg || !cachedImg.complete) {
                img.crossOrigin = "anonymous";
                await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("Failed to load frame")); img.src = selectedFrameData.image; });
              }
              ctx?.drawImage(img, 0, 0, cWidth, cHeight);
            }
          }
        }

        const initialBlob = await new Promise<Blob>((resolve) => { canvas.toBlob((blob) => resolve(blob as Blob), "image/jpeg", 0.92); });
        const fileId = uuidv4();
        const imageUrl = URL.createObjectURL(initialBlob);
        const initialImageState: ImageData = { url: imageUrl, blob: initialBlob, metadata: { id: fileId, frameId: selectedFrame, capturedAt: new Date().toISOString(), width: dimensions.width, height: dimensions.height, size: initialBlob.size, fileName: `${fileId}.jpg` } as any };

        let finalImageState = initialImageState;
        if (initialBlob.size > 6 * 1024 * 1024) {
          if (isMountedRef.current) setIsCompressing(true);
          try {
            const options = { maxSizeMB: 5, maxWidthOrHeight: 3840, useWebWorker: true, initialQuality: 0.88, alwaysKeepResolution: false, fileType: "image/jpeg" };
            const compressedBlob = await imageCompression(new File([initialBlob], "temp.jpg", { type: "image/jpeg" }), options);
            finalImageState = { ...finalImageState, blob: compressedBlob, url: URL.createObjectURL(compressedBlob), metadata: { ...finalImageState.metadata, size: compressedBlob.size } };
          } catch { /* use original */ } finally { if (isMountedRef.current) setIsCompressing(false); }
        }

        if (isMountedRef.current) { setCapturedImage(finalImageState); setIsProcessing(false); setShowPreview(true); }
      } catch (err) {
        alert((err as Error).message || "Failed to capture image. Please try again.");
        if (isMountedRef.current) setIsProcessing(false);
      } finally {
        if (isMountedRef.current) setIsCapturing(false);
      }
    }, timerDuration * 1000);
  };

  const handleRetake = () => {
    if (capturedImage?.url) URL.revokeObjectURL(capturedImage.url);
    setCapturedImage(null); setShowPreview(false); setIsCompressing(false);
  };

  const handleBack = () => {
    frameImageCacheRef.current.clear();
    frameDimensionsCacheRef.current.clear();
    onBack();
  };

  const handleFrameDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsFrameDragging(true);
    setFrameDragStart(e.clientX);
    setFrameDragStartScroll(frameScrollRef.current?.scrollLeft || 0);
  };

  const handleFrameDragMove = useCallback((e: MouseEvent) => {
    if (!frameScrollRef.current || !isFrameDragging) return;
    const diff = e.clientX - frameDragStart;
    const newScroll = frameDragStartScroll - diff;
    frameScrollRef.current.scrollLeft = newScroll;
    const container = frameScrollRef.current;
    const containerCenter = container.offsetWidth / 2;
    const centerFramePos = newScroll + containerCenter;
    let closestFrameId = selectedFrame, minDistance = Infinity;
    container.querySelectorAll(".frame-thumb-btn").forEach((btn, index) => {
      const btnCenter = (btn as HTMLElement).offsetLeft + (btn as HTMLElement).offsetWidth / 2;
      const distance = Math.abs(centerFramePos - btnCenter);
      if (distance < minDistance) { minDistance = distance; closestFrameId = frames[index]?.id; }
    });
    if (closestFrameId && closestFrameId !== selectedFrame && minDistance < 100) onSelectFrame(closestFrameId);
  }, [frameDragStart, frameDragStartScroll, selectedFrame, frames, onSelectFrame, isFrameDragging]);

  const handleFrameDragEnd = useCallback(() => setIsFrameDragging(false), []);

  useEffect(() => {
    if (frameScrollRef.current && selectedFrame && selectedFrame !== "none") {
      const container = frameScrollRef.current;
      const selectedBtn = container.querySelector(".frame-item-selected");
      if (selectedBtn) {
        setTimeout(() => {
          const containerWidth = container.offsetWidth;
          const btnLeft = (selectedBtn as HTMLElement).offsetLeft;
          const btnWidth = (selectedBtn as HTMLElement).offsetWidth;
          container.scrollTo({ left: Math.max(0, btnLeft + btnWidth / 2 - containerWidth / 2), behavior: "smooth" });
        }, 0);
      }
    }
  }, [selectedFrame]);

  useEffect(() => { if (frames.length > 0 && selectedFrame === "none") onSelectFrame(frames[0].id); }, [frames, selectedFrame, onSelectFrame]);

  useEffect(() => {
    if (selectedFrame === "none" || frames.length === 0) return;
    const selectedFrameObj = frames.find((f) => f.id === selectedFrame);
    if (!selectedFrameObj?.image) return;

    const applyDimensions = (ratio: number, w: string, h: string) => {
      setFrameAspectRatio(ratio);
      setPreviewDimensions({ width: w, height: h });
    };

    const computeAndApply = (imgW: number, imgH: number) => {
      if (!imgW || !imgH) return;
      const ratio = imgW / imgH;
      const maxW = window.innerWidth - 40;
      const maxH = window.innerHeight - 380;
      let targetW = maxW, targetH = targetW / ratio;
      if (targetH > maxH) { targetH = maxH; targetW = targetH * ratio; }
      if (targetH < 250) { targetH = 250; targetW = targetH * ratio; }
      const w = `${Math.round(targetW)}px`;
      const h = `${Math.round(targetH)}px`;
      frameDimensionsCacheRef.current.set(selectedFrame, { ratio, w, h });
      applyDimensions(ratio, w, h);
    };

    // 1. Instant path: dimensions already computed for this frame
    const cached = frameDimensionsCacheRef.current.get(selectedFrame);
    if (cached) { applyDimensions(cached.ratio, cached.w, cached.h); return; }

    // 2. Fast path: pre-loaded Image is ready — compute synchronously
    const cachedImg = frameImageCacheRef.current.get(selectedFrame);
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth) {
      computeAndApply(cachedImg.naturalWidth, cachedImg.naturalHeight);
      return;
    }

    // 3. Image still loading — wait on the existing cache entry
    if (cachedImg) {
      cachedImg.onload = () => computeAndApply(cachedImg.naturalWidth, cachedImg.naturalHeight);
      return;
    }

    // 4. Fallback: not in cache yet (shouldn't normally happen)
    const img = new Image();
    img.crossOrigin = 'anonymous';
    frameImageCacheRef.current.set(selectedFrame, img);
    img.onload = () => computeAndApply(img.naturalWidth, img.naturalHeight);
    img.src = selectedFrameObj.image;
  }, [selectedFrame, frames, windowSize]);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    let t: NodeJS.Timeout;
    const debounced = () => { clearTimeout(t); t = setTimeout(handleResize, 150); };
    window.addEventListener("resize", debounced);
    window.addEventListener("orientationchange", handleResize);
    return () => { window.removeEventListener("resize", debounced); window.removeEventListener("orientationchange", handleResize); clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (isFrameDragging) {
      window.addEventListener("mousemove", handleFrameDragMove);
      window.addEventListener("mouseup", handleFrameDragEnd);
      return () => { window.removeEventListener("mousemove", handleFrameDragMove); window.removeEventListener("mouseup", handleFrameDragEnd); };
    }
  }, [isFrameDragging, handleFrameDragMove, handleFrameDragEnd]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowTimerPopup(false); setShowZoomPopup(false); return; }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleCaptureClick(); }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isCapturing, showTimerPopup, showZoomPopup]);

  useEffect(() => () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTimerPopup && timerWrapperRef.current && !timerWrapperRef.current.contains(e.target as Node)) setShowTimerPopup(false);
      if (showZoomPopup && zoomWrapperRef.current && !zoomWrapperRef.current.contains(e.target as Node)) setShowZoomPopup(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTimerPopup, showZoomPopup]);

  return (
    <div className="flex flex-col w-screen h-screen overflow-hidden relative">

      {/* ── HEADER ── */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 bg-gradient-to-r from-[rgba(120,40,200,0.12)] to-[rgba(60,0,120,0.16)] border-b border-[rgba(168,85,247,0.20)] shrink-0">
        <button
          className="w-[125px] h-[125px] rounded-full flex items-center justify-center text-[#f0e6ff] bg-[rgba(60,0,120,0.5)] border-[4px] border-[#a855f7] transition-all duration-300 hover:bg-[rgba(168,85,247,0.22)] hover:text-white"
          style={{ boxShadow: '0 0 15px rgba(168,85,247,0.4), inset 0 0 10px rgba(168,85,247,0.4)' }}
          onClick={handleBack}
        >
          <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 0 5px rgba(224,64,251,0.8))' }}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="font-[Arial] text-[10rem] uppercase tracking-[2px] text-[#f0e6ff] m-0">{category}</h1>
        <div style={{ width: 44 }} />
      </div>

      {/* ── CONTROLS ── */}
      <div className="relative z-30 flex items-center justify-center gap-[100px] px-[50px] py-4 mt-[50px] mb-[50px] shrink-0">
        {/* Timer */}
        <div className="relative" ref={timerWrapperRef}>
          <button
            className="flex flex-col items-center min-w-[250px] px-6 py-4 rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.6)] text-[#f0e6ff] font-black transition-all duration-300 hover:bg-[rgba(168,85,247,0.18)] hover:text-white"
            style={{ boxShadow: '0 0 8px rgba(168,85,247,0.18)', border: '1px solid #a855f7' }}
            onClick={() => {
              setShowTimerPopup((prev) => !prev);
              setShowZoomPopup(false);
            }}
          >
            <small className="text-[1.1rem] text-[#b8a4d4] uppercase tracking-widest">TIMER</small>
            <strong className="text-[2rem]">{timerDuration}s</strong>
          </button>
          {showTimerPopup && (
            <div className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-[120] flex flex-col min-w-[250px] rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.97)] overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(168,85,247,0.22)' }}>
              {[0, 5, 10, 15, 20, 25, 30].map(v => (
                <button key={v} className={`w-full py-4 text-center text-[1.5rem] font-semibold border-none transition-all duration-200 ${timerDuration === v ? 'bg-[rgba(168,85,247,0.15)] text-white' : 'text-[#a855f7] hover:bg-[rgba(168,85,247,0.15)] hover:text-white'}`}
                  onClick={() => { setTimerDuration(v); setShowTimerPopup(false); }}>
                  {v === 0 ? "Off" : `${v}s`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Shutter button */}
        <button
          className="w-[150px] h-[150px] rounded-full p-[5px] transition-all duration-300 disabled:opacity-50 active:scale-[0.96] shutter-btn-animate"
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
          }}
          onClick={handleCaptureClick}
          disabled={isCapturing || isProcessing || !isInitialized}
        >
          <div className="w-full h-full rounded-full" style={{ background: 'linear-gradient(135deg, #1e1430 0%, #130d1e 100%)', boxShadow: '0 0 24px rgba(168,85,247,0.45), inset 0 0 12px rgba(168,85,247,0.12)' }} />
        </button>

        {/* Zoom */}
        <div className="relative" ref={zoomWrapperRef}>
          <button
            className="flex flex-col items-center min-w-[250px] px-6 py-4 rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.6)] text-[#f0e6ff] font-black transition-all duration-300 hover:bg-[rgba(168,85,247,0.18)] hover:text-white"
            style={{ boxShadow: '0 0 8px rgba(168,85,247,0.18)', border: '1px solid #a855f7' }}
            onClick={() => {
              setShowZoomPopup((prev) => !prev);
              setShowTimerPopup(false);
            }}
          >
            <small className="text-[1.1rem] text-[#b8a4d4] uppercase tracking-widest">ZOOM</small>
            <strong className="text-[2rem]">{zoomLevel}x</strong>
          </button>
          {showZoomPopup && (
            <div className="absolute top-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-[120] flex flex-col min-w-[250px] rounded-xl border border-[#a855f7] bg-[rgba(19,13,30,0.97)] overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(168,85,247,0.22)' }}>
              {ZOOM_OPTIONS.map(v => (
                <button key={v} className={`w-full py-4 text-center text-[1.5rem] font-semibold border-none transition-all duration-200 ${zoomLevel === v ? 'bg-[rgba(168,85,247,0.15)] text-white' : 'text-[#a855f7] hover:bg-[rgba(168,85,247,0.15)] hover:text-white'}`}
                  onClick={() => { setZoomLevel(v); setShowZoomPopup(false); }}>
                  {v}x
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CAMERA PREVIEW ── */}
      <div className="relative z-10 flex items-start justify-center relative px-[10px] mt-[10px]">
        <div style={{ width: previewDimensions.width, height: previewDimensions.height, position: 'relative', margin: '0 auto', flexShrink: 0 }}>
          <div className="relative rounded-[24px] overflow-hidden bg-black w-full h-full" style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} ref={previewContainerRef}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scaleX(-${zoomLevel}) scaleY(${zoomLevel})` }}
            />
            {selectedFrame !== "none" && (
              <img
                src={frames.find(f => f.id === selectedFrame)?.image}
                className="frame-layer"
                alt="frame"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', zIndex: 10 }}
              />
            )}
            {showFlash && <div className="screen-flash" />}
          </div>
          {showCountdown && (
            <div key={countdownValue} className="countdown-text">{countdownValue || "SMILE!"}</div>
          )}
        </div>
      </div>

      {/* ── FRAME SELECTOR ── */}
      <div className="relative z-10 mt-[50px] mb-[50px] min-h-[160px] w-full overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div
          className="flex gap-[30px] min-w-full w-max mx-auto px-[40px] py-[28px]"
          ref={frameScrollRef}
          onMouseDown={handleFrameDragStart}
          onWheel={(e) => { if (frameScrollRef.current) frameScrollRef.current.scrollLeft += e.deltaY; }}
          style={{ cursor: isFrameDragging ? "grabbing" : "grab", userSelect: "none" }}
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          {frames.map((frame) => {
            const isSelected = selectedFrame === frame.id;
            return (
              <button
                key={frame.id}
                className={`frame-thumb-btn h-[220px] w-auto shrink-0 rounded-sm overflow-hidden bg-transparent p-0 flex items-center justify-center transition-transform duration-200 ${isSelected ? 'frame-item-selected border-[3px]' : 'border-[3px] border-transparent'}`}
                onClick={() => setTimeout(() => onSelectFrame(frame.id), 0)}
              >
                <img src={frame.image} alt={frame.name} draggable="false" className="h-full w-auto object-contain block" />
              </button>
            );
          })}
        </div>
      </div>

      <PreviewScreen
        imageData={capturedImage}
        isVisible={showPreview}
        isLoading={isProcessing}
        onRetake={handleRetake}
        onContinue={(imgData) => { if (onCapture) onCapture(imgData); }}
        showAsOverlay={true}
      />
    </div>
  );
};

export default CaptureScreen;
