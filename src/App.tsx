/**
 * ================================================================================
 * FILE: App.tsx - MAIN APPLICATION ORCHESTRATOR
 * ================================================================================
 * 
 * Primary React component managing screen flow state machine and delegation
 * Phase 1 MVP Implementation (US-010-050)
 * 
 * STRUCTURE:
 * 1.0 IMPORTS & CONSTANTS
 * 2.0 FRAME DATA LOADING & FORMATTING
 * 3.0 SCREEN STATE MACHINE
 * 4.0 COMPONENT STATE & LIFECYCLE
 * 5.0 EVENT HANDLERS (NAVIGATION, CAPTURE, SAVE)
 * 6.0 SCREEN RENDERING (CONDITIONAL DISPLAY)
 * 7.0 JSX RETURN
 * 
 * SCREEN FLOW:
 * WELCOME → SELECTION → CAPTURE → PREVIEW → (SAVE) → WELCOME
 *                         ↓
 *                    AI_IMAGE → PREVIEW
 * 
 * ================================================================================
 */

import { useState, useEffect, useRef, ReactElement } from 'react';

// ========== 1.0 IMPORTS - SCREENS ==========
// Import screens
import { WelcomeScreen } from './components/screens/jsx/WelcomeScreen';
import { SelectionScreen } from './components/screens/jsx/SelectionScreen';
import { CaptureScreen } from './components/screens/jsx/CaptureScreen';
import { PreviewScreen } from './components/screens/jsx/PreviewScreen';
import AIImageScreen from './components/screens/jsx/AIImageScreen';


// ========== 1.2 IMPORTS - TYPES ==========
import type { ImageData, Frame } from './types';

// ========== 1.3 IMPORTS - DYNAMIC ASSETS ==========
// Dynamically import frames
const childrenFramesRaw = import.meta.glob('./assets/Frames/Children/*.{png,webp}', { eager: true, query: '?url' });
const adultFramesRaw = import.meta.glob('./assets/Frames/Adult/*.{png,webp}', { eager: true, query: '?url' });
const proverbFramesRaw = import.meta.glob('./assets/Frames/Proverb/*.{png,webp}', { eager: true, query: '?url' });
const collageFramesRaw = import.meta.glob('./assets/Frames/Collage/*.{png,webp}', { eager: true, query: '?url' });
// ========== 2.0 FRAME DATA LOADING & FORMATTING ==========

/**
 * Format frames from glob results
 */
const formatFrames = (rawGlob: Record<string, any>, categoryName: string): Frame[] => {
  return Object.entries(rawGlob).map(([path, module]) => {
    const fileName = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
    const imageUrl = (module as any).default || (module as any);
    return {
      id: `${categoryName}-${fileName}`,
      name: `Frame ${fileName}`,
      image: imageUrl,
      path: path,
      category: categoryName,
    };
  });
};

// ========== 3.0 SCREEN STATE MACHINE ==========
const SCREENS = {
  WELCOME: 'welcome',
  SELECTION: 'selection',
  AI_IMAGE: 'ai-image',
  CAPTURE: 'capture',
  PREVIEW: 'preview',
} as const;

type ScreenType = typeof SCREENS[keyof typeof SCREENS];

// ========== 4.0 MAIN COMPONENT & STATE MANAGEMENT ==========
/**
 * Main App Component - Screen flow orchestrator
 */
function App(): ReactElement {
  // ========== KIOSK: DISABLE PINCH-ZOOM & LONG-PRESS (SWIPE/SCROLL ALLOWED) ==========
  useEffect(() => {
    /**
     * Block context menu — prevents long-press popup on touch devices
     * (e.g. "Copy", "Open link", "Save image" menus).
     */
    const blockContextMenu = (e: Event) => {
      e.preventDefault();
    };

    /**
     * Block gesturestart / gesturechange — prevents native
     * pinch-to-zoom on Safari/iOS (non-standard but widely supported).
     */
    const blockGesture = (e: Event) => {
      e.preventDefault();
    };

    // Attach blockers
    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('gesturestart', blockGesture);
    document.addEventListener('gesturechange', blockGesture);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('gesturestart', blockGesture);
      document.removeEventListener('gesturechange', blockGesture);
    };
  }, []); // Run once on mount
  // ========== SCREEN STATE ==========
  const [currentScreen, setCurrentScreen] = useState<ScreenType>(SCREENS.WELCOME);
  const [selectedCategory, setSelectedCategory] = useState<string>('children');
  
  // ========== FRAME STATE ==========
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<string>('none');
  
  // ========== PHOTO STATE ==========
  const [capturedImageData, setCapturedImageData] = useState<ImageData | null>(null);

  // ========== INACTIVITY TIMER ==========
  // 30 minutes in milliseconds
  const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Load frames when category changes
   */
  useEffect(() => {
    let categoryFrames: Frame[] = [];

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

    const allFrames: Frame[] = [
      ...categoryFrames,
    ];

    setFrames(allFrames);
    setSelectedFrame(allFrames[0]?.id || 'none');
  }, [selectedCategory]);

  /**
   * Handle category selection
   */
  const handleSelectCategory = (category: string): void => {
    setSelectedCategory(category);
    if (category === 'blend') {
      setCurrentScreen(SCREENS.AI_IMAGE);
    } else {
      setCurrentScreen(SCREENS.CAPTURE);
    }
  };

  /**
   * Handle photo capture — stores image and shows preview
   */
  const handleCapture = (imageData: ImageData): void => {
    setCapturedImageData(imageData);
    setCurrentScreen(SCREENS.PREVIEW);
  };


  /**
   * Go back to welcome
   */
  const handleBackToWelcome = (): void => {
    setCurrentScreen(SCREENS.WELCOME);
    setCapturedImageData(null);
  };

  /**
   * Inactivity auto-reset: listen for ANY user activity.
   * If no activity for 30 minutes, go back to welcome.
   * Only active when the user is NOT already on the welcome screen.
   */
  useEffect(() => {
    // Don't run timer on the welcome screen itself
    if (currentScreen === SCREENS.WELCOME) {
      // Clear any lingering timer when we arrive at welcome
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
      return;
    }

    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        console.log('⏰ Inactivity timeout — returning to Welcome screen');
        handleBackToWelcome();
      }, INACTIVITY_TIMEOUT_MS);
    };

    // Events that count as user activity
    const ACTIVITY_EVENTS = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'click',
      'scroll',
    ] as const;

    // Start the timer immediately and reset on every activity event
    resetTimer();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScreen]);

  /**
   * Navigation helpers
   */
  const handleAIImageGenerated = (imageData: ImageData): void => {
    setCapturedImageData(imageData);
    setCurrentScreen(SCREENS.PREVIEW);
  };


  /**
   * Screen rendering
   */
  // ========== 5.0 EVENT HANDLERS (NAVIGATION, CAPTURE, SAVE) ==========
  // (All handlers are defined above in useEffect blocks and callback functions)

  // ========== 6.0 SCREEN RENDERING (CONDITIONAL DISPLAY) ==========
  const renderScreen = (): ReactElement => {
    switch (currentScreen) {
      case SCREENS.WELCOME:
        return (
          <WelcomeScreen
            onStart={() => setCurrentScreen(SCREENS.SELECTION)}
          />
        );

      case SCREENS.SELECTION:
        return (
          <SelectionScreen
            onSelectCategory={handleSelectCategory}
          />
        );

      case SCREENS.AI_IMAGE:
        return (
          <AIImageScreen
            onGenerate={handleAIImageGenerated}
            onBack={() => setCurrentScreen(SCREENS.SELECTION)}
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
            onBack={() => setCurrentScreen(SCREENS.SELECTION)}
          />
        );

      case SCREENS.PREVIEW:
        return capturedImageData ? (
          <PreviewScreen
            imageData={capturedImageData}
            isVisible={true}
            showAsOverlay={true}
            onRetake={() => { setCapturedImageData(null); setCurrentScreen(SCREENS.CAPTURE); }}
            onContinue={handleBackToWelcome}
          />
        ) : (
          <WelcomeScreen onStart={() => setCurrentScreen(SCREENS.SELECTION)} />
        );

      default:
        return <WelcomeScreen onStart={() => setCurrentScreen(SCREENS.SELECTION)} />;
    }
  };

  // ========== 7.0 JSX RETURN ==========
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0812] text-[#f0e6ff] font-[Outfit]">
      {/* Error boundary handled by main.tsx */}
      {renderScreen()}
    </div>
  );
}

export default App;
