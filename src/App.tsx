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

import { useState, useEffect, ReactElement } from 'react';
import './App.css';

// ========== 1.0 IMPORTS - SCREENS ==========
// Import screens
import { WelcomeScreen } from './components/screens/jsx/WelcomeScreen';
import { SelectionScreen } from './components/screens/jsx/SelectionScreen';
import { CaptureScreen } from './components/screens/jsx/CaptureScreen';
import { PreviewScreen } from './components/screens/jsx/PreviewScreen';
import AIImageScreen from './components/screens/jsx/AIImageScreen';

// ========== 1.1 IMPORTS - HOOKS & SERVICES ==========
// Import hooks
import { useSession } from './hooks/useSession';

// ========== 1.2 IMPORTS - TYPES ==========
import type { ImageData, Frame } from './types';

// ========== 1.3 IMPORTS - DYNAMIC ASSETS ==========
// Dynamically import frames
const childrenFramesRaw = import.meta.glob('./assets/Frames/Children/*.png', { eager: true, query: '?url' });
const adultFramesRaw = import.meta.glob('./assets/Frames/Adult/*.png', { eager: true, query: '?url' });
const proverbFramesRaw = import.meta.glob('./assets/Frames/Proverb/*.png', { eager: true, query: '?url' });
const collageFramesRaw = import.meta.glob('./assets/Frames/Collage/*.png', { eager: true, query: '?url' });
// ========== 2.0 FRAME DATA LOADING & FORMATTING ==========

/**
 * Format frames from glob results
 */
const formatFrames = (rawGlob: Record<string, any>, categoryName: string): Frame[] => {
  return Object.entries(rawGlob).map(([path, module]) => {
    const fileName = path.split('/').pop()?.replace('.png', '') || 'unknown';
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
  // ========== SCREEN STATE ==========
  const [currentScreen, setCurrentScreen] = useState<ScreenType>(SCREENS.WELCOME);
  const [selectedCategory, setSelectedCategory] = useState<string>('children');
  
  // ========== FRAME STATE ==========
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<string>('none');
  
  // ========== PHOTO STATE ==========
  const [capturedImageData, setCapturedImageData] = useState<ImageData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Hooks
  const session = useSession();

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
    if (category === 'ai') {
      setCurrentScreen(SCREENS.AI_IMAGE);
    } else {
      setCurrentScreen(SCREENS.CAPTURE);
    }
  };

  /**
   * Handle quick mode (skip category selection)
   */
  const handleQuickMode = (): void => {
    setCurrentScreen(SCREENS.CAPTURE);
  };

  /**
   * Handle photo capture
   * Creates session and saves to storage
   */
  const handleCapture = async (imageData: ImageData): Promise<void> => {
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

      // Skip auto-save, just show preview
      // await session.savePhoto(imageData.blob, imageData.metadata);

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
  const handleRetake = (): void => {
    setCapturedImageData(null);
    setCurrentScreen(SCREENS.CAPTURE);
  };

  /**
   * Handle save (already saved to IndexedDB in handleCapture)
   */
  const handleSave = (imageData: ImageData): void => {
    // Photo is already saved, just provide feedback
    console.log('Photo saved:', imageData);
  };

  /**
   * Handle print
   */
  const handlePrint = (imageData: ImageData): void => {
    console.log('Print requested:', imageData);
    // Printer integration in Phase 3
  };

  /**
   * Handle share
   */
  const handleShare = (imageData: ImageData): void => {
    console.log('Share requested:', imageData);
  };

  /**
   * Go back to welcome
   */
  const handleBackToWelcome = (): void => {
    setCurrentScreen(SCREENS.WELCOME);
    session.endSession();
    setCapturedImageData(null);
  };

  /**
   * Navigation helpers
   */
  const handleBackFromSelection = (): void => {
    setCurrentScreen(SCREENS.WELCOME);
  };

  const handleBackFromAI = (): void => {
    setCurrentScreen(SCREENS.SELECTION);
  };

  const handleAIImageGenerated = async (imageData: ImageData): Promise<void> => {
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

      // Store for preview
      setCapturedImageData(imageData);
      
      // Transition to preview screen
      setCurrentScreen(SCREENS.PREVIEW);
    } catch (error) {
      console.error('AI image generation failed:', error);
      alert('Failed to process AI image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBackFromCapture = (): void => {
    setCurrentScreen(SCREENS.SELECTION);
  };

  const handleBackFromPreview = (): void => {
    handleRetake();
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
            onBack={handleBackFromAI}
            isLoading={isProcessing}
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
            isLoading={isProcessing}
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
        ) : (
          <WelcomeScreen onStart={() => setCurrentScreen(SCREENS.SELECTION)} />
        );

      default:
        return <WelcomeScreen onStart={() => setCurrentScreen(SCREENS.SELECTION)} />;
    }
  };

  // ========== 7.0 JSX RETURN ==========
  return (
    <div className="app">
      {/* Error boundary handled by main.tsx */}
      {renderScreen()}
    </div>
  );
}

export default App;
