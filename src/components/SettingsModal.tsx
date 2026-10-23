import React, { useState } from 'react';
import { X, Settings, Volume2, VolumeX, BookOpen, Shield, Moon, Sun, Monitor, Video, Sliders, Globe, Check, Sparkles, Lock, ArrowRight, Palette } from 'lucide-react';
import { sounds } from '../utils/audio';
import { WebRtcSettingsPanel } from './WebRtcSettingsPanel';
import { loadWebRtcSettings, saveWebRtcSettings } from '../utils/webrtcSettings';
import { WebRtcSettings } from '../types/webrtc';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useSkin } from '../context/SkinContext';
import { AuthUser } from './AuthModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  initialTab?: 'general' | 'webrtc';
  user?: AuthUser | null;
  onOpenShop?: () => void;
  onUpdateUser?: (user: AuthUser) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenRules,
  initialTab = 'general',
  user,
  onOpenShop,
  onUpdateUser
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'webrtc'>(initialTab);
  const [webrtcSettings, setWebrtcSettings] = useState<WebRtcSettings>(loadWebRtcSettings);
  const { language, setLanguage, t, languages } = useLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { activeSkin, availableSkins, equipSkin, isSkinUnlocked } = useSkin();
  const [skinLoadingId, setSkinLoadingId] = useState<string | null>(null);
  const [skinNotice, setSkinNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleUpdateWebRtcSettings = (partial: Partial<WebRtcSettings>) => {
    const updated = { ...webrtcSettings, ...partial };
    setWebrtcSettings(updated);
    saveWebRtcSettings(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-xl bg-[#121319] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-850 bg-[#151620] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-750 flex items-center justify-center text-zinc-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                {t('settings.title', 'Настройки')}
              </h3>
              <p className="text-xs text-zinc-400">
                {t('settings.subtitle', 'Параметры профиля, языка, видеосвязи и интерфейса')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title={t('common.close', 'Закрыть')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-1 border-b border-zinc-850 bg-[#13141d] flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setActiveTab('general');
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'general'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('settings.tab_general', 'Общие настройки')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setActiveTab('webrtc');
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'webrtc'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{t('settings.tab_webrtc', 'Видеосвязь WebRTC')}</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {activeTab === 'general' ? (
            <>
              {/* Interface Language Selector */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{t('settings.language_title', 'Язык интерфейса')}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-800/80 text-amber-300 font-mono">
                          {languages.find(l => l.code === language)?.flag} {languages.find(l => l.code === language)?.nativeName}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {t('settings.language_desc', 'Выберите удобный язык для всех элементов меню и игры')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {languages.map((item) => {
                    const isSelected = language === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          sounds.playTick();
                          setLanguage(item.code);
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-md font-bold'
                            : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/70 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="text-base leading-none shrink-0">{item.flag}</span>
                          <span className="truncate">{item.nativeName}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sound Toggle */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                    {soundEnabled ? (
                      <Volume2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <VolumeX className="w-5 h-5 text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{t('settings.sound_title', 'Звуковые эффекты')}</span>
                      <kbd className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-400">M</kbd>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {t('settings.sound_desc', 'Звуки выстрела, голосования и таймеров (Клавиша M)')}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onToggleSound();
                    sounds.playTick();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    soundEnabled
                      ? 'bg-emerald-600/30 border border-emerald-500/60 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {soundEnabled ? t('settings.sound_on', 'ВКЛ') : t('settings.sound_off', 'ВЫКЛ')}
                </button>
              </div>

              {/* Rules Code */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {t('settings.rules_title', 'Правила и регламент')}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {t('settings.rules_desc', 'Кодекс ролей, фолы и фазы игры')}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRules();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  {t('settings.rules_btn', 'Открыть')}
                </button>
              </div>

              {/* Interactive Theme Selection */}
              <div className="p-4 rounded-2xl bg-[#161722] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      {resolvedTheme === 'light' ? (
                        <Sun className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Moon className="w-5 h-5 text-indigo-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {t('settings.theme_title', 'Тема интерфейса')}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {t('settings.theme_desc', 'Переключение между тёмным нуаром и светлым стилем')}
                      </div>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-750 text-[10px] font-mono font-semibold text-zinc-300 uppercase tracking-wider">
                    {theme === 'dark' ? t('settings.theme_dark_label', 'Нуар (Dark)') : theme === 'light' ? t('settings.theme_light_label', 'Светлая (Light)') : t('settings.theme_system_label', 'Авто (System)')}
                  </span>
                </div>

                {/* Theme Option Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {/* Dark Theme */}
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setTheme('dark');
                    }}
                    className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 cursor-pointer relative group ${
                      theme === 'dark'
                        ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-500'
                        : 'bg-[#12131b] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Moon className="w-4 h-4" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold leading-tight">
                        {t('settings.theme_dark', 'Тёмная')}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {t('settings.theme_dark_sub', 'Классический Нуар')}
                      </div>
                    </div>
                    {theme === 'dark' && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>

                  {/* Light Theme */}
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setTheme('light');
                    }}
                    className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 cursor-pointer relative group ${
                      theme === 'light'
                        ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-950/20 ring-1 ring-amber-500'
                        : 'bg-[#12131b] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500">
                      <Sun className="w-4 h-4" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold leading-tight">
                        {t('settings.theme_light', 'Светлая')}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {t('settings.theme_light_sub', 'Детектив')}
                      </div>
                    </div>
                    {theme === 'light' && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>

                  {/* System Theme */}
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playTick();
                      setTheme('system');
                    }}
                    className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 cursor-pointer relative group ${
                      theme === 'system'
                        ? 'bg-sky-500/10 border-sky-500 text-white shadow-lg shadow-sky-950/20 ring-1 ring-sky-500'
                        : 'bg-[#12131b] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                      <Monitor className="w-4 h-4" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold leading-tight">
                        {t('settings.theme_system', 'Системная')}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {t('settings.theme_system_sub', 'Авто (ОС)')}
                      </div>
                    </div>
                    {theme === 'system' && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Dynamic Custom UI Skins Section (Server Modules) */}
              <div className="p-4 rounded-2xl bg-[#161722] border border-zinc-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                      <Palette className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{t('settings.skins_title', 'Стили интерфейса (Скины инвентаря)')}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ПРЕМИУМ
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {t('settings.skins_desc', 'Динамические пакеты визуального оформления из вашего инвентаря')}
                      </div>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-750 text-[10px] font-mono font-semibold text-zinc-300">
                    {activeSkin === 'default' ? 'Базовый Нуар' : (availableSkins.find(s => s.id === activeSkin)?.name || activeSkin)}
                  </span>
                </div>

                {/* Skin feedback notice */}
                {skinNotice && (
                  <div className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    skinNotice.type === 'success'
                      ? 'bg-emerald-950/60 border border-emerald-700/60 text-emerald-300'
                      : 'bg-red-950/60 border border-red-700/60 text-red-300'
                  }`}>
                    {skinNotice.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-red-400" />}
                    <span>{skinNotice.text}</span>
                  </div>
                )}

                {/* Available Skins List */}
                <div className="space-y-2 pt-1">
                  {/* Default Base Skin */}
                  <div className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    activeSkin === 'default'
                      ? 'bg-zinc-800/80 border-amber-500/70 shadow-md ring-1 ring-amber-500/40'
                      : 'bg-[#12131b] border-zinc-800/90 hover:border-zinc-700'
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg shrink-0">
                        🎩
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">Классический Нуар (По умолчанию)</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-700/70 text-zinc-300">Базовый</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate">Стандартная палитра классической игры</p>
                      </div>
                    </div>

                    <div>
                      {activeSkin === 'default' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Активен</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={skinLoadingId !== null}
                          onClick={async () => {
                            sounds.playTick();
                            setSkinLoadingId('default');
                            setSkinNotice(null);
                            const res = await equipSkin('default', user);
                            setSkinLoadingId(null);
                            if (res.success) {
                              sounds.playCardFlip();
                              setSkinNotice({ type: 'success', text: 'Возвращен стандартный классический стиль' });
                              if (res.updatedUser && onUpdateUser) onUpdateUser(res.updatedUser);
                              setTimeout(() => setSkinNotice(null), 3000);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Custom Server-Loaded Skins */}
                  {availableSkins.map(skin => {
                    const isUnlocked = isSkinUnlocked(skin.id, user);
                    const isActive = activeSkin === skin.id;
                    const isLoading = skinLoadingId === skin.id;

                    return (
                      <div
                        key={skin.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isActive
                            ? 'bg-amber-950/20 border-amber-500 shadow-md ring-1 ring-amber-500/40'
                            : isUnlocked
                              ? 'bg-[#141520] border-zinc-800 hover:border-zinc-700'
                              : 'bg-[#101118]/70 border-zinc-850 opacity-90'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 border"
                            style={{
                              backgroundColor: skin.colors?.surface || '#181926',
                              borderColor: skin.colors?.border || '#7f1d1d'
                            }}
                          >
                            {skin.icon || '🎨'}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">{skin.name}</span>
                              <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border ${
                                skin.rarity === 'legendary'
                                  ? 'bg-amber-950/60 border-amber-600/70 text-amber-300'
                                  : 'bg-purple-950/60 border-purple-600/70 text-purple-300'
                              }`}>
                                {skin.rarity === 'legendary' ? 'Легендарный' : 'Эпический'}
                              </span>

                              {/* Color Swatch Dots */}
                              {skin.colors && (
                                <div className="flex items-center gap-1 ml-auto sm:ml-0">
                                  <span className="w-2.5 h-2.5 rounded-full border border-black/40" style={{ backgroundColor: skin.colors.primary }} />
                                  <span className="w-2.5 h-2.5 rounded-full border border-black/40" style={{ backgroundColor: skin.colors.surface }} />
                                  <span className="w-2.5 h-2.5 rounded-full border border-black/40" style={{ backgroundColor: skin.colors.border }} />
                                </div>
                              )}
                            </div>

                            <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                              {skin.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center">
                          {isActive ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Активен</span>
                            </span>
                          ) : isUnlocked ? (
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={async () => {
                                sounds.playTick();
                                setSkinLoadingId(skin.id);
                                setSkinNotice(null);
                                const res = await equipSkin(skin.id, user);
                                setSkinLoadingId(null);
                                if (!res.success) {
                                  setSkinNotice({ type: 'error', text: res.error || 'Ошибка активации' });
                                } else {
                                  sounds.playGunshot();
                                  setSkinNotice({ type: 'success', text: `Стиль «${skin.name}» успешно активирован!` });
                                  if (res.updatedUser && onUpdateUser) onUpdateUser(res.updatedUser);
                                  setTimeout(() => setSkinNotice(null), 3500);
                                }
                              }}
                              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-sm cursor-pointer"
                            >
                              {isLoading ? 'Загрузка...' : 'Активировать'}
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                                <Lock className="w-3 h-3" />
                                <span>Нет в инвентаре</span>
                              </span>
                              {onOpenShop && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    sounds.playTick();
                                    onClose();
                                    onOpenShop();
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-white text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Рынок</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Privacy Policy */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {t('settings.privacy_title', 'Политика конфиденциальности')}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {t('settings.privacy_desc', 'P2P WebRTC аудио/видео, безопасность и удаление данных')}
                    </div>
                  </div>
                </div>

                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
                >
                  {t('settings.privacy_btn', 'Открыть')}
                </a>
              </div>
            </>
          ) : (
            <WebRtcSettingsPanel
              settings={webrtcSettings}
              onUpdateSettings={handleUpdateWebRtcSettings}
            />
          )}
        </div>

      </div>
    </div>
  );
};
