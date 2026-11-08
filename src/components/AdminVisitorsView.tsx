import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  RefreshCw,
  Trash2,
  Search,
  X,
  Bell,
  BellOff,
  UserCheck,
  User,
  Clock,
  Activity,
  Smartphone,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Globe,
  CheckCircle2,
  ShieldCheck,
  Info
} from 'lucide-react';
import { sounds } from '../utils/audio';
import {
  formatDateTimeInTimezone,
  getClientProjectTimezone,
  subscribeClientProjectTimezone
} from '../utils/timezone';
import {
  AdminPushDeviceItem,
  BrowserPushEnvironment,
  detectPushEnvironment,
  fetchAdminPushStatus,
  toggleAdminVisitorPush,
  subscribeCurrentDeviceToPush,
  unsubscribeDeviceFromPush
} from '../utils/visitorPushClient';

export interface VisitorLogItem {
  id: string;
  visitorKey: string;
  sessionKey: string;
  isAuthenticated: boolean;
  userId?: string | null;
  displayName: string;
  onlineCount: number;
  deviceSummary?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface VisitorStatsSummary {
  todayVisits: number;
  uniqueVisitors24h: number;
  activeOnlineSnapshot: number;
  activeGuestsCount?: number;
}

interface AdminVisitorsViewProps {
  token: string | null;
  onNotify?: (type: 'success' | 'error', text: string) => void;
  onAuditUpdated?: () => void;
}

const PAGE_SIZE = 20;

export const AdminVisitorsView: React.FC<AdminVisitorsViewProps> = ({
  token,
  onNotify,
  onAuditUpdated
}) => {
  const [logs, setLogs] = useState<VisitorLogItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [stats, setStats] = useState<VisitorStatsSummary>({
    todayVisits: 0,
    uniqueVisitors24h: 0,
    activeOnlineSnapshot: 0,
    activeGuestsCount: 0
  });
  const [page, setPage] = useState<number>(0);
  const [searchInput, setSearchInput] = useState<string>('');
  const [appliedSearch, setAppliedSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);
  const [projectTz, setProjectTz] = useState<string>(() => getClientProjectTimezone());

  // Web Push Control State (Stage 4)
  const [pushLoading, setPushLoading] = useState<boolean>(true);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [vapidConfigured, setVapidConfigured] = useState<boolean>(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [vapidReason, setVapidReason] = useState<string | undefined>(undefined);
  const [currentDeviceSubId, setCurrentDeviceSubId] = useState<string | null>(null);
  const [pushDevices, setPushDevices] = useState<AdminPushDeviceItem[]>([]);
  const [pushEnv, setPushEnv] = useState<BrowserPushEnvironment>(() => detectPushEnvironment());
  const [pushActionBusy, setPushActionBusy] = useState<boolean>(false);
  const [disconnectingDeviceId, setDisconnectingDeviceId] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushWarning, setPushWarning] = useState<string | null>(null);

  useEffect(() => {
    return subscribeClientProjectTimezone((tz) => {
      setProjectTz(tz);
    });
  }, []);

  const loadPushStatus = useCallback(async () => {
    const activeToken = token || localStorage.getItem('mafia_auth_token');
    if (!activeToken) {
      setPushLoading(false);
      return;
    }

    setPushEnv(detectPushEnvironment());
    try {
      const status = await fetchAdminPushStatus(activeToken);
      setPushEnabled(status.enabled);
      setVapidConfigured(status.vapid.configured);
      setVapidPublicKey(status.vapid.publicKey);
      setVapidReason(status.vapid.reason);
      setCurrentDeviceSubId(status.currentDeviceSubscriptionId);
      setPushDevices(status.subscriptions);
    } catch (err: any) {
      setPushError(err?.message || 'Не удалось загрузить настройки push-уведомлений');
    } finally {
      setPushLoading(false);
    }
  }, [token]);

  const fetchVisitorsData = useCallback(
    async (targetPage: number, searchQuery: string, isSilentRefresh = false) => {
      const activeToken = token || localStorage.getItem('mafia_auth_token');
      if (!activeToken) {
        setError('Требуется авторизация Главного Администратора');
        setLoading(false);
        return;
      }

      if (isSilentRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(targetPage * PAGE_SIZE)
        });
        if (searchQuery.trim()) {
          params.set('search', searchQuery.trim());
        }

        const res = await fetch(`/api/admin/visitors?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${activeToken}`
          }
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Не удалось загрузить журнал посещений');
        }

        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setTotalCount(Number(data.totalCount) || 0);
        if (data.stats) {
          setStats({
            todayVisits: Number(data.stats.todayVisits) || 0,
            uniqueVisitors24h: Number(data.stats.uniqueVisitors24h) || 0,
            activeOnlineSnapshot: Number(data.stats.activeOnlineSnapshot) || 0,
            activeGuestsCount: Number(data.stats.activeGuestsCount) || 0
          });
        }
      } catch (err: any) {
        const msg = err?.message || 'Ошибка соединения с сервером';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchVisitorsData(page, appliedSearch, false);
  }, [page, appliedSearch, fetchVisitorsData]);

  useEffect(() => {
    loadPushStatus();
  }, [loadPushStatus]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playTick();
    setPage(0);
    setAppliedSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    sounds.playTick();
    setSearchInput('');
    setPage(0);
    setAppliedSearch('');
  };

  const handleRefresh = () => {
    sounds.playTick();
    fetchVisitorsData(page, appliedSearch, true);
    loadPushStatus();
  };

  const handleToggleGlobalPush = async () => {
    const activeToken = token || localStorage.getItem('mafia_auth_token');
    if (!activeToken || pushActionBusy) return;

    sounds.playTick();
    setPushActionBusy(true);
    setPushError(null);
    setPushWarning(null);

    try {
      const nextEnabled = !pushEnabled;
      const res = await toggleAdminVisitorPush(activeToken, nextEnabled);
      setPushEnabled(res.enabled);
      if (onNotify) {
        onNotify('success', res.message);
      }
      if (onAuditUpdated) {
        onAuditUpdated();
      }
    } catch (err: any) {
      const msg = err?.message || 'Ошибка изменения статуса уведомлений';
      setPushError(msg);
      if (onNotify) {
        onNotify('error', msg);
      }
    } finally {
      setPushActionBusy(false);
    }
  };

  const handleConnectCurrentDevice = async () => {
    const activeToken = token || localStorage.getItem('mafia_auth_token');
    if (!activeToken || pushActionBusy) return;

    sounds.playTick();
    setPushActionBusy(true);
    setPushError(null);
    setPushWarning(null);

    try {
      const res = await subscribeCurrentDeviceToPush(activeToken, {
        configured: vapidConfigured,
        publicKey: vapidPublicKey,
        reason: vapidReason
      });

      setPushEnv(detectPushEnvironment());
      await loadPushStatus();

      if (onNotify) {
        onNotify('success', res.message);
      }
      if (onAuditUpdated) {
        onAuditUpdated();
      }
    } catch (err: any) {
      setPushEnv(detectPushEnvironment());
      const msg = err?.message || 'Не удалось подключить уведомления на этом устройстве';
      setPushError(msg);
      if (onNotify) {
        onNotify('error', msg);
      }
    } finally {
      setPushActionBusy(false);
    }
  };

  const handleDisconnectDevice = async (subscriptionId: string | null, isCurrentDevice: boolean) => {
    const activeToken = token || localStorage.getItem('mafia_auth_token');
    if (!activeToken || pushActionBusy) return;

    sounds.playTick();
    setPushActionBusy(true);
    setDisconnectingDeviceId(subscriptionId || 'current');
    setPushError(null);
    setPushWarning(null);

    try {
      const res = await unsubscribeDeviceFromPush(activeToken, {
        subscriptionId,
        isCurrentDevice
      });

      setPushEnv(detectPushEnvironment());
      await loadPushStatus();

      if (res.partialWarning) {
        setPushWarning(res.partialWarning);
      }
      if (onNotify) {
        onNotify('success', res.message);
      }
      if (onAuditUpdated) {
        onAuditUpdated();
      }
    } catch (err: any) {
      const msg = err?.message || 'Не удалось отключить устройство от уведомлений';
      setPushError(msg);
      if (onNotify) {
        onNotify('error', msg);
      }
    } finally {
      setPushActionBusy(false);
      setDisconnectingDeviceId(null);
    }
  };

  const handleConfirmClearLogs = async () => {
    const activeToken = token || localStorage.getItem('mafia_auth_token');
    if (!activeToken) return;

    setClearing(true);
    try {
      const res = await fetch('/api/admin/visitors', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${activeToken}`
        }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при очистке журнала посещений');
      }

      setLogs([]);
      setTotalCount(0);
      setPage(0);
      if (data.stats) {
        setStats({
          todayVisits: Number(data.stats.todayVisits) || 0,
          uniqueVisitors24h: Number(data.stats.uniqueVisitors24h) || 0,
          activeOnlineSnapshot: Number(data.stats.activeOnlineSnapshot) || 0,
          activeGuestsCount: Number(data.stats.activeGuestsCount) || 0
        });
      } else {
        setStats((prev) => ({
          ...prev,
          todayVisits: 0,
          uniqueVisitors24h: 0
        }));
      }

      setIsClearConfirmOpen(false);
      if (onNotify) {
        onNotify('success', data.message || 'Журнал посещений успешно очищен');
      }
      if (onAuditUpdated) {
        onAuditUpdated();
      }
    } catch (err: any) {
      const msg = err?.message || 'Не удалось очистить журнал посещений';
      if (onNotify) {
        onNotify('error', msg);
      } else {
        setError(msg);
      }
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalCount, (page + 1) * PAGE_SIZE);
  const isCurrentDeviceConnected = Boolean(currentDeviceSubId);

  const permissionLabel =
    pushEnv.permission === 'granted'
      ? 'Разрешено'
      : pushEnv.permission === 'denied'
      ? 'Запрещено в браузере'
      : pushEnv.permission === 'default'
      ? 'Ожидает подтверждения'
      : 'Не поддерживается';

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      {/* Header & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span>Посетители сайта и Журнал визитов</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Учёт входов зарегистрированных игроков и гостей на главную страницу (хранение 7 дней, окно сессии 30 мин.)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            title="Обновить журнал и статистику"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setIsClearConfirmOpen(true);
            }}
            disabled={loading || clearing || totalCount === 0}
            className="h-9 px-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Удалить все записи журнала посещений"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Очистить журнал</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Online Now */}
        <div className="p-3.5 rounded-xl bg-[#13141a] border border-zinc-800/90 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs">Сейчас онлайн</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-300 font-mono">
            {stats.activeOnlineSnapshot}
          </div>
          <div className="text-[10px] text-zinc-400">
            Игроки в комнатах/лобби и активные гости
          </div>
        </div>

        {/* Visits Today */}
        <div className="p-3.5 rounded-xl bg-[#13141a] border border-zinc-800/90 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs">Посещений сегодня</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white font-mono">
            {stats.todayVisits}
          </div>
          <div className="text-[10px] text-amber-400/90 flex items-center gap-1">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">Пояс: {projectTz}</span>
          </div>
        </div>

        {/* Unique 24h */}
        <div className="p-3.5 rounded-xl bg-[#13141a] border border-zinc-800/90 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs">Уникальных за 24 ч</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-blue-300 font-mono">
            {stats.uniqueVisitors24h}
          </div>
          <div className="text-[10px] text-zinc-400">
            Всего записей в базе: {totalCount}
          </div>
        </div>

        {/* Live Push Notifications Summary Card */}
        <div className="p-3.5 rounded-xl bg-[#13141a] border border-zinc-800/90 flex flex-col justify-between space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs">Push-уведомления</span>
            {pushEnabled ? (
              <Bell className="w-4 h-4 text-emerald-400" />
            ) : (
              <BellOff className="w-4 h-4 text-zinc-500" />
            )}
          </div>
          <div
            className={`text-sm font-bold font-mono ${
              pushEnabled ? 'text-emerald-300' : 'text-zinc-300'
            }`}
          >
            {pushLoading ? 'Загрузка...' : pushEnabled ? 'Включены' : 'Выключены'}
          </div>
          <div className="text-[10px] text-zinc-400">
            Устройств: {pushDevices.length} · Это устройство:{' '}
            {isCurrentDeviceConnected ? 'подключено' : 'не подключено'}
          </div>
        </div>
      </div>

      {/* Active Web Push Management Block (Stage 4) */}
      <div className="p-4 rounded-xl bg-[#13141a] border border-zinc-800/90 space-y-3.5">
        {/* Top Row: Global Toggle + Server VAPID Readiness */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-850">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Bell className="w-4 h-4 text-amber-400 shrink-0" />
              <h4 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                Уведомления о посетителях
              </h4>
              <span className="text-[11px] font-mono text-zinc-400">
                · Сервер VAPID:{' '}
                <strong className={vapidConfigured ? 'text-emerald-400' : 'text-amber-400'}>
                  {vapidConfigured ? 'Настроен' : 'Не настроен'}
                </strong>
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Отправка Web Push уведомлений на подключённые устройства Главного Администратора при новых визитах (исключая F5 и собственные входы).
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={pushEnabled}
              disabled={pushLoading || pushActionBusy}
              onClick={handleToggleGlobalPush}
              className={`h-9 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                pushEnabled
                  ? 'bg-emerald-950/70 hover:bg-emerald-900/80 border-emerald-600/70 text-emerald-200'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  pushEnabled ? 'bg-emerald-400' : 'bg-zinc-500'
                }`}
              />
              <span>
                {pushEnabled ? 'Уведомления о посетителях: ВКЛ' : 'Уведомления о посетителях: ВЫКЛ'}
              </span>
            </button>
          </div>
        </div>

        {/* Status Warnings when Global Toggle is ON but VAPID is missing or 0 devices connected */}
        {!pushLoading && !vapidConfigured && (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-700/60 flex items-start gap-2.5 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">Серверная VAPID-конфигурация не настроена</div>
              <p className="text-amber-200/85 leading-relaxed">
                {vapidReason ||
                  'В переменных окружения сервера отсутствуют VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY.'}{' '}
                Журнал посещений продолжает работать штатно, но подключение устройств и отправка Web Push станут доступны после добавления VAPID-ключей в Environment на Render.
              </p>
            </div>
          </div>
        )}

        {!pushLoading && pushEnabled && vapidConfigured && pushDevices.length === 0 && (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-700/60 flex items-start gap-2.5 text-amber-200 text-xs">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">Ни одно устройство не подключено</div>
              <p className="text-amber-200/85 leading-relaxed">
                Глобальный переключатель уведомлений включён, однако в списке пока нет активных устройств. Нажмите «Подключить уведомления на этом устройстве» на телефоне или в браузере.
              </p>
            </div>
          </div>
        )}

        {/* iPhone / iPad Safari Tab Guidance (Requires Home Screen PWA installation) */}
        {pushEnv.requiresIOSHomeScreen && (
          <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-700/60 flex items-start gap-2.5 text-blue-200 text-xs">
            <Smartphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Инструкция для iPhone / iPad (iOS)</div>
              <p className="text-blue-200/90 leading-relaxed">
                В обычной вкладке Safari на iPhone Web Push недоступен. Чтобы получать уведомления на телефон:
                нажмите кнопку <strong>«Поделиться»</strong> в панели Safari, выберите пункт{' '}
                <strong>«На экран Домой»</strong> (Add to Home Screen), откройте установленное приложение{' '}
                <strong>Mafia Club</strong> с главного экрана и нажмите кнопку подключения здесь.
              </p>
            </div>
          </div>
        )}

        {/* Unsupported Browser Notice */}
        {!pushEnv.supported && !pushEnv.requiresIOSHomeScreen && (
          <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-750 flex items-start gap-2.5 text-zinc-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold text-white">Браузер не поддерживает Web Push</div>
              <p className="text-zinc-400 leading-relaxed">
                {pushEnv.unsupportedReason ||
                  'В текущем браузере отсутствуют Service Worker, Notifications API или PushManager.'}
              </p>
            </div>
          </div>
        )}

        {/* Browser Permission Denied Notice */}
        {pushEnv.supported && pushEnv.permission === 'denied' && (
          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-700/60 flex items-start gap-2.5 text-rose-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">Уведомления заблокированы в настройках браузера</div>
              <p className="text-rose-200/85 leading-relaxed">
                В этом браузере установлен запрет на показ уведомлений для сайта. Откройте настройки разрешений сайта (значок замка или настроек в адресной строке), разрешите «Уведомления» и нажмите кнопку подключения повторно.
              </p>
            </div>
          </div>
        )}

        {/* Action Error / Partial Warning Banners */}
        {pushError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/70 flex items-center justify-between gap-2 text-rose-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{pushError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPushError(null)}
              className="text-rose-300 hover:text-white cursor-pointer shrink-0"
              title="Скрыть сообщение"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {pushWarning && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-700/70 flex items-center justify-between gap-2 text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{pushWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setPushWarning(null)}
              className="text-amber-300 hover:text-white cursor-pointer shrink-0"
              title="Скрыть предупреждение"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Current Device Status & Subscribe / Unsubscribe Controls */}
        <div className="p-3.5 rounded-xl bg-[#101117] border border-zinc-850 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-white font-bold flex-wrap">
              <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Текущее устройство: {pushEnv.deviceLabel}</span>
              <span className="text-zinc-500">·</span>
              <span
                className={
                  isCurrentDeviceConnected
                    ? 'text-emerald-400 font-mono'
                    : 'text-zinc-400 font-mono'
                }
              >
                {isCurrentDeviceConnected ? 'Подключено к уведомлениям' : 'Не подключено'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 flex-wrap">
              <span>Разрешение браузера: {permissionLabel}</span>
              <span>·</span>
              <span>
                Web Push API: {pushEnv.supported ? 'Поддерживается' : 'Недоступен'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {!isCurrentDeviceConnected ? (
              <button
                type="button"
                onClick={handleConnectCurrentDevice}
                disabled={
                  pushLoading ||
                  pushActionBusy ||
                  !pushEnv.supported ||
                  !vapidConfigured
                }
                className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pushActionBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Bell className="w-3.5 h-3.5" />
                )}
                <span>Подключить уведомления на этом устройстве</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleConnectCurrentDevice}
                  disabled={pushLoading || pushActionBusy || !pushEnv.supported || !vapidConfigured}
                  className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                  title="Проверить и обновить подписку текущего устройства"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Обновить подписку</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDisconnectDevice(currentDeviceSubId, true)}
                  disabled={pushLoading || pushActionBusy}
                  className="h-9 px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
                >
                  {pushActionBusy && disconnectingDeviceId === (currentDeviceSubId || 'current') ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>Отключить уведомления на этом устройстве</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Registered Devices List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>ПОДКЛЮЧЁННЫЕ УСТРОЙСТВА ГЛАВНОГО АДМИНИСТРАТОРА ({pushDevices.length})</span>
            {pushDevices.length > 0 && (
              <span>Уведомления приходят на все устройства из списка</span>
            )}
          </div>

          {pushDevices.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#101117] border border-zinc-850 text-xs text-zinc-400 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-zinc-500 shrink-0" />
              <span>Нет подключённых устройств. Подключите телефон или браузер кнопкой выше.</span>
            </div>
          ) : (
            <div className="divide-y divide-zinc-850 rounded-xl bg-[#101117] border border-zinc-850 overflow-hidden">
              {pushDevices.map((dev) => {
                const connectedAtFormatted = formatDateTimeInTimezone(dev.createdAt, projectTz);
                const lastSuccessFormatted = dev.lastSuccessAt
                  ? formatDateTimeInTimezone(dev.lastSuccessAt, projectTz)
                  : null;
                const isCurrent = Boolean(dev.isCurrentDevice || dev.id === currentDeviceSubId);

                return (
                  <div
                    key={dev.id}
                    className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">
                          {dev.deviceLabel || 'Устройство администратора'}
                        </span>
                        {isCurrent && (
                          <span className="text-[11px] font-mono text-emerald-400">
                            · Текущее устройство
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 flex-wrap">
                        <span>Подключено: {connectedAtFormatted}</span>
                        <span>·</span>
                        {dev.lastError ? (
                          <span className="text-rose-400">
                            Статус отправки: ошибка ({dev.lastError})
                          </span>
                        ) : lastSuccessFormatted ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 inline shrink-0" />
                            <span>Последняя доставка: {lastSuccessFormatted}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-400">
                            Статус отправки: ожидает новых визитов
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end shrink-0">
                      <button
                        type="button"
                        disabled={pushActionBusy}
                        onClick={() => handleDisconnectDevice(dev.id, isCurrent)}
                        className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-rose-950/70 border border-zinc-750 hover:border-rose-700/60 text-zinc-300 hover:text-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {pushActionBusy && disconnectingDeviceId === dev.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <BellOff className="w-3 h-3 text-rose-400" />
                        )}
                        <span>Отключить</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Search & Filter Strip */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Поиск по никнейму игрока или ключу посетителя..."
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-[#13141a] border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/70"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
              title="Сбросить поиск"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="h-9 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-white transition-colors cursor-pointer shrink-0"
        >
          Найти
        </button>
      </form>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-700/60 flex items-center justify-between gap-3 text-rose-200 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800/80 border border-rose-600/50 text-white font-bold text-xs shrink-0 cursor-pointer"
          >
            Повторить
          </button>
        </div>
      )}

      {/* Visitor Logs List */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl bg-[#13141a] border border-zinc-800/90 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-850 bg-[#101117] flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <span>ПОСЛЕДНИЕ ПОСЕЩЕНИЯ САЙТА</span>
          <span>
            {totalCount > 0 ? `Показано ${rangeStart}–${rangeEnd} из ${totalCount}` : '0 записей'}
          </span>
        </div>

        {loading ? (
          <div className="flex-1 py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs">Загрузка журнала посещений...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex-1 py-12 px-4 flex flex-col items-center justify-center text-center gap-1.5">
            <Users className="w-8 h-8 text-zinc-600 mb-1" />
            <div className="text-sm font-bold text-zinc-300">
              {appliedSearch ? 'По вашему запросу ничего не найдено' : 'Журнал посещений пуст'}
            </div>
            <p className="text-xs text-zinc-500 max-w-md">
              {appliedSearch
                ? 'Попробуйте изменить поисковый запрос или сбросить фильтр.'
                : 'Новые посещения гостей и авторизованных игроков будут автоматически отображаться здесь при открытии сайта.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-850/80 overflow-y-auto">
            {logs.map((log) => {
              const firstSeenFormatted = formatDateTimeInTimezone(log.firstSeenAt, projectTz);
              const lastSeenFormatted = formatDateTimeInTimezone(log.lastSeenAt, projectTz);
              const hasContinuedActivity =
                log.lastSeenAt &&
                log.firstSeenAt &&
                Math.abs(new Date(log.lastSeenAt).getTime() - new Date(log.firstSeenAt).getTime()) >= 60_000;

              return (
                <div
                  key={log.id}
                  className="px-3.5 sm:px-4 py-2.5 hover:bg-zinc-900/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  {/* Left: Identity & Status */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        log.isAuthenticated
                          ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                          : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
                      }`}
                    >
                      {log.isAuthenticated ? (
                        <UserCheck className="w-4 h-4" />
                      ) : (
                        <User className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-white truncate">
                          {log.displayName || 'Гость'}
                        </span>
                        <span
                          className={`text-[11px] font-mono ${
                            log.isAuthenticated ? 'text-emerald-300' : 'text-zinc-400'
                          }`}
                        >
                          · {log.isAuthenticated ? 'Игрок' : 'Гость'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono mt-0.5 flex-wrap">
                        <span>ID: {log.visitorKey.slice(0, 12)}…</span>
                        {log.deviceSummary && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-zinc-300">
                              <Smartphone className="w-3 h-3 text-zinc-400" />
                              {log.deviceSummary}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Timestamp & Online Count Snapshot */}
                  <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 shrink-0">
                    <div className="text-xs font-mono text-zinc-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{firstSeenFormatted}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      {hasContinuedActivity && (
                        <>
                          <span
                            className="text-zinc-400"
                            title="Время последней активности в рамках 30-минутной сессии"
                          >
                            акт. до {lastSeenFormatted.split(', ')[1] || lastSeenFormatted}
                          </span>
                          <span className="text-zinc-600">·</span>
                        </>
                      )}
                      <span className="font-bold text-emerald-300">
                        Онлайн: {log.onlineCount}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > PAGE_SIZE && (
          <div className="px-4 py-2.5 border-t border-zinc-850 bg-[#101117] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                setPage((p) => Math.max(0, p - 1));
              }}
              disabled={page === 0 || loading}
              className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-xs font-bold text-zinc-200 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Назад</span>
            </button>

            <span className="text-xs font-mono text-zinc-400">
              Страница <strong className="text-white">{page + 1}</strong> из{' '}
              <strong className="text-white">{totalPages}</strong>
            </span>

            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                setPage((p) => Math.min(totalPages - 1, p + 1));
              }}
              disabled={page + 1 >= totalPages || loading}
              className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-xs font-bold text-zinc-200 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Вперёд</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Clearing Visitor Logs */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-[#12131a] border border-rose-700/60 shadow-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-600/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Подтверждение очистки журнала
                </h4>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Вы действительно хотите удалить все записи журнала посещений? Это действие нельзя отменить.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-850">
              <button
                type="button"
                disabled={clearing}
                onClick={() => {
                  sounds.playTick();
                  setIsClearConfirmOpen(false);
                }}
                className="h-9 px-4 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleConfirmClearLogs}
                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {clearing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Очистить журнал</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
