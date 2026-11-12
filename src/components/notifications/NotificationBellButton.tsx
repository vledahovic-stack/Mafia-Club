import React from 'react';
import { Bell } from 'lucide-react';
import { sounds } from '../../utils/audio';

interface NotificationBellButtonProps {
  unreadCount: number;
  hasNewAnimation?: boolean;
  onClick: () => void;
  className?: string;
  title?: string;
}

export const NotificationBellButton: React.FC<NotificationBellButtonProps> = ({
  unreadCount,
  hasNewAnimation = false,
  onClick,
  className = '',
  title = 'Уведомления'
}) => {
  const displayCount = unreadCount > 99 ? '99+' : unreadCount;

  return (
    <button
      onClick={() => {
        try {
          sounds.playTick();
        } catch {}
        onClick();
      }}
      title={unreadCount > 0 ? `${title} (${unreadCount} непрочитанных)` : title}
      aria-label={unreadCount > 0 ? `${title}: ${unreadCount} непрочитанных` : title}
      className={`relative p-1.5 sm:p-2 rounded-xl text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)]/80 transition-all cursor-pointer ${className}`}
    >
      <Bell
        className={`w-5 h-5 cyber-icon-cyan transition-transform ${
          hasNewAnimation ? 'animate-wiggle text-amber-400 scale-110' : ''
        }`}
      />

      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-gradient-to-r from-rose-600 to-amber-600 text-white font-mono font-bold text-[9px] flex items-center justify-center leading-none shadow-sm shadow-rose-950/50 border border-white/20 animate-in zoom-in-50 duration-150"
        >
          {displayCount}
        </span>
      )}
    </button>
  );
};
