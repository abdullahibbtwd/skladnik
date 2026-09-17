import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImageIcon, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

type CameraCaptureProps = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void | Promise<void>;
};

type CameraError = 'denied' | 'unsupported' | 'insecure' | 'failed';
type CameraMode = 'choose' | 'camera';

const VIDEO_CONSTRAINTS: MediaStreamConstraints[] = [
  { audio: false, video: { facingMode: { ideal: 'environment' } } },
  { audio: false, video: { facingMode: { ideal: 'user' } } },
  { audio: false, video: true },
];

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function classifyError(err: unknown): CameraError {
  if (err instanceof Error && err.name === 'InsecureContext') return 'insecure';
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'unsupported';
  return 'failed';
}

async function requestCameraStream() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error('INSECURE');
    error.name = 'InsecureContext';
    throw error;
  }
  let lastError: unknown;
  for (const constraints of VIDEO_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function CameraCapture({ open, onClose, onCapture }: CameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [mode, setMode] = useState<CameraMode>('choose');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setPreviewFile(null);
  };

  const attachStream = async (stream: MediaStream) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    await video.play();
  };

  const startCamera = async () => {
    setError(null);
    setStarting(true);
    stopStream(streamRef.current);
    streamRef.current = null;
    try {
      const stream = await requestCameraStream();
      await attachStream(stream);
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setMode('choose');
      setError(null);
      clearPreview();
      return;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'camera') return;
    void startCamera();
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [open, mode]);

  if (!open) return null;

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `invoice-${Date.now()}.jpg`, { type: 'image/jpeg' });
        stopStream(streamRef.current);
        streamRef.current = null;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewFile(file);
        setPreviewUrl(url);
      },
      'image/jpeg',
      0.92,
    );
  };

  const usePhoto = async () => {
    if (!previewFile) return;
    const file = previewFile;
    clearPreview();
    onClose();
    await onCapture(file);
  };

  const onPickedFile = (file: File | undefined) => {
    if (!file) return;
    stopStream(streamRef.current);
    streamRef.current = null;
    clearPreview();
    onClose();
    void onCapture(file);
  };

  const errorCopy =
    error === 'denied'
      ? t('camera.denied')
      : error === 'insecure'
        ? t('camera.insecure')
        : error === 'unsupported'
          ? t('camera.unsupported')
          : error
            ? t('camera.failed')
            : null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="font-display text-[0.95rem] font-semibold">{t('camera.title')}</p>
        <button
          type="button"
          onClick={() => {
            clearPreview();
            onClose();
          }}
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label={t('camera.close')}
        >
          <X size={18} />
        </button>
      </div>

      {mode === 'choose' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-10">
          <p className="mb-2 max-w-sm text-center font-sans text-[0.9rem] text-white/70">{t('camera.chooseHint')}</p>
          <button
            type="button"
            onClick={() => setMode('camera')}
            className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ops-teal px-4 py-4 text-left font-display text-[0.95rem] font-medium text-white"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
              <Camera size={22} />
            </span>
            <span>
              <span className="block">{t('camera.useCamera')}</span>
              <span className="mt-0.5 block font-sans text-[0.75rem] font-normal text-white/80">{t('camera.useCameraHint')}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-white/10 px-4 py-4 text-left font-display text-[0.95rem] font-medium text-white"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
              <ImageIcon size={22} />
            </span>
            <span>
              <span className="block">{t('camera.fromDevice')}</span>
              <span className="mt-0.5 block font-sans text-[0.75rem] font-normal text-white/80">{t('camera.fromDeviceHint')}</span>
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1 bg-black">
            <video
              ref={videoRef}
              className={cn('size-full object-cover', (previewUrl || error) && 'invisible')}
              playsInline
              muted
              autoPlay
            />
            {previewUrl && <img src={previewUrl} alt="" className="absolute inset-0 size-full object-contain" />}
            {starting && !previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 font-display text-sm text-white/80">
                {t('camera.starting')}
              </div>
            )}
            {errorCopy && !previewUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center">
                <p className="max-w-sm font-sans text-[0.9rem] leading-relaxed text-white/90">{errorCopy}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => nativeRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full bg-ops-teal px-4 py-2.5 font-display text-[0.82rem] font-medium text-white"
                  >
                    <Camera size={16} />
                    {t('camera.deviceCamera')}
                  </button>
                  <button
                    type="button"
                    onClick={() => libraryRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 font-display text-[0.82rem] font-medium"
                  >
                    <ImageIcon size={16} />
                    {t('camera.fromDevice')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {previewUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    clearPreview();
                    void startCamera();
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 font-display text-[0.82rem] font-medium"
                >
                  <RotateCcw size={16} />
                  {t('camera.retake')}
                </button>
                <button
                  type="button"
                  onClick={() => void usePhoto()}
                  className="inline-flex items-center gap-2 rounded-full bg-ops-teal px-5 py-2.5 font-display text-[0.85rem] font-medium text-white"
                >
                  {t('camera.usePhoto')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => libraryRef.current?.click()}
                  className="flex flex-col items-center gap-1 text-white/80"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-white/10">
                    <ImageIcon size={18} />
                  </span>
                  <span className="font-display text-[0.65rem] font-medium">{t('camera.fromDevice')}</span>
                </button>
                <button
                  type="button"
                  onClick={error ? () => nativeRef.current?.click() : takePhoto}
                  disabled={starting}
                  className="flex size-[4.25rem] items-center justify-center rounded-full border-[3px] border-white bg-white/15 disabled:opacity-40"
                  aria-label={t('camera.capture')}
                >
                  <span className="size-14 rounded-full bg-white" />
                </button>
                <button
                  type="button"
                  onClick={() => nativeRef.current?.click()}
                  className="flex flex-col items-center gap-1 text-white/80"
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-white/10">
                    <Camera size={18} />
                  </span>
                  <span className="font-display text-[0.65rem] font-medium">{t('camera.deviceCamera')}</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      <input
        ref={libraryRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          onPickedFile(file);
        }}
      />
      <input
        ref={nativeRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          onPickedFile(file);
        }}
      />
    </div>,
    document.body,
  );
}
