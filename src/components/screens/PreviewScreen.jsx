/**
 * PreviewScreen Component
 * Phase 1 MVP: US-014, 040, 041, 042
 * 
 * Display captured photo with options to retake, edit, save, print, or share
 */

import React, { useState, useRef, useEffect } from 'react';
import '../screens/screens.css';

export const PreviewScreen = ({
  imageData,
  onRetake,
  onSave,
  onPrint,
  onShare,
  isLoading = false,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const imgRef = useRef(null);

  /**
   * Download image
   * US-040: Download Image
   */
  const handleDownload = async () => {
    try {
      const url = URL.createObjectURL(imageData.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `selfie-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup blob URL after short delay
      setTimeout(() => URL.revokeObjectURL(url), 100);

      // Call parent handler
      if (onSave) onSave(imageData);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download image');
    }
  };

  /**
   * Print image
   * US-041: Print Image
   */
  const handlePrint = () => {
    try {
      const printWindow = window.open('', '', 'width=800,height=600');
      const url = URL.createObjectURL(imageData.blob);

      printWindow.document.write(`
        <html>
          <head>
            <title>Print Photo</title>
            <style>
              body { margin: 0; padding: 20px; }
              img { max-width: 100%; height: auto; }
              @media print {
                body { margin: 0; padding: 0; }
              }
            </style>
          </head>
          <body onload="window.print(); window.close();">
            <img src="${url}" alt="Photo" />
          </body>
        </html>
      `);
      printWindow.document.close();

      if (onPrint) onPrint(imageData);
    } catch (err) {
      console.error('Print failed:', err);
      alert('Failed to print image');
    }
  };

  /**
   * Share image
   * US-042: Share via Native API
   */
  const handleShare = async () => {
    try {
      if (navigator.share) {
        // Native share
        const file = new File([imageData.blob], 'photo.png', { type: 'image/png' });
        await navigator.share({
          title: 'My Selfie',
          text: 'Check out my selfie!',
          files: [file],
        });
      } else {
        // Fallback: copy to clipboard
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': imageData.blob,
            }),
          ]);
          alert('Photo copied to clipboard!');
        } catch {
          alert('Share not available on this device');
        }
      }

      if (onShare) onShare(imageData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  return (
    <div className="preview-screen">
      {/* Header */}
      <div className="preview-header">
        <h2 className="preview-title">Your Photo</h2>
      </div>

      {/* Main preview area */}
      <div className="preview-main">
        <div className="preview-image-container">
          {/* Image display */}
          <div
            className="preview-image-wrapper"
            style={{
              transform: `scale(${zoomLevel})`,
              overflow: 'auto',
            }}
          >
            <img
              ref={imgRef}
              src={URL.createObjectURL(imageData.blob)}
              alt="Captured photo"
              className="preview-image"
            />
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="preview-loading">
              <div className="spinner" />
            </div>
          )}
        </div>

        {/* Zoom controls */}
        <div className="preview-zoom-controls">
          <button
            className="btn btn-sm"
            onClick={() => setZoomLevel(Math.max(1, zoomLevel - 0.1))}
            disabled={zoomLevel <= 1}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="zoom-level">{(zoomLevel * 100).toFixed(0)}%</span>
          <button
            className="btn btn-sm"
            onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.1))}
            disabled={zoomLevel >= 3}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="preview-actions">
        {/* Primary actions - prominent */}
        <button className="btn btn-secondary btn-lg" onClick={onRetake} disabled={isLoading}>
          ↻ Retake
        </button>

        {/* Export menu trigger */}
        <div className="export-menu-wrapper">
          <button
            className={`btn btn-primary btn-lg ${showExportMenu ? 'active' : ''}`}
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isLoading}
            aria-expanded={showExportMenu}
            aria-haspopup="menu"
          >
            📤 Save & Share
          </button>

          {/* Export options menu */}
          {showExportMenu && (
            <div className="export-menu" role="menu">
              <button
                className="export-option"
                onClick={handleDownload}
                role="menuitem"
                disabled={isLoading}
              >
                <span className="export-icon">💾</span>
                <span>Download</span>
              </button>

              <button
                className="export-option"
                onClick={handlePrint}
                role="menuitem"
                disabled={isLoading}
              >
                <span className="export-icon">🖨️</span>
                <span>Print</span>
              </button>

              <button
                className="export-option"
                onClick={handleShare}
                role="menuitem"
                disabled={isLoading}
              >
                <span className="export-icon">📲</span>
                <span>Share</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Photo info */}
      <div className="preview-info" aria-polite="polite">
        <p className="info-text">
          📏 {imageData.metadata?.width} × {imageData.metadata?.height}px
        </p>
      </div>
    </div>
  );
};

export default PreviewScreen;
