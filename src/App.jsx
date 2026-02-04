import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Dynamically import all frames from assets
const childrenFramesRaw = import.meta.glob('./assets/Frames/Children/*.png', { eager: true, query: '?url' });
const adultFramesRaw = import.meta.glob('./assets/Frames/Adult/*.png', { eager: true, query: '?url' });
const proverbFramesRaw = import.meta.glob('./assets/Frames/Proverb/*.png', { eager: true, query: '?url' });
const collageFramesRaw = import.meta.glob('./assets/Frames/Collage/*.png', { eager: true, query: '?url' });

const formatFrames = (rawGlob, categoryName) => {
  return Object.entries(rawGlob).map(([path, module], index) => {
    const fileName = path.split('/').pop().replace('.png', '');
    return {
      id: `${categoryName}-${fileName}`,
      name: `Frame ${fileName}`,
      style: {},
      image: module.default || module
    };
  });
};

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [useIPCam, setUseIPCam] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [category, setCategory] = useState(null); // 'children', 'adult', 'collage'
  const [timerDuration, setTimerDuration] = useState(3);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState('none');
  const [frames, setFrames] = useState([{ id: 'none', name: 'Original', style: {}, image: null }]);
  const [capturedImage, setCapturedImage] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const scrollRef = useRef(null);

  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef(null);

  useEffect(() => {
    let categoryFrames = [];
    if (category === 'children') {
      categoryFrames = formatFrames(childrenFramesRaw, 'children');
    } else if (category === 'adult') {
      categoryFrames = formatFrames(adultFramesRaw, 'adult');
    } else if (category === 'proverb') {
      categoryFrames = formatFrames(proverbFramesRaw, 'proverb');
    } else if (category === 'personalization' || category === 'personalized') {
      categoryFrames = formatFrames(proverbFramesRaw, 'personalized');
    } else if (category === 'collage') {
      categoryFrames = formatFrames(collageFramesRaw, 'collage');
    }

    const allFrames = [
      { id: 'none', name: 'Original', style: {}, image: null },
      ...categoryFrames
    ];
    
    setFrames(allFrames);
    
    // Set first frame as default (if not none)
    if (categoryFrames.length > 0) {
      setSelectedFrame(categoryFrames[0].id);
    } else {
      setSelectedFrame('none');
    }
  }, [category]);

  const handleMouseDown = (e) => {
    if (!scrollRef.current) return;
    // Only drag on Right Click (button 2)
    if (e.button === 2) {
      setIsMouseDown(true);
      setStartX(e.pageX - scrollRef.current.offsetLeft);
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  };

  const handleMouseLeave = () => {
    setIsMouseDown(false);
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e) => {
    if (!isMouseDown || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleScroll = () => {
    if (!scrollRef.current || isProgrammaticScroll.current) return;
    
    // Low latency scroll detection for "live" selection while dragging
    const container = scrollRef.current;
    const center = container.scrollLeft + container.offsetWidth / 2;
    
    let closestFrameId = 'none';
    let minDistance = Infinity;

    const children = Array.from(container.children).filter(child => child.classList.contains('frame-option-card'));
    
    children.forEach((child, index) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const distance = Math.abs(center - childCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestFrameId = frames[index]?.id || 'none';
      }
    });

    if (closestFrameId !== selectedFrame) {
      setSelectedFrame(closestFrameId);
    }
  };

  const timerContainerRef = useRef(null);
  const zoomContainerRef = useRef(null);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (timerContainerRef.current && !timerContainerRef.current.contains(event.target)) {
        setShowTimerMenu(false);
      }
      if (zoomContainerRef.current && !zoomContainerRef.current.contains(event.target)) {
        setShowZoomMenu(false);
      }
    }
    if (showTimerMenu || showZoomMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimerMenu, showZoomMenu]);

  useEffect(() => {
    if (scrollRef.current && selectedFrame && !isMouseDown) {
      const container = scrollRef.current;
      const activeItem = container.querySelector('.frame-option-card.active');
      
      if (activeItem) {
        const containerCenter = container.scrollLeft + container.offsetWidth / 2;
        const itemCenter = activeItem.offsetLeft + activeItem.offsetWidth / 2;
        
        // Only scroll if significantly off-center to maintain "organic" feel
        if (Math.abs(containerCenter - itemCenter) > 5) {
          isProgrammaticScroll.current = true;
          activeItem.scrollIntoView({ behavior: 'smooth', inline: 'center' });
          
          if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
          scrollTimeout.current = setTimeout(() => {
            isProgrammaticScroll.current = false;
          }, 600);
        }
      }
    }
  }, [selectedFrame]);

  useEffect(() => {
    async function setupCamera() {
      if (useIPCam) {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
        return;
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1920, max: 2560 }, // High resolution
            height: { ideal: 1080, max: 1440 },
            frameRate: { ideal: 60, min: 30 } // High FPS
          },
          audio: false
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
    setupCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [useIPCam]);

  const [filter, setFilter] = useState('none');
  const [showFlash, setShowFlash] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const filters = [
    { id: 'none', name: 'Original', class: '' },
    { id: 'sepia', name: 'Vintage', class: 'sepia(1)' },
    { id: 'grayscale', name: 'B&W', class: 'grayscale(1)' },
    { id: 'vivid', name: 'Vivid', class: 'saturate(2) contrast(1.1)' },
    { id: 'cool', name: 'Ice', class: 'hue-rotate(180deg) saturate(1.5)' },
  ];

  const captureImage = async () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.error("Canvas ref not found");
        return;
      }
      const ctx = canvas.getContext('2d');
      
      // 1. Locate source and frame
      // Fallback selector for the stream
      const source = useIPCam 
        ? (document.querySelector('.camera-stream') || document.querySelector('img[alt="IP Camera Stream"]'))
        : videoRef.current;
      
      const currentFrame = frames.find(f => f.id === selectedFrame);
      
      if (!source) {
        console.error("Camera source not found");
        // Still show preview even if we couldn't capture, to avoid getting stuck
        setShowPreview(true);
        return;
      }

      // 2. Prepare frame image
      const frameImg = new Image();
      let frameWidth, frameHeight;
      
      if (currentFrame && currentFrame.image) {
        frameImg.src = currentFrame.image;
        await new Promise((resolve) => {
          frameImg.onload = resolve;
          frameImg.onerror = resolve;
        });
        frameWidth = frameImg.naturalWidth;
        frameHeight = frameImg.naturalHeight;
      } else {
        frameWidth = source.naturalWidth || source.videoWidth || 1920;
        frameHeight = source.naturalHeight || source.videoHeight || 1080;
      }

      // 3. Set canvas to match the FRAME size (Master Resolution)
      canvas.width = frameWidth;
      canvas.height = frameHeight;

      // 4. Calculate "Cover" cropping for the camera source to fit the frame
      const sourceWidth = source.naturalWidth || source.videoWidth || frameWidth;
      const sourceHeight = source.naturalHeight || source.videoHeight || frameHeight;
      
      const targetRatio = frameWidth / frameHeight;
      const sourceRatio = sourceWidth / sourceHeight;
      
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (sourceRatio > targetRatio) {
        // Source is wider than frame (crop horizontal)
        drawHeight = sourceHeight;
        drawWidth = sourceHeight * targetRatio;
        offsetX = (sourceWidth - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Source is taller than frame (crop vertical)
        drawWidth = sourceWidth;
        drawHeight = sourceWidth / targetRatio;
        offsetX = 0;
        offsetY = (sourceHeight - drawHeight) / 2;
      }

      // 5. Apply digital zoom if needed
      const zoomScale = zoomLevel || 1;
      const zoomedWidth = drawWidth / zoomScale;
      const zoomedHeight = drawHeight / zoomScale;
      const zoomOffsetX = offsetX + (drawWidth - zoomedWidth) / 2;
      const zoomOffsetY = offsetY + (drawHeight - zoomedHeight) / 2;

      // 6. Draw background layer
      ctx.filter = filters.find(f => f.id === filter)?.class || 'none';
      if (!useIPCam) {
        ctx.translate(frameWidth, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(source, zoomOffsetX, zoomOffsetY, zoomedWidth, zoomedHeight, 0, 0, frameWidth, frameHeight);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        ctx.drawImage(source, zoomOffsetX, zoomOffsetY, zoomedWidth, zoomedHeight, 0, 0, frameWidth, frameHeight);
      }

      // 7. Draw Frame layer on top
      ctx.filter = 'none';
      if (currentFrame && currentFrame.image) {
        ctx.drawImage(frameImg, 0, 0, frameWidth, frameHeight);
      }

      // 8. Apply CSS border frames if any
      if (currentFrame && currentFrame.style && Object.keys(currentFrame.style).length > 0) {
        const { border, borderBottom } = currentFrame.style;
        if (border) {
          ctx.lineWidth = parseInt(border) * (frameWidth / 400); 
          ctx.strokeStyle = border.split(' ')[2] || '#fff';
          ctx.strokeRect(0, 0, frameWidth, frameHeight);
          if (borderBottom) {
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fillRect(0, frameHeight - parseInt(borderBottom) * (frameHeight / 600), frameWidth, frameHeight);
          }
        }
      }

      // 9. Finalize
      const dataUrl = canvas.toDataURL('image/png');
      setCapturedImage(dataUrl);
    } catch (error) {
      console.error("Error in captureImage:", error);
    } finally {
      // Always show the preview screen after attempted capture
      setShowPreview(true);
    }
  };

  const takePhoto = () => {
    if (countdown !== null) return;

    let count = timerDuration;
    setCountdown(count);

    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(timer);
        setCountdown(null);
        setShowFlash(true);
        captureImage(); // Save the image
        setTimeout(() => setShowFlash(false), 200);
      }
    }, 1000);
  };

  return (
    <div className="app-container">
      {showFlash && <div className="flash-overlay" />}
      
      <main className="main-content">
        {!isActive ? (
          <div className="idle-screen" onClick={() => setIsActive(true)}>
            <div className="idle-content">
              <div className="idle-logo">
                <div className="pulsing-ring"></div>
                <div className="dot"></div>
              </div>
              <h1 className="gradient-text">SelfieBooth Pro</h1>
              <p>Tap anywhere to start</p>
              <div className="start-prompt">
                <span className="finger-icon">👆</span>
                <span className="mouse-icon-idle">🖱️</span>
              </div>
            </div>
          </div>
        ) : showPreview ? (
          <div className="captured-screen-container">
            <div className="preview-container glass-premium">
              <div className="preview-header">
                <h2 className="gradient-text">Nice Shot!</h2>
                <p>Your selfie is ready</p>
              </div>
              
              <div className="preview-image-wrapper">
                <img src={capturedImage} alt="Captured Selfie" className="preview-img" />
              </div>

              <div className="preview-footer">
                <button 
                  className="retake-btn glass-premium"
                  onClick={() => setShowPreview(false)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 2v6h6M21.5 22v-6h-6"/><path d="M22 11.5A10 10 0 0 0 3.2 7.2M2 12.5a10 10 0 0 0 18.8 4.3"/></svg>
                  <span>Retake</span>
                </button>

                <button 
                  className="save-btn-premium"
                  onClick={() => {
                    if (!capturedImage) return;
                    const link = document.createElement('a');
                    link.href = capturedImage;
                    link.download = `selfie-${Date.now()}.png`;
                    link.click();
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <span>Save to Gallery</span>
                </button>
              </div>
            </div>
          </div>
        ) : !category ? (
          <div className="selection-screen">
            <div className="selection-header">
              <h1 className="main-title gradient-text">Take Selfie With The Nature</h1>
              <h2 className="sub-title">Choose Your Frame</h2>
            </div>
            <div className="selection-grid">
              <button className="selection-btn glass-premium" onClick={() => setCategory('adult')}>
                <div className="btn-icon">📸</div>
                <div className="btn-text">
                  <h3>Adult</h3>
                  <span>Professional Portraits</span>
                </div>
              </button>
              <button className="selection-btn glass-premium" onClick={() => setCategory('proverb')}>
                <div className="btn-icon">📜</div>
                <div className="btn-text">
                  <h3>Proverb</h3>
                  <span>Inspirational Quotes</span>
                </div>
              </button>
              <button className="selection-btn glass-premium" onClick={() => setCategory('personalized')}>
                <div className="btn-icon">✨</div>
                <div className="btn-text">
                  <h3>Personalized</h3>
                  <span>Customized Quotes</span>
                </div>
              </button>
              <button className="selection-btn glass-premium" onClick={() => setCategory('collage')}>
                <div className="btn-icon">🖼️</div>
                <div className="btn-text">
                  <h3>Collage</h3>
                  <span>Multi-Photo Masterpiece</span>
                </div>
              </button>
              <button className="selection-btn glass-premium" onClick={() => setCategory('children')}>
                <div className="btn-icon">🧸</div>
                <div className="btn-text">
                  <h3>Children</h3>
                  <span>Fun & Playful Filters</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <>
            <button className="home-btn-premium" onClick={() => { setCategory(null); setIsActive(false); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </button>

            <div className="booth-container">
              <div className="viewfinder-wrapper glass">
                <div className="viewfinder">
                  {/* Camera Feed stays at the bottom */}
                  {useIPCam ? (
                    <img 
                      src="/cam-proxy/video" 
                      className="camera-stream"
                      alt="IP Camera Stream"
                      style={{ 
                        filter: filters.find(f => f.id === filter).class,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: `scale(${zoomLevel})`,
                        willChange: 'transform, filter' // Hardware acceleration
                      }}
                    />
                  ) : (
                    <video 
                      ref={videoRef}
                      className="camera-stream"
                      autoPlay 
                      playsInline 
                      muted
                      style={{ 
                        filter: filters.find(f => f.id === filter).class,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: `scaleX(-1) scale(${zoomLevel})`,
                        willChange: 'transform, filter' // Hardware acceleration
                      }}
                    />
                  )}

                  {/* Frames sit perfectly on top */}
                  {frames.find(f => f.id === selectedFrame)?.image && (
                    <img 
                      src={frames.find(f => f.id === selectedFrame).image} 
                      className="frame-image-overlay"
                      alt="Frame"
                    />
                  )}
                  <div 
                    className="frame-overlay" 
                    style={frames.find(f => f.id === selectedFrame)?.style}
                  ></div>
                  
                  {!stream && !useIPCam && (
                    <div className="camera-placeholder">
                      <div className="lens"></div>
                      <p>Requesting Camera Access...</p>
                    </div>
                  )}

                  {countdown !== null && (
                    <div className="countdown-overlay">
                      <span className="countdown-number">{countdown}</span>
                    </div>
                  )}

                  <div className="camera-status">
                    <span className="status-dot"></span>
                    {useIPCam ? 'IP-LINK' : 'LIVE'}
                  </div>
                </div>
                {/* Hidden canvas for processing */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>

              <aside className="controls-panel">
                <div className="frame-selector-container">
                    <div 
                      className={`frame-selector-scroll ${isMouseDown ? 'grabbing' : ''}`} 
                      ref={scrollRef}
                      onScroll={handleScroll}
                      onMouseDown={handleMouseDown}
                      onMouseLeave={handleMouseLeave}
                      onMouseUp={handleMouseUp}
                      onMouseMove={handleMouseMove}
                      onContextMenu={(e) => e.preventDefault()} // Disable right-click menu
                    >
                    <div className="scroll-spacer"></div>
                    {frames.map(f => (
                      <div 
                        key={f.id}
                        className={`frame-option-card ${selectedFrame === f.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedFrame(f.id);
                        }}
                      >
                        <div className="frame-preview-mini" style={f.style}>
                          {f.image && <img src={f.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill' }} />}
                        </div>
                        <span>{f.name}</span>
                      </div>
                    ))}
                    <div className="scroll-spacer"></div>
                  </div>
                </div>

                <div className="action-section">
                  <div className="action-row">
                    <div className="timer-container" ref={timerContainerRef}>
                      {showTimerMenu && (
                        <div className="timer-dropdown glass-premium">
                          {[1, 3, 5, 10].map(time => (
                            <button 
                              key={time} 
                              className={`timer-option ${timerDuration === time ? 'active' : ''}`}
                              onClick={() => {
                                setTimerDuration(time);
                                setShowTimerMenu(false);
                              }}
                            >
                              {time}s
                            </button>
                          ))}
                        </div>
                      )}
                      <button 
                        className={`timer-toggle ${showTimerMenu ? 'menu-open' : ''}`} 
                        onClick={() => setShowTimerMenu(!showTimerMenu)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span>{timerDuration}s</span>
                      </button>
                    </div>

                    <button 
                      className="capture-btn-premium"
                      onClick={takePhoto}
                    >
                      <div className="capture-inner-white"></div>
                    </button>

                    <div className="zoom-container" ref={zoomContainerRef}>
                      {showZoomMenu && (
                        <div className="timer-dropdown glass-premium">
                          {[1, 1.5, 2, 2.5, 3].map(level => (
                            <button 
                              key={level} 
                              className={`timer-option ${zoomLevel === level ? 'active' : ''}`}
                              onClick={() => {
                                setZoomLevel(level);
                                setShowZoomMenu(false);
                              }}
                            >
                              {level}x
                            </button>
                          ))}
                        </div>
                      )}
                      <button 
                        className={`zoom-toggle ${showZoomMenu ? 'menu-open' : ''}`} 
                        onClick={() => setShowZoomMenu(!showZoomMenu)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
                        <span>{zoomLevel}x</span>
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>


    </div>
  );
}

export default App;
