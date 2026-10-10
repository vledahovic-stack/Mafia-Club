import React, { useState } from 'react';
import { X, Settings, Volume2, VolumeX, BookOpen, Shield, Bell, Moon, Video, Sliders } from 'lucide-react';
import { sounds } from '../utils/audio';
import { WebRtcSettingsPanel } from './WebRtcSettingsPanel';
import { loadWebRtcSettings, saveWebRtcSettings } from '../utils/webrtcSettings';
import { WebRtcSettings } from '../types/webrtc';

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
                Настройки
              </h3>
              <p className="text-xs text-zinc-400">Параметры профиля, видеосвязи и интерфейса</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
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
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'general'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Общие настройки</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setActiveTab('webrtc');
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'webrtc'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Видеосвязь WebRTC</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {activeTab === 'general' ? (
            <>
              {/* Sound Toggle */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-zinc-500" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Звуковые эффекты</span>
                      <kbd className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-zinc-400">M</kbd>
                    </div>
                    <div className="text-[11px] text-zinc-400">Звуки выстрела, голосования и таймеров (Клавиша M)</div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onToggleSound();
                    sounds.playTick();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    soundEnabled
                      ? 'bg-emerald-600/30 border border-emerald-500/60 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {soundEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                </button>
              </div>

              {/* Rules Code */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-amber-500" />
                  <div>
                    <div className="text-xs font-bold text-white">Правила и регламент</div>
                    <div className="text-[11px] text-zinc-400">Кодекс ролей, фолы и фазы игры</div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenRules();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
                >
                  Открыть
                </button>
              </div>

              {/* Language & Interface Info */}
              <div className="p-4 rounded-xl bg-[#161722] border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5 text-indigo-400" />
                  <div>
                    <div className="text-xs font-bold text-white">Тема интерфейса</div>
                    <div className="text-[11px] text-zinc-400">Классический нуар (Dark Noir 1930s)</div>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-zinc-400">По умолчанию</span>
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
