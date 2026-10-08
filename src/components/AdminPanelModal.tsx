import React, { useState, useEffect } from 'react';
import { 
  X, 
  Shield, 
  Crown, 
  Users, 
  Gamepad2, 
  Coins, 
  Gift, 
  Ban, 
  Check, 
  Search, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  Radio, 
  Send, 
  Loader2, 
  AlertTriangle,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
  UserCheck,
  TrendingUp,
  Activity,
  Server,
  Lock,
  ChevronRight,
  SlidersHorizontal,
  Flame,
  AlertCircle,
  ShoppingCart,
  Plus,
  Percent,
  Tag,
  ToggleLeft,
  ToggleRight,
  RotateCcw,
  Sparkles,
  Save,
  Flag,
  UserX,
  ShieldAlert,
  FileWarning,
  Inbox,
  MessageSquare,
  Calendar,
  Clock,
  Zap,
  Award,
  History,
  ShieldCheck,
  FileText,
  Eye,
  ScrollText
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { ALL_GAME_ITEMS, ITEMS_LIST, RARITY_CONFIG, CATEGORY_CONFIG, ItemDefinition, ItemCategory, ItemRarity } from '../data/items';
import { GangsterIcon } from './GangsterIcon';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';
import { AdminEventsBuilderView } from './AdminEventsBuilderView';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onUpdateCurrentUser?: (updated: AuthUser) => void;
}

type AdminTab = 'users' | 'rooms' | 'shop' | 'dailyBonus' | 'events' | 'reports' | 'auditLogs' | 'broadcast' | 'stats';

export interface AuditLogRecord {
  id: string;
  actionType:
    | 'role_change'
    | 'room_shutdown'
    | 'event_create'
    | 'event_update'
    | 'event_delete'
    | 'task_create'
    | 'task_update'
    | 'task_delete'
    | 'user_ban'
    | 'credits_change'
    | 'item_give'
    | 'user_rename'
    | 'rating_change'
    | 'broadcast'
    | 'report_resolve'
    | 'shop_update'
    | 'daily_bonus_update'
    | 'system'
    | string;
  adminId?: string;
  adminEmail: string;
  adminName: string;
  targetId?: string;
  targetName?: string;
  details: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AuditStats {
  totalLogs: number;
  roleChangesCount: number;
  roomShutdownsCount: number;
  eventActionsCount: number;
  moderationActionsCount: number;
}

export interface DailyBonusDayConfig {
  day: number;
  credits: number;
  icon?: string;
  itemId?: string;
  itemName?: string;
  itemIcon?: string;
  isSpecial?: boolean;
  title?: string;
}

export interface DailyBonusConfig {
  isEnabled: boolean;
  multiplier: number;
  streakPolicy: 'calendar_day' | 'flexible_24h' | 'never_reset';
  cooldownHours: number;
  bannerMessage: string;
  vipBonusPercent: number;
  days: DailyBonusDayConfig[];
  updatedAt?: string;
}

export interface DailyBonusStats {
  totalClaims: number;
  todayClaims: number;
  totalCreditsGiven: number;
  totalItemsGiven: number;
  activeStreaksCount: number;
  claimsHistory?: Array<{
    id: string;
    userId: string;
    userDisplayName: string;
    day: number;
    credits: number;
    itemId?: string;
    claimedAt: string;
  }>;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  reporterName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  targetPlayerEmail?: string;
  roomCode: string;
  reason: string;
  reasonCategory: 'toxicity' | 'throwing' | 'spam' | 'inappropriate_name' | 'other';
  details?: string;
  createdAt: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  resolutionNote?: string;
  actionTaken?: 'ban' | 'warning' | 'dismissed' | 'none';
  resolvedAt?: string;
}

interface ServerStats {
  totalUsers: number;
  totalCredits: number;
  totalGamesPlayed: number;
  activeRoomsCount: number;
  activePlayersInRooms: number;
  bannedUsersCount: number;
  adminEmail: string;
}

interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
  createdAt: string;
  credits: number;
  role: 'admin' | 'moderator' | 'user';
  isAdmin: boolean;
  isBanned?: boolean;
  inventory?: { itemId: string; quantity: number }[];
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    rating: number;
    mafiaWins: number;
    civilianWins: number;
  };
}

interface ActiveRoom {
  roomCode: string;
  roomName: string;
  phase: string;
  dayNumber: number;
  playerCount: number;
  maxPlayers: number;
  gameMode: string;
  isPublic: boolean;
  hostId: string;
  hostName: string;
  players: { id: string; name: string; role?: string; isAlive: boolean; isBot: boolean }[];
}

interface ShopSettings {
  globalDiscount: number;
  bannerMessage: string;
  isShopEnabled: boolean;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateCurrentUser
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [roomsList, setRoomsList] = useState<ActiveRoom[]>([]);
  const [reportsList, setReportsList] = useState<ReportRecord[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'banned' | 'admins' | 'rich'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reports state
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');
  const [reportCategoryFilter, setReportCategoryFilter] = useState<ReportRecord['reasonCategory'] | 'all'>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [selectedReportForReview, setSelectedReportForReview] = useState<ReportRecord | null>(null);
  const [reviewResolutionNote, setReviewResolutionNote] = useState('');
  const [reviewBanTarget, setReviewBanTarget] = useState(false);

  // Daily Bonus state
  const [dailyBonusConfig, setDailyBonusConfig] = useState<DailyBonusConfig | null>(null);
  const [dailyBonusStats, setDailyBonusStats] = useState<DailyBonusStats | null>(null);
  const [isSavingDailyBonus, setIsSavingDailyBonus] = useState(false);
  const [dailyBonusUserSearch, setDailyBonusUserSearch] = useState('');
  const [dailyBonusResetSuccess, setDailyBonusResetSuccess] = useState<string | null>(null);

  // Shop state
  const [shopItemsList, setShopItemsList] = useState<ItemDefinition[]>(ITEMS_LIST);
  const [shopSettings, setShopSettings] = useState<ShopSettings>({
    globalDiscount: 0,
    bannerMessage: 'Специальные предложения Городского Синдиката!',
    isShopEnabled: true
  });
  const [shopSearch, setShopSearch] = useState('');
  const [shopCategoryFilter, setShopCategoryFilter] = useState<ItemCategory | 'all'>('all');
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<ItemDefinition | null>(null);
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [isShopSettingsOpen, setIsShopSettingsOpen] = useState(false);

  // New item form state
  const [newItemForm, setNewItemForm] = useState<Partial<ItemDefinition>>({
    id: '',
    name: '',
    category: 'certificates',
    rarity: 'rare',
    cost: 250,
    pawnValue: 125,
    icon: '📜',
    description: '',
    effectDescription: '',
    usable: true,
    consumable: true,
    inShop: true,
    discountPercent: 0
  });

  // User Edit Modal / Action state
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<ManagedUser | null>(null);
  const [creditAmountInput, setCreditAmountInput] = useState<number>(500);
  const [selectedItemToGive, setSelectedItemToGive] = useState<string>('cert_name_change');
  const [itemQuantityToGive, setItemQuantityToGive] = useState<number>(1);
  const [newRatingInput, setNewRatingInput] = useState<number>(1200);
  const [newDisplayNameInput, setNewDisplayNameInput] = useState<string>('');
  const [selectedUserRoleInput, setSelectedUserRoleInput] = useState<'user' | 'moderator' | 'admin'>('user');
  const [selectedUserIsAdminInput, setSelectedUserIsAdminInput] = useState<boolean>(false);

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'role_change' | 'room_shutdown' | 'events' | 'moderation' | 'economy' | 'broadcast'>('all');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogRecord | null>(null);
  const [isRefreshingAudit, setIsRefreshingAudit] = useState<boolean>(false);

  // Broadcast state
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const isSuperAdmin = Boolean(user && (user.isAdmin === true || user.role === 'admin' || user.email?.toLowerCase() === 'vledahovic@gmail.com'));

  const getAuthHeaders = () => {
    const token = localStorage.getItem('mafia_auth_token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };
  };

  const safeFetchJson = async (url: string, headers: HeadersInit) => {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const loadAdminData = async () => {
    if (!isSuperAdmin) return;
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [statsData, usersData, roomsData, shopData, reportsData, bonusData, auditData] = await Promise.all([
        safeFetchJson('/api/admin/stats', headers),
        safeFetchJson('/api/admin/users', headers),
        safeFetchJson('/api/admin/rooms', headers),
        safeFetchJson('/api/admin/shop/items', headers),
        safeFetchJson('/api/admin/reports', headers),
        safeFetchJson('/api/admin/daily-bonus', headers),
        safeFetchJson('/api/admin/audit-logs', headers)
      ]);

      if (statsData) {
        setStats(statsData);
      }
      if (usersData?.users) {
        setUsersList(usersData.users || []);
      }
      if (roomsData?.rooms) {
        setRoomsList(roomsData.rooms || []);
      }
      if (shopData) {
        if (shopData.items && Array.isArray(shopData.items)) {
          setShopItemsList(shopData.items);
        }
        if (shopData.settings) {
          setShopSettings(shopData.settings);
        }
      }
      if (reportsData?.reports && Array.isArray(reportsData.reports)) {
        setReportsList(reportsData.reports);
      }
      if (bonusData) {
        if (bonusData.config) {
          setDailyBonusConfig(bonusData.config);
        }
        if (bonusData.stats) {
          setDailyBonusStats(bonusData.stats);
        }
      }
      if (auditData) {
        if (auditData.logs && Array.isArray(auditData.logs)) {
          setAuditLogs(auditData.logs);
        }
        if (auditData.stats) {
          setAuditStats(auditData.stats);
        }
      }
    } catch {
      // Gracefully handled without logging fatal console errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && isSuperAdmin) {
      loadAdminData();
    }
  }, [isOpen, isSuperAdmin]);

  if (!isOpen) return null;

  // Strict access check
  if (!isSuperAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs select-none">
        <div className="w-full max-w-md bg-[#161318] border border-rose-900/60 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white uppercase">Доступ ограничен</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Панель управления доступна исключительно авторизованному администратору системы (<span className="text-amber-400 font-mono">vledahovic@gmail.com</span>).
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // User Actions
  const handleAddCredits = async (userId: string, amount: number, isSet: boolean = false) => {
    try {
      const res = await fetch('/api/admin/users/credits', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, amount, isSet })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, credits: data.user.credits } : u));
      if (selectedUserForEdit && selectedUserForEdit.id === userId) {
        setSelectedUserForEdit(prev => prev ? { ...prev, credits: data.user.credits } : null);
      }
      if (user && user.id === userId && onUpdateCurrentUser) {
        onUpdateCurrentUser({ ...user, credits: data.user.credits });
      }
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка изменения кредитов';
      showNotification('error', msg);
    }
  };

  const handleGiveItem = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/users/give-item', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          userId, 
          itemId: selectedItemToGive, 
          quantity: itemQuantityToGive 
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, inventory: data.user.inventory } : u));
      if (selectedUserForEdit && selectedUserForEdit.id === userId) {
        setSelectedUserForEdit(prev => prev ? { ...prev, inventory: data.user.inventory } : null);
      }
      if (user && user.id === userId && onUpdateCurrentUser) {
        onUpdateCurrentUser({ ...user, inventory: data.user.inventory });
      }
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка выдачи предмета';
      showNotification('error', msg);
    }
  };

  const handleToggleBan = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/users/toggle-ban', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, isBanned: data.user.isBanned } : u));
      if (selectedUserForEdit && selectedUserForEdit.id === userId) {
        setSelectedUserForEdit(prev => prev ? { ...prev, isBanned: data.user.isBanned } : null);
      }
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка блокировки';
      showNotification('error', msg);
    }
  };

  const handleUpdateRating = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/users/rating', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, rating: newRatingInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, stats: { ...u.stats, rating: data.user.stats.rating } } : u));
      if (selectedUserForEdit && selectedUserForEdit.id === userId) {
        setSelectedUserForEdit(prev => prev ? { ...prev, stats: { ...prev.stats, rating: data.user.stats.rating } } : null);
      }
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка изменения рейтинга';
      showNotification('error', msg);
    }
  };

  const handleUpdateDisplayName = async (userId: string) => {
    if (!newDisplayNameInput.trim()) return;
    try {
      const res = await fetch('/api/admin/users/rename', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, displayName: newDisplayNameInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, displayName: data.user.displayName } : u));
      if (selectedUserForEdit && selectedUserForEdit.id === userId) {
        setSelectedUserForEdit(prev => prev ? { ...prev, displayName: data.user.displayName } : null);
      }
      if (user && user.id === userId && onUpdateCurrentUser) {
        onUpdateCurrentUser({ ...user, displayName: data.user.displayName });
      }
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка изменения имени';
      showNotification('error', msg);
    }
  };

  // Audit Logs Actions
  const fetchAuditLogs = async (silent: boolean = false) => {
    try {
      if (!silent) setIsRefreshingAudit(true);
      const res = await safeFetchJson('/api/admin/audit-logs', getAuthHeaders());
      if (res) {
        if (res.logs && Array.isArray(res.logs)) {
          setAuditLogs(res.logs);
        }
        if (res.stats) {
          setAuditStats(res.stats);
        }
      }
    } finally {
      if (!silent) setIsRefreshingAudit(false);
    }
  };

  const handleUpdateRole = async (userId: string, targetRole: 'user' | 'moderator' | 'admin', isAdmin?: boolean) => {
    try {
      const res = await fetch('/api/admin/users/role', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId, role: targetRole, isAdmin: typeof isAdmin === 'boolean' ? isAdmin : targetRole === 'admin' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setUsersList(prev => prev.map(u => u.id === userId ? { ...u, role: data.user.role, isAdmin: data.user.isAdmin } : u));
      if (selectedUserForEdit && selectedUserForEdit.id === userId) {
        setSelectedUserForEdit(prev => prev ? { ...prev, role: data.user.role, isAdmin: data.user.isAdmin } : null);
      }
      if (user && user.id === userId && onUpdateCurrentUser) {
        onUpdateCurrentUser({ ...user, role: data.user.role, isAdmin: data.user.isAdmin });
      }
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка изменения роли';
      showNotification('error', msg);
    }
  };

  const handleClearAuditLogs = async () => {
    if (!confirm('Вы уверены, что хотите полностью очистить журнал аудита действий администрации?')) return;
    try {
      const res = await fetch('/api/admin/audit-logs/clear', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      fetchAuditLogs(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка очистки журнала';
      showNotification('error', msg);
    }
  };

  // Rooms Actions
  const handleCloseRoom = async (roomCode: string) => {
    try {
      const res = await fetch('/api/admin/rooms/close', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setRoomsList(prev => prev.filter(r => r.roomCode !== roomCode));
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка закрытия стола';
      showNotification('error', msg);
    }
  };

  // Broadcast Actions
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    setBroadcastLoading(true);
    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: broadcastMessage.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playGunshot();
      showNotification('success', data.message);
      setBroadcastMessage('');
      fetchAuditLogs(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки оповещения';
      showNotification('error', msg);
    } finally {
      setBroadcastLoading(false);
    }
  };

  // ================= SHOP MANAGEMENT ACTIONS =================

  const handleUpdateItem = async (itemId: string, updates: Partial<ItemDefinition>) => {
    try {
      const res = await fetch('/api/admin/shop/items/update', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: itemId, updates })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setShopItemsList(prev => prev.map(i => i.id === itemId ? data.item : i));
      if (selectedItemForEdit && selectedItemForEdit.id === itemId) {
        setSelectedItemForEdit(data.item);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка обновления товара';
      showNotification('error', msg);
    }
  };

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemForm.id || !newItemForm.name) {
      showNotification('error', 'Заполните обязательные поля ID и Название');
      return;
    }

    try {
      const res = await fetch('/api/admin/shop/items/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ item: newItemForm })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setShopItemsList(prev => [...prev, data.item]);
      setIsCreateItemModalOpen(false);
      setNewItemForm({
        id: '',
        name: '',
        category: 'certificates',
        rarity: 'rare',
        cost: 250,
        pawnValue: 125,
        icon: '📜',
        description: '',
        effectDescription: '',
        usable: true,
        consumable: true,
        inShop: true,
        discountPercent: 0
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка создания товара';
      showNotification('error', msg);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(`Вы действительно хотите удалить товар "${itemId}" из каталога?`)) return;

    try {
      const res = await fetch('/api/admin/shop/items/delete', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id: itemId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setShopItemsList(prev => prev.filter(i => i.id !== itemId));
      if (selectedItemForEdit && selectedItemForEdit.id === itemId) {
        setSelectedItemForEdit(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления товара';
      showNotification('error', msg);
    }
  };

  const handleSaveShopSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/shop/settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ settings: shopSettings })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setShopSettings(data.settings);
      setIsShopSettingsOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения настроек магазина';
      showNotification('error', msg);
    }
  };

  const handleResetShopCatalog = async () => {
    if (!confirm('Сбросить весь каталог магазина к значениям по умолчанию?')) return;

    try {
      const res = await fetch('/api/admin/shop/reset', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setShopItemsList(data.items);
      setShopSettings(data.settings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сброса магазина';
      showNotification('error', msg);
    }
  };

  // ================= DAILY BONUS ACTIONS =================
  const handleSaveDailyBonus = async (customConfig?: DailyBonusConfig) => {
    const configToSave = customConfig || dailyBonusConfig;
    if (!configToSave) return;
    setIsSavingDailyBonus(true);
    try {
      const res = await fetch('/api/admin/daily-bonus/config', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ updates: configToSave })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message || 'Настройки ежедневного бонуса успешно сохранены!');
      setDailyBonusConfig(data.config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сохранения ежедневного бонуса';
      showNotification('error', msg);
    } finally {
      setIsSavingDailyBonus(false);
    }
  };

  const handleApplyDailyBonusPreset = async (preset: 'default' | 'weekend_x2' | 'generous' | 'economy') => {
    setIsSavingDailyBonus(true);
    try {
      const res = await fetch('/api/admin/daily-bonus/preset', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ preset })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setDailyBonusConfig(data.config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка применения пресета';
      showNotification('error', msg);
    } finally {
      setIsSavingDailyBonus(false);
    }
  };

  const handleResetDailyBonusDefaults = async () => {
    if (!confirm('Сбросить все параметры ежедневного бонуса к исходным значениям по умолчанию?')) return;
    setIsSavingDailyBonus(true);
    try {
      const res = await fetch('/api/admin/daily-bonus/reset-defaults', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setDailyBonusConfig(data.config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сброса';
      showNotification('error', msg);
    } finally {
      setIsSavingDailyBonus(false);
    }
  };

  const handleResetUserDailyCooldown = async (targetUserId: string, targetName: string) => {
    try {
      const res = await fetch('/api/admin/daily-bonus/reset-user', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: targetUserId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      setDailyBonusResetSuccess(`Кулдаун бонуса для «${targetName}» успешно сброшен! Игрок может забрать награду прямо сейчас.`);
      showNotification('success', `Кулдаун для ${targetName} сброшен`);
      setTimeout(() => setDailyBonusResetSuccess(null), 6000);
      
      setUsersList(prev => prev.map(u => u.id === targetUserId ? { ...u, lastDailyBonusClaim: undefined } : u));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка сброса кулдауна игрока';
      showNotification('error', msg);
    }
  };

  const handleUpdateDayConfig = (dayIndex: number, field: keyof DailyBonusDayConfig, value: any) => {
    if (!dailyBonusConfig) return;
    const newDays = [...dailyBonusConfig.days];
    newDays[dayIndex] = {
      ...newDays[dayIndex],
      [field]: value
    };
    if (field === 'itemId') {
      if (value && ALL_GAME_ITEMS[value]) {
        newDays[dayIndex].itemName = ALL_GAME_ITEMS[value].name;
        newDays[dayIndex].itemIcon = ALL_GAME_ITEMS[value].icon;
      } else if (!value) {
        newDays[dayIndex].itemName = undefined;
        newDays[dayIndex].itemIcon = undefined;
      }
    }
    setDailyBonusConfig({
      ...dailyBonusConfig,
      days: newDays
    });
  };

  const handleResolveReport = async (
    reportId: string, 
    status: ReportRecord['status'], 
    actionTaken: ReportRecord['actionTaken'], 
    resolutionNote: string,
    banTarget: boolean = false
  ) => {
    try {
      const res = await fetch('/api/admin/reports/resolve', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reportId,
          status,
          actionTaken,
          resolutionNote,
          banTargetPlayer: banTarget
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setReportsList(prev => prev.map(r => r.id === reportId ? data.report : r));
      if (data.userBanned) {
        setUsersList(prev => prev.map(u => u.id === data.report.targetPlayerId ? { ...u, isBanned: true } : u));
      }
      setSelectedReportForReview(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка обработки жалобы';
      showNotification('error', msg);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Удалить запись жалобы из базы?')) return;
    try {
      const res = await fetch('/api/admin/reports/delete', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reportId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      sounds.playTick();
      showNotification('success', data.message);
      setReportsList(prev => prev.filter(r => r.id !== reportId));
      if (selectedReportForReview?.id === reportId) {
        setSelectedReportForReview(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка удаления жалобы';
      showNotification('error', msg);
    }
  };

  const handleQuickBanFromReport = async (report: ReportRecord) => {
    if (!confirm(`Заблокировать нарушителя «${report.targetPlayerName}» и закрыть жалобу?`)) return;
    await handleResolveReport(
      report.id,
      'resolved',
      'ban',
      'Игрок заблокирован администратором на основании подтвержденной жалобы.',
      true
    );
  };

  // Filter users
  const filteredUsers = usersList.filter(u => {
    const q = userSearch.toLowerCase();
    const matchesQuery = 
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q);

    if (!matchesQuery) return false;

    if (userFilter === 'banned') return !!u.isBanned;
    if (userFilter === 'admins') return u.email.toLowerCase() === 'vledahovic@gmail.com' || u.isAdmin || u.role === 'admin';
    if (userFilter === 'rich') return (u.credits || 0) >= 1000;

    return true;
  });

  // Filter shop items
  const filteredShopItems = shopItemsList.filter(item => {
    const q = shopSearch.toLowerCase();
    const matchesQuery = 
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q);

    if (!matchesQuery) return false;
    if (shopCategoryFilter !== 'all' && item.category !== shopCategoryFilter) return false;
    return true;
  });

  // Filter reports
  const filteredReports = reportsList.filter(report => {
    const q = reportSearch.toLowerCase();
    const matchesQuery = 
      report.targetPlayerName.toLowerCase().includes(q) ||
      report.reporterName.toLowerCase().includes(q) ||
      report.reason.toLowerCase().includes(q) ||
      (report.details || '').toLowerCase().includes(q) ||
      report.roomCode.toLowerCase().includes(q);

    if (!matchesQuery) return false;
    if (reportFilter !== 'all' && report.status !== reportFilter) return false;
    if (reportCategoryFilter !== 'all' && report.reasonCategory !== reportCategoryFilter) return false;
    return true;
  });

  // Filter audit logs
  const filteredAuditLogs = auditLogs.filter(log => {
    const q = auditSearch.toLowerCase();
    const matchesQuery = 
      !q ||
      log.details.toLowerCase().includes(q) ||
      log.adminName.toLowerCase().includes(q) ||
      log.adminEmail.toLowerCase().includes(q) ||
      (log.targetName || '').toLowerCase().includes(q) ||
      (log.targetId || '').toLowerCase().includes(q) ||
      log.actionType.toLowerCase().includes(q);

    if (!matchesQuery) return false;

    if (auditFilter === 'role_change') return log.actionType === 'role_change';
    if (auditFilter === 'room_shutdown') return log.actionType === 'room_shutdown';
    if (auditFilter === 'events') return log.actionType.includes('event') || log.actionType.includes('task');
    if (auditFilter === 'moderation') return log.actionType === 'user_ban' || log.actionType === 'report_resolve' || log.actionType === 'user_rename';
    if (auditFilter === 'economy') return log.actionType === 'credits_change' || log.actionType === 'item_give' || log.actionType === 'shop_update' || log.actionType === 'daily_bonus_update';
    if (auditFilter === 'broadcast') return log.actionType === 'broadcast';

    return true;
  });

  const pendingReportsCount = reportsList.filter(r => r.status === 'pending').length;

  const navTabs = [
    {
      id: 'users' as AdminTab,
      title: 'Игроки и Баланс',
      subtitle: 'Управление профилями, валютой и вещами',
      icon: Users,
      badge: usersList.length.toString(),
      badgeColor: 'bg-orange-950/80 border-orange-700/60 text-orange-300'
    },
    {
      id: 'rooms' as AdminTab,
      title: 'Активные столы',
      subtitle: 'Мониторинг запущенных партий live',
      icon: Gamepad2,
      badge: roomsList.length.toString(),
      badgeColor: 'bg-blue-950/80 border-blue-700/60 text-blue-300'
    },
    {
      id: 'shop' as AdminTab,
      title: 'Управление Магазином',
      subtitle: 'Товары, цены, скидки и новые предметы',
      icon: ShoppingCart,
      badge: `${shopItemsList.filter(i => i.inShop !== false).length}/${shopItemsList.length}`,
      badgeColor: 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
    },
    {
      id: 'dailyBonus' as AdminTab,
      title: 'Ежедневный бонус',
      subtitle: 'Награды за вход, стрики и акции',
      icon: Gift,
      badge: dailyBonusConfig?.isEnabled ? (dailyBonusConfig.multiplier > 1 ? `x${dailyBonusConfig.multiplier} АКТИВЕН` : 'ВКЛЮЧЕН') : 'ОТКЛЮЧЕН',
      badgeColor: dailyBonusConfig?.isEnabled 
        ? (dailyBonusConfig.multiplier > 1 ? 'bg-amber-950/80 border-amber-600 text-amber-300' : 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300')
        : 'bg-zinc-850 border-zinc-700/60 text-zinc-400'
    },
    {
      id: 'events' as AdminTab,
      title: 'Конструктор ивентов',
      subtitle: 'Архив задач, 4 типа, клановые этапы и таймлайны',
      icon: Sparkles,
      badge: 'КВЕСТЫ',
      badgeColor: 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300'
    },
    {
      id: 'reports' as AdminTab,
      title: 'Жалобы и Модерация',
      subtitle: 'Обработка репортов и бан нарушителей',
      icon: Flag,
      badge: pendingReportsCount > 0 ? `${pendingReportsCount} нов.` : reportsList.length.toString(),
      badgeColor: pendingReportsCount > 0 
        ? 'bg-rose-950/90 border-rose-600 text-rose-300 animate-pulse' 
        : 'bg-zinc-850 border-zinc-700/60 text-zinc-400'
    },
    {
      id: 'auditLogs' as AdminTab,
      title: 'Журнал аудита',
      subtitle: 'История действий админов и модерации',
      icon: ShieldCheck,
      badge: auditLogs.length.toString(),
      badgeColor: 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
    },
    {
      id: 'broadcast' as AdminTab,
      title: 'Оповещение серверов',
      subtitle: 'Системные объявления во все комнаты',
      icon: Radio,
      badge: 'LIVE',
      badgeColor: 'bg-rose-950/80 border-rose-700/60 text-rose-300'
    },
    {
      id: 'stats' as AdminTab,
      title: 'Статистика и Экономика',
      subtitle: 'Оборот кредитов, матчи и метрики',
      icon: TrendingUp,
      badge: stats ? `${stats.totalCredits} кр` : '...',
      badgeColor: 'bg-amber-950/80 border-amber-700/60 text-amber-300'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs select-none">
      
      {/* Center Noir Hub Card matching the General Lobby structure */}
      <div className="relative w-full max-w-[1240px] h-[740px] max-h-[95vh] bg-[#0d0e13]/95 border border-zinc-800/90 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header inside the Hub */}
        <div className="px-6 py-3.5 border-b border-zinc-850 flex items-center justify-between bg-[#111218]/95 shrink-0">
          
          {/* Left Brand: Gangster + MAFIA GAME ADMIN */}
          <div className="flex items-center gap-3">
            <GangsterIcon size={36} className="w-8 h-8 shrink-0 drop-shadow-md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-bold tracking-widest text-white text-sm sm:text-base uppercase flex items-center gap-1.5">
                  MAFIA GAME <span className="text-amber-400 font-mono text-xs px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/60">ADMIN</span>
                </h1>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono tracking-wider leading-none mt-0.5">
                КОНСОЛЬ АДМИНИСТРАТОРА СЕРВЕРА
              </p>
            </div>
          </div>

          {/* Center Quick Server Metrics Pill */}
          <div className="hidden md:flex items-center gap-4 px-3.5 py-1 rounded-xl bg-[#14151e] border border-zinc-800 text-xs text-zinc-300">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">Сервер:</span>
              <span className="font-bold text-emerald-400">ОНЛАЙН</span>
            </div>
            <div className="w-px h-3 bg-zinc-800" />
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <span>{usersList.length} игроков</span>
            </div>
            <div className="w-px h-3 bg-zinc-800" />
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
              <span>{shopItemsList.length} товаров</span>
            </div>
          </div>

          {/* Right: Admin Email Profile Badge + Refresh & Close */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-300 text-xs font-mono">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>vledahovic@gmail.com</span>
            </div>

            <button
              onClick={() => {
                sounds.playTick();
                loadAdminData();
              }}
              disabled={loading}
              title="Обновить данные"
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors border border-zinc-800"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            <button
              onClick={() => {
                sounds.playTick();
                onClose();
              }}
              title="Закрыть панель"
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors border border-zinc-800 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className={`px-6 py-2 text-xs font-bold text-center border-b shrink-0 flex items-center justify-center gap-2 ${
            feedback.type === 'success' 
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/90 border-rose-800 text-rose-300'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Main 2-Column Content Layout (Lobby Style with Right Tabs Block) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          
          {/* ================= LEFT BLOCK: MAIN WORKSPACE (8.5 of 12 cols) ================= */}
          <div className="md:col-span-8 lg:col-span-8.5 bg-[#0b0c10]/95 p-4 sm:p-6 flex flex-col min-h-0 overflow-y-auto space-y-4 border-b md:border-b-0 md:border-r border-zinc-850 order-2 md:order-1">
            
            {/* ================= TAB 1: USERS MANAGEMENT ================= */}
            {activeTab === 'users' && (
              <div className="space-y-4 flex-1 flex flex-col">
                
                {/* Search & Filter Toolbar */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-[#12131a] p-3 rounded-xl border border-zinc-800/80">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск игрока по нику, email или ID..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="w-full bg-[#171822] border border-zinc-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {[
                      { id: 'all', label: `Все (${usersList.length})` },
                      { id: 'banned', label: `Бан (${usersList.filter(u => u.isBanned).length})` },
                      { id: 'admins', label: 'Админы' },
                      { id: 'rich', label: 'Богатые (1k+)' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setUserFilter(f.id as any); sounds.playTick(); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                          userFilter === f.id
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Users List Container */}
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {filteredUsers.length === 0 ? (
                    <div className="h-64 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-400 text-xs space-y-2">
                      <Users className="w-8 h-8 text-zinc-400" />
                      <span>Игроки по заданному фильтру не найдены</span>
                    </div>
                  ) : (
                    filteredUsers.map(u => {
                      const isRootAdmin = u.email.toLowerCase() === 'vledahovic@gmail.com';
                      const certItem = u.inventory?.find(i => i.itemId === 'cert_name_change');
                      const certCount = certItem ? certItem.quantity : 0;

                      return (
                        <div
                          key={u.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            u.isBanned 
                              ? 'bg-rose-950/20 border-rose-900/60' 
                              : isRootAdmin 
                                ? 'bg-amber-950/20 border-amber-800/60' 
                                : 'bg-[#13141a] hover:bg-[#161722] border-zinc-800/80'
                          }`}
                        >
                          {/* User Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center text-white font-bold text-sm shadow-md border border-orange-400/30 shrink-0">
                              {u.displayName.slice(0, 1).toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-white tracking-tight truncate">{u.displayName}</span>
                                {isRootAdmin && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-600/80 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                                    <Crown className="w-3 h-3 text-amber-400" /> Главный Админ
                                  </span>
                                )}
                                {u.isBanned && (
                                  <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-600 text-rose-300 text-[10px] font-bold">
                                    ЗАБЛОКИРОВАН
                                  </span>
                                )}
                                <span className="text-[11px] font-mono text-amber-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 font-bold">
                                  {u.stats?.rating || 1200} Elo
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap font-mono">
                                <span>{u.email}</span>
                                <span>•</span>
                                <span className="text-amber-300 font-bold flex items-center gap-1">
                                  <Coins className="w-3 h-3 text-amber-400" /> {u.credits || 0} кр
                                </span>
                                <span>•</span>
                                <span className="text-blue-300">📜 Серт: {certCount} шт</span>
                                <span>•</span>
                                <span>Игр: {u.stats?.gamesPlayed || 0} (Побед: {u.stats?.gamesWon || 0})</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <button
                              onClick={() => {
                                sounds.playTick();
                                setSelectedUserForEdit(u);
                                setNewRatingInput(u.stats?.rating || 1200);
                                setNewDisplayNameInput(u.displayName);
                                setSelectedUserRoleInput(u.role || 'user');
                                setSelectedUserIsAdminInput(Boolean(u.isAdmin || u.role === 'admin'));
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              <span>Управление</span>
                            </button>

                            {!isRootAdmin && (
                              <button
                                onClick={() => handleToggleBan(u.id)}
                                title={u.isBanned ? 'Разблокировать' : 'Заблокировать'}
                                className={`p-1.5 rounded-lg border text-xs font-bold transition-colors ${
                                  u.isBanned
                                    ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                                    : 'bg-rose-950/80 border-rose-800 text-rose-300 hover:bg-rose-900'
                                }`}
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 2: ACTIVE ROOMS ================= */}
            {activeTab === 'rooms' && (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Активные игровые столы ({roomsList.length})
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Мониторинг партий, ведущих, участников и фаз игры
                    </p>
                  </div>
                  <button
                    onClick={() => { sounds.playTick(); loadAdminData(); }}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Обновить</span>
                  </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto">
                  {roomsList.length === 0 ? (
                    <div className="h-64 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-400 text-xs space-y-2">
                      <Gamepad2 className="w-8 h-8 text-zinc-400" />
                      <span>В данный момент нет запущенных активных комнат</span>
                    </div>
                  ) : (
                    roomsList.map(room => (
                      <div
                        key={room.roomCode}
                        className="p-4 rounded-xl bg-[#13141a] border border-zinc-800/80 space-y-3"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{room.roomName}</span>
                              <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-amber-400 font-mono text-xs font-bold">
                                Код: {room.roomCode}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-700/60 text-blue-300 text-[10px] font-bold">
                                Фаза: {room.phase}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 mt-1">
                              Ведущий: <span className="text-zinc-200 font-semibold">{room.hostName}</span> · Игроков: {room.playerCount}/{room.maxPlayers}
                            </div>
                          </div>

                          <button
                            onClick={() => handleCloseRoom(room.roomCode)}
                            className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Принудительно закрыть</span>
                          </button>
                        </div>

                        {/* Players chips */}
                        <div className="pt-2 border-t border-zinc-850 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-zinc-400 mr-1">Игроки:</span>
                          {room.players.map(p => (
                            <span
                              key={p.id}
                              className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                                !p.isAlive
                                  ? 'bg-zinc-900/50 border-zinc-800 text-zinc-400 line-through'
                                  : p.isBot
                                    ? 'bg-blue-950/40 border-blue-800/50 text-blue-300'
                                    : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                              }`}
                            >
                              {p.name} {p.role ? `(${p.role})` : ''} {p.isBot ? '[BOT]' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 3: SHOP MANAGEMENT ================= */}
            {activeTab === 'shop' && (
              <div className="space-y-4 flex-1 flex flex-col overflow-y-auto">
                
                {/* Shop Header & Top Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#13141f] p-4 rounded-xl border border-zinc-800">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-emerald-400" />
                      Управление Магазином и Товарами
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Редактирование цен, скидок, видимости товаров и добавление новых предметов
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        sounds.playTick();
                        setIsCreateItemModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить товар</span>
                    </button>

                    <button
                      onClick={() => {
                        sounds.playTick();
                        setIsShopSettingsOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-colors flex items-center gap-1.5 border border-zinc-700"
                    >
                      <Percent className="w-3.5 h-3.5 text-amber-400" />
                      <span>Скидки / Баннер</span>
                    </button>

                    <button
                      onClick={handleResetShopCatalog}
                      title="Сбросить магазин к исходным предметам"
                      className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors border border-zinc-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Global Active Discount Banner Notification if active */}
                {shopSettings.globalDiscount > 0 && (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/60 flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center gap-2 font-bold">
                      <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                      <span>В магазине активна глобальная скидка: -{shopSettings.globalDiscount}%</span>
                    </div>
                    <span className="font-mono text-[11px] text-amber-400/80">«{shopSettings.bannerMessage}»</span>
                  </div>
                )}

                {/* Search & Category Filter Toolbar */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-[#12131a] p-3 rounded-xl border border-zinc-800/80">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск товара по названию, описанию или ID..."
                      value={shopSearch}
                      onChange={e => setShopSearch(e.target.value)}
                      className="w-full bg-[#171822] border border-zinc-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Category Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {[
                      { id: 'all', label: `Все (${shopItemsList.length})` },
                      { id: 'certificates', label: 'Сертификаты' },
                      { id: 'chests', label: 'Сундуки' },
                      { id: 'cosmetics', label: 'Косметика' },
                      { id: 'valuables', label: 'Ломбард' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setShopCategoryFilter(f.id as any); sounds.playTick(); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                          shopCategoryFilter === f.id
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Items Grid */}
                <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
                  {filteredShopItems.length === 0 ? (
                    <div className="h-48 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-400 text-xs space-y-2">
                      <ShoppingCart className="w-8 h-8 text-zinc-400" />
                      <span>Товары по заданному фильтру не найдены</span>
                    </div>
                  ) : (
                    filteredShopItems.map(item => {
                      const rarity = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.common;
                      const inShop = item.inShop !== false;

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                            inShop
                              ? 'bg-[#13141a] hover:bg-[#161724] border-zinc-800/80'
                              : 'bg-zinc-900/30 border-zinc-850 opacity-75'
                          }`}
                        >
                          {/* Item Left Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="text-3xl p-2 rounded-xl bg-black/40 border border-white/10 shrink-0">
                              {item.icon}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-white tracking-tight">{item.name}</span>
                                <span className={`text-[10px] uppercase font-mono font-bold px-1.5 py-0.2 rounded border ${rarity.color} ${rarity.border} ${rarity.bg}`}>
                                  {rarity.label}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                                  inShop ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                  {inShop ? '✓ В ПРОДАЖЕ' : 'СКРЫТ'}
                                </span>
                                {item.discountPercent !== undefined && item.discountPercent > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-600">
                                    -{item.discountPercent}%
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                                {item.description}
                              </p>

                              <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 mt-1 flex-wrap">
                                <span className="text-zinc-400 font-mono">ID: {item.id}</span>
                                <span>•</span>
                                <span>Категория: <b className="text-zinc-200">{CATEGORY_CONFIG[item.category]?.label || item.category}</b></span>
                              </div>
                            </div>
                          </div>

                          {/* Item Price Editor & Action Controls */}
                          <div className="flex items-center gap-2 shrink-0 self-end lg:self-center flex-wrap">
                            {/* Fast Shop Price Edit Input */}
                            <div className="flex items-center gap-1 bg-[#161722] p-1 rounded-lg border border-zinc-700 text-xs">
                              <span className="text-amber-400 font-bold px-1 flex items-center gap-1">
                                <Coins className="w-3.5 h-3.5" /> Магазин:
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={item.cost}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 0;
                                  handleUpdateItem(item.id, { cost: val });
                                }}
                                className="w-16 bg-[#101117] border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-amber-300 font-mono font-bold text-center focus:outline-none focus:border-amber-500"
                              />
                              <span className="text-[10px] text-zinc-400 pr-1">кр</span>
                            </div>

                            {/* Fast Pawn Value Edit Input */}
                            <div className="flex items-center gap-1 bg-[#161722] p-1 rounded-lg border border-zinc-700 text-xs">
                              <span className="text-zinc-300 font-bold px-1">
                                ⚖️ Ломбард:
                              </span>
                              <input
                                type="number"
                                min={0}
                                value={item.pawnValue || Math.floor(item.cost * 0.5)}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 0;
                                  handleUpdateItem(item.id, { pawnValue: val });
                                }}
                                className="w-16 bg-[#101117] border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono font-bold text-center focus:outline-none focus:border-zinc-500"
                              />
                              <span className="text-[10px] text-zinc-400 pr-1">кр</span>
                            </div>

                            {/* In Shop Toggle Button */}
                            <button
                              onClick={() => handleUpdateItem(item.id, { inShop: !inShop })}
                              title={inShop ? 'Снять с продажи в магазине' : 'Вернуть в продажу магазина'}
                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors flex items-center gap-1.5 ${
                                inShop
                                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                              }`}
                            >
                              {inShop ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-zinc-400" />}
                              <span>{inShop ? 'Вкл' : 'Выкл'}</span>
                            </button>

                            {/* Full Edit Modal */}
                            <button
                              onClick={() => {
                                sounds.playTick();
                                setSelectedItemForEdit(item);
                              }}
                              title="Редактировать полные параметры товара"
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete custom item */}
                            {item.id !== 'cert_name_change' && (
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                title="Удалить товар"
                                className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 4: DAILY BONUS MANAGEMENT ================= */}
            {activeTab === 'dailyBonus' && (
              <div className="space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
                
                {/* Header Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 shrink-0 px-1">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Gift className="w-4 h-4 text-amber-400" />
                      Управление Ежедневным Бонусом
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Конфигурация 7-дневной прогрессии, множителей наград, кулдаунов и подарков
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetDailyBonusDefaults}
                      disabled={isSavingDailyBonus}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Сбросить конфигурацию к значениям по умолчанию"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Сброс</span>
                    </button>

                    <button
                      onClick={() => handleSaveDailyBonus()}
                      disabled={isSavingDailyBonus}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-950/50 transition-all cursor-pointer"
                    >
                      {isSavingDailyBonus ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Сохранение...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Сохранить изменения</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Feedback banner if player cooldown was reset */}
                {dailyBonusResetSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-600/70 flex items-center justify-between gap-3 text-xs text-emerald-200 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{dailyBonusResetSuccess}</span>
                    </div>
                    <button
                      onClick={() => setDailyBonusResetSuccess(null)}
                      className="text-emerald-400 hover:text-emerald-200 text-xs font-mono"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Campaign Presets Bar */}
                <div className="p-3.5 rounded-xl bg-[#13141c] border border-zinc-800/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
                      Быстрые пресеты кампаний:
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleApplyDailyBonusPreset('default')}
                      disabled={isSavingDailyBonus}
                      className="px-3 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>🌟</span>
                      <span>Стандарт</span>
                    </button>
                    <button
                      onClick={() => handleApplyDailyBonusPreset('weekend_x2')}
                      disabled={isSavingDailyBonus}
                      className="px-3 py-1.5 rounded-lg bg-orange-950/70 hover:bg-orange-900 border border-orange-700 text-orange-200 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      <span>Уикенд x2</span>
                    </button>
                    <button
                      onClick={() => handleApplyDailyBonusPreset('generous')}
                      disabled={isSavingDailyBonus}
                      className="px-3 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-700 text-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Щедрый синдикат</span>
                    </button>
                    <button
                      onClick={() => handleApplyDailyBonusPreset('economy')}
                      disabled={isSavingDailyBonus}
                      className="px-3 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>🪙</span>
                      <span>Эконом</span>
                    </button>
                  </div>
                </div>

                {/* Global Settings & Rules */}
                <div className="p-4 rounded-xl bg-[#13141c] border border-zinc-800/90 space-y-3.5 shrink-0">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-orange-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Глобальные параметры и тайминги
                      </span>
                    </div>

                    {/* Master Switch */}
                    <button
                      onClick={() => {
                        sounds.playTick();
                        if (dailyBonusConfig) {
                          setDailyBonusConfig({
                            ...dailyBonusConfig,
                            isEnabled: !dailyBonusConfig.isEnabled
                          });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        dailyBonusConfig?.isEnabled
                          ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                          : 'bg-zinc-850 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      {dailyBonusConfig?.isEnabled ? (
                        <>
                          <ToggleRight className="w-4 h-4 text-emerald-400" />
                          <span>БОНУС ВКЛЮЧЕН</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-4 h-4 text-zinc-500" />
                          <span>БОНУС ОТКЛЮЧЕН</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Multiplier */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase font-mono">
                        Множитель наград (x)
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[1.0, 1.5, 2.0, 3.0].map(mult => (
                          <button
                            key={mult}
                            onClick={() => {
                              sounds.playTick();
                              if (dailyBonusConfig) {
                                setDailyBonusConfig({ ...dailyBonusConfig, multiplier: mult });
                              }
                            }}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                              dailyBonusConfig?.multiplier === mult
                                ? 'bg-amber-600 border-amber-400 text-white'
                                : 'bg-zinc-850 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                            }`}
                          >
                            x{mult}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cooldown Hours */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <span>Кулдаун (часы)</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="48"
                        value={dailyBonusConfig?.cooldownHours ?? 20}
                        onChange={e => {
                          const val = Number(e.target.value) || 20;
                          if (dailyBonusConfig) {
                            setDailyBonusConfig({ ...dailyBonusConfig, cooldownHours: val });
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-[#171822] border border-zinc-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[10px] text-zinc-500">
                        20 ч позволяет комфортно забирать бонус каждый день
                      </p>
                    </div>

                    {/* VIP Bonus % */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase font-mono flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span>VIP / Admin бонус (%)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={dailyBonusConfig?.vipBonusPercent ?? 20}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          if (dailyBonusConfig) {
                            setDailyBonusConfig({ ...dailyBonusConfig, vipBonusPercent: val });
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-[#171822] border border-zinc-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[10px] text-zinc-500">
                        Прибавка к кредитам для админов и VIP
                      </p>
                    </div>

                    {/* Streak Reset Policy */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-400 uppercase font-mono flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-emerald-400" />
                        <span>Политика сброса стрика</span>
                      </label>
                      <select
                        value={dailyBonusConfig?.streakPolicy || 'calendar_day'}
                        onChange={e => {
                          if (dailyBonusConfig) {
                            setDailyBonusConfig({
                              ...dailyBonusConfig,
                              streakPolicy: e.target.value as any
                            });
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-[#171822] border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="calendar_day">Календарный день (строго)</option>
                        <option value="flexible_24h">Гибкие 48 часов</option>
                        <option value="never_reset">Никогда не сбрасывать</option>
                      </select>
                      <p className="text-[10px] text-zinc-500">
                        Условие обнуления серии заходов
                      </p>
                    </div>
                  </div>

                  {/* Banner Announcement Input */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase font-mono">
                      Баннер-объявление в окне бонуса для игроков
                    </label>
                    <input
                      type="text"
                      placeholder="Заходите каждый день и получайте золотые кредиты Города!"
                      value={dailyBonusConfig?.bannerMessage || ''}
                      onChange={e => {
                        if (dailyBonusConfig) {
                          setDailyBonusConfig({
                            ...dailyBonusConfig,
                            bannerMessage: e.target.value
                          });
                        }
                      }}
                      className="w-full px-3 py-2 bg-[#171822] border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* 7-Day Progression Schedule Editor */}
                <div className="space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        Расписание наград по дням (Дни 1 – 7)
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      Текущий множитель: <span className="text-amber-400 font-bold">x{dailyBonusConfig?.multiplier || 1}</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
                    {(dailyBonusConfig?.days || []).map((dayConfig, idx) => {
                      const effectiveCredits = Math.round(dayConfig.credits * (dailyBonusConfig?.multiplier || 1));
                      const isSpecial = !!dayConfig.isSpecial;

                      return (
                        <div
                          key={dayConfig.day}
                          className={`p-3 rounded-xl border flex flex-col justify-between transition-all space-y-2.5 ${
                            isSpecial
                              ? 'bg-gradient-to-b from-amber-950/40 to-[#16131c] border-amber-600/70 shadow-lg shadow-amber-950/30'
                              : 'bg-[#13141d] border-zinc-800/80 hover:border-zinc-700'
                          }`}
                        >
                          {/* Day badge & special star */}
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                              isSpecial
                                ? 'bg-amber-950/90 border-amber-500 text-amber-300'
                                : 'bg-zinc-850 border-zinc-700 text-zinc-300'
                            }`}>
                              ДЕНЬ {dayConfig.day}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateDayConfig(idx, 'isSpecial', !isSpecial)}
                              className={`text-xs p-1 rounded hover:bg-white/10 transition-colors cursor-pointer ${
                                isSpecial ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
                              }`}
                              title={isSpecial ? 'Особый финальный день' : 'Обычный день'}
                            >
                              ★
                            </button>
                          </div>

                          {/* Icon Selector / display */}
                          <div className="flex items-center justify-center py-1">
                            <div className="relative group">
                              <span className="text-3xl filter drop-shadow-md cursor-pointer block transform hover:scale-110 transition-transform">
                                {dayConfig.icon || '🪙'}
                              </span>
                              {/* Quick icon choice popup */}
                              <div className="hidden group-hover:flex absolute left-1/2 -translate-x-1/2 bottom-full mb-1 p-1 bg-black/90 border border-zinc-700 rounded-lg shadow-xl gap-1 z-30">
                                {['🪙', '💰', '💎', '👑', '🏆', '🎁', '📜', '🔥'].map(ic => (
                                  <button
                                    key={ic}
                                    type="button"
                                    onClick={() => handleUpdateDayConfig(idx, 'icon', ic)}
                                    className="p-1 hover:bg-white/20 rounded text-sm cursor-pointer"
                                  >
                                    {ic}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Day Title input */}
                          <div>
                            <label className="text-[9px] font-mono uppercase text-zinc-400">Название</label>
                            <input
                              type="text"
                              value={dayConfig.title || `День ${dayConfig.day}`}
                              onChange={e => handleUpdateDayConfig(idx, 'title', e.target.value)}
                              className="w-full px-2 py-1 bg-[#181926] border border-zinc-800 rounded text-[11px] text-white focus:outline-none focus:border-amber-500 truncate"
                            />
                          </div>

                          {/* Base Credits input */}
                          <div>
                            <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                              <span>Базовые кр.</span>
                              <span className="text-amber-400 font-bold">ИТОГО: {effectiveCredits}</span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              step="25"
                              value={dayConfig.credits}
                              onChange={e => handleUpdateDayConfig(idx, 'credits', Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 bg-[#181926] border border-zinc-800 rounded text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          {/* Attached Item Reward Selector */}
                          <div>
                            <label className="text-[9px] font-mono uppercase text-zinc-400 flex items-center justify-between">
                              <span>Подарок</span>
                              {dayConfig.itemId && <span className="text-emerald-400">Вручается</span>}
                            </label>
                            <select
                              value={dayConfig.itemId || ''}
                              onChange={e => handleUpdateDayConfig(idx, 'itemId', e.target.value)}
                              className="w-full px-1.5 py-1 bg-[#181926] border border-zinc-800 rounded text-[10px] text-zinc-200 focus:outline-none focus:border-amber-500"
                            >
                              <option value="">— Без предмета —</option>
                              {shopItemsList.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.icon} {item.name}
                                </option>
                              ))}
                            </select>
                            {dayConfig.itemId && (
                              <div className="mt-1 text-[10px] text-emerald-400 truncate flex items-center gap-1 font-mono">
                                <span>{dayConfig.itemIcon || '🎁'}</span>
                                <span className="truncate">{dayConfig.itemName || dayConfig.itemId}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Statistics & Economics KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
                  <div className="p-3 rounded-xl bg-[#13141d] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Всего получено</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">
                      {dailyBonusStats?.totalClaims || 0}
                    </div>
                    <div className="text-[9px] text-zinc-500">За все время</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#13141d] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Забрали сегодня</div>
                    <div className="text-lg font-bold text-emerald-300 font-mono mt-0.5">
                      {dailyBonusStats?.todayClaims || 0}
                    </div>
                    <div className="text-[9px] text-emerald-500">Активные игроки</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#13141d] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Кредитов роздано</div>
                    <div className="text-lg font-bold text-amber-300 font-mono mt-0.5">
                      {dailyBonusStats?.totalCreditsGiven || 0} кр
                    </div>
                    <div className="text-[9px] text-amber-500">Вливание в экономику</div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#13141d] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Подарено вещей</div>
                    <div className="text-lg font-bold text-purple-300 font-mono mt-0.5">
                      {dailyBonusStats?.totalItemsGiven || 0} шт
                    </div>
                    <div className="text-[9px] text-purple-400">Ценные призы 7-го дня</div>
                  </div>

                  <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-[#13141d] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Серий в игре</div>
                    <div className="text-lg font-bold text-blue-300 font-mono mt-0.5">
                      {dailyBonusStats?.activeStreaksCount || usersList.filter(u => (u as any).dailyBonusStreak > 0).length}
                    </div>
                    <div className="text-[9px] text-blue-400">Стрик &gt; 0 дней</div>
                  </div>
                </div>

                {/* Lower Split Section: Reset Player Cooldown Tool & Recent Claims Log */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 shrink-0 pb-2">
                  
                  {/* Tool: Reset Specific Player's Daily Bonus Timer */}
                  <div className="p-4 rounded-xl bg-[#13141d] border border-zinc-800 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Мгновенный сброс кулдауна игроку</span>
                      </h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Позволяет игроку сразу забрать бонус без ожидания 24 часов (для тестов или поддержки)
                      </p>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Поиск по никнейму или email..."
                        value={dailyBonusUserSearch}
                        onChange={e => setDailyBonusUserSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-[#171822] border border-zinc-800 rounded-lg text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {usersList
                        .filter(u => {
                          if (!dailyBonusUserSearch) return true;
                          const q = dailyBonusUserSearch.toLowerCase();
                          return u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
                        })
                        .slice(0, 5)
                        .map(u => {
                          const streak = (u as any).dailyBonusStreak || 0;
                          const lastClaim = (u as any).lastDailyBonusClaim;
                          const hasClaimedRecently = !!lastClaim;

                          return (
                            <div
                              key={u.id}
                              className="p-2.5 rounded-lg bg-[#181926] border border-zinc-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{u.displayName}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                                    Стрик: {streak} дн.
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-400 truncate">
                                  {u.email} • {hasClaimedRecently ? `Последний вход: ${new Date(lastClaim).toLocaleDateString()}` : 'Еще не забирал'}
                                </div>
                              </div>

                              <button
                                onClick={() => handleResetUserDailyCooldown(u.id, u.displayName)}
                                className="px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/80 text-amber-300 hover:text-white text-[11px] font-mono font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Сбросить</span>
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Claims Log / History */}
                  <div className="p-4 rounded-xl bg-[#13141d] border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                        <span>Журнал последних получений бонуса</span>
                      </h4>
                      <span className="text-[10px] font-mono text-zinc-400">
                        ПОСЛЕДНИЕ 10
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {(!dailyBonusStats?.claimsHistory || dailyBonusStats.claimsHistory.length === 0) ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          История выдачи ежедневных бонусов пока пуста
                        </div>
                      ) : (
                        dailyBonusStats.claimsHistory.slice(0, 8).map(claim => (
                          <div
                            key={claim.id}
                            className="p-2 rounded-lg bg-[#181926] border border-zinc-800/80 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 shrink-0">
                                День {claim.day}
                              </span>
                              <div className="min-w-0">
                                <span className="font-bold text-zinc-200 truncate block">
                                  {claim.userDisplayName}
                                </span>
                                <span className="text-[10px] text-zinc-500 font-mono block">
                                  {new Date(claim.claimedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(claim.claimedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-amber-300">
                                +{claim.credits} кр
                              </span>
                              {claim.itemId && (
                                <div className="text-[10px] text-purple-300 font-mono">
                                  🎁 {claim.itemId}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* ================= TAB: EVENTS & QUESTS BUILDER ================= */}
            {activeTab === 'events' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1">
                <AdminEventsBuilderView token={localStorage.getItem('mafia_auth_token')} />
              </div>
            )}

            {/* ================= TAB 5: REPORTS & MODERATION ================= */}
            {activeTab === 'reports' && (
              <div className="space-y-4 flex-1 flex flex-col min-h-0 overflow-hidden">
                
                {/* Reports Header & Quick Stats */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0 px-1">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Flag className="w-4 h-4 text-rose-400" />
                      Жалобы и Модерация игроков ({reportsList.length})
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Поступающие репорты из игровых комнат, проверка нарушений и блокировка аккаунтов
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs font-mono font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      <span>{pendingReportsCount} ожидают решения</span>
                    </div>
                  </div>
                </div>

                {/* Filters & Search Toolbar */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 shrink-0">
                  <div className="sm:col-span-6 relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск по нарушителю, заявителю, комнате или тексту..."
                      value={reportSearch}
                      onChange={e => setReportSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[#13141a] border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  {/* Status Filters */}
                  <div className="sm:col-span-6 flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {[
                      { id: 'all' as const, label: 'Все жалобы', count: reportsList.length },
                      { id: 'pending' as const, label: '🚩 Ожидают', count: pendingReportsCount },
                      { id: 'resolved' as const, label: '✅ Решены', count: reportsList.filter(r => r.status === 'resolved').length },
                      { id: 'dismissed' as const, label: '❌ Отклонены', count: reportsList.filter(r => r.status === 'dismissed').length }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => {
                          sounds.playTick();
                          setReportFilter(f.id);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 border ${
                          reportFilter === f.id
                            ? 'bg-rose-950/80 border-rose-500 text-white shadow-xs'
                            : 'bg-[#14151e] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <span>{f.label}</span>
                        <span className="text-[10px] font-mono px-1 rounded bg-black/40 text-zinc-300">
                          {f.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reports List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {filteredReports.length === 0 ? (
                    <div className="p-10 rounded-2xl bg-[#13141a]/60 border border-zinc-800/80 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
                        <Inbox className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-bold text-zinc-300">Жалоб в данной категории нет</div>
                      <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                        Все поступающие жалобы от игроков во время матчей будут мгновенно отображаться здесь.
                      </p>
                    </div>
                  ) : (
                    filteredReports.map(report => {
                      const isPending = report.status === 'pending';
                      const isResolved = report.status === 'resolved';
                      const isDismissed = report.status === 'dismissed';

                      const targetUser = usersList.find(u => u.id === report.targetPlayerId);
                      const isTargetBanned = targetUser?.isBanned;

                      const categoryBadge = {
                        toxicity: { label: 'Оскорбления / Токсичность', icon: '🤬', color: 'bg-rose-950/80 border-rose-800 text-rose-300' },
                        throwing: { label: 'Руининг / Слив игры', icon: '🛑', color: 'bg-amber-950/80 border-amber-800 text-amber-300' },
                        spam: { label: 'Спам / Флуд в чате', icon: '📢', color: 'bg-blue-950/80 border-blue-800 text-blue-300' },
                        inappropriate_name: { label: 'Неподобающий никнейм', icon: '📛', color: 'bg-purple-950/80 border-purple-800 text-purple-300' },
                        other: { label: 'Другое нарушение', icon: '⚠️', color: 'bg-zinc-800 border-zinc-700 text-zinc-300' }
                      }[report.reasonCategory] || { label: 'Нарушение', icon: '⚠️', color: 'bg-zinc-800 border-zinc-700 text-zinc-300' };

                      return (
                        <div
                          key={report.id}
                          className={`p-4 rounded-2xl border transition-all space-y-3 ${
                            isPending
                              ? 'bg-[#161217] border-rose-900/60 shadow-lg shadow-rose-950/20'
                              : isResolved
                              ? 'bg-[#12141a] border-emerald-900/40 opacity-85'
                              : 'bg-[#121319] border-zinc-850 opacity-70'
                          }`}
                        >
                          {/* Top Row: Target Player & Reporter Meta */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-zinc-800/80">
                            
                            {/* Target Player Info */}
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0">
                                <GangsterIcon size={24} className="w-6 h-6" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-zinc-400 uppercase">Нарушитель:</span>
                                  <span className="text-sm font-bold text-white tracking-wide">
                                    {report.targetPlayerName}
                                  </span>
                                  {isTargetBanned && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 border border-rose-600 text-rose-300 flex items-center gap-1">
                                      <Ban className="w-2.5 h-2.5" /> ЗАБАНЕН
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-3 mt-0.5">
                                  <span>ID: {report.targetPlayerId.slice(0, 12)}</span>
                                  {report.targetPlayerEmail && <span>Email: {report.targetPlayerEmail}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Status & Room Meta */}
                            <div className="flex items-center gap-2 text-right">
                              <div className="text-[10px] font-mono text-zinc-400">
                                <div>Комната: <strong className="text-amber-400">#{report.roomCode}</strong></div>
                                <div>{new Date(report.createdAt).toLocaleString('ru-RU')}</div>
                              </div>

                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border uppercase tracking-wider font-mono ${
                                isPending
                                  ? 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse'
                                  : isResolved
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              }`}>
                                {isPending ? 'Ожидает решения' : isResolved ? 'Рассмотрено' : 'Отклонено'}
                              </span>
                            </div>
                          </div>

                          {/* Reason Badge & Quotation Text */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 ${categoryBadge.color}`}>
                                <span>{categoryBadge.icon}</span>
                                <span>{categoryBadge.label}</span>
                              </span>
                              <span className="text-xs text-zinc-300 font-semibold">
                                «{report.reason}»
                              </span>
                            </div>

                            {report.details && (
                              <div className="p-3 rounded-xl bg-[#0f1015] border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed font-sans">
                                <span className="text-[10px] text-zinc-400 font-mono block mb-1 uppercase">Детали инцидента от заявителя:</span>
                                {report.details}
                              </div>
                            )}

                            {/* Reporter signature */}
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                              <span>Заявитель:</span>
                              <strong className="text-zinc-200">{report.reporterName}</strong>
                              <span className="text-zinc-500 font-mono">(ID: {report.reporterId.slice(0, 8)})</span>
                            </div>

                            {/* Resolution Details if processed */}
                            {report.resolvedAt && (
                              <div className="p-2.5 rounded-xl bg-[#141824] border border-blue-900/40 text-xs space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-blue-300 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Решение администрации: {report.actionTaken === 'ban' ? '🔨 Блокировка аккаунта' : report.actionTaken === 'warning' ? '⚠️ Предупреждение' : '❌ Отклонено'}</span>
                                  </span>
                                  <span className="text-[10px] font-mono text-zinc-400">{new Date(report.resolvedAt).toLocaleString('ru-RU')}</span>
                                </div>
                                {report.resolutionNote && (
                                  <p className="text-[11px] text-zinc-300 italic">
                                    Заметка: {report.resolutionNote}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons Toolbar */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-850">
                            <div className="flex items-center gap-2 flex-wrap">
                              
                              {/* Quick Ban button */}
                              <button
                                onClick={() => handleQuickBanFromReport(report)}
                                title="Заблокировать игрока в системе"
                                className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200 hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                              >
                                <Ban className="w-3.5 h-3.5 text-rose-400" />
                                <span>{isTargetBanned ? 'Бан подтвержден' : 'Забанить нарушителя'}</span>
                              </button>

                              {/* Warning button */}
                              <button
                                onClick={() => handleResolveReport(report.id, 'resolved', 'warning', 'Вынесено официальное предупреждение.')}
                                title="Пометить как рассмотренное с предупреждением"
                                className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-700 text-amber-200 hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                                <span>Предупреждение</span>
                              </button>

                              {/* Dismiss button */}
                              <button
                                onClick={() => handleResolveReport(report.id, 'dismissed', 'dismissed', 'Нарушений правил не обнаружено.')}
                                title="Отклонить жалобу как необоснованную"
                                className="px-3 py-1.5 rounded-xl bg-[#171822] hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors"
                              >
                                <span>Отклонить</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Detailed Note / Review Modal trigger */}
                              <button
                                onClick={() => {
                                  sounds.playTick();
                                  setSelectedReportForReview(report);
                                  setReviewResolutionNote(report.resolutionNote || '');
                                  setReviewBanTarget(false);
                                }}
                                title="Написать вердикт модератора"
                                className="px-3 py-1.5 rounded-xl bg-blue-950/80 hover:bg-blue-900 border border-blue-700 text-blue-200 text-xs font-bold transition-colors flex items-center gap-1.5"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                                <span>Вердикт / Заметка</span>
                              </button>

                              {/* Delete Report Record */}
                              <button
                                onClick={() => handleDeleteReport(report.id)}
                                title="Удалить запись жалобы"
                                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-rose-950 hover:border-rose-800 text-zinc-400 hover:text-rose-300 border border-zinc-700 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB: AUDIT LOGS ================= */}
            {activeTab === 'auditLogs' && (
              <div className="space-y-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
                {/* Header & Main Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#13141f] p-4 rounded-xl border border-zinc-800 shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Журнал аудита действий (Audit Logs)
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Сквозной аудит всех действий администрации в реальном времени: смена ролей, закрытие столов, создание ивентов и квестов, блокировки и транзакции
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { sounds.playTick(); fetchAuditLogs(false); }}
                      disabled={isRefreshingAudit}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-colors flex items-center gap-1.5 border border-zinc-700"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAudit ? 'animate-spin text-amber-400' : ''}`} />
                      <span>Обновить</span>
                    </button>

                    <button
                      onClick={handleClearAuditLogs}
                      title="Очистить журнал аудита"
                      className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800/80 text-rose-300 font-bold text-xs transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Очистить</span>
                    </button>
                  </div>
                </div>

                {/* 5 Metric Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 shrink-0">
                  <div className="p-3 rounded-xl bg-[#13141a] border border-zinc-800 space-y-1">
                    <div className="text-[10px] text-zinc-400 font-mono uppercase">Всего действий</div>
                    <div className="text-lg font-bold text-white font-mono">
                      {auditStats?.totalLogs ?? auditLogs.length}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-1">
                    <div className="text-[10px] text-purple-300 font-mono uppercase flex items-center gap-1">
                      <Crown className="w-3 h-3 text-purple-400" /> Смена ролей
                    </div>
                    <div className="text-lg font-bold text-purple-300 font-mono">
                      {auditStats?.roleChangesCount ?? auditLogs.filter(l => l.actionType === 'role_change').length}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 space-y-1">
                    <div className="text-[10px] text-rose-300 font-mono uppercase flex items-center gap-1">
                      <Gamepad2 className="w-3 h-3 text-rose-400" /> Закрытия столов
                    </div>
                    <div className="text-lg font-bold text-rose-300 font-mono">
                      {auditStats?.roomShutdownsCount ?? auditLogs.filter(l => l.actionType === 'room_shutdown').length}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/40 space-y-1">
                    <div className="text-[10px] text-indigo-300 font-mono uppercase flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-400" /> Ивенты и квесты
                    </div>
                    <div className="text-lg font-bold text-indigo-300 font-mono">
                      {auditStats?.eventActionsCount ?? auditLogs.filter(l => l.actionType.includes('event') || l.actionType.includes('task')).length}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 space-y-1 col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-amber-300 font-mono uppercase flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-amber-400" /> Модерация
                    </div>
                    <div className="text-lg font-bold text-amber-300 font-mono">
                      {auditStats?.moderationActionsCount ?? auditLogs.filter(l => l.actionType === 'user_ban' || l.actionType === 'report_resolve').length}
                    </div>
                  </div>
                </div>

                {/* Filter & Search Bar */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-[#12131a] p-3 rounded-xl border border-zinc-800/80 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Поиск по описанию, имени администратора, email, цели или типу действия..."
                      value={auditSearch}
                      onChange={e => setAuditSearch(e.target.value)}
                      className="w-full bg-[#171822] border border-zinc-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-orange-500 font-sans"
                    />
                  </div>

                  {/* Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {[
                      { id: 'all', label: `Все (${auditLogs.length})` },
                      { id: 'role_change', label: 'Смена ролей' },
                      { id: 'room_shutdown', label: 'Закрытия комнат' },
                      { id: 'events', label: 'Ивенты и квесты' },
                      { id: 'moderation', label: 'Модерация' },
                      { id: 'economy', label: 'Экономика' },
                      { id: 'broadcast', label: 'Оповещения' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setAuditFilter(f.id as any); sounds.playTick(); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                          auditFilter === f.id
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Logs Timeline Container */}
                <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                  {filteredAuditLogs.length === 0 ? (
                    <div className="h-64 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-400 text-xs space-y-2">
                      <History className="w-8 h-8 text-zinc-500" />
                      <span>Записи аудита по выбранному фильтру не найдены</span>
                    </div>
                  ) : (
                    filteredAuditLogs.map(log => {
                      let badge = {
                        label: 'Действие',
                        color: 'bg-zinc-900 border-zinc-700 text-zinc-300',
                        icon: Shield
                      };

                      if (log.actionType === 'role_change') {
                        badge = { label: 'Смена роли', color: 'bg-purple-950/80 border-purple-600 text-purple-300', icon: Crown };
                      } else if (log.actionType === 'room_shutdown') {
                        badge = { label: 'Закрытие комнаты', color: 'bg-rose-950/80 border-rose-600 text-rose-300', icon: Trash2 };
                      } else if (log.actionType === 'event_create') {
                        badge = { label: 'Создание ивента', color: 'bg-indigo-950/80 border-indigo-600 text-indigo-300', icon: Sparkles };
                      } else if (log.actionType === 'event_update') {
                        badge = { label: 'Обновление ивента', color: 'bg-indigo-950/80 border-indigo-700 text-indigo-300', icon: Calendar };
                      } else if (log.actionType === 'event_delete') {
                        badge = { label: 'Удаление ивента', color: 'bg-rose-950/80 border-rose-700 text-rose-300', icon: Trash2 };
                      } else if (log.actionType === 'task_create') {
                        badge = { label: 'Создание квеста', color: 'bg-blue-950/80 border-blue-600 text-blue-300', icon: Award };
                      } else if (log.actionType === 'task_update') {
                        badge = { label: 'Обновление квеста', color: 'bg-blue-950/80 border-blue-700 text-blue-300', icon: Layers };
                      } else if (log.actionType === 'task_delete') {
                        badge = { label: 'Удаление квеста', color: 'bg-orange-950/80 border-orange-700 text-orange-300', icon: Trash2 };
                      } else if (log.actionType === 'user_ban') {
                        badge = { label: 'Блокировка', color: 'bg-red-950/80 border-red-600 text-red-300', icon: Ban };
                      } else if (log.actionType === 'credits_change') {
                        badge = { label: 'Кредиты', color: 'bg-amber-950/80 border-amber-600 text-amber-300', icon: Coins };
                      } else if (log.actionType === 'item_give') {
                        badge = { label: 'Выдача предмета', color: 'bg-orange-950/80 border-orange-600 text-orange-300', icon: Gift };
                      } else if (log.actionType === 'user_rename') {
                        badge = { label: 'Смена ника', color: 'bg-emerald-950/80 border-emerald-600 text-emerald-300', icon: Edit3 };
                      } else if (log.actionType === 'rating_change') {
                        badge = { label: 'Рейтинг Elo', color: 'bg-blue-950/80 border-blue-600 text-blue-300', icon: TrendingUp };
                      } else if (log.actionType === 'broadcast') {
                        badge = { label: 'Оповещение', color: 'bg-rose-950/80 border-rose-600 text-rose-300', icon: Radio };
                      } else if (log.actionType === 'report_resolve') {
                        badge = { label: 'Жалоба решена', color: 'bg-teal-950/80 border-teal-600 text-teal-300', icon: CheckCircle2 };
                      } else if (log.actionType === 'daily_bonus_update') {
                        badge = { label: 'Бонус', color: 'bg-amber-950/80 border-amber-600 text-amber-300', icon: Sparkles };
                      }

                      const Icon = badge.icon;
                      const dateObj = new Date(log.createdAt);
                      const timeFormatted = isNaN(dateObj.getTime()) ? log.createdAt : dateObj.toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      });

                      const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

                      return (
                        <div
                          key={log.id}
                          className="p-3.5 rounded-xl bg-[#13141c] hover:bg-[#161724] border border-zinc-800/80 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 group"
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="p-2.5 rounded-xl bg-[#0c0d12] border border-zinc-800 shrink-0 text-white shadow-sm mt-0.5">
                              <Icon className="w-4 h-4 text-amber-400" />
                            </div>

                            <div className="min-w-0 space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${badge.color}`}>
                                  {badge.label}
                                </span>

                                {log.targetName && (
                                  <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-300 text-[11px] font-bold truncate max-w-xs">
                                    🎯 {log.targetName}
                                  </span>
                                )}

                                {log.targetId && !log.targetName && (
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-mono">
                                    ID: {log.targetId}
                                  </span>
                                )}
                              </div>

                              <div className="text-xs text-zinc-200 font-sans leading-relaxed break-words">
                                {log.details}
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-zinc-400 flex-wrap font-mono pt-0.5">
                                <span className="flex items-center gap-1 text-zinc-400">
                                  <Crown className="w-3 h-3 text-amber-500" />
                                  <span className="text-zinc-300 font-semibold">{log.adminName}</span> ({log.adminEmail})
                                </span>
                                <span>•</span>
                                <span className="text-zinc-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-zinc-500" />
                                  <span>{timeFormatted}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          {hasMetadata && (
                            <button
                              onClick={() => {
                                sounds.playTick();
                                setSelectedAuditLog(log);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-750 text-zinc-300 hover:text-white text-xs font-mono font-bold transition-colors flex items-center gap-1.5 self-start sm:self-center shrink-0 cursor-pointer"
                              title="Посмотреть структуру данных события"
                            >
                              <FileText className="w-3.5 h-3.5 text-amber-400" />
                              <span>Детали</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ================= TAB 5: BROADCAST SYSTEM MESSAGE ================= */}
            {activeTab === 'broadcast' && (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="px-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
                      Глобальное оповещение всех игроков
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Сообщение мгновенно появится в чатах всех активных игровых комнат с пометкой «Оповещение Администрации».
                    </p>
                  </div>

                  <form onSubmit={handleSendBroadcast} className="space-y-3">
                    <textarea
                      rows={4}
                      placeholder="Введите текст системного оповещения..."
                      value={broadcastMessage}
                      onChange={e => setBroadcastMessage(e.target.value)}
                      className="w-full bg-[#13141a] border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-orange-500 font-sans"
                    />

                    {/* Quick Templates */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-zinc-400">Быстрые шаблоны:</span>
                      {[
                        '⚠️ Внимание! Через 10 минут запланирована перезагрузка сервера.',
                        '🎉 Стартовал праздничный турнир! Победители получат Сертификаты смены ника.',
                        '🛡️ Напоминаем о правилах уважительного общения в игровом чате.',
                        '🏷️ В городском магазине объявлена распродажа со скидками до -50%!'
                      ].map((tmpl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setBroadcastMessage(tmpl)}
                          className="px-2 py-1 rounded bg-[#171822] hover:bg-zinc-800 border border-zinc-700/80 text-[10px] text-zinc-300 transition-colors"
                        >
                          Шаблон {idx + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={broadcastLoading || !broadcastMessage.trim()}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {broadcastLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>Отправить оповещение во все комнаты</span>
                    </button>
                  </form>
                </div>

                {/* Broadcast Live Preview */}
                <div className="p-4 rounded-xl bg-[#13141d] border border-rose-900/40 space-y-2">
                  <span className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider">Предпросмотр сообщения в чате:</span>
                  <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-[11px]">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Оповещение Администрации</span>
                    </div>
                    <p className="text-zinc-200 mt-1 text-xs">
                      {broadcastMessage.trim() || 'Текст сообщения появится здесь...'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ================= TAB 5: STATISTICS & ECONOMY ================= */}
            {activeTab === 'stats' && (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Экономика сервера и глобальные метрики
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Сводные данные по пользователям, балансу кредитов и активности
                  </p>
                </div>

                {/* 4 Large Metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-4 rounded-xl bg-[#13141a] border border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-xs">Всего игроков</span>
                      <Users className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="text-xl font-bold text-white font-mono">
                      {stats?.totalUsers ?? usersList.length}
                    </div>
                    <div className="text-[10px] text-emerald-400">Зарегистрировано в БД</div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#13141a] border border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-xs">Кредиты в обороте</span>
                      <Coins className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-xl font-bold text-amber-300 font-mono">
                      {stats?.totalCredits ?? usersList.reduce((a, b) => a + (b.credits || 0), 0)} кр
                    </div>
                    <div className="text-[10px] text-amber-400">Внутриигровая валюта</div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#13141a] border border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-xs">Сыграно матчей</span>
                      <Gamepad2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-xl font-bold text-blue-300 font-mono">
                      {stats?.totalGamesPlayed ?? usersList.reduce((a, b) => a + (b.stats?.gamesPlayed || 0), 0)}
                    </div>
                    <div className="text-[10px] text-blue-400">Всего завершенных партий</div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#13141a] border border-zinc-800 space-y-1">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="text-xs">Активные столы</span>
                      <Activity className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-emerald-300 font-mono">
                      {stats?.activeRoomsCount ?? roomsList.length}
                    </div>
                    <div className="text-[10px] text-emerald-400">Игр прямо сейчас</div>
                  </div>
                </div>

                {/* Economic Catalog Summary */}
                <div className="p-4 rounded-xl bg-[#13141a] border border-zinc-800 space-y-3">
                  <div className="text-xs font-bold text-white uppercase tracking-wider">
                    Предметы и Сертификаты в игре ({shopItemsList.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {shopItemsList.map(item => (
                      <div key={item.id} className="p-2.5 rounded-lg bg-[#181924] border border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{item.icon}</span>
                          <div>
                            <div className="font-bold text-zinc-200">{item.name}</div>
                            <div className="text-[10px] text-zinc-400">{item.description}</div>
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs text-amber-300 font-bold shrink-0">
                          {item.cost ? `${item.cost} кр` : 'Дроп'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= RIGHT BLOCK: TABS & NAVIGATION (3.5 of 12 cols) ================= */}
          <div className="md:col-span-4 lg:col-span-3.5 bg-[#101117]/95 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto space-y-4 order-1 md:order-2">
            
            <div className="space-y-3.5">
              {/* Top Section Header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Разделы управления
                </span>
                <span className="text-[10px] text-amber-500 font-mono font-bold">
                  [ 9 РАЗДЕЛОВ ]
                </span>
              </div>

              {/* Vertical Tab Navigation Stack */}
              <div className="space-y-2">
                {navTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        sounds.playTick();
                        setActiveTab(tab.id);
                      }}
                      className={`w-full p-3 sm:p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 group ${
                        isActive
                          ? 'bg-gradient-to-r from-orange-950/70 to-amber-950/50 border-orange-500 text-white shadow-md shadow-orange-950/40'
                          : 'bg-[#14151b] hover:bg-[#1a1b24] border-zinc-800/80 text-zinc-300 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          isActive 
                            ? 'bg-orange-600 text-white shadow-sm' 
                            : 'bg-zinc-850 text-zinc-400 group-hover:text-amber-400 group-hover:bg-zinc-800'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs sm:text-sm font-bold tracking-tight truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
                            {tab.title}
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {tab.subtitle}
                          </div>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border shrink-0 ${tab.badgeColor}`}>
                        {tab.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Status Card inside Right Block */}
            <div className="pt-3 border-t border-zinc-800/80 space-y-2.5">
              <div className="p-3 rounded-xl bg-[#13141c] border border-zinc-800/90 text-xs space-y-2">
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-amber-400" />
                    <span>База данных:</span>
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">Подключена</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Товаров в магазине:</span>
                  </span>
                  <span className="text-emerald-300 font-mono font-bold">
                    {shopItemsList.filter(i => i.inShop !== false).length} шт.
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>Всего кредитов:</span>
                  </span>
                  <span className="text-amber-300 font-mono font-bold">
                    {stats?.totalCredits ?? usersList.reduce((a, b) => a + (b.credits || 0), 0)} кр
                  </span>
                </div>
              </div>

              <div className="text-center text-[10px] text-zinc-400 font-mono">
                AI Studio Mafia Engine · v3.2
              </div>
            </div>
          </div>
        </div>

        {/* ================= USER MANAGEMENT DRAWER / SUBMODAL ================= */}
        {selectedUserForEdit && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#121319] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold text-base">
                    {selectedUserForEdit.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{selectedUserForEdit.displayName}</h4>
                    <p className="text-xs text-zinc-400 font-mono">{selectedUserForEdit.email}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedUserForEdit(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Action 1: Add / Set Credits */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    Кредиты (Баланс: {selectedUserForEdit.credits} кр)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={creditAmountInput}
                    onChange={e => setCreditAmountInput(parseInt(e.target.value) || 0)}
                    className="w-28 bg-[#101117] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                  />
                  <button
                    onClick={() => handleAddCredits(selectedUserForEdit.id, creditAmountInput, false)}
                    className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors"
                  >
                    + Добавить
                  </button>
                  <button
                    onClick={() => handleAddCredits(selectedUserForEdit.id, creditAmountInput, true)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
                  >
                    Установить
                  </button>
                </div>
              </div>

              {/* Action 2: Give Item */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2">
                <span className="font-bold text-xs text-zinc-200 flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-orange-400" />
                  Выдать предмет из каталога
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedItemToGive}
                    onChange={e => setSelectedItemToGive(e.target.value)}
                    className="flex-1 bg-[#101117] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {shopItemsList.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.icon} {item.name} ({item.cost} кр)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={itemQuantityToGive}
                    onChange={e => setItemQuantityToGive(parseInt(e.target.value) || 1)}
                    className="w-16 bg-[#101117] border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono font-bold text-center"
                  />
                  <button
                    onClick={() => handleGiveItem(selectedUserForEdit.id)}
                    className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                  >
                    Выдать
                  </button>
                </div>
              </div>

              {/* Action 3: Change Elo Rating */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2">
                <span className="font-bold text-xs text-zinc-200 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  Изменить рейтинг Elo
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newRatingInput}
                    onChange={e => setNewRatingInput(parseInt(e.target.value) || 0)}
                    className="flex-1 bg-[#101117] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono font-bold"
                  />
                  <button
                    onClick={() => handleUpdateRating(selectedUserForEdit.id)}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                  >
                    Сохранить Elo
                  </button>
                </div>
              </div>

              {/* Action 4: Rename Player */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2">
                <span className="font-bold text-xs text-zinc-200 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                  Принудительная смена никнейма
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDisplayNameInput}
                    onChange={e => setNewDisplayNameInput(e.target.value)}
                    placeholder="Новое имя игрока..."
                    className="flex-1 bg-[#101117] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => handleUpdateDisplayName(selectedUserForEdit.id)}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                  >
                    Переименовать
                  </button>
                </div>
              </div>

              {/* Action 5: Change User Role & Permissions */}
              <div className="p-3.5 rounded-xl bg-[#161722] border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-zinc-200 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                    Роль и права доступа
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/60 text-purple-300 font-bold uppercase">
                    Текущая: {selectedUserForEdit.role || 'user'} {selectedUserForEdit.isAdmin ? '(Админ)' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(['user', 'moderator', 'admin'] as const).map(roleOption => (
                    <button
                      key={roleOption}
                      type="button"
                      onClick={() => {
                        setSelectedUserRoleInput(roleOption);
                        if (roleOption === 'admin') setSelectedUserIsAdminInput(true);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border text-center ${
                        selectedUserRoleInput === roleOption
                          ? 'bg-purple-600 border-purple-500 text-white shadow-sm'
                          : 'bg-[#101117] border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
                      }`}
                    >
                      {roleOption === 'user' ? 'Игрок' : roleOption === 'moderator' ? 'Модератор' : 'Админ'}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUserIsAdminInput}
                      onChange={e => setSelectedUserIsAdminInput(e.target.checked)}
                      className="rounded bg-zinc-900 border-zinc-700 text-purple-600 focus:ring-0"
                    />
                    <span className="text-[11px]">Флаг isAdmin</span>
                  </label>

                  <button
                    onClick={() => handleUpdateRole(selectedUserForEdit.id, selectedUserRoleInput, selectedUserIsAdminInput)}
                    className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Применить</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= CREATE NEW ITEM MODAL ================= */}
        {isCreateItemModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#121319] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Создание нового товара в магазине
                </h4>
                <button
                  onClick={() => setIsCreateItemModalOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateNewItem} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">ID (Slug латиницей)*</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. cert_vip_name"
                      value={newItemForm.id || ''}
                      onChange={e => setNewItemForm(prev => ({ ...prev, id: e.target.value }))}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Иконка (Эмодзи)</label>
                    <input
                      type="text"
                      placeholder="📜, 🧰, 💎, 👑"
                      value={newItemForm.icon || '🎁'}
                      onChange={e => setNewItemForm(prev => ({ ...prev, icon: e.target.value }))}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Название товара*</label>
                  <input
                    type="text"
                    required
                    placeholder="Например: Золотой Сертификат Мафии"
                    value={newItemForm.name || ''}
                    onChange={e => setNewItemForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Категория</label>
                    <select
                      value={newItemForm.category}
                      onChange={e => setNewItemForm(prev => ({ ...prev, category: e.target.value as any }))}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2 py-1.5 text-white"
                    >
                      <option value="certificates">Сертификаты</option>
                      <option value="chests">Сундуки и кейсы</option>
                      <option value="cosmetics">Рубашки и титулы</option>
                      <option value="valuables">Ценности ломбарда</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Редкость</label>
                    <select
                      value={newItemForm.rarity}
                      onChange={e => setNewItemForm(prev => ({ ...prev, rarity: e.target.value as any }))}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2 py-1.5 text-white"
                    >
                      <option value="common">Обычный</option>
                      <option value="rare">Редкий</option>
                      <option value="epic">Эпический</option>
                      <option value="legendary">Легендарный</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Цена в магазине (кр)</label>
                    <input
                      type="number"
                      min={0}
                      value={newItemForm.cost}
                      onChange={e => setNewItemForm(prev => ({ ...prev, cost: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Выплата в ломбарде (кр)</label>
                    <input
                      type="number"
                      min={0}
                      value={newItemForm.pawnValue}
                      onChange={e => setNewItemForm(prev => ({ ...prev, pawnValue: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Описание товара</label>
                  <textarea
                    rows={2}
                    placeholder="Описание действия или свойств товара..."
                    value={newItemForm.description || ''}
                    onChange={e => setNewItemForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-[#161722] border border-zinc-700 rounded-lg p-2 text-white"
                  />
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newItemForm.inShop !== false}
                      onChange={e => setNewItemForm(prev => ({ ...prev, inShop: e.target.checked }))}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Сразу выставить в продажу</span>
                  </label>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateItemModalOpen(false)}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Создать товар</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= EDIT ITEM MODAL ================= */}
        {selectedItemForEdit && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#121319] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  Редактирование: {selectedItemForEdit.name}
                </h4>
                <button
                  onClick={() => setSelectedItemForEdit(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Название товара</label>
                    <input
                      type="text"
                      value={selectedItemForEdit.name}
                      onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Иконка (Эмодзи)</label>
                    <input
                      type="text"
                      value={selectedItemForEdit.icon}
                      onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, icon: e.target.value } : null)}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Цена магазина (кр)</label>
                    <input
                      type="number"
                      min={0}
                      value={selectedItemForEdit.cost}
                      onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, cost: parseInt(e.target.value) || 0 } : null)}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Ломбард (кр)</label>
                    <input
                      type="number"
                      min={0}
                      value={selectedItemForEdit.pawnValue || Math.floor(selectedItemForEdit.cost * 0.5)}
                      onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, pawnValue: parseInt(e.target.value) || 0 } : null)}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Скидка %</label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={selectedItemForEdit.discountPercent || 0}
                      onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, discountPercent: parseInt(e.target.value) || 0 } : null)}
                      className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-emerald-300 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Описание</label>
                  <textarea
                    rows={2}
                    value={selectedItemForEdit.description}
                    onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, description: e.target.value } : null)}
                    className="w-full bg-[#161722] border border-zinc-700 rounded-lg p-2 text-white"
                  />
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItemForEdit.inShop !== false}
                      onChange={e => setSelectedItemForEdit(prev => prev ? { ...prev, inShop: e.target.checked } : null)}
                      className="rounded border-zinc-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Включен в каталоге магазина</span>
                  </label>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItemForEdit(null)}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      if (selectedItemForEdit) {
                        handleUpdateItem(selectedItemForEdit.id, selectedItemForEdit);
                        setSelectedItemForEdit(null);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Сохранить изменения</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= SHOP SETTINGS & GLOBAL DISCOUNT MODAL ================= */}
        {isShopSettingsOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-[#121319] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Percent className="w-4 h-4 text-amber-400" />
                  Настройки скидок и промо-акций
                </h4>
                <button
                  onClick={() => setIsShopSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveShopSettings} className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Глобальная скидка на все товары (%)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={5}
                      value={shopSettings.globalDiscount}
                      onChange={e => setShopSettings(prev => ({ ...prev, globalDiscount: parseInt(e.target.value) || 0 }))}
                      className="flex-1 accent-orange-500"
                    />
                    <span className="w-12 text-center font-mono font-bold text-amber-300 text-sm bg-zinc-900 py-1 rounded border border-zinc-800">
                      {shopSettings.globalDiscount}%
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Текст рекламного промо-баннера</label>
                  <input
                    type="text"
                    value={shopSettings.bannerMessage}
                    onChange={e => setShopSettings(prev => ({ ...prev, bannerMessage: e.target.value }))}
                    placeholder="Например: Праздничная распродажа в Синдикате!"
                    className="w-full bg-[#161722] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsShopSettingsOpen(false)}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Применить настройки</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= REVIEW REPORT MODAL ================= */}
        {selectedReportForReview && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#121319] border border-rose-900/80 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400">
                    <Flag className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase">
                      Разбор жалобы #{selectedReportForReview.id.slice(-6)}
                    </h4>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      Комната #{selectedReportForReview.roomCode} · {new Date(selectedReportForReview.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedReportForReview(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Target & Reporter Summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-[#17141a] border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono uppercase block">Нарушитель:</span>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{selectedReportForReview.targetPlayerName}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    ID: {selectedReportForReview.targetPlayerId}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#14151e] border border-zinc-800 space-y-1">
                  <span className="text-[10px] text-zinc-400 font-mono uppercase block">Заявитель:</span>
                  <div className="font-bold text-zinc-200">
                    {selectedReportForReview.reporterName}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    ID: {selectedReportForReview.reporterId}
                  </div>
                </div>
              </div>

              {/* Violation reason and incident details */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[11px] text-zinc-400 block mb-1">Причина жалобы:</span>
                  <div className="p-2.5 rounded-xl bg-[#161318] border border-rose-950 text-rose-300 font-bold">
                    {selectedReportForReview.reason}
                  </div>
                </div>

                {selectedReportForReview.details && (
                  <div>
                    <span className="text-[11px] text-zinc-400 block mb-1">Детали и цитаты:</span>
                    <div className="p-3 rounded-xl bg-[#0f1015] border border-zinc-800 text-zinc-300 leading-relaxed font-sans">
                      {selectedReportForReview.details}
                    </div>
                  </div>
                )}

                {/* Resolution Note field */}
                <div>
                  <label className="text-[11px] text-zinc-300 font-bold block mb-1">
                    Вердикт / Заметка модератора:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Укажите комментарий к решению (например: нарушение подтверждено по логам чата)..."
                    value={reviewResolutionNote}
                    onChange={e => setReviewResolutionNote(e.target.value)}
                    className="w-full bg-[#161722] border border-zinc-700 rounded-xl p-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Ban target player checkbox */}
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-xs cursor-pointer hover:bg-rose-950/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={reviewBanTarget}
                    onChange={e => setReviewBanTarget(e.target.checked)}
                    className="rounded border-rose-700 text-rose-600 focus:ring-0 w-4 h-4 accent-rose-600"
                  />
                  <div>
                    <span className="font-bold block">Применить блокировку аккаунта игрока</span>
                    <span className="text-[10px] text-zinc-400">Нарушитель будет мгновенно забанен в базе данных</span>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap justify-between gap-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSelectedReportForReview(null)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs"
                >
                  Отмена
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResolveReport(selectedReportForReview.id, 'dismissed', 'dismissed', reviewResolutionNote || 'Отклонено администратором')}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs transition-colors"
                  >
                    Отклонить
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResolveReport(selectedReportForReview.id, 'resolved', reviewBanTarget ? 'ban' : 'warning', reviewResolutionNote || 'Нарушение рассмотрено', reviewBanTarget)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-rose-950/40 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Вынести вердикт</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= AUDIT LOG DETAIL MODAL ================= */}
        {selectedAuditLog && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs select-none animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-[#121319] border border-zinc-700/80 rounded-2xl shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-950/80 border border-purple-700 text-purple-300">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Детали записи аудита</h4>
                    <p className="text-[11px] font-mono text-zinc-400">ID: {selectedAuditLog.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAuditLog(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[#161722] border border-zinc-800 space-y-1">
                  <div className="text-[10px] text-zinc-400 font-mono uppercase">Действие:</div>
                  <div className="font-bold text-white leading-relaxed">{selectedAuditLog.details}</div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-[#161722] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase">Администратор:</div>
                    <div className="text-zinc-200 font-bold truncate mt-0.5">{selectedAuditLog.adminName}</div>
                    <div className="text-[10px] text-zinc-400 truncate">{selectedAuditLog.adminEmail}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#161722] border border-zinc-800">
                    <div className="text-[10px] text-zinc-400 uppercase">Время записи:</div>
                    <div className="text-zinc-200 font-bold mt-0.5">{new Date(selectedAuditLog.createdAt).toLocaleString('ru-RU')}</div>
                    <div className="text-[10px] text-zinc-400 font-mono truncate">{selectedAuditLog.actionType}</div>
                  </div>
                </div>

                {selectedAuditLog.metadata && Object.keys(selectedAuditLog.metadata).length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase text-zinc-400">Структурированные метаданные (JSON):</span>
                    <pre className="p-3 rounded-xl bg-[#0b0c10] border border-zinc-800 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-48 leading-relaxed">
                      {JSON.stringify(selectedAuditLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setSelectedAuditLog(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
