import React, { useState } from 'react';
import { X, Settings, Volume2, VolumeX, BookOpen, Shield, Moon, Video, Sliders, Globe, Check } from 'lucide-react';
import { sounds } from '../utils/audio';
import { WebRtcSettingsPanel } from './WebRtcSettingsPanel';
import { loadWebRtcSettings, saveWebRtcSettings } from '../utils/webrtcSettings';
import { WebRtcSettings } from '../types/webrtc';
import { useLanguage } from '../context/LanguageContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  initialTab?: 'general' | 'webrtc';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenRules,
  initialTab = 'general'
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'webrtc'>(initialTab);
  const [webrtcSettings, setWebrtcSettings] = useState<WebRtcSettings>(loadWebRtcSettings);
  const { language, setLanguage, t, languages } = useLanguage();

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

              {/* Theme Info */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <Moon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {t('settings.theme_title', 'Тема интерфейса')}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {t('settings.theme_desc', 'Классический нуар (Dark Noir 1930s)')}
                    </div>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-zinc-400">
                  {t('settings.theme_default', 'По умолчанию')}
                </span>
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
