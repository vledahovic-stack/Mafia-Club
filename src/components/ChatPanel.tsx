import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, GamePhase, RoleId } from '../types/mafia';
import { Send, Skull, Shield, MessageSquare, ScrollText, Lock, Sparkles } from 'lucide-react';
import { sounds } from '../utils/audio';

interface ChatPanelProps {
  messages: ChatMessage[];
  myId: string;
  myRole?: RoleId;
  isAlive: boolean;
  isSpectator?: boolean;
  phase: GamePhase;
  onSendMessage: (text: string, channel: ChatMessage['channel']) => void;
}

const QUICK_PHRASES = [
  'Я мирный житель!',
  'Обратите внимание на голосование!',
  'Почему он так нервничает?',
  'Давайте выслушаем аргументы.',
  'Шериф, проверь его ночью!',
  'Я голосую за город.'
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  myId,
  myRole,
  isAlive,
  isSpectator = false,
  phase,
  onSendMessage
}) => {
  const isMafia = myRole === 'mafia' || myRole === 'don';
  const isGameOver = phase === 'GAME_OVER';

  const [activeChannel, setActiveChannel] = useState<ChatMessage['channel']>('all');
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannel]);

  useEffect(() => {
    if (activeChannel === 'mafia' && !isMafia && !isGameOver) {
      setActiveChannel('all');
    }
    if (activeChannel === 'dead' && isAlive && !isGameOver) {
      setActiveChannel('all');
    }
  }, [activeChannel, isMafia, isAlive, isGameOver]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim(), activeChannel);
    setInputText('');
    sounds.playMessageSound();
  };

  const handleQuickPhrase = (phrase: string) => {
    onSendMessage(phrase, activeChannel);
    sounds.playMessageSound();
  };

  // Determine if player can send in current channel & phase
  let canSend = true;
  let sendDisabledReason = '';

  if (activeChannel === 'system') {
    canSend = false;
    sendDisabledReason = 'Журнал событий ведётся протоколом';
  } else if (activeChannel === 'all') {
    if (isSpectator) {
      // Spectators can freely chat in all channel
      canSend = true;
    } else if (phase === 'NIGHT' && isAlive) {
      canSend = false;
      sendDisabledReason = 'Ночью город спит — говорить нельзя';
    } else if (!isAlive && !isGameOver) {
      canSend = false;
      sendDisabledReason = 'Мёртвые не могут писать живым';
    }
  } else if (activeChannel === 'mafia') {
    if (!isMafia && !isGameOver) {
      canSend = false;
      sendDisabledReason = 'Только для мафии';
    }
  } else if (activeChannel === 'dead') {
    if (isAlive && !isGameOver && !isSpectator) {
      canSend = false;
      sendDisabledReason = 'Только для выбывших игроков';
    }
  }

  // Filter messages for current channel view
  const currentMessages = messages.filter(m => {
    if (activeChannel === 'system') return m.channel === 'system';
    return m.channel === activeChannel;
  });

  return (
    <div className="flex flex-col h-full bg-[#111218] border border-zinc-800/90 rounded-2xl overflow-hidden shadow-xl select-none">
      {/* Channel Tabs */}
      <div className="flex border-b border-zinc-850 bg-[#13141d] p-1.5 gap-1 text-xs">
        <button
          onClick={() => setActiveChannel('all')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-bold transition-colors ${
            activeChannel === 'all'
              ? 'bg-[#1b1c28] text-white shadow-xs'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
          <span>Общий</span>
        </button>

        {(isMafia || isGameOver) && (
          <button
            onClick={() => setActiveChannel('mafia')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-bold transition-colors ${
              activeChannel === 'mafia'
                ? 'bg-rose-950/70 text-rose-200 border border-rose-800/60 shadow-xs'
                : 'text-rose-400 hover:text-rose-300'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-rose-500" />
            <span>Мафия</span>
          </button>
        )}

        {(!isAlive || isGameOver) && (
          <button
            onClick={() => setActiveChannel('dead')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-bold transition-colors ${
              activeChannel === 'dead'
                ? 'bg-[#1b1c28] text-zinc-200 shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Skull className="w-3.5 h-3.5 text-zinc-400" />
            <span>Кладбище</span>
          </button>
        )}

        <button
          onClick={() => setActiveChannel('system')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl font-bold transition-colors ${
            activeChannel === 'system'
              ? 'bg-[#1b1c28] text-amber-300 shadow-xs'
              : 'text-zinc-400 hover:text-amber-400'
          }`}
        >
          <ScrollText className="w-3.5 h-3.5" />
          <span>Журнал</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 font-sans">
        {currentMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-zinc-500 p-4">
            {activeChannel === 'system'
              ? 'Записи событий начнут появляться по ходу игры'
              : 'Сообщений пока нет. Будьте первым, кто выскажется!'}
          </div>
        ) : (
          currentMessages.map(msg => {
            const isMe = msg.senderId === myId;
            const isSystem = msg.channel === 'system' || msg.senderId === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="p-2.5 rounded-xl bg-[#151620] border border-amber-900/30 text-[11px] text-amber-200/90 leading-relaxed font-mono">
                  {msg.text}
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 flex-wrap">
                  {msg.clanTag && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300">
                      [{msg.clanTag}]
                    </span>
                  )}
                  {msg.isSpectator && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-950/80 border border-indigo-700/70 text-indigo-300 flex items-center gap-1">
                      <span>👁️</span>
                      <span>Зритель</span>
                    </span>
                  )}
                  <span className={`text-[11px] font-bold ${isMe ? 'text-amber-400' : 'text-zinc-300'}`}>
                    {msg.senderName}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className={`p-2.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                  isMe
                    ? 'bg-gradient-to-r from-[#b85820] to-[#8c3d12] text-white shadow-md'
                    : msg.channel === 'mafia'
                    ? 'bg-rose-950/40 border border-rose-900/60 text-rose-100'
                    : msg.channel === 'dead'
                    ? 'bg-zinc-900/80 border border-zinc-800 text-zinc-300'
                    : 'bg-[#181924] border border-zinc-800/80 text-zinc-100'
                }`}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Phrases Bar (Day Discussion only) */}
      {phase === 'DAY_DISCUSSION' && isAlive && canSend && (
        <div className="px-3 py-1.5 border-t border-zinc-850 bg-[#13141d] overflow-x-auto flex gap-1.5 scrollbar-none">
          {QUICK_PHRASES.map((phrase, idx) => (
            <button
              key={idx}
              onClick={() => handleQuickPhrase(phrase)}
              className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-[#181924] hover:bg-[#222432] border border-zinc-800 text-[10px] text-zinc-300 hover:text-white transition-colors"
            >
              {phrase}
            </button>
          ))}
        </div>
      )}

      {/* Input Form or Disabled Banner */}
      <div className="p-3 border-t border-zinc-850 bg-[#13141c]">
        {canSend ? (
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              maxLength={200}
              onChange={e => setInputText(e.target.value)}
              placeholder={activeChannel === 'mafia' ? 'Заговор мафии...' : 'Ваша реплика...'}
              className="flex-1 bg-[#161722] border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white transition-colors shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        ) : (
          <div className="py-2 px-3 rounded-xl bg-[#161722] border border-zinc-800 text-center text-[11px] text-zinc-400">
            {sendDisabledReason}
          </div>
        )}
      </div>
    </div>
  );
};
