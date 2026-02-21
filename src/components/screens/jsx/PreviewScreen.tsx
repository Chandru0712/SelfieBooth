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
import '../styles/screens.css';

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

  const handleDone = () => {
    if (onContinue) {
      onContinue(imageData);
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
        {/* Upload in progress */}
        {isProcessing && (
          <div className="capture-preview-image-container">
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '20px'
            }}>
              <div className="spinner" />
              <p style={{ color: '#fff', fontSize: '16px' }}>Uploading & Generating QR Code...</p>
            </div>
          </div>
        )}

        {/* Upload complete - show image + QR code */}
        {!isProcessing && uploadedImageUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Top Bar: Actions & QR */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: '30px',
              padding: '20px',
              background: 'rgba(0,0,0,0.4)',
              zIndex: 10
            }}>
              {/* QR Code Block */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: '#00f2ff', fontWeight: 'bold', margin: 0, fontSize: '18px' }}>✅ Upload Successful!</p>
                  <p style={{ color: '#fff', margin: '5px 0 0 0', fontSize: '14px' }}>Scan to download</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                  <div
                    ref={qrRef}
                    style={{
                      background: 'white',
                      padding: '8px',
                      borderRadius: '8px',
                      boxShadow: '0 0 15px rgba(0, 242, 255, 0.4)'
                    }}
                  >
                    <QRCodeCanvas
                      value={uploadedImageUrl}
                      size={500}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={handleRetake}
                    disabled={isProcessing}
                    style={{ borderRadius: '30px', padding: '12px 30px', width: '100%' }}
                  >
                    ↻ Retake
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom: Image */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              overflow: 'hidden',
              padding: '10px'
            }}>
              <img
                src={uploadedImageUrl}
                alt="Uploaded photo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'left top'
                }}
              />
            </div>
          </div>
        )}

        {/* Before upload - show image with upload button */}
        {!isProcessing && !uploadedImageUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Top Bar: Actions */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '20px',
              padding: '20px',
              background: 'rgba(0,0,0,0.4)',
              zIndex: 10
            }}>
              <button
                className="btn btn-secondary"
                onClick={handleRetake}
                disabled={isProcessing}
                style={{ borderRadius: '30px', padding: '12px 30px' }}
              >
                ↻ Retake
              </button>

              <button
                className="btn btn-primary btn-lg"
                onClick={handleContinue}
                disabled={isProcessing}
                style={{ borderRadius: '30px', boxShadow: '0 0 20px rgba(0,242,255,0.4)', padding: '16px 40px', border: 'none' }}
              >
                ✓ Upload & Get QR
              </button>
            </div>

            {/* Bottom: Image */}
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              overflow: 'hidden',
              padding: '10px'
            }}>
              <img
                ref={imgRef}
                src={imageData.url}
                alt="Captured preview"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'left top'
                }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            style={{
              position: 'fixed',
              bottom: '200px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(239, 68, 68, 0.9)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '14px',
              zIndex: 2001,
              maxWidth: '80%',
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  // Regular preview screen mode
  return (
    <div className="preview-screen">
      {/* Header */}
      <div className="preview-header">
        <h2 className="preview-title">Your Photo</h2>
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
            className="btn btn-secondary btn-lg"
            onClick={handleRetake}
            disabled={isProcessing}
          >
            ↻ Retake
          </button>

          <div className="export-menu-wrapper">
            <button
              className="btn btn-primary btn-lg"
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
        <div className="preview-info" style={{ color: '#ef4444' }} aria-live="polite">
          <p className="info-text">⚠️ {error}</p>
        </div>
      )}

      {/* Photo info */}
      {uploadedImageUrl && (
        <div style={{
          marginTop: '20px',
          padding: '20px',
          background: 'rgba(0,242,255,0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(0,242,255,0.3)',
          textAlign: 'center'
        }}>
          <p style={{ color: '#00f2ff', fontWeight: 'bold', marginBottom: '15px' }}>✅ Upload Successful!</p>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
            <div ref={qrRef} style={{ display: 'inline-block', background: 'white', padding: '10px', borderRadius: '8px' }}>
              <QRCodeCanvas value={uploadedImageUrl} size={150} level="H" includeMargin={true} />
            </div>
            <button
              onClick={handleRetake}
              className="btn btn-secondary"
              style={{ width: '100%', maxWidth: '170px' }}
            >
              ↻ Retake
            </button>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
              style={{
                padding: '12px 24px',
                background: '#4ade80',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
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
