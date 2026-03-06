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

import { useState, useEffect, useRef, ReactElement, Suspense, lazy, useMemo, useCallback } from 'react';

// ========== 1.0 IMPORTS - SCREENS ==========
// Import screens lazily to dramatically improve initial load times
const WelcomeScreen = lazy(() => import('./components/screens/jsx/WelcomeScreen').then(module => ({ default: module.WelcomeScreen })));
const SelectionScreen = lazy(() => import('./components/screens/jsx/SelectionScreen').then(module => ({ default: module.SelectionScreen })));
const CaptureScreen = lazy(() => import('./components/screens/jsx/CaptureScreen').then(module => ({ default: module.CaptureScreen })));
const PreviewScreen = lazy(() => import('./components/screens/jsx/PreviewScreen').then(module => ({ default: module.PreviewScreen })));
const AIImageScreen = lazy(() => import('./components/screens/jsx/AIImageScreen'));


// ========== 1.2 IMPORTS - TYPES ==========
import type { ImageData, Frame } from './types';

// ========== 1.3 IMPORTS - DYNAMIC ASSETS ==========
// Keep frame imports lazy so initial app load does not eagerly include every frame category.
type FrameModuleLoader = () => Promise<{ default?: string } | string>;
const FRAME_GLOBS: Record<string, Record<string, FrameModuleLoader>> = {
  children: import.meta.glob('./assets/Frames/Children/*.webp', { query: '?url' }) as Record<string, FrameModuleLoader>,
  adult: import.meta.glob('./assets/Frames/Adult/*.webp', { query: '?url' }) as Record<string, FrameModuleLoader>,
  proverb: import.meta.glob('./assets/Frames/Proverb/*.webp', { query: '?url' }) as Record<string, FrameModuleLoader>,
  creative: import.meta.glob('./assets/Frames/Creative/*.webp', { query: '?url' }) as Record<string, FrameModuleLoader>,
};

const frameCache = new Map<string, Frame[]>();
const framePromiseCache = new Map<string, Promise<Frame[]>>();

const loadFramesForCategory = async (categoryName: string): Promise<Frame[]> => {
  if (frameCache.has(categoryName)) {
    return frameCache.get(categoryName)!;
  }
  if (framePromiseCache.has(categoryName)) {
    return framePromiseCache.get(categoryName)!;
  }

  const categoryGlob = FRAME_GLOBS[categoryName];
  if (!categoryGlob) return [];

  const pendingFrames = Promise.all(
    Object.entries(categoryGlob).map(async ([path, loader]) => {
      const loadedModule = await loader();
      const fileName = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'unknown';
      const imageUrl = (loadedModule as { default?: string }).default || (loadedModule as string);
      return {
        id: `${categoryName}-${fileName}`,
        name: `Frame ${fileName}`,
        image: imageUrl,
        path,
        category: categoryName,
      };
    })
  ).then((loadedFrames) => {
    loadedFrames.sort((a, b) => a.name.localeCompare(b.name));
    frameCache.set(categoryName, loadedFrames);
    framePromiseCache.delete(categoryName);
    return loadedFrames;
  });

  framePromiseCache.set(categoryName, pendingFrames);
  return pendingFrames;
};

const CATEGORY_NAMES: Record<string, string> = {
  children: 'Children',
  adult: 'Adult',
  proverb: 'Proverb',
  creative: 'Creative',
  wildlife: 'Wild Life',
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
  const [selectedFrame, setSelectedFrame] = useState<string>('none');
  
  // ========== PHOTO STATE ==========
  const [capturedImageData, setCapturedImageData] = useState<ImageData | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [isFramesLoading, setIsFramesLoading] = useState(false);

  // ========== INACTIVITY TIMER ==========
  // 30 minutes in milliseconds
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFrames = async () => {
      setIsFramesLoading(true);
      const loadedFrames = await loadFramesForCategory(selectedCategory);
      if (!cancelled) {
        setFrames(loadedFrames);
        setIsFramesLoading(false);
      }
    };

    loadFrames();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleCallbackId: number | null = null;
    let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const preloadScreensAndFrames = () => {
      import('./components/screens/jsx/SelectionScreen');
      import('./components/screens/jsx/CaptureScreen');
      import('./components/screens/jsx/PreviewScreen');
      import('./components/screens/jsx/AIImageScreen');

      Object.keys(FRAME_GLOBS).forEach((category) => {
        void loadFramesForCategory(category);
      });
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleCallbackId = win.requestIdleCallback(preloadScreensAndFrames, { timeout: 2000 });
    } else {
      idleTimeoutId = setTimeout(preloadScreensAndFrames, 600);
    }

    return () => {
      if (idleCallbackId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleCallbackId);
      }
      if (idleTimeoutId !== null) {
        clearTimeout(idleTimeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!frames.some((frame) => frame.id === selectedFrame)) {
      setSelectedFrame(frames[0]?.id || 'none');
    }
  }, [frames, selectedFrame]);

  /**
   * Handle category selection
   */
  const handleSelectCategory = useCallback((category: string): void => {
    setSelectedCategory(category);
    if (category === 'blend' || category === 'wildlife') {
      setCurrentScreen(SCREENS.AI_IMAGE);
    } else {
      setCurrentScreen(SCREENS.CAPTURE);
    }
  }, []);

  /**
   * Handle photo capture — stores image and shows preview
   */
  const handleCapture = useCallback((imageData: ImageData): void => {
    setCapturedImageData(imageData);
    setCurrentScreen(SCREENS.PREVIEW);
  }, []);


  /**
   * Go back to welcome
   */
  const handleBackToWelcome = useCallback((): void => {
    setCurrentScreen(SCREENS.WELCOME);
    setCapturedImageData(null);
  }, []);

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
  const handleAIImageGenerated = useCallback((imageData: ImageData): void => {
    setCapturedImageData(imageData);
    setCurrentScreen(SCREENS.PREVIEW);
  }, []);


  /**
   * Screen rendering
   */
  // ========== 5.0 EVENT HANDLERS (NAVIGATION, CAPTURE, SAVE) ==========
  // (All handlers are defined above in useEffect blocks and callback functions)

  // ========== 6.0 SCREEN RENDERING (CONDITIONAL DISPLAY) ==========
  const categoryName = useMemo(
    () => CATEGORY_NAMES[selectedCategory] || selectedCategory,
    [selectedCategory]
  );

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
            category={categoryName}
            onGenerate={handleAIImageGenerated}
            onBack={() => setCurrentScreen(SCREENS.SELECTION)}
          />
        );

      case SCREENS.CAPTURE:
        return (
          <CaptureScreen
            category={categoryName}
            frames={frames}
            isLoading={isFramesLoading}
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
      <Suspense fallback={<div className="flex h-full w-full items-center justify-center text-3xl tracking-wide">Loading...</div>}>
        {renderScreen()}
      </Suspense>
    </div>
  );
}

export default App;
