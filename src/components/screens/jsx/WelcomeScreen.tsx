/**
 * ================================================================================
 * FILE: WelcomeScreen.jsx - WELCOME & INTRODUCTION SCREEN
 * ================================================================================
 * 
 * Phase 1 MVP: US-050 Welcome & Introduction Screen
 * Simple tap-to-start welcome screen with pre-camera permission request
 * 
 * STRUCTURE:
 * 1.0 IMPORTS & PROPS
 * 2.0 STATE MANAGEMENT & LIFECYCLE
 * 3.0 CAMERA PRE-REQUEST (BACKGROUND)
 * 4.0 JSX / RENDER
 * 
 * ================================================================================
 */

import { useEffect, useState } from 'react';
import bg1 from '../../../assets/Welcome-01-4k.webp';
import bg2 from '../../../assets/Welcome-02-4k.webp';

import '../styles/screens.css';

// ---- Add or remove images from this list to change the pool ----
const BACKGROUND_IMAGES = [bg1, bg2];

/**
 * Pick a background image ONCE at app startup — randomly.
 * - Each kiosk independently picks a different random image on launch.
 * - Same image is locked in for the whole session (no change on auto-reset or remount).
 * - Only changes when the app/browser is fully restarted.
 */
const SESSION_BACKGROUND: string =
  BACKGROUND_IMAGES[Math.floor(Math.random() * BACKGROUND_IMAGES.length)];


interface WelcomeScreenProps {
  onStart?: () => void;
}

// ========== 1.0 COMPONENT & PROPS ==========
export const WelcomeScreen = ({ onStart = () => {} }: WelcomeScreenProps) => {
  // ========== 2.0 STATE MANAGEMENT & LIFECYCLE ==========
  const [isAnimating, setIsAnimating] = useState(false);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  // Background is fixed for the whole session — no re-pick on remount
  const currentBg = SESSION_BACKGROUND;

  // ========== 3.0 CAMERA PRE-REQUEST (BACKGROUND) ==========
  useEffect(() => {
    // Trigger animation on mount
    setIsAnimating(true);

    // Pre-request camera permission to have it ready
    const preRequestCamera = async () => {
      try {
        setIsRequestingCamera(true);
        // Request camera access in the background
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        
        // Immediately stop the stream - we just wanted to request permission
        stream.getTracks().forEach(track => track.stop());
        console.log('✓ Camera permission granted and ready');
      } catch (error) {
        // Silently fail - user will be prompted again on capture screen if needed
        console.log('Camera permission not granted yet:', (error as Error).message);
      } finally {
        setIsRequestingCamera(false);
      }
    };

    // Request after a short delay so the welcome screen renders first
    const timeout = setTimeout(preRequestCamera, 500);
    
    return () => clearTimeout(timeout);
  }, []);

  // ========== 4.0 JSX / RENDER ==========
  return (
    <div className="welcome-screen" onClick={onStart}>
      {/* Random background image */}
      <div
        className="welcome-bg-image"
        style={{ backgroundImage: `url(${currentBg})` }}
      />
      {/* Background gradient overlay */}
      <div className="welcome-bg-gradient" />

      {/* Main content container */}
      <div className={`welcome-content ${isAnimating ? 'animated' : ''}`}>
        {/* Logo/Brand */}
        <div className="welcome-logo-container">
          <div className="welcome-logo">SNAPSHOT</div>
        </div>

        {/* Vertical Title Stack */}
        {/* <div className="welcome-title-container">
          <h1 className="welcome-title-line">SELFIE</h1>
          <h1 className="welcome-title-line">BOOTH</h1>
          <h1 className="welcome-title-line highlight">PRO</h1>
        </div> */}

        {/* Glass Button Instruction */}
        <div className="welcome-action-container">
          <div className="glass-button-large">
            <span className="tap-icon">👆</span>
            <span className="tap-text">TAP TO START</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
