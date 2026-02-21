/**
 * ================================================================================
 * FILE: SelectionScreen.jsx - CATEGORY SELECTION INTERFACE
 * ================================================================================
 * 
 * Phase 1 MVP: Category selection before capture
 * Allows users to choose photo booth theme/category
 * 
 * STRUCTURE:
 * 1.0 IMPORTS, CATEGORIES CONSTANT & PROPS
 * 2.0 STATE MANAGEMENT
 * 3.0 CATEGORY SELECTION HANDLER
 * 4.0 JSX / RENDER
 * 
 * ================================================================================
 */

import { useState } from 'react';
import type { Category } from '../../../types';
import '../styles/screens.css';

interface SelectionScreenProps {
  onSelectCategory?: (categoryId: string) => void;
}

// ========== 1.0 CATEGORIES CONSTANT ==========
const CATEGORIES: Category[] = [
  {
    id: 'children',
    name: 'Children',
    description: 'Playful and colorful frames',
    emoji: '🎨',
  },
  {
    id: 'adult',
    name: 'Adult',
    description: 'Sophisticated and professional',
    emoji: '✨',
  },
  {
    id: 'proverb',
    name: 'Proverb',
    description: 'Thoughtful and inspiring',
    emoji: '🌟',
  },
  {
    id: 'collage',
    name: 'Creative',
    description: 'Multi-frame layouts',
    emoji: '🎭',
  },
  {
    id: 'blend',
    name: 'Blend',
    description: 'Generate with artificial intelligence',
    emoji: '🤖',
  },
];

// ========== 2.0 COMPONENT PROPS & STATE ==========
export const SelectionScreen = ({ onSelectCategory = () => {} }: SelectionScreenProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // ========== 3.0 CATEGORY SELECTION HANDLER ==========
  const handleSelectCategory = (categoryId: string): void => {
    setSelectedCategory(categoryId);
    setIsTransitioning(true);

    // Give visual feedback then proceed
    setTimeout(() => {
      onSelectCategory(categoryId);
    }, 300);
  };

  // ========== 4.0 JSX / RENDER ==========
  return (
    <div className="selection-screen">
      <div className="selection-bg-gradient" />
      
      {/* Main Title */}
      <div className="selection-header-main">
        <h1 className="selection-main-title">Take Selfie with the nature</h1>
      </div>
      
      {/* Category list (vertical) */}
      <div className="selection-grid">
        {/* Subtitle */}
        <h2 className="selection-title">Choose the style</h2>
        
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-card ${selectedCategory === category.id ? 'selected' : ''} ${
              isTransitioning && selectedCategory !== category.id ? 'dimmed' : ''
            }`}
            onClick={() => handleSelectCategory(category.id)}
            disabled={isTransitioning}
            aria-pressed={selectedCategory === category.id}
          >
            <div className="category-emoji">{category.emoji}</div>
            <div className="category-text">
              <h3 className="category-name">{category.name}</h3>
              <p className="category-description">{category.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SelectionScreen;
