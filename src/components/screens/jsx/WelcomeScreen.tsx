import { useEffect, useState } from 'react';
import bg1 from '../../../assets/Welcome-01-4k.webp';
import bg2 from '../../../assets/Welcome-02-4k.webp';

const BACKGROUND_IMAGES = [bg1, bg2];

const SESSION_BACKGROUND: string =
  BACKGROUND_IMAGES[Math.floor(Math.random() * BACKGROUND_IMAGES.length)];

interface WelcomeScreenProps {
  onStart?: () => void;
}

export const WelcomeScreen = ({ onStart = () => {} }: WelcomeScreenProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const currentBg = SESSION_BACKGROUND;

  useEffect(() => {
    setIsAnimating(true);
    const preRequestCamera = async () => {
      try {
        setIsRequestingCamera(true);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.log('Camera permission not granted yet:', (error as Error).message);
      } finally {
        setIsRequestingCamera(false);
      }
    };
    const timeout = setTimeout(preRequestCamera, 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    /* Full-screen wrapper — background image, clickable */
    <div
      className="relative flex items-center justify-center w-screen h-screen overflow-hidden cursor-pointer"
      onClick={onStart}
    >
      {/* Background image layer */}
      <div
        className="absolute inset-0 bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${currentBg})` }}
      />

      {/* Dark gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(5,13,26,0.55)] via-transparent to-[rgba(5,13,26,0.3)]" />

      {/* Content — fades + slides in on mount */}
      <div
        className={`relative z-10 flex flex-col items-center justify-between h-full w-full px-5 py-16
          transition-all duration-700 ease-out
          ${isAnimating ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        {/* Brand / Logo */}
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-2xl tracking-[6px] text-white/80 uppercase font-[Righteous]"
            style={{ animation: 'float 4s ease-in-out infinite' }}
          >
            SNAPSHOT
          </span>
        </div>

        {/* Center: Tap-to-Start glass button */}
        <div className="flex items-center justify-center flex-1 w-full">
          {/* Glassmorphism TAP TO START */}
          <div
            className="
              shimmer-btn
              flex items-center justify-center gap-8
              px-24 py-10
              rounded-[28px]
              border border-[rgba(100,160,255,0.35)]
              transition-all duration-350 ease-out
              hover:scale-105 hover:-translate-y-1
              active:scale-[0.98]
            "
            style={{
              background: 'rgba(5,13,26,0.35)',
              backdropFilter: 'blur(20px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
              boxShadow: '0 8px 40px rgba(0,30,80,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
          >
            {/* Bouncing finger icon */}
            <span
              className="text-5xl"
              style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))', animation: 'bounce-icon 1.5s infinite ease-in-out' }}
            >
              👆
            </span>
            {/* Label */}
            <span
              className="text-[54px] font-extrabold tracking-[3px] text-white font-[Pacifico]"
              style={{ textShadow: '0 0 20px rgba(100,180,255,0.6), 0 2px 8px rgba(0,0,0,0.5)' }}
            >
              TAP TO START
            </span>
          </div>
        </div>

        {/* Bottom spacer so content doesn't touch edge */}
        <div className="h-8" />
      </div>

      {/* Hidden: camera request status — no UI needed */}
      {isRequestingCamera && <span className="sr-only">Requesting camera…</span>}
    </div>
  );
};

export default WelcomeScreen;
