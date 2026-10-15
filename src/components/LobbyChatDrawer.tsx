import React, { useState, useEffect, useRef } from 'react';
import { X, Send, MessageSquare, Users, Shield } from 'lucide-react';
import { sounds } from '../utils/audio';

export interface LobbyMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface LobbyChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  myId: string;
  myName: string;
}

export const LobbyChatDrawer: React.FC<LobbyChatDrawerProps> = ({
  isOpen,
  onClose,
  myId,
  myName
}) => {
  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/lobby/chat');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // Ignore network errors in polling
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || loading) return;

    setInputText('');
    setLoading(true);

    try {
      const res = await fetch('/api/lobby/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: myId,
          senderName: myName,
          text
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        sounds.playTick();
      }
    } catch (e) {
      console.error('Failed to send lobby message', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[#121319] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[520px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-[#161720] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-orange-950/60 border border-orange-800/60 text-orange-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Общий чат лобби
              </h3>
              <p className="text-[10px] text-zinc-400">
                Переписка игроков Города перед посадкой за стол
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

        {/* Message Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 text-xs">
              <MessageSquare className="w-8 h-8 text-zinc-400 mb-2 opacity-50" />
              <span>Здесь пока тихо. Напишите первое приветствие в Город!</span>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.senderId === myId;
              const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {isMe ? 'Вы' : msg.senderName}
                    </span>
                    <span className="text-[9px] text-zinc-400">{time}</span>
                  </div>

                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                      isMe
                        ? 'bg-[#ea580c] text-white rounded-br-none shadow-md shadow-orange-950/40'
                        : 'bg-[#1c1e27] border border-zinc-800 text-zinc-200 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSend} className="p-3 border-t border-zinc-850 bg-[#161720] flex gap-2">
          <input
            type="text"
            value={inputText}
            maxLength={200}
            onChange={e => setInputText(e.target.value)}
            placeholder="Напишите сообщение в общий чат..."
            className="flex-1 bg-[#101117] border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-orange-500 font-medium"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="px-4 py-2 rounded-xl bg-[#ea580c] hover:bg-[#f97316] disabled:opacity-40 text-white transition-colors flex items-center justify-center shadow-md shadow-orange-950/40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

      </div>
    </div>
  );
};
