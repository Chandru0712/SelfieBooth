import { useState, useRef, useEffect, useCallback } from "react";
import { useCamera } from "../../../hooks/useCamera.ts";
import { v4 as uuidv4 } from "uuid";
import imageCompression from "browser-image-compression";
import PreviewScreen from "./PreviewScreen";
import type { ImageData, Frame } from "../../../types";
import "../styles/screens.css";

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

  // Local state
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const getCaptureDimensions = () => {
    const container = previewContainerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const containerWidth = Math.round(rect.width);
    const containerHeight = Math.round(rect.height);
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return { width: containerWidth, height: containerHeight };
    }
    
    // Capture at the highest native camera resolution that matches the frame's aspect ratio
    const aspect = containerWidth / containerHeight;
    let captureHeight = video.videoHeight;
    let captureWidth = captureHeight * aspect;

    // If the required width exceeds the camera's max width, scale by width instead
    if (captureWidth > video.videoWidth) {
      captureWidth = video.videoWidth;
      captureHeight = captureWidth / aspect;
    }
    
    return { width: Math.round(captureWidth), height: Math.round(captureHeight) };
  };

  const handleCaptureClick = async () => {
    if (isCapturing || !isInitialized) return;

    setIsCapturing(true);
    setShowCountdown(true);
    setCountdownValue(timerDuration);

    countdownIntervalRef.current = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setTimeout(async () => {
      if (!isMountedRef.current) return;
      try {
        setShowCountdown(false);
        setIsProcessing(true); // Disable the shutter immediately so they can't spam it during capture rendering.
        console.log("📸 Timer finished, generating snapshot...");
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

        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        const cWidth = canvas.width;
        const cHeight = canvas.height;

        const r_v = vWidth / vHeight;
        const r_c = cWidth / cHeight;

        let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;

        if (r_v > r_c) {
          sWidth = vHeight * r_c;
          sx = (vWidth - sWidth) / 2;
        } else {
          sHeight = vWidth / r_c;
          sy = (vHeight - sHeight) / 2;
        }

        if (zoomLevel !== 1) {
          const zoomedSWidth = sWidth / Math.max(zoomLevel, 0.1);
          const zoomedSHeight = sHeight / Math.max(zoomLevel, 0.1);

          sx = sx + (sWidth - zoomedSWidth) / 2;
          sy = sy + (sHeight - zoomedSHeight) / 2;
          sWidth = zoomedSWidth;
          sHeight = zoomedSHeight;
        }

        if (ctx) {
          ctx.save();
          ctx.translate(cWidth, 0);
          ctx.scale(-1, 1);
          let dx = 0, dy = 0, dWidth = cWidth, dHeight = cHeight;

          if (zoomLevel < 1) {
             dWidth = cWidth * zoomLevel;
             dHeight = cHeight * zoomLevel;
             dx = (cWidth - dWidth) / 2;
             dy = (cHeight - dHeight) / 2;
          }

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
              const img = new Image();
              img.crossOrigin = "anonymous";
              await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("Failed to load frame"));
                img.src = selectedFrameData.image;
              });
              ctx?.drawImage(img, 0, 0, cWidth, cHeight);
            }
          }
        }

        const initialBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob as Blob), "image/jpeg", 0.95);
        });
        
        const fileId = uuidv4();
        const imageUrl = URL.createObjectURL(initialBlob);
        
        const initialImageState: ImageData = {
          url: imageUrl,
          blob: initialBlob,
          metadata: {
            id: fileId,
            frameId: selectedFrame,
            capturedAt: new Date().toISOString(),
            width: dimensions.width,
            height: dimensions.height,
            size: initialBlob.size,
            fileName: `${fileId}.jpg`,
          } as any,
        };

        let finalImageState = initialImageState;
        console.log("🖼️ Initial blob generated. Size:", initialBlob.size, "- Checking if compression is needed.");

        if (initialBlob.size > 8 * 1024 * 1024) {
          if (isMountedRef.current) setIsCompressing(true);
          try {
            const options = {
              maxSizeMB: 8,
              maxWidthOrHeight: 4000,
              useWebWorker: true,
              initialQuality: 0.95,
              alwaysKeepResolution: true,
              fileType: "image/jpeg",
            };
            const compressedBlob = await imageCompression(new File([initialBlob], "temp.jpg", { type: "image/jpeg" }), options);
            finalImageState = {
              ...finalImageState,
              blob: compressedBlob,
              url: URL.createObjectURL(compressedBlob),
              metadata: {
                ...finalImageState.metadata,
                size: compressedBlob.size,
              }
            };
          } catch (compError) {
            console.warn("Compression failed, using fallback original:", compError);
          } finally {
            if (isMountedRef.current) setIsCompressing(false);
          }
        }

        console.log("✅ Processing complete, saving photo and rendering Preview Overlay:", finalImageState.metadata.fileName);

        if (isMountedRef.current) {
          setCapturedImage(finalImageState);
          setIsProcessing(false);
          setShowPreview(true);
        }
      } catch (err) {
        console.error("❌ Capture failed:", err);
        alert((err as Error).message || "Failed to capture image. Please try again.");
        if (isMountedRef.current) setIsProcessing(false);
      } finally {
        if (isMountedRef.current) setIsCapturing(false);
      }
    }, timerDuration * 1000);
  };

  const handleRetake = () => {
    if (capturedImage?.url) {
      URL.revokeObjectURL(capturedImage.url);
    }
    setCapturedImage(null);
    setShowPreview(false);
    setIsCompressing(false);
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
      const visibleStart = newScroll;
      const centerFramePos = visibleStart + containerCenter;

      let closestFrameId = selectedFrame;
      let minDistance = Infinity;

      const buttons = container.querySelectorAll(".frame-item");
      buttons.forEach((btn, index) => {
        const btnCenter = (btn as HTMLElement).offsetLeft + (btn as HTMLElement).offsetWidth / 2;
        const distance = Math.abs(centerFramePos - btnCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestFrameId = frames[index]?.id;
        }
      });

      if (closestFrameId && closestFrameId !== selectedFrame && minDistance < 100) {
        onSelectFrame(closestFrameId);
      }
    }, [frameDragStart, frameDragStartScroll, selectedFrame, frames, onSelectFrame, isFrameDragging]);

  const handleFrameDragEnd = useCallback(() => {
    setIsFrameDragging(false);
  }, []);

  useEffect(() => {
    if (frameScrollRef.current && selectedFrame && selectedFrame !== "none") {
      const container = frameScrollRef.current;
      const selectedBtn = container.querySelector(".frame-item.is-selected");
      if (selectedBtn) {
        setTimeout(() => {
          const containerWidth = container.offsetWidth;
          const btnLeft = (selectedBtn as HTMLElement).offsetLeft;
          const btnWidth = (selectedBtn as HTMLElement).offsetWidth;
          const targetScroll = btnLeft + btnWidth / 2 - containerWidth / 2;
          container.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
        }, 0);
      }
    }
  }, [selectedFrame]);

  useEffect(() => {
    if (frames.length > 0 && selectedFrame === "none") {
      onSelectFrame(frames[0].id);
    }
  }, [frames, selectedFrame, onSelectFrame]);

  useEffect(() => {
    if (selectedFrame === "none") {
      return;
    }

    if (frames.length > 0) {
      const selectedFrameObj = frames.find((f) => f.id === selectedFrame);
      if (selectedFrameObj?.image) {
        
        const computeDimensions = (frameWidth: number, frameHeight: number) => {
          if (!frameWidth || !frameHeight) return;
          const ratio = frameWidth / frameHeight;
          setFrameAspectRatio(ratio);

          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;

          // Dedicate padding and pixel headroom for Header (100) + Controls (80) + Track (200)
          const verticalReserve = 380;
          const horizontalPadding = 40;

          const maxW = screenWidth - horizontalPadding;
          const maxH = screenHeight - verticalReserve;

          // Start with max available width
          let targetW = maxW;
          let targetH = targetW / ratio;

          // If the resulting scale forces it too tall, scale via height instead
          if (targetH > maxH) {
            targetH = maxH;
            targetW = targetH * ratio;
          }

          // Safety minimum sizing to prevent disappearing elements on tight monitors
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

        // Fast path for natively loaded DOM image
        const cachedImgEl = document.querySelector(`img[src="${selectedFrameObj.image}"]`) as HTMLImageElement;
        if (cachedImgEl && cachedImgEl.naturalWidth && cachedImgEl.naturalHeight) {
           computeDimensions(cachedImgEl.naturalWidth, cachedImgEl.naturalHeight);
        } else {
          // Slow path fallback decode
          const img = new Image();
          img.onload = () => computeDimensions(img.naturalWidth, img.naturalHeight);
          img.onerror = () => console.error("Failed to load frame image for dimensions.");
          img.src = selectedFrameObj.image;
        }
      }
    }
  }, [selectedFrame, frames, windowSize]);

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 150);
    };
    window.addEventListener("resize", debouncedResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", debouncedResize);
      window.removeEventListener("orientationchange", handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  useEffect(() => {
    if (isFrameDragging) {
      window.addEventListener("mousemove", handleFrameDragMove);
      window.addEventListener("mouseup", handleFrameDragEnd);
      return () => {
        window.removeEventListener("mousemove", handleFrameDragMove);
        window.removeEventListener("mouseup", handleFrameDragEnd);
      };
    }
  }, [isFrameDragging, handleFrameDragMove, handleFrameDragEnd]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowTimerPopup(false);
        setShowZoomPopup(false);
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleCaptureClick();
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isCapturing, showTimerPopup, showZoomPopup, handleCaptureClick]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTimerPopup && timerWrapperRef.current && !timerWrapperRef.current.contains(e.target as Node)) {
        setShowTimerPopup(false);
      }
      if (showZoomPopup && zoomWrapperRef.current && !zoomWrapperRef.current.contains(e.target as Node)) {
        setShowZoomPopup(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTimerPopup, showZoomPopup]);

  return (
    <div className="capture-screen-modern">
      {/* SECTION 1: Top Header */}
      <div className="layout-header">
        <button className="back-circle-btn" onClick={onBack}>
          <svg width="75" height="75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="category-title">{category}</h1>
        <div style={{ width: 44 }} /> 
      </div>

      {/* SECTION 2: Control Panel (Timer, Capture, Zoom) */}
      <div className="layout-controls">
        <div className="control-group" ref={timerWrapperRef}>
          <button className="sub-control-btn" onClick={() => setShowTimerPopup(!showTimerPopup)}>
            <small>TIMER</small>
            <strong>{timerDuration}s</strong>
          </button>
          {showTimerPopup && (
            <div className="popup-overlay">
              {[0, 5, 10, 15, 20, 25, 30].map(v => (
                <button 
                  key={v} 
                  className={timerDuration === v ? "active-option" : ""}
                  onClick={() => {setTimerDuration(v); setShowTimerPopup(false);}}
                >
                  {v === 0 ? "Off" : `${v}s`}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="main-shutter-btn" onClick={handleCaptureClick} disabled={isCapturing || isProcessing || !isInitialized}>
          <div className="shutter-inner" />
        </button>

        <div className="control-group" ref={zoomWrapperRef}>
          <button className="sub-control-btn" onClick={() => setShowZoomPopup(!showZoomPopup)}>
            <small>ZOOM</small>
            <strong>{zoomLevel}x</strong>
          </button>
          {showZoomPopup && (
            <div className="popup-overlay">
              {ZOOM_OPTIONS.map(v => (
                <button 
                  key={v} 
                  className={zoomLevel === v ? "active-option" : ""}
                  onClick={() => {setZoomLevel(v); setShowZoomPopup(false);}}
                >
                  {v}x
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
            ref={previewContainerRef}
            style={{ width: "100%", height: "100%" }}
          >
            <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ 
              width: "100%", 
              height: "100%", 
              objectFit: "cover",
              transform: `scaleX(-${zoomLevel}) scaleY(${zoomLevel})` 
            }}
          />
          {selectedFrame !== "none" && (
            <img 
              src={frames.find(f => f.id === selectedFrame)?.image} 
              className="frame-layer" 
              alt="frame" 
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "fill",
                objectPosition: "center",
                pointerEvents: "none",
                zIndex: 10,
              }}
            />
          )}
            {showFlash && <div className="screen-flash" />}
          </div>
          {showCountdown && <div key={countdownValue} className="countdown-text">{countdownValue || "SMILE!"}</div>}
        </div>
      </div>
      {/* SECTION 4: Frame Selector */}
      <div className="layout-frame-selector">
        <div 
          className="frame-track" 
          ref={frameScrollRef}
          onMouseDown={handleFrameDragStart}
          onWheel={(e) => {
            if (frameScrollRef.current) {
              frameScrollRef.current.scrollLeft += e.deltaY;
            }
          }}
          style={{ cursor: isFrameDragging ? "grabbing" : "grab", userSelect: "none" }}
          draggable="false"
          onDragStart={(e) => e.preventDefault()}
        >
          {frames.map((frame) => (
            <button
              key={frame.id}
              className={`frame-item ${selectedFrame === frame.id ? "is-selected" : ""}`}
              onClick={() => setTimeout(() => onSelectFrame(frame.id), 0)}
            >
              <img src={frame.image} alt={frame.name} draggable="false" />
            </button>
          ))}
        </div>
      </div>

      <PreviewScreen
        imageData={capturedImage}
        isVisible={showPreview}
        isLoading={isProcessing}
        onRetake={handleRetake}
        onContinue={(imgData) => {
          if (onCapture) onCapture(imgData);
        }}
        showAsOverlay={true}
      />
    </div>
  );
};

export default CaptureScreen;