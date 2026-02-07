/**
 * SelectionScreen Component
 * Phase 1 MVP: Category selection before capture
 * 
 * Allows users to choose photo booth theme/category
 */

import React, { useState } from 'react';
import '../screens/screens.css';

const CATEGORIES = [
  {
    id: 'children',
    name: 'Kids Fun',
    description: 'Playful and colorful frames',
    emoji: '🎨',
  },
  {
    id: 'adult',
    name: 'Elegant',
    description: 'Sophisticated and professional',
    emoji: '✨',
  },
  {
    id: 'proverb',
    name: 'Wisdom',
    description: 'Thoughtful and inspiring',
    emoji: '🌟',
  },
  {
    id: 'collage',
    name: 'Creative',
    description: 'Multi-frame layouts',
    emoji: '🎭',
  },
];

export const SelectionScreen = ({ onSelectCategory }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleSelectCategory = (categoryId) => {
    setSelectedCategory(categoryId);
    setIsTransitioning(true);

    // Give visual feedback then proceed
    setTimeout(() => {
      onSelectCategory(categoryId);
    }, 300);
  };

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
