import { useState, useRef, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { ImageData } from '../../../types';
import { uploadImageAndGenerateQR, downloadImageFromUrl } from '../../../utils/apiService.ts';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (imageData?.url) { try { URL.revokeObjectURL(imageData.url); } catch { /* ignore */ } }
    };
  }, [imageData?.url]);

  if (!isVisible || !imageData) return null;

  const handleContinue = async () => {
    try {
      setIsProcessing(true); setError(null); setUploadedImageUrl(null);
      const uploadResult = await uploadImageAndGenerateQR(imageData.blob, imageData.metadata.fileName);
      if (!uploadResult.success) { setError(uploadResult.error || 'Upload failed. Please try again.'); return; }
      if (!uploadResult.imageUrl) { setError('Upload successful but no image URL returned'); return; }
      setUploadedImageUrl(uploadResult.imageUrl);
    } catch { setError('Failed to upload image. Please try again.'); }
    finally { setIsProcessing(false); }
  };

  const handlePrint = () => {
    try {
      const printWindow = window.open('', '', 'width=800,height=600');
      if (!printWindow) { setError('Failed to open print window'); return; }
      const url = URL.createObjectURL(imageData.blob);
      printWindow.document.write(`<html><head><title>Print Photo</title><style>body{margin:0;padding:20px}img{max-width:100%;height:auto}@media print{body{margin:0;padding:0}}</style></head><body onload="window.print();window.close();"><img src="${url}" alt="Photo"/></body></html>`);
      printWindow.document.close();
    } catch { setError('Failed to print image'); }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        const file = new File([imageData.blob], imageData.metadata.fileName, { type: 'image/png' });
        await navigator.share({ title: 'My Selfie', text: 'Check out my selfie!', files: [file] });
      } else {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageData.blob })]);
        alert('Photo copied to clipboard!');
      }
    } catch (err) { if ((err as Error).name !== 'AbortError') setError('Share not available on this device'); }
  };

  const downloadQRCode = () => {
    if (!qrRef.current) return;
    const canvas = qrRef.current.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;
    downloadImageFromUrl(canvas.toDataURL('image/png'), 'qrcode.png');
  };

  const handleRetake = () => { setError(null); setUploadedImageUrl(null); onRetake(); };

  /* ─── Shared button styles ─── */
  const btnBase = "inline-flex items-center justify-center gap-2.5 px-10 py-4 rounded-[30px] font-bold text-[22px] uppercase tracking-[0.5px] transition-all duration-300 min-w-[280px] text-center";
  const btnSecondary = `${btnBase} bg-[rgba(10,22,40,0.6)] text-[#e2e8f0] border-2 border-[rgba(255,255,255,0.2)] hover:-translate-y-0.5 hover:scale-[1.04]`;
  const btnPrimary   = `${btnBase} bg-gradient-to-r from-[#3b82f6] to-[#1d4ed8] text-white border-none disabled:opacity-50 hover:-translate-y-0.5 hover:scale-[1.04]`;

  /* ─── Overlay mode ─── */
  if (showAsOverlay) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-[rgba(5,13,26,0.92)]" style={{ backdropFilter: 'blur(20px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 bg-gradient-to-r from-[rgba(0,100,255,0.10)] to-[rgba(0,40,120,0.14)] border-b border-[rgba(56,139,253,0.18)] shrink-0">
          <div className="w-[125px]" />
          <h1 className="font-[Arial] text-[6rem] uppercase tracking-[2px] text-[#e2e8f0] m-0">Preview</h1>
          <div className="w-[125px]" />
        </div>

        {/* Body */}
        <div className="relative flex-1 flex flex-col overflow-hidden">
          {/* Image */}
          <div className="flex-1 flex flex-col items-center overflow-auto px-3 pt-[220px]">
            <img
              ref={imgRef}
              src={uploadedImageUrl || imageData.url}
              alt="Captured preview"
              className="w-full max-h-[50vh] object-contain object-top mt-[3%]"
            />
            {/* QR Code after upload */}
            {uploadedImageUrl && !isProcessing && (
              <div className="flex justify-center items-center mt-[50px] pb-[60px] w-full">
                <div className="qr-canvas-wrapper" style={{ padding: 15 }} ref={qrRef}>
                  <QRCodeCanvas value={uploadedImageUrl} size={512} level="H" includeMargin={true} />
                </div>
              </div>
            )}
          </div>

          {/* Fixed action bar at top */}
          <div className="absolute top-0 left-0 right-0 flex justify-center items-center gap-8 px-5 py-10 bg-[rgba(5,13,26,0.6)]" style={{ backdropFilter: 'blur(8px)' }}>
            <button className={btnSecondary} onClick={handleRetake} disabled={isProcessing}>
              ↻ Retake
            </button>
            <button className={btnPrimary} onClick={handleContinue} disabled={isProcessing || !!uploadedImageUrl}>
              {isProcessing ? 'Generating QR Code…' : '✓ Click & Get QR'}
            </button>
          </div>
        </div>

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-[200px] left-1/2 -translate-x-1/2 bg-[rgba(239,68,68,0.9)] text-white px-6 py-3 rounded-lg text-sm z-[2001] max-w-[80%]">
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ─── Regular (non-overlay) mode ─── */
  return (
    <div className="flex flex-col w-screen h-screen bg-[#050d1a] text-[#e2e8f0] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 bg-gradient-to-r from-[rgba(0,100,255,0.10)] to-[rgba(0,40,120,0.14)] border-b border-[rgba(56,139,253,0.18)] shrink-0">
        <div className="w-[125px]" />
        <h1 className="font-[Arial] text-[6rem] uppercase tracking-[2px] text-[#e2e8f0] m-0">Preview</h1>
        <div className="w-[125px]" />
      </div>

      {/* Preview image */}
      <div className="flex-1 flex flex-col items-center justify-center p-5 overflow-hidden">
        <div className="relative flex items-center justify-center w-full h-full">
          <img
            ref={imgRef}
            src={imageData.url}
            alt="Captured photo"
            className="max-w-full max-h-full object-contain rounded-2xl border border-[rgba(56,139,253,0.18)]"
            style={{ boxShadow: '0 20px 25px -5px rgba(0,10,30,0.7)' }}
          />
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="spinner" />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {!uploadedImageUrl && (
        <div className="flex justify-center gap-8 px-5 py-10 bg-[rgba(10,22,40,0.8)] border-t border-[rgba(56,139,253,0.18)] rounded-[20px] mx-0 my-10">
          <button className={btnSecondary} onClick={handleRetake} disabled={isProcessing}>↻ Retake</button>
          <div>
            <button className={btnPrimary} onClick={handleContinue} disabled={isProcessing}>
              {isProcessing
                ? <><span className="spinner" style={{ display: 'inline-block', width: 20, height: 20, borderWidth: 2 }} /><span>Uploading…</span></>
                : '✓ Upload & Get QR'}
            </button>
            <div className="flex gap-4 mt-4 justify-center flex-wrap">
              <button className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[rgba(10,22,40,0.6)] border border-[rgba(56,139,253,0.3)] text-[#94a3b8] text-sm transition hover:text-white" onClick={handlePrint} disabled={isProcessing}>🖨️ Print</button>
              <button className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[rgba(10,22,40,0.6)] border border-[rgba(56,139,253,0.3)] text-[#94a3b8] text-sm transition hover:text-white" onClick={handleShare} disabled={isProcessing}>📲 Share</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-sm text-center px-5 pb-4">⚠️ {error}</p>}

      {uploadedImageUrl && (
        <div className="mt-5 mx-5 mb-5 p-5 bg-[rgba(59,130,246,0.1)] rounded-lg border border-[rgba(59,130,246,0.3)] text-center">
          <p className="text-[#00f2ff] font-bold text-lg mb-4">✅ Upload Successful!</p>
          <div className="flex items-center justify-center gap-8">
            <div className="qr-canvas-wrapper" ref={qrRef}>
              <QRCodeCanvas value={uploadedImageUrl} size={250} level="H" includeMargin={true} />
            </div>
            <button className={btnSecondary + " min-w-[auto] px-8"} onClick={handleRetake}>↻ Retake</button>
          </div>
          <div className="flex gap-4 mt-5 justify-center flex-wrap">
            <button className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[rgba(10,22,40,0.6)] border border-[rgba(56,139,253,0.3)] text-[#94a3b8] text-sm transition hover:text-white" onClick={handlePrint}>🖨️ Print</button>
            <button className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[rgba(10,22,40,0.6)] border border-[rgba(56,139,253,0.3)] text-[#94a3b8] text-sm transition hover:text-white" onClick={handleShare}>📲 Share</button>
            <button
              className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-black text-sm transition hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #00f2ff 0%, #00c3ff 100%)', boxShadow: '0 4px 15px rgba(0,242,255,0.3)' }}
              onClick={downloadQRCode}
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
