import React, { useState } from 'react';
import {
  UserPlus,
  Gift,
  ShieldAlert,
  Info,
  Check,
  CheckCheck,
  X,
  Trash2,
  Clock,
  Loader2
} from 'lucide-react';
import { UserNotification } from '../../types/notifications';
import { sounds } from '../../utils/audio';

interface NotificationItemProps {
  notification: UserNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onAction?: (id: string, action: 'accept' | 'decline') => Promise<{ success: boolean; error?: string }>;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'только что';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин назад`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ч назад`;
    if (diffSec < 86400 * 2) return 'вчера';

    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onDelete,
  onAction
}) => {
  const [isActing, setIsActing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const getIcon = () => {
    switch (notification.type) {
      case 'friend_request':
        return <UserPlus className="w-4 h-4 text-emerald-400" />;
      case 'reward':
      case 'campaign_reward':
        return <Gift className="w-4 h-4 text-amber-400" />;
      case 'system_alert':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400" />;
    }
  };

  const handleAction = async (action: 'accept' | 'decline') => {
    if (!onAction || isActing) return;
    setIsActing(true);
    setActionError(null);
    try {
      sounds.playTick();
      const res = await onAction(notification.id, action);
      if (!res.success && res.error) {
        setActionError(res.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка выполнения';
      setActionError(msg);
    } finally {
      setIsActing(false);
    }
  };

  const actorName = notification.data?.actorName;
  const actorAvatar = notification.data?.actorAvatar;

  return (
    <div
      className={`group relative rounded-2xl p-3 sm:p-3.5 transition-all border ${
        notification.isRead
          ? 'bg-[var(--skin-bg-subcard)]/60 border-[var(--skin-border-base)] opacity-85 hover:opacity-100 hover:border-[var(--skin-border-strong)]'
          : 'bg-[var(--skin-bg-card)] border-[var(--skin-border-accent)] shadow-sm shadow-[var(--skin-accent-primary)]/5'
      }`}
    >
      {/* Unread Indicator Dot */}
      {!notification.isRead && (
        <span
          title="Непрочитано"
          className="absolute top-3.5 left-2 w-1.5 h-1.5 rounded-full bg-[var(--skin-accent-primary)] animate-pulse"
        />
      )}

      <div className="flex items-start gap-3 pl-1.5">
        {/* Category Icon / Actor Avatar */}
        <div className="shrink-0 pt-0.5">
          {notification.type === 'friend_request' && actorName ? (
            <div className="w-9 h-9 rounded-xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] flex items-center justify-center font-bold text-sm text-[var(--skin-accent-primary)] shadow-xs overflow-hidden">
              {actorAvatar ? (
                <span className="font-mono text-xs font-bold text-[var(--skin-text-accent)]">
                  {actorName[0]?.toUpperCase()}
                </span>
              ) : (
                actorName[0]?.toUpperCase()
              )}
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] flex items-center justify-center shadow-xs">
              {getIcon()}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4
              className={`text-xs font-bold truncate ${
                notification.isRead
                  ? 'text-[var(--skin-text-secondary)]'
                  : 'text-[var(--skin-text-primary)]'
              }`}
            >
              {notification.title}
            </h4>

            {/* Quick Actions (Mark Read & Delete) */}
            <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && (
                <button
                  onClick={() => onMarkAsRead(notification.id)}
                  title="Отметить прочитанным"
                  className="p-1 rounded-lg text-[var(--skin-text-muted)] hover:text-emerald-400 hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => onDelete(notification.id)}
                title="Удалить уведомление"
                className="p-1 rounded-lg text-[var(--skin-text-muted)] hover:text-rose-400 hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-[11px] sm:text-xs text-[var(--skin-text-secondary)] mt-0.5 leading-snug break-words">
            {notification.message}
          </p>

          {/* Action error feedback */}
          {actionError && (
            <div className="mt-2 text-[10px] text-rose-400 bg-rose-950/60 border border-rose-800/60 rounded-lg px-2 py-1">
              {actionError}
            </div>
          )}

          {/* Interactive Friend Request Actions or Status */}
          {notification.type === 'friend_request' && (
            <div className="mt-2.5 pt-2 border-t border-[var(--skin-border-subtle)] flex items-center gap-2 flex-wrap">
              {notification.actionState === 'pending' ? (
                <>
                  <button
                    disabled={isActing}
                    onClick={() => handleAction('accept')}
                    className="skin-btn-primary px-3 py-1.5 rounded-xl text-white text-[11px] font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isActing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Принять</span>
                  </button>

                  <button
                    disabled={isActing}
                    onClick={() => handleAction('decline')}
                    className="skin-btn-secondary px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Отклонить</span>
                  </button>
                </>
              ) : notification.actionState === 'accepted' ? (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded-lg">
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Заявка принята</span>
                </div>
              ) : notification.actionState === 'declined' ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--skin-text-muted)] bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] px-2.5 py-1 rounded-lg">
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>Заявка отклонена</span>
                </div>
              ) : (
                <div className="text-[10px] text-[var(--skin-text-muted)] italic">
                  Заявка отменена или недействительна
                </div>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="flex items-center gap-1 text-[10px] text-[var(--skin-text-muted)] mt-2 font-mono">
            <Clock className="w-3 h-3 shrink-0" />
            <span>{formatRelativeTime(notification.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
