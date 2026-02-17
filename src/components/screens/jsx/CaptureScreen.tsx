/**
 * ========================================
 * CAPTURE SCREEN COMPONENT
 * ========================================
 *
 * Phase 1 MVP: US-010, 011, 012, 013
 * Main capture interface with camera preview, frame selection, and capture controls
 *
 * STRUCTURE:
 * 1. IMPORTS & SETUP
 * 2. STATE MANAGEMENT (Lines 28-60)
 * 3. FRAME LOGIC (Lines 375-510)
 *    - Frame aspect ratio calculation
 *    - Frame selection handling
 *    - Window resize handling
 * 4. CAPTURE LOGIC (Lines 115-290)
 *    - Canvas rendering
 *    - Image capture
 *    - Flash/countdown
 * 5. FRAME DRAG LOGIC (Lines 296-353)
 *    - Drag start/move/end handlers
 *    - Auto-scroll logic
 * 6. JSX RETURN - Main UI (Lines 593~)
 *    - Header section
 *    - Preview container
 *    - Frame selector (TOP)
 *    - Control panel (TOP)
 *    - Preview overlay
 * ========================================
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useCamera } from "../../../hooks/useCamera.ts";
import { APP_CONFIG } from "../../../constants.ts";
import type { ImageData, Frame } from "../../../types";
import { v4 as uuidv4 } from "uuid";
import imageCompression from "browser-image-compression";
import "../styles/screens.css";

interface CaptureScreenProps {
  category?: string;
  frames?: Frame[];
  selectedFrame?: string;
  onSelectFrame?: (frameId: string) => void;
  onCapture?: (imageData: ImageData) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

const ZOOM_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

export const CaptureScreen = ({
  category = "children",
  frames = [],
  selectedFrame = "none",
  onSelectFrame = () => {},
  onCapture = () => {},
  onBack = () => {},
  isLoading: parentIsLoading = false,
}: CaptureScreenProps) => {
  // ========== 1. CAMERA HOOK & INITIALIZATION ==========
  const {
    videoRef,
    isInitialized,
    isLoading: cameraLoading,
    error: cameraError,
    restart,
  } = useCamera();

  const isLoading = parentIsLoading || cameraLoading;

  // ========== 2. STATE MANAGEMENT ==========
  // Local state
  const [timerDuration, setTimerDuration] = useState(3);
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
  const [previewDimensions, setPreviewDimensions] = useState({
    width: "100%",
    height: "auto",
  });
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [capturedImage, setCapturedImage] = useState<ImageData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const frameScrollRef = useRef<HTMLDivElement>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerWrapperRef = useRef<HTMLDivElement>(null);
  const zoomWrapperRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const getCaptureDimensions = () => {
    // Get exact visual dimensions from preview container
    const container = previewContainerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    // Use container's exact pixel dimensions
    const containerWidth = Math.round(rect.width);
    const containerHeight = Math.round(rect.height);

    // Get actual video dimensions
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      // Fallback if video not ready
      return { width: containerWidth, height: containerHeight };
    }

    // Return exact container dimensions (what you see on screen)
    // This ensures captured image matches preview exactly
    return {
      width: containerWidth,
      height: containerHeight,
    };
  };

  // ========== 3. CAPTURE LOGIC ==========
  /**
   * Handle capture button click
   * Starts timer countdown then captures image
   */
  const [isCompressing, setIsCompressing] = useState(false);

  // ... (existing hooks)

  const handleCaptureClick = async () => {
    if (isCapturing || !isInitialized) return;

    setIsCapturing(true);
    setShowCountdown(true);
    setCountdownValue(timerDuration);

    // Countdown
    countdownIntervalRef.current = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // After timer, capture image
    setTimeout(async () => {
      try {
        setShowCountdown(false);

        // Show flash immediately
        setShowFlash(true);
        setTimeout(() => {
          setShowFlash(false);
        }, 600);

        const dimensions = getCaptureDimensions();
        if (!dimensions) throw new Error("Unable to determine capture size");

        // Create canvas for final composition
        const canvas = document.createElement("canvas");
        canvas.width = dimensions.width;
        canvas.height = dimensions.height;
        const ctx = canvas.getContext("2d");

        // 1. Draw Video Layer (Optimized)
        const video = videoRef.current;
        if (!video) throw new Error("Video stream not available");

        const vWidth = video.videoWidth;
        const vHeight = video.videoHeight;
        const cWidth = canvas.width;
        const cHeight = canvas.height;

        const r_v = vWidth / vHeight;
        const r_c = cWidth / cHeight;

        let sx = 0,
          sy = 0,
          sWidth = vWidth,
          sHeight = vHeight;

        if (r_v > r_c) {
          sWidth = vHeight * r_c;
          sx = (vWidth - sWidth) / 2;
        } else {
          sHeight = vWidth / r_c;
          sy = (vHeight - sHeight) / 2;
        }

        if (zoomLevel !== 1) {
          const zoomedSWidth = sWidth / zoomLevel;
          const zoomedSHeight = sHeight / zoomLevel;

          sx = sx + (sWidth - zoomedSWidth) / 2;
          sy = sy + (sHeight - zoomedSHeight) / 2;
          sWidth = zoomedSWidth;
          sHeight = zoomedSHeight;
        }

        if (ctx) {
          ctx.save();
          // We need to mirror around the center of the canvas
          ctx.translate(cWidth, 0);
          ctx.scale(-1, 1);
          
          let dx = 0,
            dy = 0,
            dWidth = cWidth,
            dHeight = cHeight;

          // Recalculate draw dimensions for Zoom Out (< 1)
          // Zoom In (>= 1) is handled by source cropping (sx, sy, sWidth, sHeight) earlier
          if (zoomLevel < 1) {
             dWidth = cWidth * zoomLevel;
             dHeight = cHeight * zoomLevel;
             dx = (cWidth - dWidth) / 2;
             dy = (cHeight - dHeight) / 2;
          }

          ctx.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
          ctx.restore();
        }

        // 2. Draw Frame Overlay (NOT mirrored - frame stays in normal orientation)
        if (selectedFrame !== "none") {
          const frameEl = document.querySelector(
            ".frame-overlay",
          ) as HTMLImageElement;
          if (frameEl && frameEl.complete && ctx) {
            ctx.drawImage(frameEl, 0, 0, cWidth, cHeight);
          } else {
            const selectedFrameData = frames.find(
              (f) => f.id === selectedFrame,
            );
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

        // 3. Export Initial Image (Fast - JPEG)
        const initialBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob(
            (blob) => {
              resolve(blob as Blob);
            },
            "image/jpeg",
            0.95,
          );
        });
        const fileId = uuidv4();

        // Show preview IMMEDIATELY with uncompressed image
        const imageUrl = URL.createObjectURL(initialBlob);
        const initialImageState = {
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
          },
        };

        setCapturedImage(initialImageState);
        setIsProcessing(false);
        setShowPreview(true);

        // 4. Compress in Background if needed (Max 2MB)
        if (initialBlob.size > 2 * 1024 * 1024) {
          setIsCompressing(true);
          console.log(
            `Original size: ${(initialBlob.size / 1024 / 1024).toFixed(2)} MB. Starting background compression...`,
          );

          // Wrap in async immediately to let main thread continue
          (async () => {
            try {
              const options = {
                maxSizeMB: 2,
                useWebWorker: true,
                initialQuality: 0.9,
                alwaysKeepResolution: true,
                fileType: "image/jpeg",
              };

              const compressedBlob = await imageCompression(
                new File([initialBlob], "temp.jpg", { type: "image/jpeg" }),
                options,
              );
              console.log(
                `Compressed size: ${(compressedBlob.size / 1024 / 1024).toFixed(2)} MB`,
              );

              // Update state only if we still have the same image
              setCapturedImage((prev) => {
                if (prev && prev.metadata.id === fileId) {
                  return {
                    ...prev,
                    blob: compressedBlob,
                    metadata: {
                      ...prev.metadata,
                      size: compressedBlob.size,
                      compressed: true,
                    },
                  };
                }
                return prev; // Context changed (retake clicked)
              });
            } catch (compError) {
              console.warn("Background compression failed:", compError);
            } finally {
              setIsCompressing(false);
            }
          })();
        }
      } catch (err) {
        console.error("Capture failed:", err);
        const errorMsg =
          (err as Error).message ||
          "Failed to capture image. Please try again.";
        alert(errorMsg);
        setIsProcessing(false);
      } finally {
        setIsCapturing(false);
      }
    }, timerDuration * 1000);
  };

  /**
   * Handle retake photo
   */
  const handleRetake = () => {
    if (capturedImage?.url) {
      URL.revokeObjectURL(capturedImage.url);
    }
    setCapturedImage(null);
    setShowPreview(false);
    setIsCompressing(false); // Cancel compression UI
  };

  /**
   * Handle confirm and proceed
   */
  const handleConfirm = () => {
    if (onCapture && capturedImage) {
      onCapture(capturedImage);
    }
  };

  // ========== 4. FRAME DRAG & SELECTION LOGIC ==========
  /**
   * Handle frame selector drag
   */
  const handleFrameDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsFrameDragging(true);
    setFrameDragStart(e.clientX);
    setFrameDragStartScroll(frameScrollRef.current?.scrollLeft || 0);
  };

  const handleFrameDragMove = useCallback(
    (e: MouseEvent) => {
      if (!frameScrollRef.current || !isFrameDragging) return;

      const diff = e.clientX - frameDragStart;
      const newScroll = frameDragStartScroll - diff;
      frameScrollRef.current.scrollLeft = newScroll;

      // Auto-select frame closest to center
      const container = frameScrollRef.current;
      const containerCenter = container.offsetWidth / 2;
      const visibleStart = newScroll;
      const centerFramePos = visibleStart + containerCenter;

      let closestFrameId = selectedFrame;
      let minDistance = Infinity;

      const buttons = container.querySelectorAll(".frame-option");
      buttons.forEach((btn, index) => {
        const btnCenter =
          (btn as HTMLElement).offsetLeft +
          (btn as HTMLElement).offsetWidth / 2;
        const distance = Math.abs(centerFramePos - btnCenter);

        if (distance < minDistance) {
          minDistance = distance;
          closestFrameId = frames[index]?.id;
        }
      });

      if (
        closestFrameId &&
        closestFrameId !== selectedFrame &&
        minDistance < 100
      ) {
        onSelectFrame(closestFrameId);
      }
    },
    [
      frameDragStart,
      frameDragStartScroll,
      selectedFrame,
      frames,
      onSelectFrame,
      isFrameDragging,
    ],
  );

  const handleFrameDragEnd = () => {
    setIsFrameDragging(false);
  };

  // ========== 5. AUTO-CENTER & FRAME CALCULATION ==========
  /**
   * Auto-center selected frame
   */
  useEffect(() => {
    if (frameScrollRef.current && selectedFrame && selectedFrame !== "none") {
      const container = frameScrollRef.current;
      const selectedBtn = container.querySelector(".frame-option.selected");

      if (selectedBtn) {
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
          const containerWidth = container.offsetWidth;
          const btnLeft = (selectedBtn as HTMLElement).offsetLeft;
          const btnWidth = (selectedBtn as HTMLElement).offsetWidth;

          // Center the button in the container
          // targetScroll = button center - container center
          const targetScroll = btnLeft + btnWidth / 2 - containerWidth / 2;

          container.scrollTo({
            left: Math.max(0, targetScroll),
            behavior: "smooth",
          });
        }, 0);
      }
    }
  }, [selectedFrame]);

  /**
   * Select first frame by default on mount
   */
  useEffect(() => {
    if (frames.length > 0 && selectedFrame === "none") {
      onSelectFrame(frames[0].id);
    }
  }, [frames, selectedFrame, onSelectFrame]);

  /**
   * Calculate frame aspect ratio and optimal dimensions
   */
  useEffect(() => {
    if (selectedFrame === "none") {
      return;
    }

    if (frames.length > 0) {
      const selectedFrameObj = frames.find((f) => f.id === selectedFrame);
      if (selectedFrameObj?.image) {
        const img = new Image();
        img.onload = () => {
          // Get actual frame dimensions
          const frameWidth = img.naturalWidth || img.width;
          const frameHeight = img.naturalHeight || img.height;
          const frameRatio = frameWidth / frameHeight;

          setFrameAspectRatio(frameRatio);

          // Get screen dimensions and calculate screen ratio
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          const screenRatio = screenWidth / screenHeight;

          // Reserve space for UI controls (header + frame selector + control panel)
          // Portrait screens need more vertical reservation, landscape needs less
          const isScreenPortrait = screenRatio < 1;
          const isScreenLandscape = screenRatio > 1;
          const isFramePortrait = frameRatio < 1;
          const isFrameLandscape = frameRatio > 1;

          let verticalReserve, horizontalPadding;

          if (isScreenPortrait) {
            // Portrait screen (mobile/kiosk): reserve ~600px for larger controls
            verticalReserve = 600;
            horizontalPadding = 20;
          } else {
            // Landscape screen: reserve ~580px
            verticalReserve = 580;
            horizontalPadding = 40;
          }

          const availableHeight = screenHeight - verticalReserve;
          const availableWidth = screenWidth - horizontalPadding * 2;

          let containerWidth, containerHeight;

          // Smart scaling based on both screen and frame ratios
          if (isFramePortrait && isScreenPortrait) {
            // Portrait frame on portrait screen - maximize height
            containerHeight = Math.min(availableHeight, screenHeight * 0.75);
            containerWidth = containerHeight * frameRatio;

            // Ensure width fits
            if (containerWidth > availableWidth) {
              containerWidth = availableWidth;
              containerHeight = containerWidth / frameRatio;
            }
          } else if (isFrameLandscape && isScreenLandscape) {
            // Landscape frame on landscape screen - maximize width
            containerWidth = Math.min(availableWidth, screenWidth * 0.85);
            containerHeight = containerWidth / frameRatio;

            // Ensure height fits
            if (containerHeight > availableHeight) {
              containerHeight = availableHeight;
              containerWidth = containerHeight * frameRatio;
            }
          } else if (isFramePortrait && isScreenLandscape) {
            // Portrait frame on landscape screen - height limited
            containerHeight = Math.min(availableHeight, screenHeight * 0.85);
            containerWidth = containerHeight * frameRatio;

            // Ensure width fits
            if (containerWidth > availableWidth * 0.6) {
              containerWidth = availableWidth * 0.6;
              containerHeight = containerWidth / frameRatio;
            }
          } else if (isFrameLandscape && isScreenPortrait) {
            // Landscape frame on portrait screen - width limited
            containerWidth = availableWidth;
            containerHeight = containerWidth / frameRatio;

            // Ensure height fits
            if (containerHeight > availableHeight * 0.6) {
              containerHeight = availableHeight * 0.6;
              containerWidth = containerHeight * frameRatio;
            }
          } else {
            // Square frame - use the smaller dimension
            const size = Math.min(availableWidth, availableHeight) * 0.9;
            containerWidth = size;
            containerHeight = size;
          }

          // Final bounds check
          containerWidth = Math.min(containerWidth, availableWidth);
          containerHeight = Math.min(containerHeight, availableHeight);

          // Ensure minimum sizes for usability
          const minSize = 200;
          if (containerWidth < minSize || containerHeight < minSize) {
            if (frameRatio > 1) {
              containerWidth = Math.max(containerWidth, minSize);
              containerHeight = containerWidth / frameRatio;
            } else {
              containerHeight = Math.max(containerHeight, minSize);
              containerWidth = containerHeight * frameRatio;
            }
          }

          setPreviewDimensions({
            width: `${Math.round(containerWidth)}px`,
            height: `${Math.round(containerHeight)}px`,
          });
        };
        img.onerror = () => {
          console.error("Failed to load frame image");
        };
        img.src = selectedFrameObj.image;
      }
    }
  }, [selectedFrame, frames, windowSize]);

  /**
   * Handle window resize to recalculate frame dimensions
   */
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
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

  /**
   * Add global mouse listeners for drag
   */
  useEffect(() => {
    if (isFrameDragging) {
      window.addEventListener("mousemove", handleFrameDragMove);
      window.addEventListener("mouseup", handleFrameDragEnd);

      return () => {
        window.removeEventListener("mousemove", handleFrameDragMove);
        window.removeEventListener("mouseup", handleFrameDragEnd);
      };
    }
  }, [isFrameDragging, handleFrameDragMove]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapturing, showTimerPopup, showZoomPopup]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Close popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showTimerPopup &&
        timerWrapperRef.current &&
        !timerWrapperRef.current.contains(e.target as Node)
      ) {
        setShowTimerPopup(false);
      }
      if (
        showZoomPopup &&
        zoomWrapperRef.current &&
        !zoomWrapperRef.current.contains(e.target as Node)
      ) {
        setShowZoomPopup(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTimerPopup, showZoomPopup]);

  // ========== 6. EVENT LISTENERS & KEYBOARD HANDLING ==========
  // (Keyboard shortcuts, click outside handlers are defined above in useEffect blocks)

  // ========== 7. RENDER / JSX RETURN ==========
  return (
    <div className="capture-screen">
      {/* Header */}
      <div className="capture-header">
        <button
          className="btn-icon btn-back"
          onClick={onBack}
          aria-label="Go back to home"
        >
          <svg
            width="60"
            height="60"
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
        <h2 className="capture-title">{category}</h2>
      </div>

      {/* Main capture area */}
      <div
        className="capture-main"
      >
        {/* ===== FRAME SELECTOR - TOP ===== */}
        <div className="frame-selector-section">
          <label className="frame-selector-label">Select Frame</label>
          <div
            className={`frame-selector-scroll ${isFrameDragging ? "dragging" : ""}`}
            ref={frameScrollRef}
            onMouseDown={handleFrameDragStart}
            onWheel={(e) => {
              if (frameScrollRef.current) {
                frameScrollRef.current.scrollLeft += e.deltaY;
              }
            }}
            style={{
              cursor: isFrameDragging ? "grabbing" : "grab",
              margin: "0 auto",
            }}
            draggable="false"
            onDragStart={(e) => e.preventDefault()}
          >
            {frames.map((frame) => (
              <button
                key={frame.id}
                className={`frame-option ${selectedFrame === frame.id ? "selected" : ""}`}
                onClick={() => onSelectFrame(frame.id)}
                disabled={isCapturing}
                title={frame.name}
                aria-pressed={selectedFrame === frame.id}
              >
                {frame.image ? (
                  <img
                    src={frame.image}
                    alt={frame.name}
                    className="frame-thumbnail"
                    loading="lazy"
                  />
                ) : (
                  <div className="frame-placeholder">No Frame</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ===== CONTROL PANEL - MIDDLE ===== */}
        <div className="control-panel">
          <div className="control-upper">
            <div className="control-wrapper" ref={timerWrapperRef}>
              <button
                className="control-icon-btn timer-btn"
                onClick={() => setShowTimerPopup(!showTimerPopup)}
                disabled={isCapturing}
                title="Set timer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{timerDuration}s</span>
              </button>
              {showTimerPopup && (
                <div className="timer-popup">
                  {[0, 3, 5, 10].map((value) => (
                    <button
                      key={value}
                      className={`timer-option ${timerDuration === value ? "selected" : ""}`}
                      onClick={() => {
                        setTimerDuration(value);
                        setShowTimerPopup(false);
                      }}
                    >
                      {value === 0 ? "Off" : `${value}s`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="control-wrapper" ref={zoomWrapperRef}>
              <button
                className="control-icon-btn zoom-btn"
                onClick={() => setShowZoomPopup(!showZoomPopup)}
                disabled={isCapturing}
                title="Set zoom"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <span>{zoomLevel.toFixed(1)}x</span>
              </button>
              {showZoomPopup && (
                <div className="zoom-popup">
                  {ZOOM_OPTIONS.map((value) => (
                    <button
                      key={value}
                      className={`zoom-option ${zoomLevel === value ? "selected" : ""}`}
                      onClick={() => {
                        setZoomLevel(value);
                        setShowZoomPopup(false);
                      }}
                    >
                      {value.toFixed(2)}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Capture button - circular (center) */}
          <button
            className="btn-capture-circle"
            onClick={handleCaptureClick}
            disabled={isCapturing || !isInitialized}
            aria-label="Capture photo (press Space)"
            title="Press Space to capture"
          >
            <div className="capture-ring"></div>
          </button>
        </div>

        {/* ===== CAMERA PREVIEW - BOTTOM ===== */}
        <div
          className="preview-container"
          ref={previewContainerRef}
          style={{
            aspectRatio: frameAspectRatio,
            width: previewDimensions.width,
            height: previewDimensions.height,
            margin: "0 auto", // Center horizontally, flex handles vertical
            flexShrink: 0, // Prevent crushing
          }}
        >
          {/* Camera feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            webkit-playsinline="true"
            className={`camera-preview ${!isInitialized ? "camera-loading" : ""}`}
            aria-label="Camera preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              transform: `scaleX(-${zoomLevel}) scaleY(${zoomLevel})`, // Explicit separate scaling
              transformOrigin: "center center",
              transition: "transform 0.2s ease",
            }}
          />
          {/* Frame overlay */}
          {selectedFrame !== "none" &&
            frames.find((f) => f.id === selectedFrame)?.image && (
              <img
                src={frames.find((f) => f.id === selectedFrame)?.image || ""}
                className="frame-overlay"
                alt="Selected frame"
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
          {/* Flash animation on capture */}
          {showFlash && <div className="flash-effect" />}
          {/* Countdown overlay */}
          {showCountdown && (
            <div className="countdown-overlay">
              <div key={countdownValue} className="countdown-number">
                {countdownValue || "Cheese!"}
              </div>
            </div>
          )}
          {/* Loading state */}
          {isLoading && (
            <div className="camera-loading-indicator">
              <div className="spinner" />
              <p>Initializing camera...</p>
            </div>
          )}
          {/* Error state */}
          {cameraError && (
            <div className="camera-error">
              <p className="error-message">{cameraError}</p>
              <button
                className="btn btn-primary btn-retry"
                onClick={restart}
                disabled={cameraLoading}
              >
                {cameraLoading ? "Retrying..." : "Retry"}
              </button>
            </div>
          )}
        </div>

        {/* End of capture-main */}
      </div>

      {/* Processing Overlay */}
      {(isProcessing || isLoading) && (
        <div className="processing-overlay">
          <div className="processing-content">
            <div className="spinner"></div>
            <p className="processing-text">
              {isProcessing ? "Creating your photo..." : "Saving photo..."}
            </p>
          </div>
        </div>
      )}

      {/* Preview Overlay */}
      {showPreview && capturedImage && (
        <div className="capture-preview-overlay">
          <div className="capture-preview-image-container">
            <img
              src={capturedImage.url}
              alt="Captured"
              className="capture-preview-image"
            />
          </div>

          <div className="capture-preview-actions">
            <button
              className="capture-btn-preview capture-btn-retake"
              onClick={handleRetake}
              disabled={isLoading}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Retake
            </button>

            <button
              className="capture-btn-preview capture-btn-confirm"
              onClick={handleConfirm}
              disabled={isLoading || isCompressing}
            >
              {isCompressing ? (
                <span
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span
                    className="spinner"
                    style={{
                      display: "inline-block",
                      width: "18px",
                      height: "18px",
                      borderWidth: "2px",
                      borderColor: "rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                    }}
                  ></span>
                  <span>Optimizing...</span>
                </span>
              ) : (
                <>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Continue
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaptureScreen;
