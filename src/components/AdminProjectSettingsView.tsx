import React, { useState, useEffect, useCallback } from 'react';
import {
  SlidersHorizontal,
  Save,
  RotateCcw,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  ShieldCheck,
  Info,
  ToggleLeft,
  ToggleRight,
  Layers
} from 'lucide-react';
import { sounds } from '../utils/audio';

export interface AdminAvatarProjectSettingsDto {
  galleryLimit: number;
  allowAnimatedAvatars: boolean;
  defaultGalleryLimit: number;
  defaultAllowAnimatedAvatars: boolean;
  minGalleryLimit: number;
  maxGalleryLimit: number;
  supportedStaticFormats: string[];
  supportedAnimatedFormats: string[];
  maxUploadBytes: number;
  minDimensionPx: number;
  maxDimensionPx: number;
  outputDimensionPx: number;
  maxAnimatedFrames: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminProjectSettingsViewProps {
  token: string | null;
  isMainAdmin: boolean;
  onNotify?: (type: 'success' | 'error', text: string) => void;
  onAuditUpdated?: () => void;
}

const DEFAULT_AVATAR_SETTINGS: AdminAvatarProjectSettingsDto = {
  galleryLimit: 20,
  allowAnimatedAvatars: false,
  defaultGalleryLimit: 20,
  defaultAllowAnimatedAvatars: false,
  minGalleryLimit: 1,
  maxGalleryLimit: 1000,
  supportedStaticFormats: ['JPEG', 'PNG', 'WebP'],
  supportedAnimatedFormats: ['Animated WebP (image/webp)'],
  maxUploadBytes: 5 * 1024 * 1024,
  minDimensionPx: 32,
  maxDimensionPx: 4096,
  outputDimensionPx: 256,
  maxAnimatedFrames: 60,
  updatedAt: null,
  updatedBy: null
};

export function validateDraftGalleryLimitInput(
  rawInput: string,
  minLimit = 1,
  maxLimit = 1000
): { valid: boolean; value?: number; error?: string } {
  const trimmed = String(rawInput ?? '').trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Укажите лимит личной галереи (положительное целое число).'
    };
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Лимит личной галереи должен быть положительным целым числом без дробной части.'
    };
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < minLimit || num > maxLimit) {
    return {
      valid: false,
      error: `Лимит личной галереи должен быть в диапазоне от ${minLimit} до ${maxLimit}.`
    };
  }
  return { valid: true, value: num };
}

export const AdminProjectSettingsView: React.FC<AdminProjectSettingsViewProps> = ({
  token,
  isMainAdmin,
  onNotify,
  onAuditUpdated
}) => {
  const [savedSettings, setSavedSettings] = useState<AdminAvatarProjectSettingsDto>(DEFAULT_AVATAR_SETTINGS);
  const [draftGalleryLimitInput, setDraftGalleryLimitInput] = useState<string>('20');
  const [draftAllowAnimated, setDraftAllowAnimated] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const getAuthHeaders = useCallback(() => {
    const activeToken = token || localStorage.getItem('mafia_auth_token') || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeToken}`
    };
  }, [token]);

  const fetchProjectSettings = useCallback(
    async (silent = false) => {
      if (!isMainAdmin) {
        setLoading(false);
        setLoadError('Доступ запрещён: раздел «Настройки проекта» доступен только Главному Администратору.');
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setLoadError(null);

      try {
        const res = await fetch('/api/admin/project-settings', {
          headers: getAuthHeaders()
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Не удалось загрузить настройки проекта.');
        }

        const avatarsData: AdminAvatarProjectSettingsDto = {
          ...DEFAULT_AVATAR_SETTINGS,
          ...(data.avatars || {}),
          galleryLimit:
            typeof data.avatars?.galleryLimit === 'number'
              ? data.avatars.galleryLimit
              : typeof data.galleryLimit === 'number'
              ? data.galleryLimit
              : DEFAULT_AVATAR_SETTINGS.galleryLimit,
          allowAnimatedAvatars:
            typeof data.avatars?.allowAnimatedAvatars === 'boolean'
              ? data.avatars.allowAnimatedAvatars
              : typeof data.allowAnimatedAvatars === 'boolean'
              ? data.allowAnimatedAvatars
              : DEFAULT_AVATAR_SETTINGS.allowAnimatedAvatars
        };

        setSavedSettings(avatarsData);
        setDraftGalleryLimitInput(String(avatarsData.galleryLimit));
        setDraftAllowAnimated(avatarsData.allowAnimatedAvatars);
      } catch (err: any) {
        const msg = err?.message || 'Ошибка загрузки настроек проекта.';
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders, isMainAdmin]
  );

  useEffect(() => {
    fetchProjectSettings();
  }, [fetchProjectSettings]);

  const limitValidation = validateDraftGalleryLimitInput(
    draftGalleryLimitInput,
    savedSettings.minGalleryLimit,
    savedSettings.maxGalleryLimit
  );

  const hasUnsavedChanges =
    (limitValidation.valid ? limitValidation.value !== savedSettings.galleryLimit : true) ||
    draftAllowAnimated !== savedSettings.allowAnimatedAvatars;

  const handleResetDraft = () => {
    sounds.playTick();
    setDraftGalleryLimitInput(String(savedSettings.galleryLimit));
    setDraftAllowAnimated(savedSettings.allowAnimatedAvatars);
    setStatusMessage(null);
  };

  const handleRestoreDefaultsToDraft = () => {
    sounds.playTick();
    setDraftGalleryLimitInput(String(savedSettings.defaultGalleryLimit));
    setDraftAllowAnimated(savedSettings.defaultAllowAnimatedAvatars);
    setStatusMessage(null);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!isMainAdmin) {
      const msg = 'Доступ запрещён: сохранять настройки проекта может только Главный Администратор.';
      setStatusMessage({ type: 'error', text: msg });
      onNotify?.('error', msg);
      return;
    }

    if (!limitValidation.valid || limitValidation.value === undefined) {
      const errMsg = limitValidation.error || 'Некорректное значение лимита личной галереи.';
      setStatusMessage({ type: 'error', text: errMsg });
      onNotify?.('error', errMsg);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/project-settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          galleryLimit: limitValidation.value,
          allowAnimatedAvatars: draftAllowAnimated
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка сохранения настроек проекта.');
      }

      const updatedAvatars: AdminAvatarProjectSettingsDto = {
        ...savedSettings,
        ...(data.avatars || {}),
        galleryLimit:
          typeof data.avatars?.galleryLimit === 'number'
            ? data.avatars.galleryLimit
            : typeof data.galleryLimit === 'number'
            ? data.galleryLimit
            : limitValidation.value,
        allowAnimatedAvatars:
          typeof data.avatars?.allowAnimatedAvatars === 'boolean'
            ? data.avatars.allowAnimatedAvatars
            : typeof data.allowAnimatedAvatars === 'boolean'
            ? data.allowAnimatedAvatars
            : draftAllowAnimated
      };

      setSavedSettings(updatedAvatars);
      setDraftGalleryLimitInput(String(updatedAvatars.galleryLimit));
      setDraftAllowAnimated(updatedAvatars.allowAnimatedAvatars);

      sounds.playTick();
      const successMsg = data.message || 'Настройки проекта успешно сохранены.';
      setStatusMessage({ type: 'success', text: successMsg });
      onNotify?.('success', successMsg);
      onAuditUpdated?.();
    } catch (err: any) {
      const errMsg = err?.message || 'Не удалось сохранить настройки проекта.';
      setStatusMessage({ type: 'error', text: errMsg });
      onNotify?.('error', errMsg);
    } finally {
      setSaving(false);
    }
  };

  if (!isMainAdmin) {
    return (
      <div className="p-5 rounded-2xl bg-rose-950/30 border border-rose-700/60 text-rose-200 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
            Доступ ограничен
          </div>
          <p className="text-xs text-rose-200/90 leading-relaxed">
            Раздел «Настройки проекта» доступен для просмотра и изменения исключительно Главному Администратору.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-800/90">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Настройки проекта
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/60 text-amber-300 font-mono text-[10px] font-bold">
              MAIN ADMIN ONLY
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Глобальные параметры систем Mafia Club (таблица <span className="font-mono text-zinc-300">project_settings</span>). Изменения вступают в силу только после нажатия кнопки «Сохранить».
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              fetchProjectSettings();
            }}
            disabled={loading || saving}
            className="px-3 py-1.5 rounded-xl bg-[#161722] hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : 'text-zinc-400'}`} />
            <span>Обновить</span>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="p-8 rounded-2xl bg-[#13141c] border border-zinc-800 flex items-center justify-center gap-2.5 text-xs text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>Загрузка настроек проекта из базы данных...</span>
        </div>
      )}

      {/* Load Error Banner */}
      {!loading && loadError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-700/60 text-rose-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchProjectSettings()}
            className="px-3 py-1 rounded-lg bg-rose-900/70 hover:bg-rose-800 text-white font-bold text-[11px] shrink-0"
          >
            Повторить
          </button>
        </div>
      )}

      {/* Save Feedback Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-700/70 text-emerald-200'
              : 'bg-rose-950/40 border-rose-700/70 text-rose-200'
          }`}
        >
          <div className="flex items-start gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-[11px] font-mono opacity-75 hover:opacity-100 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Extensible Settings Form */}
      {!loading && !loadError && (
        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* MODULE 1: User Avatar & Personal Gallery System */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#13141c] border border-zinc-800/90 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-950/70 border border-amber-700/60 text-amber-300">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    Система пользовательских аватаров и личной галереи
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Управление лимитами хранения и обработкой загружаемых изображений игроков
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span className="px-2 py-0.5 rounded bg-[#181924] border border-zinc-700/80 text-zinc-300">
                  Активно в БД: <strong className="text-amber-300">{savedSettings.galleryLimit} шт.</strong> ·{' '}
                  <strong className={savedSettings.allowAnimatedAvatars ? 'text-emerald-400' : 'text-zinc-400'}>
                    {savedSettings.allowAnimatedAvatars ? 'АНИМ. ВКЛ' : 'АНИМ. ВЫКЛ'}
                  </strong>
                </span>
              </div>
            </div>

            {/* Two Settings Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Setting 1: Personal Avatar Gallery Limit */}
              <div className="p-4 rounded-xl bg-[#171822] border border-zinc-800 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <label
                        htmlFor="project-setting-avatar-gallery-limit"
                        className="text-xs font-bold text-white flex items-center gap-1.5"
                      >
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>1. Лимит личной галереи аватаров</span>
                      </label>
                      <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                        Ключ: <span className="text-amber-300/90">avatar_gallery_limit</span> · По умолчанию:{' '}
                        <span className="text-zinc-200 font-bold">{savedSettings.defaultGalleryLimit}</span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-700/50 text-amber-300 font-mono text-[10px] font-bold shrink-0">
                      Текущее: {savedSettings.galleryLimit}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-300/90 leading-relaxed">
                    Максимальное количество загруженных изображений в личной галерее одного игрока. Новое ограничение применяется ко всем последующим загрузкам.
                  </p>

                  <div className="p-2.5 rounded-lg bg-[#111219] border border-zinc-800/90 text-[11px] text-zinc-400 flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      Если у игрока уже загружено больше изображений, чем новый лимит, существующие изображения{' '}
                      <strong className="text-zinc-200">не удаляются автоматически</strong>.
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-zinc-800/70">
                  <div className="flex items-center gap-2">
                    <input
                      id="project-setting-avatar-gallery-limit"
                      type="number"
                      min={savedSettings.minGalleryLimit}
                      max={savedSettings.maxGalleryLimit}
                      step={1}
                      value={draftGalleryLimitInput}
                      onChange={(e) => {
                        setDraftGalleryLimitInput(e.target.value);
                        setStatusMessage(null);
                      }}
                      className={`w-32 bg-[#0e0f15] border rounded-xl px-3 py-2 text-sm text-white font-mono font-bold focus:outline-none ${
                        limitValidation.valid
                          ? 'border-zinc-700 focus:border-amber-500'
                          : 'border-rose-600 focus:border-rose-500'
                      }`}
                    />
                    <span className="text-xs text-zinc-400 font-mono">
                      изображений ({savedSettings.minGalleryLimit}–{savedSettings.maxGalleryLimit})
                    </span>
                  </div>

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-zinc-400 font-mono mr-1">Быстрый выбор:</span>
                    {[5, 10, 20, 30, 50, 100].map((preset) => {
                      const isSelected =
                        limitValidation.valid && limitValidation.value === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            sounds.playTick();
                            setDraftGalleryLimitInput(String(preset));
                            setStatusMessage(null);
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-600 border-amber-400 text-white'
                              : 'bg-[#111218] hover:bg-zinc-800 border-zinc-700/80 text-zinc-300'
                          }`}
                        >
                          {preset}
                          {preset === 20 ? ' (по умолч.)' : ''}
                        </button>
                      );
                    })}
                  </div>

                  {!limitValidation.valid && (
                    <div className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-0.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{limitValidation.error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Setting 2: Allow Animated Avatars */}
              <div className="p-4 rounded-xl bg-[#171822] border border-zinc-800 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>2. Разрешить анимированные аватары</span>
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                        Ключ: <span className="text-amber-300/90">avatar_allow_animated</span> · По умолчанию:{' '}
                        <span className="text-zinc-200 font-bold">Выключено</span>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border shrink-0 ${
                        savedSettings.allowAnimatedAvatars
                          ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                          : 'bg-zinc-850 border-zinc-700/60 text-zinc-400'
                      }`}
                    >
                      Текущее: {savedSettings.allowAnimatedAvatars ? 'ВКЛ' : 'ВЫКЛ'}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-300/90 leading-relaxed">
                    Управляет приёмом новых анимированных изображений при загрузке в личную галерею. Переключение не изменяет и не удаляет уже загруженные изображения.
                  </p>

                  <div className="p-2.5 rounded-lg bg-[#111219] border border-zinc-800/90 text-[11px] text-zinc-400 space-y-1">
                    <div className="flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-zinc-200">Фактическая поддержка серверного конвейера:</strong> при включении разрешается загрузка{' '}
                        <strong className="text-amber-300">анимированного WebP (image/webp)</strong> до{' '}
                        <strong className="text-zinc-200">{savedSettings.maxAnimatedFrames} кадров</strong>, объёмом до 5 МБ и разрешением кадра от {savedSettings.minDimensionPx}×{savedSettings.minDimensionPx} до {savedSettings.maxDimensionPx}×{savedSettings.maxDimensionPx} пикс. (приводится к {savedSettings.outputDimensionPx}×{savedSettings.outputDimensionPx} WebP). Форматы GIF и SVG не принимаются, а APNG обрабатывается как статичный однокадровый PNG.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">
                      Статус в черновике:{' '}
                      <span className={draftAllowAnimated ? 'text-emerald-400' : 'text-zinc-400'}>
                        {draftAllowAnimated ? 'Разрешено (ВКЛ)' : 'Запрещено (ВЫКЛ)'}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {draftAllowAnimated
                        ? 'Новые анимированные WebP (до 60 кадров) будут приниматься после сохранения'
                        : 'Новые анимированные файлы будут отклоняться сервером'}
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={draftAllowAnimated}
                    onClick={() => {
                      sounds.playTick();
                      setDraftAllowAnimated((prev) => !prev);
                      setStatusMessage(null);
                    }}
                    className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                      draftAllowAnimated
                        ? 'bg-emerald-950/80 hover:bg-emerald-900/80 border-emerald-500 text-emerald-200 shadow-sm'
                        : 'bg-[#111218] hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {draftAllowAnimated ? (
                      <>
                        <ToggleRight className="w-5 h-5 text-emerald-400" />
                        <span>ВКЛЮЧЕНО</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-5 h-5 text-zinc-400" />
                        <span>ВЫКЛЮЧЕНО</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Action Bar with mandatory Save button */}
            <div className="pt-3 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 flex-wrap">
                {hasUnsavedChanges ? (
                  <span className="text-amber-300 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    Есть несохранённые изменения (нажмите «Сохранить»)
                  </span>
                ) : (
                  <span className="text-zinc-400">
                    Все отображаемые параметры синхронизированы с базой данных
                  </span>
                )}
                {savedSettings.updatedAt && (
                  <span className="text-zinc-500">
                    · Обновлено: {new Date(savedSettings.updatedAt).toLocaleString('ru-RU')}
                    {savedSettings.updatedBy ? ` (${savedSettings.updatedBy})` : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleRestoreDefaultsToDraft}
                  disabled={saving}
                  className="px-3 py-2 rounded-xl bg-[#181924] hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-40"
                  title="Подставить значения по умолчанию (20 и Выкл) в форму перед сохранением"
                >
                  По умолчанию
                </button>

                {hasUnsavedChanges && (
                  <button
                    type="button"
                    onClick={handleResetDraft}
                    disabled={saving}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Отменить</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={saving || !limitValidation.valid || !hasUnsavedChanges}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-45 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Сохранить</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
