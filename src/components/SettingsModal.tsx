import React from 'react';
import { X, Settings, Volume2, VolumeX, BookOpen, Shield, Bell, Moon } from 'lucide-react';
import { sounds } from '../utils/audio';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenRules
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#121319] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-850 bg-[#151620] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-750 flex items-center justify-center text-zinc-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Настройки
              </h3>
              <p className="text-xs text-zinc-400">Параметры аккаунта и интерфейса</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-4">
          
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

        </div>

      </div>
    </div>
  );
};
