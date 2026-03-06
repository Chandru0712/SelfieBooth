import { useEffect, useState } from 'react';
import type { Category } from '../../../types';

interface SelectionScreenProps {
  onSelectCategory?: (categoryId: string) => void;
}

const CATEGORIES: Category[] = [
  { id: 'children', name: 'Children',  description: 'Playful and colorful frames',           emoji: '🎨' },
  // { id: 'adult',    name: 'Adult',     description: 'Sophisticated and professional',         emoji: '✨' },
  { id: 'proverb',  name: 'Proverb',   description: 'Thoughtful and inspiring',              emoji: '🌟' },
  { id: 'creative',  name: 'Creative',  description: 'Multi-frame layouts',                    emoji: '🎭' },
  { id: 'wildlife',    name: 'WildLife',     description: 'Generate with artificial intelligence',  emoji: '🤖' },
];

export const SelectionScreen = ({ onSelectCategory = () => {} }: SelectionScreenProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const tigerLoader = import.meta.glob('../../../assets/Tiger.webp', { query: '?url' });
    const loader = Object.values(tigerLoader)[0] as (() => Promise<{ default?: string } | string>) | undefined;

    if (!loader) return;
    const loadBackground = async () => {
      const loaded = await loader();
      if (!cancelled) {
        setBackgroundImageUrl((loaded as { default?: string }).default || (loaded as string));
      }
    };

    loadBackground();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectCategory = (categoryId: string): void => {
    setSelectedCategory(categoryId);
    setIsTransitioning(true);
    setTimeout(() => onSelectCategory(categoryId), 300);
  };

  return (
    <div
      className="relative flex flex-col items-center justify-between w-screen h-screen overflow-hidden"
      style={{
        backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
        backgroundPosition: 'center',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundColor: '#0c0812',
      }}
    >
      {/* Subtle dark overlay */}
      <div className="absolute inset-0 bg-[rgba(12,8,18,0.50)] pointer-events-none z-0" />

      {/* Main Title */}
      <div className="relative z-10 w-full text-center pt-24 pb-4">
        <h1
          className="text-[clamp(80px,18vw,150px)] font-bold leading-[1.1] tracking-wide"
          style={{
            background: 'linear-gradient(135deg, #f0e6ff 0%, #d8b4fe 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Take Selfie With The Nature
        </h1>
      </div>

      {/* Category grid — properly centered vertically */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-6 w-full max-w-[800px] mx-auto flex-1 pb-[500px]">
        <h2
          className="text-[72px] font-[Righteous] text-white text-center tracking-[2px]"
          style={{ textShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
        >
          Choose the style
        </h2>

        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`
              relative flex flex-row items-center justify-center gap-6
              w-full px-[200px] py-[50px]
              rounded-[20px] border-2
              text-white cursor-pointer
              overflow-hidden
              transition-all duration-300
              ${selectedCategory === category.id
                ? 'scale-105 border-[rgba(224,64,251,0.85)] bg-[rgba(168,85,247,0.15)]'
                : 'border-[rgba(168,85,247,0.22)] bg-[rgba(255,255,255,0.06)]'}
              ${isTransitioning && selectedCategory !== category.id ? 'opacity-40' : ''}
              hover:scale-[1.05] hover:-translate-y-0.5 hover:bg-[rgba(168,85,247,0.14)] hover:border-[rgba(224,64,251,0.65)]
              active:scale-[0.98]
            `}
            style={{
              backdropFilter: 'blur(20px) saturate(1.8) brightness(1.1)',
              boxShadow: '0 4px 32px 0 rgba(0,0,0,0.18), 0 0 20px rgba(168,85,247,0.10)',
              animation: 'pulse-glow-subtle 3s infinite',
            }}
            onClick={() => handleSelectCategory(category.id)}
            disabled={isTransitioning}
            aria-pressed={selectedCategory === category.id}
          >
            {/* Shimmer sweep */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                transform: 'translateX(-100%)',
                transition: 'transform 0.5s ease',
              }}
            />
            <div
              className="text-[64px] transition-transform duration-300"
              style={{ filter: 'drop-shadow(0 0 10px rgba(224,64,251,0.65))', }}
            >
              {category.emoji}
            </div>
            <div className="flex flex-col items-center justify-center gap-1 flex-1 text-center">
              <h3
                className="text-[64px] font-bold m-0 uppercase tracking-[2px]"
                style={{ textShadow: '0 0 10px rgba(224,64,251,0.5)' }}
              >
                {category.name}
              </h3>
              <p className="text-sm text-white/80 font-medium tracking-[0.5px]">
                {category.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SelectionScreen;
