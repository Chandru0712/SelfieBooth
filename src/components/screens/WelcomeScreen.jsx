/**
 * WelcomeScreen Component
 * Phase 1 MVP: US-050 Welcome & Introduction Screen
 * 
 * Simple tap-to-start welcome screen
 */

import React, { useEffect, useState } from 'react';
import '../screens/screens.css';

export const WelcomeScreen = ({ onStart }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);

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
        console.log('Camera permission not granted yet:', error.message);
      } finally {
        setIsRequestingCamera(false);
      }
    };

    // Request after a short delay so the welcome screen renders first
    const timeout = setTimeout(preRequestCamera, 500);
    
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="welcome-screen" onClick={onStart}>
      {/* Background gradient */}
      <div className="welcome-bg-gradient" />

      {/* Main content container */}
      <div className={`welcome-content ${isAnimating ? 'animated' : ''}`}>
        {/* Logo/Brand */}
        <div className="welcome-logo-container">
          <div className="welcome-logo">📸</div>
          <h1 className="welcome-title">SelfieBooth Pro</h1>
        </div>

        {/* Simple tap instruction */}
        <div className="welcome-tap-instruction">
          <p className="tap-text">Tap anywhere to start</p>
          <div className="tap-indicator">👆</div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
