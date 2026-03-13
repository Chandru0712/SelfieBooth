import { useState, memo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { ImageData } from '../../../types';
import { uploadImageAndGenerateQR } from '../../../utils/apiService.ts';

interface PreviewScreenProps {
  imageData: ImageData | null;
  isVisible: boolean;
  isLoading?: boolean;
  onRetake?: () => void;
  onContinue?: (imageData: ImageData) => void;
  showAsOverlay?: boolean;
}

export const PreviewScreen = memo(function PreviewScreen({
  imageData,
  isVisible = false,
  onRetake = () => {},
  onContinue: _onContinue = () => {},
}: PreviewScreenProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  if (!isVisible || !imageData) return null;

  const handleContinue = async () => {
    try {
      setIsProcessing(true); setUploadedImageUrl(null);
      const uploadResult = await uploadImageAndGenerateQR(imageData.blob, imageData.metadata.fileName);
      if (!uploadResult.success) {
        console.error('Upload failed:', uploadResult.error || 'Unknown error');
        return;
      }
      if (!uploadResult.imageUrl) {
        console.error('Upload successful but no image URL returned');
        return;
      }
      setUploadedImageUrl(uploadResult.imageUrl);
    } catch (err) { console.error('Failed to upload image:', err); }
    finally { setIsProcessing(false); }
  };

  const handleRetake = () => { setUploadedImageUrl(null); onRetake(); };

  /* ─── Button styles ─── */
  const btnBase = "inline-flex items-center justify-center gap-2.5 px-10 py-4 rounded-[30px] font-bold text-[22px] uppercase tracking-[0.5px] transition-all duration-300 min-w-[280px] text-center";
  const btnPrimary = `${btnBase} bg-gradient-to-r from-[#a855f7] to-[#7e22ce] text-white border-none disabled:opacity-50 hover:-translate-y-0.5 hover:scale-[1.04]`;
  const btnRetake  = `${btnBase} bg-[rgba(19,13,30,0.70)] text-[#f0e6ff] border-2 border-[#a855f7] hover:bg-[rgba(168,85,247,0.18)] hover:border-[#e040fb] hover:text-white hover:-translate-y-1 hover:scale-[1.05] disabled:opacity-50`;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0c0812]" style={{ backdropFilter: 'blur(20px)' }}>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-8 py-5 bg-gradient-to-r from-[rgba(120,40,200,0.12)] to-[rgba(60,0,120,0.16)] border-b border-[rgba(168,85,247,0.20)] shrink-0">
        <div className="w-[125px]" />
        <h1 className="font-[Arial] text-[6rem] uppercase tracking-[2px] text-[#f0e6ff] m-0">Preview</h1>
        <div className="w-[125px]" />
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {/* Image */}
        <div className="flex-1 flex flex-col items-center overflow-auto px-3 pt-[100px]">
          <img
            src={uploadedImageUrl || imageData?.url || ''}
            alt="Captured preview"
            className="w-full max-h-[50vh] object-contain object-top mt-[3%]"
            onError={(e) => {
              console.error('Image load error:', e);
            }}
          />
          {/* QR Code after upload */}
          {uploadedImageUrl && !isProcessing && (
            <div className="flex flex-col justify-center items-center mt-[50px] pb-[60px] w-full gap-6">
              <div className="qr-canvas-wrapper" style={{ padding: 15 }}>
                <QRCodeCanvas value={uploadedImageUrl} size={512} level="H" includeMargin={true} />
              </div>
              <h2 className="text-[2.5rem] font-bold tracking-wide text-[#f0e6ff] text-center" style={{ textShadow: '0 4px 20px rgba(168,85,247,0.6)' }}>
                Scan QR Code to Download
              </h2>
            </div>
          )}
        </div>

        {/* Fixed action bar at top */}
        <div className="absolute top-0 left-0 right-0 flex justify-center items-center gap-8 px-5 py-10" style={{ backdropFilter: 'blur(8px)' }}>
          <button
            className={btnRetake}
            style={{ boxShadow: '0 0 16px rgba(168,85,247,0.35)', border: '1px solid #a855f7' }}
            onClick={handleRetake}
            disabled={isProcessing}
          >
            ↻ Retake
          </button>
          <button className={btnPrimary} onClick={handleContinue} disabled={isProcessing || !!uploadedImageUrl}>
            {isProcessing ? 'Generating QR Code…' : '✓ Click & Get QR'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default PreviewScreen;