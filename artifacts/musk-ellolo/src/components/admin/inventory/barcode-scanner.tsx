import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/hooks/use-language';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScanBarcode, Camera, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function BarcodeScanner({ onScan }: { onScan: (barcode: string) => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [manualBarcode, setManualBarcode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Focus trap for hardware scanners when camera is inactive
  useEffect(() => {
    let barcodeBuffer = '';
    let timeoutId: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Enter' && barcodeBuffer.length > 0) {
        onScan(barcodeBuffer);
        barcodeBuffer = '';
      } else if (e.key.length === 1) {
        barcodeBuffer += e.key;
        clearTimeout(timeoutId);
        // Reset buffer if typing is too slow (human vs scanner)
        timeoutId = setTimeout(() => {
          barcodeBuffer = '';
        }, 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeoutId);
    };
  }, [onScan]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      setIsCameraActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        // Note: BarcodeDetector API is experimental. For production,
        // use a library like html5-qrcode. This is a progressive enhancement.
        if ('BarcodeDetector' in window) {
          // @ts-ignore - BarcodeDetector is not in standard TS types yet
          const barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'code_128'] });
          
          const detectLoop = setInterval(async () => {
            if (!videoRef.current) return clearInterval(detectLoop);
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                onScan(barcodes[0].rawValue);
                toggleCamera(); // Stop after successful scan
                clearInterval(detectLoop);
              }
            } catch (e) {
              // Ignore detection errors during loop
            }
          }, 500);
        } else {
          toast({
            title: t('مسح الباركود غير مدعوم', 'Barcode scanning not supported'),
            description: t('متصفحك لا يدعم التعرف التلقائي على الباركود من الكاميرا.', 'Your browser does not support automatic barcode detection from camera.'),
            variant: 'destructive'
          });
          stream.getTracks().forEach(track => track.stop());
          setIsCameraActive(false);
        }
      }
    } catch (err) {
      toast({
        title: t('تعذر الوصول للكاميرا', 'Could not access camera'),
        description: t('تأكد من إعطاء الصلاحيات اللازمة.', 'Ensure permissions are granted.'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <form onSubmit={handleManualSubmit} className="flex-1 flex gap-2">
          <Input 
            value={manualBarcode} 
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder={t('مسح أو إدخال الباركود...', 'Scan or enter barcode...')}
            className="flex-1"
          />
          <Button type="submit" variant="secondary">
            <ScanBarcode className="w-4 h-4 me-2" />
            {t('بحث', 'Search')}
          </Button>
        </form>
        <Button 
          type="button" 
          variant={isCameraActive ? "destructive" : "outline"}
          onClick={toggleCamera}
        >
          {isCameraActive ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
        </Button>
      </div>

      {isCameraActive && (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 border-2 border-primary/50 m-12 rounded-lg pointer-events-none" />
        </div>
      )}
    </div>
  );
}
