import React, { useState } from 'react';
import { X, Plus, DoorOpen } from 'lucide-react';
import { sounds } from '../utils/audio';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (roomName: string) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [roomName, setRoomName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = roomName.trim() || `Комната №${Math.floor(400 + Math.random() * 99)}`;
    sounds.playGavel();
    onCreate(name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-md bg-[#121319] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-850 bg-[#161720] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Создать комнату
              </h3>
              <p className="text-[11px] text-zinc-400">
                Задайте название для нового игрового стола
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-2">
              Название комнаты:
            </label>
            <input
              type="text"
              autoFocus
              value={roomName}
              maxLength={30}
              onChange={e => setRoomName(e.target.value)}
              placeholder="Например: Комната №433, Клуб Мафии, Стол Дона..."
              className="w-full bg-[#181922] border border-zinc-800 rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-orange-500 font-medium"
            />
            <p className="text-[11px] text-zinc-400 mt-2">
              Все параметры (роли, количество мест и таймеры) настраиваются создателем прямо за столом.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 border border-amber-900/60"
            >
              <DoorOpen className="w-4 h-4" />
              <span>Создать стол и войти</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
