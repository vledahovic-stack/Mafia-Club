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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-500" />
            <h3 className="font-serif-title font-semibold text-zinc-100 text-base">
              Дневник расследования
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Players dossier */}
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-2.5">
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
                        ? 'bg-zinc-900/30 border-zinc-900 text-zinc-400'
                        : 'bg-zinc-900/70 border-zinc-800/80 text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
                        {player.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <span className={`text-sm font-medium ${!player.isAlive ? 'line-through text-zinc-400' : ''}`}>
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
                            : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800'
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
                            : 'text-zinc-400 hover:text-rose-400 hover:bg-zinc-800'
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
                            : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-800'
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
                            : 'text-zinc-400 hover:text-purple-400 hover:bg-zinc-800'
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
            <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-2">
              Личные записи и алиби
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Записывайте сюда: кто за кого голосовал, подозрительные фразы, алиби игроков..."
              className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded p-3 text-xs text-zinc-200 placeholder-zinc-400 focus:outline-none focus:border-amber-600/70 focus:ring-1 focus:ring-amber-600/30 resize-none font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-5 py-3 bg-zinc-900/40 flex justify-between items-center text-xs text-zinc-400">
          <span>Заметки видны только вам</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
