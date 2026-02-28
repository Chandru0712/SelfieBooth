import React from 'react';
import './CubeSpinner.css';

const CubeSpinner: React.FC = () => {
  return (
    <div className="advanced-spinner-container">
      <div className="advanced-spinner">
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-ring"></div>
        <div className="spinner-particles"></div>
        <div className="spinner-core"></div>
        <div className="spinner-core-glow"></div>
      </div>
    </div>
  );
};

export default CubeSpinner;
