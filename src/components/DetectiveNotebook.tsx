import React, { useState, useEffect } from 'react';
import { X, Search, Check, AlertCircle, HelpCircle, Shield, Skull, Crown } from 'lucide-react';
import { Player } from '../types/mafia';

interface DetectiveNotebookProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  roomCode: string;
}

type TagType = 'clean' | 'suspect' | 'checked' | 'don' | 'dead';

export const DetectiveNotebook: React.FC<DetectiveNotebookProps> = ({
  isOpen,
  onClose,
  players,
  roomCode
}) => {
  const storageKeyNotes = `mafia_notes_${roomCode}`;
  const storageKeyTags = `mafia_tags_${roomCode}`;

  const [notes, setNotes] = useState<string>(() => {
    return localStorage.getItem(storageKeyNotes) || '';
  });

  const [tags, setTags] = useState<Record<string, TagType>>(() => {
    try {
      const saved = localStorage.getItem(storageKeyTags);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(storageKeyNotes, notes);
  }, [notes, storageKeyNotes]);

  useEffect(() => {
    localStorage.setItem(storageKeyTags, JSON.stringify(tags));
  }, [tags, storageKeyTags]);

  if (!isOpen) return null;

  const toggleTag = (playerId: string, tag: TagType) => {
    setTags(prev => {
      const next = { ...prev };
      if (next[playerId] === tag) {
        delete next[playerId];
      } else {
        next[playerId] = tag;
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs">
      <div className="skin-modal w-full max-w-xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="skin-header flex items-center justify-between border-b border-[var(--skin-border-header)] px-5 py-3.5 bg-[var(--skin-bg-header)]">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[var(--skin-accent-primary)]" />
            <h3
              className="font-serif-title font-semibold text-[var(--skin-text-primary)] text-base"
              style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
            >
              Дневник расследования
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Players dossier */}
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--skin-text-muted)] font-semibold mb-2.5">
              Статусы и подозрения игроков
            </div>
            <div className="space-y-2">
              {players.map(player => {
                const currentTag = tags[player.id];
                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2.5 rounded border transition-colors ${
                      !player.isAlive
                        ? 'bg-[var(--skin-bg-slot)]/50 border-[var(--skin-border-subtle)] text-[var(--skin-text-muted)]'
                        : 'skin-subcard bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-primary)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--skin-text-secondary)]">
                        {player.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <span className={`text-sm font-medium ${!player.isAlive ? 'line-through text-[var(--skin-text-muted)]' : 'text-[var(--skin-text-primary)]'}`}>
                          {player.name}
                        </span>
                        {!player.isAlive && (
                          <span className="ml-2 text-[10px] text-red-400 font-semibold">Погиб</span>
                        )}
                      </div>
                    </div>

                    {/* Tag buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleTag(player.id, 'clean')}
                        title="Мирный / Доверяю"
                        className={`p-1.5 rounded text-xs transition-colors ${
                          currentTag === 'clean'
                            ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                            : 'text-[var(--skin-text-muted)] hover:text-emerald-400 hover:bg-[var(--skin-bg-elevated)]'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleTag(player.id, 'suspect')}
                        title="Подозрительный"
                        className={`p-1.5 rounded text-xs transition-colors ${
                          currentTag === 'suspect'
                            ? 'bg-rose-950 border border-rose-500 text-rose-300'
                            : 'text-[var(--skin-text-muted)] hover:text-rose-400 hover:bg-[var(--skin-bg-elevated)]'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleTag(player.id, 'checked')}
                        title="Проверен шерифом"
                        className={`p-1.5 rounded text-xs transition-colors ${
                          currentTag === 'checked'
                            ? 'bg-amber-950 border border-amber-500 text-amber-300'
                            : 'text-[var(--skin-text-muted)] hover:text-amber-400 hover:bg-[var(--skin-bg-elevated)]'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleTag(player.id, 'don')}
                        title="Подозрение на Дона"
                        className={`p-1.5 rounded text-xs transition-colors ${
                          currentTag === 'don'
                            ? 'bg-purple-950 border border-purple-500 text-purple-300'
                            : 'text-[var(--skin-text-muted)] hover:text-purple-400 hover:bg-[var(--skin-bg-elevated)]'
                        }`}
                      >
                        <Crown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Secret Notes Textarea */}
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--skin-text-muted)] font-semibold mb-2">
              Личные записи и алиби
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Записывайте сюда: кто за кого голосовал, подозрительные фразы, алиби игроков..."
              className="skin-input w-full h-32 bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] rounded p-3 text-xs text-[var(--skin-input-text)] placeholder-[var(--skin-input-placeholder)] focus:outline-none focus:border-[var(--skin-input-border-focus)] resize-none font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--skin-border-header)] px-5 py-3 bg-[var(--skin-bg-header)] flex justify-between items-center text-xs text-[var(--skin-text-muted)]">
          <span>Заметки видны только вам</span>
          <button
            onClick={onClose}
            className="skin-btn-secondary px-4 py-1.5 rounded bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-btn-secondary-bg-hover)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] font-medium transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
