import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCheck,
  Trash2,
  Bell,
  AlertTriangle,
  Loader2,
  ChevronDown
} from 'lucide-react';
import {
  UserNotification,
  NotificationFilter,
  NotificationCategory
} from '../../types/notifications';
import { NotificationItem } from './NotificationItem';
import { sounds } from '../../utils/audio';

interface NotificationCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: UserNotification[];
  unreadCount: number;
  total?: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  onLoadMore: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onDeleteAllRead: () => void;
  onAction?: (id: string, action: 'accept' | 'decline') => Promise<{ success: boolean; error?: string }>;
}

const FILTER_LABELS: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'unread', label: 'Непрочитанные' },
  { key: 'friends', label: 'Друзья' },
  { key: 'rewards', label: 'Награды' },
  { key: 'system', label: 'Системные' },
  { key: 'general', label: 'Прочее' }
];

export const NotificationCenterDrawer: React.FC<NotificationCenterDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  total,
  isLoading,
  isLoadingMore,
  hasMore,
  filter,
  onFilterChange,
  onLoadMore,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onDeleteAllRead,
  onAction
}) => {
  const [showConfirmDeleteAllRead, setShowConfirmDeleteAllRead] = useState<boolean>(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConfirmDeleteAllRead) {
          setShowConfirmDeleteAllRead(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showConfirmDeleteAllRead, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer Container */}
      <div
        className="relative w-full max-w-md h-full bg-[var(--skin-bg-modal)] border-l border-[var(--skin-border-accent)] shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-250 text-[var(--skin-text-primary)]"
      >
        {/* Top Header */}
        <div className="p-3.5 sm:p-4 border-b border-[var(--skin-border-base)] bg-[var(--skin-bg-header)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] text-[var(--skin-accent-primary)] shadow-xs">
              <Bell className="w-4 h-4 cyber-icon-cyan" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider font-sans">
                  Уведомления
                </h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--skin-text-muted)] font-mono">
                {typeof total === 'number' && total > 0 ? `Всего: ${total}` : 'Центр оповещений'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  try { sounds.playTick(); } catch {}
                  onMarkAllAsRead();
                }}
                title="Отметить все прочитанными"
                className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-emerald-400 hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
            )}

            {notifications.some(n => n.isRead) && (
              <button
                onClick={() => {
                  try { sounds.playTick(); } catch {}
                  setShowConfirmDeleteAllRead(true);
                }}
                title="Очистить прочитанные"
                className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-rose-400 hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => {
                try { sounds.playTick(); } catch {}
                onClose();
              }}
              title="Закрыть"
              className="p-1.5 rounded-lg text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Categories / Filter Pills Bar */}
        <div className="px-3 py-2 border-b border-[var(--skin-border-subtle)] bg-[var(--skin-bg-subcard)]/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {FILTER_LABELS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                try { sounds.playTick(); } catch {}
                onFilterChange(tab.key);
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                filter === tab.key
                  ? 'bg-[var(--skin-accent-primary)] text-white shadow-xs'
                  : 'text-[var(--skin-text-secondary)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)]'
              }`}
            >
              {tab.label}
              {tab.key === 'unread' && unreadCount > 0 && (
                <span className="ml-1 px-1 rounded-full bg-rose-500/80 text-[10px] font-mono">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Notification Cards List Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 min-h-0">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-[var(--skin-text-muted)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--skin-accent-primary)]" />
              <span className="text-xs">Загрузка уведомлений...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-[var(--skin-text-muted)]">
              <div className="w-12 h-12 rounded-2xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-[var(--skin-text-muted)]/60" />
              </div>
              <p className="text-xs font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider">
                {filter === 'unread' ? 'Нет непрочитанных' : 'Список пуст'}
              </p>
              <p className="text-[11px] text-[var(--skin-text-muted)] mt-1 max-w-xs">
                {filter === 'unread'
                  ? 'Все ваши уведомления прочитаны. Новые появятся здесь.'
                  : 'Здесь будут отображаться заявки в друзья, награды и системные вести.'}
              </p>
            </div>
          ) : (
            <>
              {notifications.map(item => (
                <NotificationItem
                  key={item.id}
                  notification={item}
                  onMarkAsRead={onMarkAsRead}
                  onDelete={onDelete}
                  onAction={onAction}
                />
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="pt-2 text-center">
                  <button
                    disabled={isLoadingMore}
                    onClick={onLoadMore}
                    className="skin-btn-secondary w-full py-2 px-3 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <span>Загрузить ещё</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Delete All Read Confirmation Modal */}
        {showConfirmDeleteAllRead && (
          <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="skin-modal max-w-xs w-full bg-[var(--skin-bg-modal)] border border-[var(--skin-border-accent)] rounded-2xl p-4 shadow-2xl text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-400 mx-auto flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--skin-text-primary)]">
                Очистить прочитанные?
              </h4>
              <p className="text-[11px] text-[var(--skin-text-secondary)] leading-relaxed">
                Все прочитанные информационные уведомления будут безвозвратно удалены. Ожидающие заявки сохранятся.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    try { sounds.playTick(); } catch {}
                    onDeleteAllRead();
                    setShowConfirmDeleteAllRead(false);
                  }}
                  className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
                >
                  Удалить
                </button>
                <button
                  onClick={() => setShowConfirmDeleteAllRead(false)}
                  className="flex-1 py-1.5 rounded-xl skin-btn-secondary border text-xs font-semibold transition-colors cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
