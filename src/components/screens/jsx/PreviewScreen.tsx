/**
 * ================================================================================
 * FILE: PreviewScreen.tsx - COMMON CAPTURE PREVIEW & UPLOAD INTERFACE
 * ================================================================================
 * 
 * Central preview component for all capture screens (AIImageScreen, CaptureScreen)
 * Handles:
 * - Image preview and display
 * - Retake/Continue workflow
 * - Image upload to API
 * - Inline QR code generation and display using qrcode.react
 * - Print and Share functionality
 * 
 * ================================================================================
 */

import { useState, useRef, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { ImageData } from '../../../types';
import { uploadImageAndGenerateQR, downloadImageFromUrl } from '../../../utils/apiService.ts';
import '../styles/PreviewScreen.css';

interface PreviewScreenProps {
  imageData: ImageData | null;
  isVisible: boolean;
  isLoading?: boolean;
  onRetake?: () => void;
  onContinue?: (imageData: ImageData) => void;
  showAsOverlay?: boolean;
}

export const PreviewScreen = ({
  imageData,
  isVisible = false,
  isLoading = false,
  onRetake = () => {},
  onContinue = () => {},
  showAsOverlay = true,
}: PreviewScreenProps) => {
  // ========== STATE MANAGEMENT ==========
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // Cleanup on unmount or when imageData changes
  useEffect(() => {
    return () => {
      if (imageData?.url) {
        try {
          URL.revokeObjectURL(imageData.url);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [imageData?.url]);

  if (!isVisible || !imageData) {
    return null;
  }

  // ========== UPLOAD & QR LOGIC ==========
  const handleContinue = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      setUploadedImageUrl(null);

      console.log('📤 Starting upload...', {
        fileName: imageData.metadata.fileName,
        blobSize: imageData.blob.size,
      });

      // Upload image and get image URL
      const uploadResult = await uploadImageAndGenerateQR(
        imageData.blob,
        imageData.metadata.fileName
      );

      console.log('📥 Upload response received:', uploadResult);

      if (!uploadResult.success) {
        const errorMsg = uploadResult.error || 'Upload failed. Please try again.';
        console.error('❌ Upload failed:', errorMsg);
        setError(errorMsg);
        return;
      }

      if (!uploadResult.imageUrl) {
        console.warn('⚠️ No image URL in upload response');
        setError('Upload successful but no image URL returned');
        return;
      }

      console.log('✅ Upload successful! Image URL:', uploadResult.imageUrl);
      setUploadedImageUrl(uploadResult.imageUrl);
    } catch (err) {
      console.error('Failed to upload image:', err);
      setError('Failed to upload image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = () => {
    try {
      const printWindow = window.open('', '', 'width=800,height=600');
      if (!printWindow) {
        setError('Failed to open print window');
        return;
      }

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
    } catch (err) {
      console.error('Print failed:', err);
      setError('Failed to print image');
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        // Native share
        const file = new File([imageData.blob], imageData.metadata.fileName, {
          type: 'image/png',
        });
        await navigator.share({
          title: 'My Selfie',
          text: 'Check out my selfie!',
          files: [file],
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': imageData.blob,
          }),
        ]);
        alert('Photo copied to clipboard!');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
        setError('Share not available on this device');
      }
    }
  };

  const downloadQRCode = () => {
    if (!qrRef.current) return;
    
    const canvas = qrRef.current.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    
    const url = canvas.toDataURL('image/png');
    downloadImageFromUrl(url, 'qrcode.png');
  };

  // EVENT HANDLERS
  const handleRetake = () => {
    setError(null);
    setUploadedImageUrl(null);
    if (onRetake) {
      onRetake();
    }
  };

  // ========== RENDER LOGIC ==========
  if (showAsOverlay) {
    // Overlay mode - upload screen with QR code
    return (
      <div className="capture-preview-overlay">
        {/* Top Header */}
        <div className="layout-header">
          <div className="header-spacer" />
          <h1 className="category-title">Preview</h1>
          <div className="header-spacer" /> 
        </div>

        {/* Main Interface -> Keep image fixed in background, action panel fixed at bottom */}
        <div className="flex-col-full main-interface-container">
          
          {/* Always show the preview image spanning the available height */}
          <div className="preview-image-wrapper image-bounds-padding-top">
            <img
              ref={imgRef}
              src={uploadedImageUrl || imageData.url}
              alt="Captured preview"
              className="preview-image-inner"
            />
            
            {/* Bottom QR Code (Only visible after successful upload, no text or retake button) */}
            {uploadedImageUrl && !isProcessing && (
              <div className="qr-bottom-container">
                <div className="qr-canvas-wrapper large qr-padded" ref={qrRef}>
                  <QRCodeCanvas
                    value={uploadedImageUrl}
                    size={512}
                    level="H"
                    includeMargin={true}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Top panel with blur effect containing dynamic actions */}
          <div className="bottom-blur-panel panel-fixed-top">
            <button
              className="btn btn-secondary btn-large-action secondary"
              onClick={handleRetake}
              disabled={isProcessing}
            >
              ↻ Retake
            </button>

            <button
              className="btn btn-primary btn-large-action primary"
              onClick={handleContinue}
              disabled={isProcessing || !!uploadedImageUrl}
            >
              {isProcessing ? 'Generating QR Code...' : '✓ Click & Get QR'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-toast">
            {error}
          </div>
        )}
      </div>
    );
  }

  // Regular preview screen mode
  return (
    <div className="preview-screen">
      {/* Top Header */}
      <div className="layout-header">
        <div className="header-spacer" />
        <h1 className="category-title">Preview</h1>
        <div className="header-spacer" /> 
      </div>

      {/* Main preview area */}
      <div className="preview-main">
        <div className="preview-image-container">
          <img
            ref={imgRef}
            src={imageData.url}
            alt="Captured photo"
            className="preview-image"
          />

          {isProcessing && (
            <div className="preview-loading">
              <div className="spinner" />
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (Only show if not yet uploaded) */}
      {!uploadedImageUrl && (
        <div className="preview-actions">
          <button
            className="btn btn-secondary btn-large-action secondary"
            onClick={handleRetake}
            disabled={isProcessing}
          >
            ↻ Retake
          </button>

          <div className="export-menu-wrapper">
            <button
              className="btn btn-primary btn-large-action primary"
              onClick={handleContinue}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block' }} />
                  <span>Uploading...</span>
                </>
              ) : (
                '✓ Upload & Get QR'
              )}
            </button>

            <div className="export-menu" role="menu">
              <button
                className="export-option"
                onClick={handlePrint}
                role="menuitem"
                disabled={isProcessing}
              >
                <span className="export-icon">🖨️</span>
                <span>Print</span>
              </button>

              <button
                className="export-option"
                onClick={handleShare}
                role="menuitem"
                disabled={isProcessing}
              >
                <span className="export-icon">📲</span>
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="preview-info error-text" aria-live="polite">
          <p className="info-text">⚠️ {error}</p>
        </div>
      )}

      {/* Photo info */}
      {uploadedImageUrl && (
        <div className="upload-success-panel">
          <p className="success-title">✅ Upload Successful!</p>
          <div className="qr-controls">
            <div className="qr-canvas-wrapper large" ref={qrRef}>
              <QRCodeCanvas value={uploadedImageUrl} size={250} level="H" includeMargin={true} />
            </div>
            <button
              onClick={handleRetake}
              className="btn btn-secondary btn-retake-medium"
            >
              ↻ Retake
            </button>
          </div>
          <div className="panel-actions">
            <button
              onClick={handlePrint}
              className="btn btn-secondary"
            >
              🖨️ Print
            </button>
            
            <button
              onClick={handleShare}
              className="btn btn-secondary"
            >
              📲 Share
            </button>

            <button
              onClick={downloadQRCode}
              className="btn-qr-download"
            >
              📥 Download QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewScreen;
