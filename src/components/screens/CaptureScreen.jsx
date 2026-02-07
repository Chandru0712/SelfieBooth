/**
 * CaptureScreen Component
 * Phase 1 MVP: US-010, 011, 012, 013
 * 
 * Main capture interface with camera preview, frame selection, and capture controls
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { cameraService } from '../../services/cameraService';
import { APP_CONFIG } from '../../constants';
import '../screens/screens.css';

const ZOOM_OPTIONS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];

export const CaptureScreen = ({
  category = 'children',
  frames = [],
  selectedFrame = 'none',
  onSelectFrame,
  onCapture,
  onBack,
  isLoading: parentIsLoading = false,
}) => {
  // Camera hook
  const { 
    videoRef, 
    isInitialized, 
    isLoading: cameraLoading,
    error: cameraError, 
    captureFrame,
    restart
  } = useCamera();
  
  const isLoading = parentIsLoading || cameraLoading;

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
  const [frameAspectRatio, setFrameAspectRatio] = useState('16 / 9');
  const [previewDimensions, setPreviewDimensions] = useState({ width: '100%', height: 'auto' });
  const [framePixelSize, setFramePixelSize] = useState(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [capturedImage, setCapturedImage] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const frameScrollRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const timerWrapperRef = useRef(null);
  const zoomWrapperRef = useRef(null);
  const previewContainerRef = useRef(null);

  const getCaptureDimensions = () => {
    if (selectedFrame !== 'none' && framePixelSize?.width && framePixelSize?.height) {
      return framePixelSize;
    }

    if (cameraService.isIPCamera) {
      const img = document.querySelector('.camera-stream');
      const width = img?.naturalWidth || img?.width;
      const height = img?.naturalHeight || img?.height;
      if (width && height) {
        return { width, height };
      }
    }

    const video = videoRef.current;
    const width = video?.videoWidth;
    const height = video?.videoHeight;
    if (width && height) {
      return { width, height };
    }

    const container = previewContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width && rect.height) {
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }
    }

    return null;
  };

  /**
   * Handle zoom controls
   */
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 1));
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  /**
   * Handle capture button click
   * Starts timer countdown then captures image
   */
  const handleCaptureClick = async () => {
    if (isCapturing || !isInitialized) return;

    setIsCapturing(true);
    setShowCountdown(true);
    setCountdownValue(timerDuration);

    // Countdown
    countdownIntervalRef.current = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // After timer, capture image
    setTimeout(async () => {
      try {
        setShowCountdown(false);
        
        // Show flash immediately for instant feedback
        setShowFlash(true);
        setTimeout(() => {
          setShowFlash(false);
          setIsProcessing(true);  // Show processing screen
        }, 600);

        const dimensions = getCaptureDimensions();
        if (!dimensions) {
          throw new Error('Unable to determine capture size');
        }

        // Capture frame from video
        const captureResult = await captureFrame(dimensions.width, dimensions.height);

        // Composite frame overlay if selected
        let finalBlob = captureResult.blob;
        if (selectedFrame !== 'none') {
          const selectedFrameData = frames.find(f => f.id === selectedFrame);
          if (selectedFrameData?.image) {
            // Load frame image
            const frameImg = new Image();
            frameImg.crossOrigin = 'anonymous';
            
            await new Promise((resolve, reject) => {
              frameImg.onload = resolve;
              frameImg.onerror = () => reject(new Error('Failed to load frame'));
              frameImg.src = selectedFrameData.image;
            });

            // Create canvas for compositing
            const canvas = document.createElement('canvas');
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            const ctx = canvas.getContext('2d');

            // Draw captured image
            const capturedImg = new Image();
            await new Promise((resolve, reject) => {
              capturedImg.onload = resolve;
              capturedImg.onerror = reject;
              capturedImg.src = URL.createObjectURL(captureResult.blob);
            });
            
            ctx.drawImage(capturedImg, 0, 0, canvas.width, canvas.height);

            // Draw frame overlay on top
            ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

            // Convert to blob
            finalBlob = await new Promise((resolve) => {
              canvas.toBlob(resolve, 'image/png', 1.0);
            });
          }
        }

        // Store composited image and show preview
        const imageUrl = URL.createObjectURL(finalBlob);
        setCapturedImage({
          url: imageUrl,
          blob: finalBlob,
          metadata: {
            frameId: selectedFrame,
            capturedAt: new Date().toISOString(),
            width: dimensions.width,
            height: dimensions.height,
          }
        });
        
        // Hide processing and show preview
        setIsProcessing(false);
        setShowPreview(true);
      } catch (err) {
        console.error('Capture failed:', err);
        // Show more detailed error
        const errorMsg = err.message || 'Failed to capture image. Please try again.';
        alert(errorMsg);
        setIsProcessing(false);  // Hide processing on error
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
  };

  /**
   * Handle confirm and proceed
   */
  const handleConfirm = () => {
    if (onCapture && capturedImage) {
      onCapture({
        blob: capturedImage.blob,
        metadata: capturedImage.metadata,
      });
    }
  };

  /**
   * Handle frame selector drag
   */
  const handleFrameDragStart = (e) => {
    setIsFrameDragging(true);
    setFrameDragStart(e.clientX);
    setFrameDragStartScroll(frameScrollRef.current?.scrollLeft || 0);
  };

  const handleFrameDragMove = useCallback((e) => {
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
    
    const buttons = container.querySelectorAll('.frame-option');
    buttons.forEach((btn, index) => {
      const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
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

  const handleFrameDragEnd = () => {
    setIsFrameDragging(false);
  };

  /**
   * Auto-center selected frame
   */
  useEffect(() => {
    if (frameScrollRef.current && selectedFrame && selectedFrame !== 'none') {
      const container = frameScrollRef.current;
      const selectedBtn = container.querySelector('.frame-option.selected');
      
      if (selectedBtn) {
        // Use setTimeout to ensure DOM is fully rendered
        setTimeout(() => {
          const containerWidth = container.offsetWidth;
          const btnLeft = selectedBtn.offsetLeft;
          const btnWidth = selectedBtn.offsetWidth;
          
          // Center the button in the container
          // targetScroll = button center - container center
          const targetScroll = btnLeft + btnWidth / 2 - containerWidth / 2;
          
          container.scrollTo({
            left: Math.max(0, targetScroll),
            behavior: 'smooth'
          });
        }, 0);
      }
    }
  }, [selectedFrame]);

  /**
   * Select first frame by default on mount
   */
  useEffect(() => {
    if (frames.length > 0 && selectedFrame === 'none') {
      onSelectFrame(frames[0].id);
    }
  }, [frames, selectedFrame, onSelectFrame]);

  /**
   * Calculate frame aspect ratio and optimal dimensions
   */
  useEffect(() => {
    if (selectedFrame === 'none') {
      setFramePixelSize(null);
      return;
    }

    if (frames.length > 0) {
      const selectedFrameObj = frames.find(f => f.id === selectedFrame);
      if (selectedFrameObj?.image) {
        const img = new Image();
        img.onload = () => {
          // Get actual frame dimensions
          const frameWidth = img.naturalWidth || img.width;
          const frameHeight = img.naturalHeight || img.height;
          setFramePixelSize({ width: frameWidth, height: frameHeight });
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
            // Portrait screen (mobile): reserve ~300px for controls
            verticalReserve = 300;
            horizontalPadding = 20;
          } else if (isScreenLandscape) {
            // Landscape screen (desktop/tablet): reserve ~200px for controls
            verticalReserve = 200;
            horizontalPadding = 40;
          } else {
            // Square-ish screen
            verticalReserve = 250;
            horizontalPadding = 30;
          }
          
          const availableHeight = screenHeight - verticalReserve;
          const availableWidth = screenWidth - (horizontalPadding * 2);
          
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
            height: `${Math.round(containerHeight)}px`
          });
        };
        img.onerror = () => {
          console.error('Failed to load frame image');
          setFramePixelSize(null);
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
        height: window.innerHeight
      });
    };

    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 150);
    };

    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  /**
   * Add global mouse listeners for drag
   */
  useEffect(() => {
    if (isFrameDragging) {
      window.addEventListener('mousemove', handleFrameDragMove);
      window.addEventListener('mouseup', handleFrameDragEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleFrameDragMove);
        window.removeEventListener('mouseup', handleFrameDragEnd);
      };
    }
  }, [isFrameDragging, handleFrameDragMove]);
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        setShowTimerPopup(false);
        setShowZoomPopup(false);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleCaptureClick();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
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
    const handleClickOutside = (e) => {
      if (showTimerPopup && timerWrapperRef.current && !timerWrapperRef.current.contains(e.target)) {
        setShowTimerPopup(false);
      }
      if (showZoomPopup && zoomWrapperRef.current && !zoomWrapperRef.current.contains(e.target)) {
        setShowZoomPopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTimerPopup, showZoomPopup]);

  return (
    <div className="capture-screen">
      {/* Header */}
      <div className="capture-header">
        <button className="btn-icon btn-back" onClick={onBack} aria-label="Go back to home">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="capture-title">{category}</h2>
      </div>

      {/* Main capture area */}
      <div className="capture-main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
        {/* Camera preview with frame overlay */}
        <div 
          className="preview-container" 
          ref={previewContainerRef}
          style={{ 
            aspectRatio: frameAspectRatio,
            width: previewDimensions.width,
            height: previewDimensions.height,
            margin: 'auto'
          }}
        >          {/* Camera feed - IP camera uses img, webcam uses video */}
          {cameraService.isIPCamera ? (
            <img 
              src="/cam-proxy/video"
              className="camera-stream"
              alt="IP Camera Stream"
              style={{ 
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s ease'
              }}
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`camera-preview ${!isInitialized ? 'camera-loading' : ''}`}
              aria-label="Camera preview"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s ease'
              }}
            />
          )}

          {/* Frame overlay */}
          {selectedFrame !== 'none' && frames.find(f => f.id === selectedFrame)?.image && (
            <img 
              src={frames.find(f => f.id === selectedFrame).image}
              className="frame-overlay"
              alt="Selected frame"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                objectPosition: 'center',
                pointerEvents: 'none',
                zIndex: 10
              }}
            />
          )}

          {/* Flash animation on capture */}
          {showFlash && <div className="flash-effect" />}

          {/* Countdown overlay */}
          {showCountdown && (
            <div className="countdown-overlay">
              <div key={countdownValue} className="countdown-number">{countdownValue || 'Say Cheese!'}</div>
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
                {cameraLoading ? 'Retrying...' : 'Retry'}
              </button>
            </div>
          )}
        </div>

        {/* Frame selector - horizontal scroll */}
          <div className="frame-selector-section">
            <label className="control-label">Select Frame:</label>
            <div 
              className={`frame-selector-scroll ${isFrameDragging ? 'dragging' : ''}`}
              ref={frameScrollRef}
              onMouseDown={handleFrameDragStart}
              style={{ cursor: isFrameDragging ? 'grabbing' : 'grab', margin: '0 auto' }}
            >
              {frames.map((frame) => (
                <button
                  key={frame.id}
                  className={`frame-option ${selectedFrame === frame.id ? 'selected' : ''}`}
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

        {/* Control Panel */}
        <div className="control-panel" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
          {/* Timer button (left) */}
          <div className="control-wrapper" ref={timerWrapperRef}>
            <button
              className="control-icon-btn timer-btn"
              onClick={() => setShowTimerPopup(!showTimerPopup)}
              disabled={isCapturing}
              aria-label="Select timer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="13" r="9"/>
                <polyline points="12 6 12 13 16 13"/>
                <path d="M9 2h6"/>
              </svg>
              <span>{timerDuration}s</span>
            </button>

            {/* Timer popup */}
            {showTimerPopup && (
              <div className="timer-popup">
                {APP_CONFIG.TIMER_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    className={`timer-option ${timerDuration === opt ? 'selected' : ''}`}
                    onClick={() => {
                      setTimerDuration(opt);
                      setShowTimerPopup(false);
                    }}
                  >
                    {opt}s
                  </button>
                ))}
              </div>
            )}
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

          {/* Zoom button (right) */}
          <div className="control-wrapper" ref={zoomWrapperRef}>
            <button
              className="control-icon-btn zoom-btn"
              onClick={() => setShowZoomPopup(!showZoomPopup)}
              disabled={isCapturing}
              aria-label="Select zoom"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
              <span>{zoomLevel.toString().replace(/\.?0+$/, '')}x</span>
            </button>

            {/* Zoom popup */}
            {showZoomPopup && (
              <div className="zoom-popup">
                {ZOOM_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    className={`zoom-option ${zoomLevel === opt ? 'selected' : ''}`}
                    onClick={() => {
                      setZoomLevel(opt);
                      setShowZoomPopup(false);
                    }}
                  >
                    {opt.toString().replace(/\.?0+$/, '')}x
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Processing Overlay */}
      {(isProcessing || isLoading) && (
        <div className="processing-overlay">
          <div className="processing-content">
            <div className="spinner"></div>
            <p className="processing-text">
              {isProcessing ? 'Creating your photo...' : 'Saving photo...'}
            </p>
          </div>
        </div>
      )}

      {/* Preview Overlay */}
      {showPreview && capturedImage && (
        <div className="preview-overlay">
          <div className="preview-image-container">
            <img 
              src={capturedImage.url} 
              alt="Captured" 
              className="preview-image"
            />
          </div>
          
          <div className="preview-actions">
            <button 
              className="btn-preview btn-retake"
              onClick={handleRetake}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Retake
            </button>
            
            <button 
              className="btn-preview btn-confirm"
              onClick={handleConfirm}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaptureScreen;
