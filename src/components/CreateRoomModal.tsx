import React, { useState } from 'react';
import { X, Plus, DoorOpen } from 'lucide-react';
import { sounds } from '../utils/audio';
import { useLanguage } from '../context/LanguageContext';

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
  const { t } = useLanguage();
  const [roomName, setRoomName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultPrefix = t('home.room_prefix', 'Комната №');
    const name = roomName.trim() || `${defaultPrefix}${Math.floor(400 + Math.random() * 99)}`;
    sounds.playGavel();
    onCreate(name);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs select-none">
      <div className="skin-modal w-full max-w-md bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="skin-header px-6 py-4 border-b border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] flex items-center justify-center text-[var(--skin-accent-primary)] font-bold">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3
                className="text-sm font-bold text-[var(--skin-text-primary)] uppercase tracking-wider"
                style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
              >
                {t('create_room.title', 'Создать комнату')}
              </h3>
              <p className="text-[11px] text-[var(--skin-text-muted)]">
                {t('create_room.subtitle', 'Задайте название для нового игрового стола')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
            title={t('common.close', 'Закрыть')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-[var(--skin-text-secondary)] block mb-2">
              {t('create_room.name_label', 'Название комнаты:')}
            </label>
            <input
              type="text"
              autoFocus
              value={roomName}
              maxLength={30}
              onChange={e => setRoomName(e.target.value)}
              placeholder={t('create_room.name_placeholder', 'Например: Комната №433, Клуб Мафии, Стол Дона...')}
              className="skin-input w-full bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] rounded-xl px-4 py-3 text-xs text-[var(--skin-input-text)] placeholder-[var(--skin-input-placeholder)] focus:outline-none focus:border-[var(--skin-input-border-focus)] font-medium"
            />
            <p className="text-[11px] text-[var(--skin-text-muted)] mt-2">
              {t('create_room.note', 'Все параметры (роли, количество мест и таймеры) настраиваются создателем прямо за столом.')}
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="cyber-room-join-btn skin-btn-join w-full py-3.5 rounded-xl text-white font-bold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 border cursor-pointer"
            >
              <DoorOpen className="w-4 h-4" />
              <span>{t('create_room.submit', 'Создать стол и войти')}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
