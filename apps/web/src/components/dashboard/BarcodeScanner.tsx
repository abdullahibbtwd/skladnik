import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScanBarcode, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

function detectorCtor(): BarcodeDetectorCtor | null {
  return (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector ?? null;
}

/** Camera scanning needs the BarcodeDetector API (Chrome on Android, not iOS Safari) and a secure origin. */
export function cameraScanSupported() {
  return Boolean(detectorCtor() && typeof navigator.mediaDevices?.getUserMedia === 'function' && window.isSecureContext);
}

/** Full-screen camera view; reports each new code once, then closes. */
export const BarcodeScanner: React.FC<{ onDetected: (code: string) => void; onClose: () => void }> = ({ onDetected, onClose }) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Ctor({ formats: FORMATS });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const code = codes.find((row) => row.rawValue.trim())?.rawValue.trim();
            if (code) {
              navigator.vibrate?.(60);
              onDetected(code);
              onClose();
              return;
            }
          } catch {
            // A frame that can't be decoded yet; try the next one.
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('pos.cameraFailed'));
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="flex items-center gap-2 font-display text-[0.9rem] font-medium">
          <ScanBarcode size={18} />
          {t('pos.scanTitle')}
        </span>
        <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-white/10" aria-label={t('common.cancel')}>
          <X size={18} />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <p className="px-4 py-4 text-center font-sans text-[0.82rem] text-white/80">{error ?? t('pos.scanHint')}</p>
    </div>,
    document.body,
  );
};
