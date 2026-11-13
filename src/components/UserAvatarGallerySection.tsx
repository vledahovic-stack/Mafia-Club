import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Eye,
  Trash2,
  Check,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  Image as ImageIcon,
  Lock,
  Coins
} from 'lucide-react';
import { AuthUser } from './AuthModal';
import { DEFAULT_AVATAR_CHANGE_COST } from '../data/items';
import { sounds } from '../utils/audio';
import {
  UserGalleryAvatarItem,
  UserGalleryListResponse,
  CropPanZoomState,
  validateAvatarSelectedFile,
  validateAvatarNaturalDimensions,
  computeClampedSquareCrop,
  formatAvatarByteSize,
  resolveAvatarErrorMessage,
  AVATAR_PREVIEW_TARGET_SIZE
} from '../utils/avatarGalleryUi';

interface ProtectedGalleryImageProps {
  imageUrl: string;
  alt: string;
  className?: string;
}

/**
 * Renders a private gallery image strictly via the protected server route (`/api/user/avatars/:id/image`).
 * Never uses base64 and never exposes R2 object keys.
 * Uses standard browser requests (with synced session cookie) and falls back to authenticated binary Blob fetch
 * if third-party iframe cookies are restricted by the browser.
 */
const ProtectedGalleryImage: React.FC<ProtectedGalleryImageProps> = ({
  imageUrl,
  alt,
  className = ''
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(imageUrl);
  const [triedBearerFallback, setTriedBearerFallback] = useState(false);
  const [hasError, setHasError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setResolvedSrc(imageUrl);
    setTriedBearerFallback(false);
    setHasError(false);
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [imageUrl]);

  const handleImageError = async () => {
    if (triedBearerFallback) {
      setHasError(true);
      return;
    }
    setTriedBearerFallback(true);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      if (!token) {
        setHasError(true);
        return;
      }
      const res = await fetch(imageUrl, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        setHasError(true);
        return;
      }
      const blob = await res.blob();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const objUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objUrl;
      setResolvedSrc(objUrl);
    } catch {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-zinc-900/80 text-zinc-500 text-[11px] p-2 text-center ${className}`}>
        <ImageIcon className="w-5 h-5 mb-1 opacity-60" />
        <span>Недоступно</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading="lazy"
      onError={handleImageError}
      className={className}
    />
  );
};

interface PendingCropSession {
  file: File;
  objectUrl: string;
  imageElement: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
}

export interface UserAvatarGallerySectionProps {
  userCredits?: number;
  avatarCertificateCount?: number;
  avatarChangeCost?: number;
  activeAvatarId?: string | null;
  onUserUpdated?: (updatedUser: AuthUser, message?: string) => void;
}

export const UserAvatarGallerySection: React.FC<UserAvatarGallerySectionProps> = ({
  userCredits = 0,
  avatarCertificateCount = 0,
  avatarChangeCost = DEFAULT_AVATAR_CHANGE_COST,
  activeAvatarId = null,
  onUserUpdated
}) => {
  const [galleryItems, setGalleryItems] = useState<UserGalleryAvatarItem[]>([]);
  const [galleryCount, setGalleryCount] = useState<number>(0);
  const [galleryMaxLimit, setGalleryMaxLimit] = useState<number>(20);
  const [loadingGallery, setLoadingGallery] = useState<boolean>(true);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [galleryFeedback, setGalleryFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Selected image in gallery & payment method for Stage 3 activation
  const [selectedFutureAvatarId, setSelectedFutureAvatarId] = useState<string | null>(null);
  const [galleryPaymentMethod, setGalleryPaymentMethod] = useState<'certificate' | 'credits'>(
    avatarCertificateCount > 0 ? 'certificate' : 'credits'
  );
  const [confirmActivateAvatar, setConfirmActivateAvatar] = useState<UserGalleryAvatarItem | null>(null);
  const [activatingAvatarId, setActivatingAvatarId] = useState<string | null>(null);

  // View modal state
  const [viewingAvatar, setViewingAvatar] = useState<UserGalleryAvatarItem | null>(null);

  // Delete confirmation state
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState<UserGalleryAvatarItem | null>(null);
  const [deletingAvatarId, setDeletingAvatarId] = useState<string | null>(null);

  // Crop & upload editor modal state
  const [cropSession, setCropSession] = useState<PendingCropSession | null>(null);
  const [cropState, setCropState] = useState<CropPanZoomState>({
    zoom: 1,
    centerX: 0,
    centerY: 0
  });
  const [uploadingCrop, setUploadingCrop] = useState<boolean>(false);
  const [cropModalError, setCropModalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pointer / touch drag tracking refs
  const dragRef = useRef<{
    isDragging: boolean;
    startClientX: number;
    startClientY: number;
    startCenterX: number;
    startCenterY: number;
    initialPinchDistance: number | null;
    initialPinchZoom: number;
  }>({
    isDragging: false,
    startClientX: 0,
    startClientY: 0,
    startCenterX: 0,
    startCenterY: 0,
    initialPinchDistance: null,
    initialPinchZoom: 1
  });

  // Sync cookie from localStorage token so <img src="/api/user/avatars/:id/image"> works directly
  const syncSessionCookie = useCallback(() => {
    try {
      const token = localStorage.getItem('mafia_auth_token');
      if (token) {
        document.cookie = `mafia_auth_token=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`;
      }
    } catch {
      // ignore cookie errors in restricted contexts
    }
  }, []);

  const fetchGallery = useCallback(async (silent = false) => {
    if (!silent) {
      setLoadingGallery(true);
    }
    setGalleryError(null);
    syncSessionCookie();

    try {
      const token = localStorage.getItem('mafia_auth_token');
      if (!token) {
        setGalleryError('Требуется вход в аккаунт для просмотра личной галереи.');
        setLoadingGallery(false);
        return;
      }

      const res = await fetch('/api/user/avatars', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      let data: Partial<UserGalleryListResponse> & { error?: string; code?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const errMsg = resolveAvatarErrorMessage(
          res.status,
          data.code,
          data.error,
          'Не удалось загрузить личную галерею аватаров.'
        );
        setGalleryError(errMsg);
        return;
      }

      const list = Array.isArray(data.avatars) ? data.avatars : [];
      setGalleryItems(list);
      setGalleryCount(typeof data.count === 'number' ? data.count : list.length);
      setGalleryMaxLimit(typeof data.maxLimit === 'number' ? data.maxLimit : 20);
    } catch {
      setGalleryError('Ошибка соединения с сервером. Проверьте подключение к сети.');
    } finally {
      setLoadingGallery(false);
    }
  }, [syncSessionCookie]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Keep gallery items' isActive flag in sync when user's activeAvatarId changes (e.g., when switching to standard emoji)
  useEffect(() => {
    setGalleryItems((prev) =>
      prev.map((item) => ({
        ...item,
        isActive: Boolean(activeAvatarId && item.id === activeAvatarId)
      }))
    );
  }, [activeAvatarId]);

  // Cleanup crop objectUrl if component unmounts
  useEffect(() => {
    return () => {
      if (cropSession?.objectUrl) {
        URL.revokeObjectURL(cropSession.objectUrl);
      }
    };
  }, [cropSession]);

  // Render both the interactive crop viewport canvas and the 256x256 result preview canvas
  useEffect(() => {
    if (!cropSession) return;
    const { imageElement, naturalWidth, naturalHeight } = cropSession;
    const crop = computeClampedSquareCrop(naturalWidth, naturalHeight, cropState);

    // 1. Draw 256x256 live output preview
    const previewCanvas = previewCanvasRef.current;
    if (previewCanvas) {
      const ctx = previewCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, AVATAR_PREVIEW_TARGET_SIZE, AVATAR_PREVIEW_TARGET_SIZE);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          imageElement,
          crop.x,
          crop.y,
          crop.size,
          crop.size,
          0,
          0,
          AVATAR_PREVIEW_TARGET_SIZE,
          AVATAR_PREVIEW_TARGET_SIZE
        );
      }
    }

    // 2. Draw interactive square crop viewport (shows cropped region + rule-of-thirds guides)
    const viewportCanvas = viewportCanvasRef.current;
    if (viewportCanvas) {
      const vSize = viewportCanvas.width;
      const vCtx = viewportCanvas.getContext('2d');
      if (vCtx) {
        vCtx.clearRect(0, 0, vSize, vSize);
        vCtx.imageSmoothingEnabled = true;
        vCtx.imageSmoothingQuality = 'high';
        vCtx.drawImage(
          imageElement,
          crop.x,
          crop.y,
          crop.size,
          crop.size,
          0,
          0,
          vSize,
          vSize
        );

        // Subtle 3x3 framing grid lines
        vCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        vCtx.lineWidth = 1;
        const third = vSize / 3;
        vCtx.beginPath();
        vCtx.moveTo(third, 0);
        vCtx.lineTo(third, vSize);
        vCtx.moveTo(third * 2, 0);
        vCtx.lineTo(third * 2, vSize);
        vCtx.moveTo(0, third);
        vCtx.lineTo(vSize, third);
        vCtx.moveTo(0, third * 2);
        vCtx.lineTo(vSize, third * 2);
        vCtx.stroke();
      }
    }
  }, [cropSession, cropState]);

  const closeCropSession = useCallback(() => {
    if (cropSession?.objectUrl) {
      URL.revokeObjectURL(cropSession.objectUrl);
    }
    setCropSession(null);
    setCropModalError(null);
    setUploadingCrop(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [cropSession]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGalleryFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (galleryCount >= galleryMaxLimit) {
      setGalleryFeedback({
        type: 'error',
        text: `Достигнут лимит личной галереи (${galleryMaxLimit} изображений). Удалите неиспользуемое изображение перед загрузкой нового.`
      });
      e.target.value = '';
      return;
    }

    const validation = validateAvatarSelectedFile(file);
    if (!validation.valid) {
      setGalleryFeedback({
        type: 'error',
        text: validation.error || 'Недопустимый файл изображения.'
      });
      e.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const dimCheck = validateAvatarNaturalDimensions(img.naturalWidth, img.naturalHeight);
      if (!dimCheck.valid) {
        URL.revokeObjectURL(objectUrl);
        setGalleryFeedback({
          type: 'error',
          text: dimCheck.error || 'Недопустимые размеры изображения.'
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      if (cropSession?.objectUrl) {
        URL.revokeObjectURL(cropSession.objectUrl);
      }

      setCropModalError(null);
      setCropState({
        zoom: 1,
        centerX: img.naturalWidth / 2,
        centerY: img.naturalHeight / 2
      });
      setCropSession({
        file,
        objectUrl,
        imageElement: img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
      sounds.playTick();
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setGalleryFeedback({
        type: 'error',
        text: 'Не удалось прочитать выбранное изображение. Убедитесь, что это корректный файл JPEG, PNG или WebP.'
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    img.src = objectUrl;
  };

  // Convert viewport pointer delta into source pixel center shift
  const applyViewportDragDelta = useCallback(
    (deltaClientX: number, deltaClientY: number, startCenterX: number, startCenterY: number) => {
      if (!cropSession || !viewportCanvasRef.current) return;
      const rect = viewportCanvasRef.current.getBoundingClientRect();
      const displaySize = Math.max(1, rect.width);

      setCropState((prev) => {
        const currentCrop = computeClampedSquareCrop(
          cropSession.naturalWidth,
          cropSession.naturalHeight,
          prev
        );
        const sourcePixelsPerScreenPixel = currentCrop.size / displaySize;
        const nextCenterX = startCenterX - deltaClientX * sourcePixelsPerScreenPixel;
        const nextCenterY = startCenterY - deltaClientY * sourcePixelsPerScreenPixel;
        const clamped = computeClampedSquareCrop(cropSession.naturalWidth, cropSession.naturalHeight, {
          zoom: prev.zoom,
          centerX: nextCenterX,
          centerY: nextCenterY
        });
        return {
          zoom: prev.zoom,
          centerX: clamped.x + clamped.size / 2,
          centerY: clamped.y + clamped.size / 2
        };
      });
    },
    [cropSession]
  );

  // Mouse handlers for desktop crop panning
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropSession) return;
    e.preventDefault();
    const currentCrop = computeClampedSquareCrop(
      cropSession.naturalWidth,
      cropSession.naturalHeight,
      cropState
    );
    dragRef.current = {
      isDragging: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCenterX: currentCrop.x + currentCrop.size / 2,
      startCenterY: currentCrop.y + currentCrop.size / 2,
      initialPinchDistance: null,
      initialPinchZoom: cropState.zoom
    };
  };

  useEffect(() => {
    if (!cropSession) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      const dx = e.clientX - dragRef.current.startClientX;
      const dy = e.clientY - dragRef.current.startClientY;
      applyViewportDragDelta(dx, dy, dragRef.current.startCenterX, dragRef.current.startCenterY);
    };

    const handleWindowMouseUp = () => {
      dragRef.current.isDragging = false;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [cropSession, applyViewportDragDelta]);

  // Touch handlers for mobile 1-finger pan and 2-finger pinch zoom
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!cropSession) return;
    const currentCrop = computeClampedSquareCrop(
      cropSession.naturalWidth,
      cropSession.naturalHeight,
      cropState
    );

    if (e.touches.length === 1) {
      dragRef.current = {
        isDragging: true,
        startClientX: e.touches[0].clientX,
        startClientY: e.touches[0].clientY,
        startCenterX: currentCrop.x + currentCrop.size / 2,
        startCenterY: currentCrop.y + currentCrop.size / 2,
        initialPinchDistance: null,
        initialPinchZoom: cropState.zoom
      };
    } else if (e.touches.length >= 2) {
      dragRef.current.isDragging = false;
      dragRef.current.initialPinchDistance = getTouchDistance(e.touches);
      dragRef.current.initialPinchZoom = cropState.zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!cropSession) return;
    if (e.touches.length === 1 && dragRef.current.isDragging) {
      const dx = e.touches[0].clientX - dragRef.current.startClientX;
      const dy = e.touches[0].clientY - dragRef.current.startClientY;
      applyViewportDragDelta(dx, dy, dragRef.current.startCenterX, dragRef.current.startCenterY);
    } else if (e.touches.length >= 2 && dragRef.current.initialPinchDistance) {
      const dist = getTouchDistance(e.touches);
      if (dist > 0) {
        const ratio = dist / dragRef.current.initialPinchDistance;
        const nextZoom = Math.max(1, Math.min(4, Number((dragRef.current.initialPinchZoom * ratio).toFixed(2))));
        setCropState((prev) => {
          const clamped = computeClampedSquareCrop(cropSession.naturalWidth, cropSession.naturalHeight, {
            ...prev,
            zoom: nextZoom
          });
          return {
            zoom: nextZoom,
            centerX: clamped.x + clamped.size / 2,
            centerY: clamped.y + clamped.size / 2
          };
        });
      }
    }
  };

  const handleTouchEnd = () => {
    dragRef.current.isDragging = false;
    dragRef.current.initialPinchDistance = null;
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!cropSession) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.15 : -0.15;
    setCropState((prev) => {
      const nextZoom = Math.max(1, Math.min(4, Number((prev.zoom + step).toFixed(2))));
      const clamped = computeClampedSquareCrop(cropSession.naturalWidth, cropSession.naturalHeight, {
        ...prev,
        zoom: nextZoom
      });
      return {
        zoom: nextZoom,
        centerX: clamped.x + clamped.size / 2,
        centerY: clamped.y + clamped.size / 2
      };
    });
  };

  const handleZoomChange = (nextZoomValue: number) => {
    if (!cropSession) return;
    const nextZoom = Math.max(1, Math.min(4, nextZoomValue));
    setCropState((prev) => {
      const clamped = computeClampedSquareCrop(cropSession.naturalWidth, cropSession.naturalHeight, {
        ...prev,
        zoom: nextZoom
      });
      return {
        zoom: nextZoom,
        centerX: clamped.x + clamped.size / 2,
        centerY: clamped.y + clamped.size / 2
      };
    });
  };

  const handleResetCrop = () => {
    if (!cropSession) return;
    setCropState({
      zoom: 1,
      centerX: cropSession.naturalWidth / 2,
      centerY: cropSession.naturalHeight / 2
    });
    sounds.playTick();
  };

  // Upload original file + crop parameters via existing POST /api/user/avatars endpoint (always free)
  const handleConfirmUpload = async () => {
    if (!cropSession || uploadingCrop) return;
    setCropModalError(null);
    setUploadingCrop(true);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      if (!token) {
        setCropModalError('Сессия истекла. Пожалуйста, войдите в аккаунт снова.');
        setUploadingCrop(false);
        return;
      }

      const crop = computeClampedSquareCrop(
        cropSession.naturalWidth,
        cropSession.naturalHeight,
        cropState
      );

      const formData = new FormData();
      formData.append('avatar', cropSession.file);
      formData.append('crop', JSON.stringify({ x: crop.x, y: crop.y, size: crop.size }));

      const res = await fetch('/api/user/avatars', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      let data: {
        success?: boolean;
        avatar?: UserGalleryAvatarItem;
        count?: number;
        maxLimit?: number;
        error?: string;
        code?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok || !data.avatar) {
        const errMsg = resolveAvatarErrorMessage(
          res.status,
          data.code,
          data.error,
          'Не удалось загрузить и обработать изображение.'
        );
        setCropModalError(errMsg);
        setUploadingCrop(false);
        return;
      }

      const uploadedAvatar = data.avatar;
      setGalleryItems((prev) => [uploadedAvatar, ...prev.filter((item) => item.id !== uploadedAvatar.id)]);
      if (typeof data.count === 'number') {
        setGalleryCount(data.count);
      } else {
        setGalleryCount((prev) => prev + 1);
      }
      if (typeof data.maxLimit === 'number') {
        setGalleryMaxLimit(data.maxLimit);
      }

      setSelectedFutureAvatarId(uploadedAvatar.id);
      closeCropSession();
      sounds.playTick();
      setGalleryFeedback({
        type: 'success',
        text: 'Изображение успешно загружено в вашу личную галерею! Теперь вы можете установить его как активный аватар.'
      });
    } catch {
      setCropModalError('Сетевой сбой при отправке файла. Проверьте подключение и попробуйте снова.');
      setUploadingCrop(false);
    }
  };

  // Stage 3: Activate selected gallery image with confirmation and payment (credits or certificate)
  const handleInitiateActivate = (item: UserGalleryAvatarItem) => {
    setGalleryFeedback(null);
    if (item.isActive) {
      setGalleryFeedback({
        type: 'info',
        text: 'Это изображение уже установлено как ваш активный аватар. Повторная оплата не требуется.'
      });
      return;
    }

    const useCert = galleryPaymentMethod === 'certificate';
    if (useCert && avatarCertificateCount <= 0) {
      setGalleryFeedback({
        type: 'error',
        text: 'У вас нет «Сертификата на смену аватара». Выберите оплату кредитами или приобретите сертификат в магазине.'
      });
      return;
    }

    if (!useCert && userCredits < avatarChangeCost) {
      setGalleryFeedback({
        type: 'error',
        text: `Недостаточно кредитов для смены аватара. Требуется ${avatarChangeCost} кр (у вас ${userCredits} кр).`
      });
      return;
    }

    sounds.playTick();
    setConfirmActivateAvatar(item);
  };

  const handleConfirmActivate = async () => {
    if (!confirmActivateAvatar || activatingAvatarId) return;
    const targetAvatar = confirmActivateAvatar;
    setActivatingAvatarId(targetAvatar.id);
    setGalleryFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      if (!token) {
        setGalleryFeedback({
          type: 'error',
          text: 'Сессия истекла. Авторизуйтесь заново.'
        });
        setActivatingAvatarId(null);
        return;
      }

      const useCertificate = galleryPaymentMethod === 'certificate';
      const res = await fetch(`/api/user/avatars/${encodeURIComponent(targetAvatar.id)}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          avatarId: targetAvatar.id,
          useCertificate
        })
      });

      let data: {
        success?: boolean;
        user?: AuthUser;
        activeAvatarId?: string;
        alreadyActive?: boolean;
        certificateUsed?: boolean;
        costCredits?: number;
        message?: string;
        error?: string;
        code?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const errMsg = resolveAvatarErrorMessage(
          res.status,
          data.code,
          data.error,
          'Не удалось установить выбранный аватар.'
        );
        setGalleryFeedback({
          type: 'error',
          text: errMsg
        });
        setConfirmActivateAvatar(null);
        setActivatingAvatarId(null);
        return;
      }

      const newActiveId = data.activeAvatarId || targetAvatar.id;
      setGalleryItems((prev) =>
        prev.map((item) => ({
          ...item,
          isActive: item.id === newActiveId
        }))
      );

      setConfirmActivateAvatar(null);
      setViewingAvatar(null);
      setSelectedFutureAvatarId(null);
      sounds.playTick();

      const successText =
        data.message ||
        (data.alreadyActive
          ? 'Это изображение уже установлено как ваш активный аватар.'
          : data.certificateUsed
          ? 'Пользовательский аватар успешно установлен с помощью Сертификата!'
          : `Пользовательский аватар успешно установлен! Списано ${data.costCredits ?? avatarChangeCost} кр.`);

      setGalleryFeedback({
        type: 'success',
        text: successText
      });

      if (data.user && onUserUpdated) {
        onUserUpdated(data.user, successText);
      }
    } catch {
      setGalleryFeedback({
        type: 'error',
        text: 'Ошибка соединения при установке аватара. Оплата не списана, попробуйте снова.'
      });
    } finally {
      setActivatingAvatarId(null);
    }
  };

  // Delete gallery item with confirmation via existing DELETE /api/user/avatars/:avatarId endpoint
  const handleConfirmDelete = async () => {
    if (!confirmDeleteAvatar || deletingAvatarId) return;
    if (confirmDeleteAvatar.isActive) {
      setGalleryFeedback({
        type: 'error',
        text: 'Активный аватар нельзя удалить. Сначала выберите другой аватар.'
      });
      setConfirmDeleteAvatar(null);
      return;
    }

    const targetId = confirmDeleteAvatar.id;
    setDeletingAvatarId(targetId);
    setGalleryFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      if (!token) {
        setGalleryFeedback({
          type: 'error',
          text: 'Сессия истекла. Авторизуйтесь заново.'
        });
        setDeletingAvatarId(null);
        return;
      }

      const res = await fetch(`/api/user/avatars/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      let data: {
        success?: boolean;
        deletedAvatarId?: string;
        count?: number;
        maxLimit?: number;
        error?: string;
        code?: string;
      } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const errMsg = resolveAvatarErrorMessage(
          res.status,
          data.code,
          data.error,
          'Не удалось удалить изображение из галереи.'
        );
        setGalleryFeedback({
          type: 'error',
          text: errMsg
        });
        setConfirmDeleteAvatar(null);
        setDeletingAvatarId(null);
        return;
      }

      setGalleryItems((prev) => prev.filter((item) => item.id !== targetId));
      if (typeof data.count === 'number') {
        setGalleryCount(data.count);
      } else {
        setGalleryCount((prev) => Math.max(0, prev - 1));
      }
      if (typeof data.maxLimit === 'number') {
        setGalleryMaxLimit(data.maxLimit);
      }

      if (selectedFutureAvatarId === targetId) {
        setSelectedFutureAvatarId(null);
      }
      if (viewingAvatar?.id === targetId) {
        setViewingAvatar(null);
      }

      setConfirmDeleteAvatar(null);
      sounds.playTick();
      setGalleryFeedback({
        type: 'success',
        text: 'Изображение удалено из личной галереи.'
      });
    } catch {
      setGalleryFeedback({
        type: 'error',
        text: 'Ошибка соединения при удалении изображения. Попробуйте ещё раз.'
      });
    } finally {
      setDeletingAvatarId(null);
    }
  };

  const handleSelectFutureAvatar = (item: UserGalleryAvatarItem) => {
    sounds.playTick();
    if (selectedFutureAvatarId === item.id) {
      setSelectedFutureAvatarId(null);
      return;
    }
    setSelectedFutureAvatarId(item.id);
  };

  const selectedFutureItem = galleryItems.find((item) => item.id === selectedFutureAvatarId) || null;
  const isLimitReached = galleryCount >= galleryMaxLimit;
  const currentCropPixels = cropSession
    ? computeClampedSquareCrop(cropSession.naturalWidth, cropSession.naturalHeight, cropState)
    : null;

  return (
    <div
      style={{
        backgroundColor: 'var(--skin-bg-card)',
        borderColor: 'var(--skin-border-base)'
      }}
      className="p-4 rounded-2xl border space-y-4"
    >
      {/* Header: Title, Counter, Upload Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h5 className="text-sm font-bold text-[var(--skin-text-primary)]">Мои аватары</h5>
            <span className="text-xs text-[var(--skin-text-secondary)]">
              · {galleryCount} из {galleryMaxLimit}
            </span>
          </div>
          <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
            Личная галерея изображений (JPEG, PNG, WebP до 5 МБ, квадрат 256×256)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={isLimitReached || loadingGallery}
            onClick={() => {
              setGalleryFeedback(null);
              fileInputRef.current?.click();
            }}
            style={
              !isLimitReached
                ? {
                    background: 'var(--skin-btn-primary-bg)',
                    color: 'var(--skin-btn-primary-text)'
                  }
                : undefined
            }
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all min-h-[40px] ${
              isLimitReached
                ? 'bg-zinc-800/80 border border-zinc-700 text-zinc-500 cursor-not-allowed'
                : 'hover:brightness-110 shadow-md cursor-pointer'
            }`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span>Загрузить изображение</span>
          </button>
        </div>
      </div>

      {/* Limit reached hint */}
      {isLimitReached && (
        <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Достигнут лимит личной галереи ({galleryMaxLimit} из {galleryMaxLimit}). Чтобы загрузить новое изображение, удалите один из неиспользуемых аватаров.
          </span>
        </div>
      )}

      {/* Feedback Banner */}
      {galleryFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-start justify-between gap-2 ${
            galleryFeedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
              : galleryFeedback.type === 'error'
              ? 'bg-rose-950/80 border-rose-700 text-rose-300'
              : 'bg-indigo-950/80 border-indigo-700 text-indigo-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {galleryFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : galleryFeedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            )}
            <span>{galleryFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setGalleryFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
            aria-label="Закрыть уведомление"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stage 3: Selected Gallery Avatar Activation Panel (Payment Method + Apply Button) */}
      {selectedFutureItem && (
        <div className="p-3.5 rounded-xl bg-purple-950/50 border border-purple-500/60 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-purple-400/60 shrink-0 bg-zinc-900">
                <ProtectedGalleryImage
                  imageUrl={selectedFutureItem.imageUrl}
                  alt="Выбранный аватар"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--skin-text-primary)]">
                  {selectedFutureItem.isActive
                    ? 'Это изображение уже является вашим активным аватаром'
                    : 'Установка выбранного изображения как активного аватара'}
                </div>
                <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                  {selectedFutureItem.isActive
                    ? 'Повторная активация не списывает кредиты или сертификат.'
                    : `Стоимость смены: ${avatarChangeCost} кредитов или 1 «Сертификат на смену аватара».`}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFutureAvatarId(null)}
              className="px-2.5 py-1.5 rounded-lg border border-purple-500/40 bg-purple-900/40 hover:bg-purple-900/70 text-[11px] font-semibold text-purple-200 shrink-0 cursor-pointer"
            >
              Снять выбор
            </button>
          </div>

          {!selectedFutureItem.isActive && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Payment Option 1: Certificate */}
                <button
                  type="button"
                  onClick={() => setGalleryPaymentMethod('certificate')}
                  style={
                    galleryPaymentMethod !== 'certificate'
                      ? {
                          backgroundColor: 'var(--skin-bg-subcard)',
                          borderColor: 'var(--skin-border-base)'
                        }
                      : undefined
                  }
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    galleryPaymentMethod === 'certificate'
                      ? 'bg-purple-950/70 border-purple-400 shadow-sm'
                      : 'hover:border-[var(--skin-border-strong)]'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-[var(--skin-text-primary)] truncate">
                      🎭 Сертификат (Бесплатно)
                    </div>
                    <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                      В инвентаре: <span className="font-bold text-purple-300">{avatarCertificateCount} шт.</span>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      galleryPaymentMethod === 'certificate'
                        ? 'border-purple-400 bg-purple-600'
                        : 'border-[var(--skin-border-strong)]'
                    }`}
                  >
                    {galleryPaymentMethod === 'certificate' && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </button>

                {/* Payment Option 2: Credits */}
                <button
                  type="button"
                  onClick={() => setGalleryPaymentMethod('credits')}
                  style={
                    galleryPaymentMethod !== 'credits'
                      ? {
                          backgroundColor: 'var(--skin-bg-subcard)',
                          borderColor: 'var(--skin-border-base)'
                        }
                      : undefined
                  }
                  className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    galleryPaymentMethod === 'credits'
                      ? 'bg-amber-950/60 border-amber-400 shadow-sm'
                      : 'hover:border-[var(--skin-border-strong)]'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1 truncate">
                      <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Кредиты ({avatarChangeCost} кр)</span>
                    </div>
                    <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                      Баланс: <span className="font-bold text-amber-300">{userCredits} кр</span>
                      {userCredits < avatarChangeCost && (
                        <span className="text-rose-400 ml-1 font-semibold">(недостаточно)</span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      galleryPaymentMethod === 'credits'
                        ? 'border-amber-400 bg-amber-600'
                        : 'border-[var(--skin-border-strong)]'
                    }`}
                  >
                    {galleryPaymentMethod === 'credits' && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </button>
              </div>

              <button
                type="button"
                disabled={Boolean(activatingAvatarId)}
                onClick={() => handleInitiateActivate(selectedFutureItem)}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:brightness-110 shadow-md cursor-pointer min-h-[40px]"
              >
                <Check className="w-4 h-4" />
                <span>Сделать активным аватаром</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Loading / Error / Empty / Gallery Grid */}
      {loadingGallery ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[var(--skin-text-secondary)]">
          <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
          <span>Загрузка личной галереи...</span>
        </div>
      ) : galleryError ? (
        <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/70 text-center space-y-2">
          <p className="text-xs text-rose-300 font-semibold">{galleryError}</p>
          <button
            type="button"
            onClick={() => fetchGallery()}
            className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700 text-xs font-semibold text-rose-100 cursor-pointer"
          >
            Повторить попытку
          </button>
        </div>
      ) : galleryItems.length === 0 ? (
        <div
          style={{
            backgroundColor: 'var(--skin-bg-subcard)',
            borderColor: 'var(--skin-border-base)'
          }}
          className="p-6 rounded-xl border text-center space-y-2"
        >
          <ImageIcon className="w-7 h-7 text-[var(--skin-text-secondary)] mx-auto opacity-60" />
          <div className="text-xs font-semibold text-[var(--skin-text-primary)]">
            В вашей личной галерее пока нет изображений
          </div>
          <p className="text-[11px] text-[var(--skin-text-secondary)] max-w-md mx-auto leading-relaxed">
            Загрузите собственное изображение JPEG, PNG или WebP. Загрузка в галерею бесплатна и не списывает кредиты или сертификаты.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {galleryItems.map((item) => {
            const isSelectedFuture = selectedFutureAvatarId === item.id;
            return (
              <div
                key={item.id}
                style={
                  !isSelectedFuture && !item.isActive
                    ? {
                        backgroundColor: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-base)'
                      }
                    : undefined
                }
                className={`rounded-xl border p-2 flex flex-col gap-2 transition-all ${
                  item.isActive
                    ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/40'
                    : isSelectedFuture
                    ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-950/50'
                    : 'hover:border-[var(--skin-border-strong)]'
                }`}
              >
                {/* Square Thumbnail */}
                <div
                  onClick={() => setViewingAvatar(item)}
                  className="relative aspect-square w-full rounded-lg overflow-hidden bg-zinc-900 cursor-pointer group"
                >
                  <ProtectedGalleryImage
                    imageUrl={item.imageUrl}
                    alt="Аватар из личной галереи"
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                    <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                </div>

                {/* Status line (unboxed clean metadata) */}
                <div className="flex items-center justify-between text-[11px] px-0.5">
                  <span
                    className={`font-semibold truncate ${
                      item.isActive
                        ? 'text-emerald-300'
                        : isSelectedFuture
                        ? 'text-purple-300'
                        : 'text-[var(--skin-text-secondary)]'
                    }`}
                  >
                    {item.isActive
                      ? 'Активный'
                      : isSelectedFuture
                      ? 'Выбран'
                      : formatAvatarByteSize(item.byteSize)}
                  </span>
                  <span className="text-[10px] text-[var(--skin-text-secondary)]">
                    {item.width}×{item.height}
                  </span>
                </div>

                {/* Card Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectFutureAvatar(item)}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer min-h-[34px] ${
                      item.isActive
                        ? 'bg-emerald-900/70 text-emerald-200 border border-emerald-700/70'
                        : isSelectedFuture
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                    }`}
                  >
                    {item.isActive ? (
                      <>
                        <Check className="w-3 h-3 shrink-0" />
                        <span>Активен</span>
                      </>
                    ) : isSelectedFuture ? (
                      <>
                        <Check className="w-3 h-3 shrink-0" />
                        <span>Выбрано</span>
                      </>
                    ) : (
                      <span>Выбрать</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewingAvatar(item)}
                    title="Просмотр изображения"
                    aria-label="Просмотр изображения"
                    className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer min-h-[34px] min-w-[34px] flex items-center justify-center"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={item.isActive || deletingAvatarId === item.id}
                    onClick={() => {
                      if (item.isActive) return;
                      setConfirmDeleteAvatar(item);
                    }}
                    title={
                      item.isActive
                        ? 'Активный аватар нельзя удалить'
                        : 'Удалить из галереи'
                    }
                    aria-label={
                      item.isActive
                        ? 'Активный аватар нельзя удалить'
                        : 'Удалить из галереи'
                    }
                    className={`p-1.5 rounded-lg border transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center ${
                      item.isActive
                        ? 'bg-zinc-900/60 border-zinc-800 text-zinc-600 cursor-not-allowed'
                        : 'bg-rose-950/60 hover:bg-rose-900/80 border-rose-800/70 text-rose-300 cursor-pointer'
                    }`}
                  >
                    {item.isActive ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: SQUARE CROP EDITOR WITH TOUCH & MOUSE + 256x256 LIVE PREVIEW */}
      {/* ===================================================================== */}
      {cropSession && currentCropPixels && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="w-full max-w-lg rounded-2xl border p-4 sm:p-5 space-y-4 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)]">
                  Квадратная обрезка аватара
                </h4>
                <p className="text-[11px] text-[var(--skin-text-secondary)]">
                  Перемещайте изображение мышью или пальцем, чтобы выбрать квадратную область
                </p>
              </div>
              <button
                type="button"
                disabled={uploadingCrop}
                onClick={closeCropSession}
                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                aria-label="Закрыть редактор обрезки"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cropModalError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{cropModalError}</span>
              </div>
            )}

            {/* Main Crop Editor & 256x256 Preview Layout */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {/* Interactive Square Viewport */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] rounded-2xl overflow-hidden border-2 border-purple-500/80 bg-zinc-950 shadow-inner">
                  <canvas
                    ref={viewportCanvasRef}
                    width={260}
                    height={260}
                    onMouseDown={handleMouseDown}
                    onWheel={handleWheelZoom}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none block"
                  />
                </div>
                <span className="text-[11px] text-[var(--skin-text-secondary)]">
                  Область: {currentCropPixels.size}×{currentCropPixels.size} пикс. (из {cropSession.naturalWidth}×{cropSession.naturalHeight})
                </span>
              </div>

              {/* Live 256x256 Result Preview */}
              <div className="flex sm:flex-col items-center gap-3 sm:gap-2">
                <div className="text-center space-y-1">
                  <div className="text-[11px] font-semibold text-[var(--skin-text-secondary)]">
                    Предпросмотр 256×256
                  </div>
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border border-purple-400/60 bg-zinc-950 shadow-md mx-auto">
                    <canvas
                      ref={previewCanvasRef}
                      width={AVATAR_PREVIEW_TARGET_SIZE}
                      height={AVATAR_PREVIEW_TARGET_SIZE}
                      className="w-full h-full block"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Zoom & Reset Controls */}
            <div
              style={{
                backgroundColor: 'var(--skin-bg-subcard)',
                borderColor: 'var(--skin-border-base)'
              }}
              className="p-3 rounded-xl border space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--skin-text-secondary)]">
                  Масштаб: {cropState.zoom.toFixed(2)}×
                </span>
                <button
                  type="button"
                  onClick={handleResetCrop}
                  className="text-[11px] font-semibold text-purple-300 hover:text-purple-200 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>По центру</span>
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleZoomChange(cropState.zoom - 0.2)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
                  aria-label="Уменьшить масштаб"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.05}
                  value={cropState.zoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  className="flex-1 accent-purple-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleZoomChange(cropState.zoom + 0.2)}
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
                  aria-label="Увеличить масштаб"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={uploadingCrop}
                onClick={closeCropSession}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={uploadingCrop}
                onClick={handleConfirmUpload}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:brightness-110 disabled:opacity-50 cursor-pointer min-h-[40px]"
              >
                {uploadingCrop ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Загрузка в галерею...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Сохранить в галерею</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: FULL IMAGE VIEW ("ПРОСМОТР")                                 */}
      {/* ===================================================================== */}
      {viewingAvatar && (
        <div
          onClick={() => setViewingAvatar(null)}
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="w-full max-w-sm rounded-2xl border p-4 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
                Просмотр аватара
              </h4>
              <button
                type="button"
                onClick={() => setViewingAvatar(null)}
                className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                aria-label="Закрыть просмотр"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-64 h-64 mx-auto rounded-2xl overflow-hidden border border-[var(--skin-border-strong)] bg-zinc-950 shadow-lg">
              <ProtectedGalleryImage
                imageUrl={viewingAvatar.imageUrl}
                alt="Просмотр аватара 256×256"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-[var(--skin-text-secondary)]">
              <span>
                {viewingAvatar.width}×{viewingAvatar.height} WebP
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatAvatarByteSize(viewingAvatar.byteSize)}</span>
              {viewingAvatar.isActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-semibold">Активный аватар</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={viewingAvatar.isActive}
                onClick={() => {
                  const target = viewingAvatar;
                  setViewingAvatar(null);
                  setSelectedFutureAvatarId(target.id);
                }}
                style={
                  !viewingAvatar.isActive
                    ? {
                        background: 'var(--skin-btn-primary-bg)',
                        color: 'var(--skin-btn-primary-text)'
                      }
                    : undefined
                }
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all min-h-[40px] ${
                  viewingAvatar.isActive
                    ? 'bg-emerald-950/60 border border-emerald-700/70 text-emerald-300 cursor-default'
                    : 'hover:brightness-110 cursor-pointer'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {viewingAvatar.isActive ? 'Уже активен' : 'Выбрать для установки'}
                </span>
              </button>

              <button
                type="button"
                disabled={viewingAvatar.isActive}
                onClick={() => {
                  if (viewingAvatar.isActive) return;
                  setConfirmDeleteAvatar(viewingAvatar);
                }}
                title={
                  viewingAvatar.isActive
                    ? 'Активный аватар нельзя удалить'
                    : 'Удалить из галереи'
                }
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[40px] ${
                  viewingAvatar.isActive
                    ? 'bg-zinc-900/60 border-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-rose-950/70 hover:bg-rose-900/80 border-rose-800 text-rose-200 cursor-pointer'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: DELETE CONFIRMATION ("УДАЛЕНИЕ С ПОДТВЕРЖДЕНИЕМ")             */}
      {/* ===================================================================== */}
      {confirmDeleteAvatar && (
        <div
          onClick={() => !deletingAvatarId && setConfirmDeleteAvatar(null)}
          className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="w-full max-w-sm rounded-2xl border p-4 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-rose-500/50 shrink-0 bg-zinc-900">
                <ProtectedGalleryImage
                  imageUrl={confirmDeleteAvatar.imageUrl}
                  alt="Удаляемый аватар"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
                  Удалить изображение?
                </h4>
                <p className="text-xs text-[var(--skin-text-secondary)] mt-0.5 leading-relaxed">
                  Изображение будет безвозвратно удалено из вашей личной галереи и хранилища.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={Boolean(deletingAvatarId)}
                onClick={() => setConfirmDeleteAvatar(null)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer min-h-[40px]"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={Boolean(deletingAvatarId)}
                onClick={handleConfirmDelete}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                {deletingAvatarId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить навсегда</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: STAGE 3 ACTIVATION CONFIRMATION ("ПОДТВЕРЖДЕНИЕ СМЕНЫ")       */}
      {/* ===================================================================== */}
      {confirmActivateAvatar && (
        <div
          onClick={() => !activatingAvatarId && setConfirmActivateAvatar(null)}
          className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--skin-bg-card)',
              borderColor: 'var(--skin-border-base)'
            }}
            className="w-full max-w-sm rounded-2xl border p-4 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-purple-400/60 shrink-0 bg-zinc-900">
                <ProtectedGalleryImage
                  imageUrl={confirmActivateAvatar.imageUrl}
                  alt="Активируемый аватар"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
                  Подтвердите смену аватара
                </h4>
                <p className="text-xs text-[var(--skin-text-secondary)] mt-0.5 leading-relaxed">
                  {galleryPaymentMethod === 'certificate' ? (
                    <>
                      Будет использован <span className="font-bold text-purple-300">1 «Сертификат на смену аватара»</span> (кредиты не списываются).
                    </>
                  ) : (
                    <>
                      С вашего баланса будет списано <span className="font-bold text-amber-300">{avatarChangeCost} кредитов</span>.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={Boolean(activatingAvatarId)}
                onClick={() => setConfirmActivateAvatar(null)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold cursor-pointer min-h-[40px]"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={Boolean(activatingAvatarId)}
                onClick={handleConfirmActivate}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:brightness-110 disabled:opacity-50 min-h-[40px]"
              >
                {activatingAvatarId ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Применение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Подтвердить и применить</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
