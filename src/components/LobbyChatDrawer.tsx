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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs">
      <div className="skin-modal w-full max-w-lg bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] flex flex-col h-[520px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="skin-header px-5 py-3.5 border-b border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] text-[var(--skin-accent-primary)]">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3
                className="text-sm font-bold text-[var(--skin-text-primary)] uppercase tracking-wider"
                style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
              >
                Общий чат лобби
              </h3>
              <p className="text-[10px] text-[var(--skin-text-muted)]">
                Переписка игроков Города перед посадкой за стол
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 font-sans">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[var(--skin-text-muted)] text-xs">
              <MessageSquare className="w-8 h-8 text-[var(--skin-text-muted)] mb-2 opacity-50" />
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
                    <span className={`text-[11px] font-semibold ${isMe ? 'text-[var(--skin-text-accent)]' : 'text-[var(--skin-text-secondary)]'}`}>
                      {isMe ? 'Вы' : msg.senderName}
                    </span>
                    <span className="text-[9px] text-[var(--skin-text-muted)] font-mono">{time}</span>
                  </div>

                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                      isMe
                        ? 'skin-btn-primary bg-[var(--skin-btn-primary-bg)] text-[var(--skin-btn-primary-text)] border border-[var(--skin-btn-primary-border)] rounded-br-none shadow-md'
                        : 'skin-subcard bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-primary)] rounded-bl-none'
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
        <form onSubmit={handleSend} className="p-3 border-t border-[var(--skin-border-header)] bg-[var(--skin-bg-header)] flex gap-2">
          <input
            type="text"
            value={inputText}
            maxLength={200}
            onChange={e => setInputText(e.target.value)}
            placeholder="Напишите сообщение в общий чат..."
            className="skin-input flex-1 bg-[var(--skin-input-bg)] border border-[var(--skin-input-border)] rounded-xl px-3.5 py-2 text-xs text-[var(--skin-input-text)] placeholder-[var(--skin-input-placeholder)] focus:outline-none focus:border-[var(--skin-input-border-focus)] font-medium"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="skin-btn-primary px-4 py-2 rounded-xl bg-[var(--skin-btn-primary-bg)] hover:bg-[var(--skin-btn-primary-bg-hover)] disabled:opacity-40 text-[var(--skin-btn-primary-text)] border border-[var(--skin-btn-primary-border)] transition-colors flex items-center justify-center shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>

      </div>
    </div>
  );
};
