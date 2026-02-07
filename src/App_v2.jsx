/**
 * App Component - Main orchestrator
 * Phase 1 MVP Implementation
 * 
 * Manages screen flow, state coordination, and delegates to specialized components
 */

import React, { useState, useEffect } from 'react';
import './App.css';

// Import screens
import { WelcomeScreen } from './components/screens/WelcomeScreen';
import { SelectionScreen } from './components/screens/SelectionScreen';
import { CaptureScreen } from './components/screens/CaptureScreen';
import { PreviewScreen } from './components/screens/PreviewScreen';

// Import hooks
import { useCamera } from './hooks/useCamera';
import { useSession } from './hooks/useSession';

// Import services & utilities
import { APP_CONFIG, CAMERA_CONFIG } from './constants';
import { throttle } from './utils/throttle';

// Dynamically import frames
const childrenFramesRaw = import.meta.glob('./assets/Frames/Children/*.png', { eager: true, query: '?url' });
const adultFramesRaw = import.meta.glob('./assets/Frames/Adult/*.png', { eager: true, query: '?url' });
const proverbFramesRaw = import.meta.glob('./assets/Frames/Proverb/*.png', { eager: true, query: '?url' });
const collageFramesRaw = import.meta.glob('./assets/Frames/Collage/*.png', { eager: true, query: '?url' });

/**
 * App Screen States (state machine)
 */
const SCREENS = {
  WELCOME: 'welcome',
  SELECTION: 'selection',
  CAPTURE: 'capture',
  PREVIEW: 'preview',
};

/**
 * Format frames from glob results
 */
const formatFrames = (rawGlob, categoryName) => {
  return Object.entries(rawGlob).map(([path, module]) => {
    const fileName = path.split('/').pop().replace('.png', '');
    const imageUrl = module.default || module;
    return {
      id: `${categoryName}-${fileName}`,
      name: `Frame ${fileName}`,
      image: imageUrl,
    };
  });
};

/**
 * Main App Component
 */
function App() {
  // Screen state
  const [currentScreen, setCurrentScreen] = useState(SCREENS.WELCOME);
  const [selectedCategory, setSelectedCategory] = useState('children');
  
  // Frame state
  const [frames, setFrames] = useState([{ id: 'none', name: 'Original', image: null }]);
  const [selectedFrame, setSelectedFrame] = useState('none');
  
  // Photo state
  const [capturedImageData, setCapturedImageData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hooks
  const camera = useCamera();
  const session = useSession();

  /**
   * Load frames when category changes
   */
  useEffect(() => {
    let categoryFrames = [];

    switch (selectedCategory) {
      case 'children':
        categoryFrames = formatFrames(childrenFramesRaw, 'children');
        break;
      case 'adult':
        categoryFrames = formatFrames(adultFramesRaw, 'adult');
        break;
      case 'proverb':
        categoryFrames = formatFrames(proverbFramesRaw, 'proverb');
        break;
      case 'collage':
        categoryFrames = formatFrames(collageFramesRaw, 'collage');
        break;
      default:
        categoryFrames = [];
    }

    const allFrames = [
      { id: 'none', name: 'Original', image: null },
      ...categoryFrames,
    ];

    setFrames(allFrames);
    setSelectedFrame(allFrames[1]?.id || 'none');
  }, [selectedCategory]);

  /**
   * Handle category selection
   */
  const handleSelectCategory = (category) => {
    setSelectedCategory(category);
    setCurrentScreen(SCREENS.CAPTURE);
  };

  /**
   * Handle quick mode (skip category selection)
   */
  const handleQuickMode = () => {
    setCurrentScreen(SCREENS.CAPTURE);
  };

  /**
   * Handle photo capture
   * Creates session and saves to storage
   */
  const handleCapture = async (imageData) => {
    try {
      setIsProcessing(true);

      // Create session if needed
      let sessionId = session.currentSession?.id;
      if (!sessionId) {
        const newSession = await session.createSession({
          category: selectedCategory,
        });
        sessionId = newSession.id;
      }

      // Save photo to session
      await session.savePhoto(imageData.blob, imageData.metadata);

      // Store for preview
      setCapturedImageData(imageData);
      
      // Transition to preview screen
      setCurrentScreen(SCREENS.PREVIEW);
    } catch (error) {
      console.error('Capture failed:', error);
      alert('Failed to save photo. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Handle retake - go back to capture
   */
  const handleRetake = () => {
    setCapturedImageData(null);
    setCurrentScreen(SCREENS.CAPTURE);
  };

  /**
   * Handle save (already saved to IndexedDB in handleCapture)
   */
  const handleSave = (imageData) => {
    // Photo is already saved, just provide feedback
    console.log('Photo saved:', imageData);
  };

  /**
   * Handle print
   */
  const handlePrint = (imageData) => {
    console.log('Print requested:', imageData);
    // Printer integration in Phase 3
  };

  /**
   * Handle share
   */
  const handleShare = (imageData) => {
    console.log('Share requested:', imageData);
  };

  /**
   * Go back to welcome
   */
  const handleBackToWelcome = () => {
    setCurrentScreen(SCREENS.WELCOME);
    session.endSession();
    setCapturedImageData(null);
  };

  /**
   * Navigation helpers
   */
  const handleBackFromSelection = () => {
    setCurrentScreen(SCREENS.WELCOME);
  };

  const handleBackFromCapture = () => {
    setCurrentScreen(SCREENS.SELECTION);
  };

  const handleBackFromPreview = () => {
    handleRetake();
  };

  /**
   * Screen rendering
   */
  const renderScreen = () => {
    switch (currentScreen) {
      case SCREENS.WELCOME:
        return (
          <WelcomeScreen
            onStart={() => setCurrentScreen(SCREENS.SELECTION)}
            onSettings={() => {
              // Settings modal in Phase 2
              console.log('Settings clicked');
            }}
          />
        );

      case SCREENS.SELECTION:
        return (
          <SelectionScreen
            onSelectCategory={handleSelectCategory}
            onBack={handleBackFromSelection}
            onQuickMode={handleQuickMode}
          />
        );

      case SCREENS.CAPTURE:
        return (
          <CaptureScreen
            category={selectedCategory}
            frames={frames}
            selectedFrame={selectedFrame}
            onSelectFrame={setSelectedFrame}
            onCapture={handleCapture}
            onBack={handleBackFromCapture}
            isLoading={isProcessing || !camera.isInitialized}
          />
        );

      case SCREENS.PREVIEW:
        return capturedImageData ? (
          <PreviewScreen
            imageData={capturedImageData}
            onRetake={handleBackFromPreview}
            onSave={handleSave}
            onPrint={handlePrint}
            onShare={handleShare}
            isLoading={isProcessing}
          />
        ) : null;

      default:
        return <WelcomeScreen onStart={() => setCurrentScreen(SCREENS.SELECTION)} />;
    }
  };

  return (
    <div className="app">
      {/* Error boundary handled by main.jsx */}
      {renderScreen()}

      {/* Debug info (remove in production) */}
      {import.meta.env.DEV && (
        <div className="debug-info" style={{ position: 'fixed', bottom: 10, right: 10, fontSize: '10px', color: '#888' }}>
          <p>Screen: {currentScreen}</p>
          <p>Session: {session.currentSession?.id?.slice(0, 8)}...</p>
          <p>Storage: {session.storageStats?.sizeMB}MB</p>
        </div>
      )}
    </div>
  );
}

export default App;
