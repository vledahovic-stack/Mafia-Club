import React, { useState, useEffect } from 'react';
import { AuthUser } from './AuthModal';
import { 
  X, 
  Trophy, 
  Shield, 
  Skull, 
  LogOut, 
  Edit3, 
  Check, 
  Loader2, 
  Coins, 
  Package, 
  FileText, 
  Sparkles, 
  Gift, 
  Scale, 
  Search, 
  Tag, 
  ArrowRight,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertCircle,
  Crown,
  Flame,
  Zap,
  History,
  Award,
  Users,
  Video,
  Globe,
  LayoutGrid,
  Camera
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useSkin } from '../context/SkinContext';
import { WebRtcSettingsPanel } from './WebRtcSettingsPanel';
import { loadWebRtcSettings, saveWebRtcSettings } from '../utils/webrtcSettings';
import { WebRtcSettings } from '../types/webrtc';
import { sounds } from '../utils/audio';
import { 
  ALL_GAME_ITEMS, 
  ITEMS_LIST, 
  DEFAULT_NICKNAME_CHANGE_COST, 
  DEFAULT_AVATAR_CHANGE_COST,
  NICKNAME_CHANGE_CERTIFICATE_ID, 
  AVATAR_CHANGE_CERTIFICATE_ID,
  ROLE_SELECT_CARD_ID,
  RARITY_CONFIG, 
  CATEGORY_CONFIG,
  ItemDefinition,
  ItemCategory,
  ItemRarity
} from '../data/items';

import { DetailedStatsView } from './DetailedStatsView';
import { GameHistoryView } from './GameHistoryView';
import { RoleMasteryView } from './RoleMasteryView';
import { FriendsView } from './FriendsView';
import { getUserMasterySummary } from '../data/mastery';
import { DailyStreakWidget } from './DailyStreakWidget';
import { calculateDailyStreak } from '../utils/streak';
import { 
  calculateLevelInfo, 
  getLevelMilestones, 
  getXpActionRules, 
  getRuntimeExperienceConfig, 
  subscribeToExperienceConfig, 
  fetchExperienceConfig 
} from '../utils/experience';

interface UserProfileModalProps {
  user: AuthUser;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onUpdateUser: (updatedUser: AuthUser) => void;
  onOpenShop?: () => void;
  onOpenAdmin?: () => void;
  onOpenBonus?: () => void;
  onOpenTasks?: () => void;
  onOpenFeedback?: () => void;
  onJoinRoom?: (roomCode: string, asSpectator?: boolean) => void;
  currentRoomCode?: string | null;
  initialTab?: ProfileTab;
}

type ProfileTab = 'inventory' | 'experience' | 'friends' | 'mastery' | 'history' | 'stats' | 'nickname' | 'avatar' | 'catalog' | 'streak' | 'webrtc' | 'language';

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  onLogout,
  onUpdateUser,
  onOpenShop,
  onOpenAdmin,
  onOpenBonus,
  onOpenTasks,
  onOpenFeedback,
  onJoinRoom,
  currentRoomCode,
  initialTab = 'inventory'
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const { language, setLanguage, t, languages } = useLanguage();
  const { equipSkin } = useSkin();

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  const [webrtcSettings, setWebrtcSettings] = useState<WebRtcSettings>(loadWebRtcSettings);
  const isSuperAdmin = Boolean(user && (user.isAdmin === true || user.role === 'admin' || user.email?.toLowerCase() === 'vledahovic@gmail.com'));
  const streakInfo = calculateDailyStreak(user);
  const masterySummary = React.useMemo(() => getUserMasterySummary(user), [user]);
  
  // Dynamic experience progression config
  const [expConfig, setExpConfig] = useState(getRuntimeExperienceConfig());
  useEffect(() => {
    fetchExperienceConfig().then(cfg => setExpConfig(cfg));
    return subscribeToExperienceConfig(cfg => setExpConfig(cfg));
  }, []);

  const levelInfo = React.useMemo(() => calculateLevelInfo(user.xp), [user.xp, expConfig]);
  const activeMilestones = React.useMemo(() => getLevelMilestones(), [expConfig]);
  const activeActionRules = React.useMemo(() => getXpActionRules(), [expConfig]);
  
  // Nickname change form state
  const [newDisplayName, setNewDisplayName] = useState(user.displayName);
  const [paymentMethod, setPaymentMethod] = useState<'certificate' | 'credits'>('certificate');
  const [loadingName, setLoadingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);

  // Avatar change form state
  const [newAvatarSeed, setNewAvatarSeed] = useState(user.avatarSeed || user.displayName);
  const [avatarPaymentMethod, setAvatarPaymentMethod] = useState<'certificate' | 'credits'>('certificate');
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user?.avatarSeed) {
      setNewAvatarSeed(user.avatarSeed);
    }
  }, [user?.avatarSeed]);

  // Inventory interactions state
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'all'>('all');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<ItemCategory | 'all'>('all');
  const [selectedItemDetail, setSelectedItemDetail] = useState<ItemDefinition | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Chest unboxing loot modal
  const [unboxedLoot, setUnboxedLoot] = useState<{ message: string; reward?: any } | null>(null);

  // Mobile All Sections Drawer state (Mobile only)
  const [isMobileSectionsDrawerOpen, setIsMobileSectionsDrawerOpen] = useState<boolean>(false);

  if (!isOpen) return null;

  const stats = user.stats || {
    gamesPlayed: 0,
    gamesWon: 0,
    rating: 1200,
    mafiaWins: 0,
    civilianWins: 0
  };

  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const userCredits = typeof user.credits === 'number' ? user.credits : 250;
  const inventory = Array.isArray(user.inventory) ? user.inventory : [];

  // Count certificates in inventory
  const certItem = inventory.find(i => i.itemId === NICKNAME_CHANGE_CERTIFICATE_ID);
  const certificateCount = certItem ? certItem.quantity : 0;

  const avatarCertItem = inventory.find(i => i.itemId === AVATAR_CHANGE_CERTIFICATE_ID);
  const avatarCertificateCount = avatarCertItem ? avatarCertItem.quantity : 0;

  // Filter user inventory
  const filteredInventory = inventory.filter(invItem => {
    const itemDef = ALL_GAME_ITEMS[invItem.itemId];
    if (!itemDef) return false;
    if (selectedCategory === 'all') return true;
    return itemDef.category === selectedCategory;
  });

  // Filter catalog of all items
  const filteredCatalog = ITEMS_LIST.filter(item => {
    const matchesCategory = catalogCategory === 'all' || item.category === catalogCategory;
    const matchesSearch = item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                          item.description.toLowerCase().includes(catalogSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Handle nickname change
  const handleChangeNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(null);

    const clean = newDisplayName.trim();
    if (clean.length < 2 || clean.length > 30) {
      setNameError('Имя должно содержать от 2 до 30 символов.');
      return;
    }

    if (clean === user.displayName) {
      setNameError('Новое имя совпадает с текущим.');
      return;
    }

    const useCert = paymentMethod === 'certificate';
    if (useCert && certificateCount <= 0) {
      setNameError('У вас нет «Сертификата на смену никнейма». Выберите оплату кредитами или приобретите сертификат в магазине.');
      return;
    }

    if (!useCert && userCredits < DEFAULT_NICKNAME_CHANGE_COST) {
      setNameError(`Недостаточно кредитов. Требуется ${DEFAULT_NICKNAME_CHANGE_COST} кр (у вас ${userCredits} кр).`);
      return;
    }

    setLoadingName(true);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/change-name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          displayName: clean,
          useCertificate: useCert
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при смене никнейма');
      }

      sounds.playTick();
      onUpdateUser(data.user);
      setNameSuccess(data.message || 'Никнейм успешно изменён!');
      setTimeout(() => {
        setNameSuccess(null);
        setActiveTab('inventory');
      }, 2500);
    } catch (err: unknown) {
      setNameError(err instanceof Error ? err.message : 'Не удалось изменить никнейм.');
    } finally {
      setLoadingName(false);
    }
  };

  // Handle avatar change
  const handleChangeAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAvatarError(null);
    setAvatarSuccess(null);

    const clean = newAvatarSeed.trim();
    if (!clean) {
      setAvatarError('Укажите новый аватар.');
      return;
    }

    const useCert = avatarPaymentMethod === 'certificate';
    if (useCert && avatarCertificateCount <= 0) {
      setAvatarError('У вас нет «Сертификата на смену аватара». Выберите оплату кредитами или приобретите сертификат в магазине.');
      return;
    }

    if (!useCert && userCredits < DEFAULT_AVATAR_CHANGE_COST) {
      setAvatarError(`Недостаточно кредитов. Требуется ${DEFAULT_AVATAR_CHANGE_COST} кр (у вас ${userCredits} кр).`);
      return;
    }

    setLoadingAvatar(true);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/change-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          avatarSeed: clean,
          useCertificate: useCert
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при смене аватара');
      }

      sounds.playTick();
      onUpdateUser(data.user);
      setAvatarSuccess(data.message || 'Аватар успешно изменён!');
      setTimeout(() => {
        setAvatarSuccess(null);
        setActiveTab('inventory');
      }, 2500);
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось изменить аватар.');
    } finally {
      setLoadingAvatar(false);
    }
  };

  // Handle using/opening an item from inventory
  const handleUseItem = async (itemId: string) => {
    if (itemId === NICKNAME_CHANGE_CERTIFICATE_ID) {
      // Direct jump to nickname change tab
      setPaymentMethod('certificate');
      setActiveTab('nickname');
      sounds.playTick();
      return;
    }
    if (itemId === AVATAR_CHANGE_CERTIFICATE_ID) {
      // Direct jump to avatar change tab
      setAvatarPaymentMethod('certificate');
      setActiveTab('avatar');
      sounds.playTick();
      return;
    }

    if (itemId.startsWith('skin_')) {
      const skinId = itemId.replace('skin_', '');
      if (user.equippedCosmetics?.uiSkin === skinId) {
        // Unequip back to default
        setActionLoading(true);
        setActionFeedback(null);
        try {
          const res = await equipSkin('default', user);
          if (res.updatedUser) {
            onUpdateUser(res.updatedUser);
          } else {
            onUpdateUser({
              ...user,
              equippedCosmetics: {
                ...user.equippedCosmetics,
                uiSkin: undefined
              }
            });
          }
          sounds.playCardFlip();
          setActionFeedback({ type: 'success', text: 'Стиль интерфейса сброшен к стандартному.' });
          setTimeout(() => setActionFeedback(null), 3000);
        } finally {
          setActionLoading(false);
        }
        return;
      }
    }

    setActionLoading(true);
    setActionFeedback(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/use-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ itemId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка активации предмета');
      }

      sounds.playGunshot();
      onUpdateUser(data.user);

      if (itemId.startsWith('skin_')) {
        const skinId = itemId.replace('skin_', '');
        await equipSkin(skinId, data.user);
      }

      if (itemId.startsWith('chest_')) {
        setUnboxedLoot({
          message: data.resultMessage,
          reward: data.reward
        });
      } else {
        setActionFeedback({ type: 'success', text: data.resultMessage });
        setTimeout(() => setActionFeedback(null), 3000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при использовании предмета';
      setActionFeedback({ type: 'error', text: msg });
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle pawning an item (selling for credits)
  const handlePawnItem = async (itemId: string) => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/pawn-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ itemId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка сдачи в ломбард');
      }

      sounds.playTick();
      onUpdateUser(data.user);
      setActionFeedback({ type: 'success', text: data.message });
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при сдаче предмета';
      setActionFeedback({ type: 'error', text: msg });
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setActionLoading(false);
    }
  };

  // Total items in inventory for badges
  const totalInventoryCount = inventory.reduce((acc, i) => acc + i.quantity, 0);

  // Mobile navigation tabs & drawer configuration
  const profileTabsConfig = [
    {
      id: 'inventory' as const,
      title: 'Инвентарь',
      shortTitle: 'Инвентарь',
      subtitle: 'Рюкзак, сундуки, косметика и предметы',
      icon: Package,
      badge: `${totalInventoryCount} шт`,
      badgeColor: 'bg-orange-950/80 border-orange-700/60 text-orange-300'
    },
    {
      id: 'experience' as const,
      title: 'Шкала опыта',
      shortTitle: 'Опыт',
      subtitle: `Уровень ${levelInfo.level} · ${levelInfo.title} (${levelInfo.progressPercent}%)`,
      icon: Sparkles,
      badge: `Ур. ${levelInfo.level}`,
      badgeColor: 'bg-amber-950/80 border-amber-700/60 text-amber-300'
    },
    {
      id: 'friends' as const,
      title: 'Друзья',
      shortTitle: 'Друзья',
      subtitle: 'Список друзей, онлайн-статусы и лобби',
      icon: Users,
      badge: 'Общение',
      badgeColor: 'bg-amber-950/80 border-amber-700/60 text-amber-300'
    },
    {
      id: 'mastery' as const,
      title: 'Мастерство ролей',
      shortTitle: 'Мастерство',
      subtitle: 'Значки мастера, прогресс и уникальные титулы',
      icon: Award,
      badge: masterySummary.masteredCount > 0 ? `👑 ${masterySummary.masteredCount}` : 'Значки',
      badgeColor: 'bg-yellow-950/80 border-yellow-700/60 text-yellow-300'
    },
    {
      id: 'history' as const,
      title: 'История игр',
      shortTitle: 'История',
      subtitle: 'Архив прошедших матчей и протоколы партий',
      icon: History,
      badge: stats.gamesPlayed > 0 ? `${stats.gamesPlayed}` : '0',
      badgeColor: 'bg-zinc-900 border-zinc-700 text-zinc-300'
    },
    {
      id: 'stats' as const,
      title: 'Статистика',
      shortTitle: 'Статы',
      subtitle: 'Винрейты за роли, рейтинг Elo и сводки',
      icon: Trophy,
      badge: `${stats.rating} Elo`,
      badgeColor: 'bg-amber-950/80 border-amber-700/60 text-amber-300'
    },
    {
      id: 'streak' as const,
      title: 'Серия входов',
      shortTitle: 'Стрик',
      subtitle: streakInfo.claimedToday 
        ? `Серия: ${streakInfo.streak} дн. (сегодня собрано)` 
        : `День ${streakInfo.targetDay}: доступна награда (+${streakInfo.todayRewardCredits} кр)!`,
      icon: Flame,
      badge: `${streakInfo.streak} дн`,
      badgeColor: !streakInfo.claimedToday 
        ? 'bg-amber-500 text-zinc-950 font-black animate-pulse' 
        : 'bg-orange-950/80 border-orange-700/60 text-orange-300',
      isAlert: !streakInfo.claimedToday
    },
    {
      id: 'nickname' as const,
      title: 'Смена никнейма',
      shortTitle: 'Никнейм',
      subtitle: 'Сертификат смены или оплата кредитами',
      icon: Edit3,
      badge: certificateCount > 0 ? `${certificateCount} серт.` : 'Смена',
      badgeColor: 'bg-blue-950/80 border-blue-700/60 text-blue-300'
    },
    {
      id: 'avatar' as const,
      title: 'Смена аватара',
      shortTitle: 'Аватар',
      subtitle: 'Сертификат аватара или оплата кредитами',
      icon: Camera,
      badge: avatarCertificateCount > 0 ? `${avatarCertificateCount} серт.` : 'Аватар',
      badgeColor: 'bg-purple-950/80 border-purple-700/60 text-purple-300'
    },
    {
      id: 'catalog' as const,
      title: 'Все предметы',
      shortTitle: 'Каталог',
      subtitle: 'Полная база предметов Города и ломбард',
      icon: Tag,
      badge: `${ITEMS_LIST.length} предм.`,
      badgeColor: 'bg-zinc-900 border-zinc-700 text-zinc-300'
    },
    {
      id: 'webrtc' as const,
      title: 'Видеосвязь WebRTC',
      shortTitle: 'Связь',
      subtitle: 'Камера, микрофон, выбор устройств и эхоподавление',
      icon: Video,
      badge: 'Камера',
      badgeColor: 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300'
    },
    {
      id: 'language' as const,
      title: 'Язык и Настройки',
      shortTitle: 'Язык',
      subtitle: 'Язык интерфейса, уведомления и профиль',
      icon: Globe,
      badge: language.toUpperCase(),
      badgeColor: 'bg-amber-950/80 border-amber-700/60 text-amber-300'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-black/85 backdrop-blur-xs select-none overflow-x-hidden">
      {/* Center Noir Hub Card matching the General Lobby structure (65% width, 98% height on desktop; 100% on mobile) */}
      <div className="relative w-full md:w-[65vw] h-full min-h-[100dvh] md:min-h-0 md:h-[98vh] bg-[#121319] border-0 md:border md:border-zinc-800 rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* ================= DESKTOP TOP HEADER (hidden on mobile, md:flex) ================= */}
        <div className="hidden md:flex px-6 py-4 bg-gradient-to-r from-[#171824] via-[#141520] to-[#12131a] border-b border-zinc-800 items-center justify-between relative shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { setActiveTab('avatar'); sounds.playTick(); }}
              title="Нажмите, чтобы сменить аватар профиля"
              className="relative group w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-900 via-indigo-900 to-amber-950 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-purple-950/40 border border-purple-500/40 shrink-0 cursor-pointer overflow-hidden transition-all active:scale-95"
            >
              <span className="text-2xl drop-shadow-md">
                {user.avatarSeed && user.avatarSeed.length <= 4 ? user.avatarSeed : user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-purple-300 font-bold transition-opacity">
                <Camera className="w-5 h-5 text-purple-300" />
              </div>
            </button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-white tracking-tight">{user.displayName}</h3>
                {user.clanTag && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/70 text-amber-300 text-[10px] font-mono font-black" title={user.clanName ? `Клан: ${user.clanName} (${user.clanRole === 'leader' ? 'Лидер' : 'Участник'})` : undefined}>
                    [{user.clanTag}]
                  </span>
                )}
                {user.equippedCosmetics?.title && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-600/60 text-amber-300 text-[10px] font-bold">
                    {user.equippedCosmetics.title}
                  </span>
                )}

                {/* Role Mastery Badge Pill */}
                {masterySummary.masteredCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => { setActiveTab('mastery'); sounds.playTick(); }}
                    title={`Открыто значков Мастера: ${masterySummary.masteredCount} шт. Нажмите для перехода в Мастерство ролей`}
                    className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-950 to-orange-950 hover:from-amber-900 hover:to-orange-900 border border-amber-500/80 text-amber-300 text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs shadow-amber-950/60"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>Мастер: {masterySummary.masteredCount} знач.</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setActiveTab('mastery'); sounds.playTick(); }}
                    title="Мастерство ролей и значки"
                    className="px-2 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500/60 text-zinc-400 hover:text-amber-300 text-[10px] font-mono transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Award className="w-3 h-3 text-amber-400" />
                    <span>Мастерство</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setActiveTab('history'); sounds.playTick(); }}
                  title="Открыть историю игр и статистику матчей"
                  className="px-2.5 py-0.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500/60 text-amber-400 text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span>{stats.rating} Elo ({stats.gamesPlayed} игр)</span>
                </button>

                {/* Level & Rank Pill */}
                <button
                  type="button"
                  onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
                  title={`Шкала опыта: Ур. ${levelInfo.level} (${levelInfo.title}). Прогресс: ${levelInfo.xpInCurrentLevel}/${levelInfo.xpNeededForNextLevel} XP (${levelInfo.progressPercent}%). Нажмите для подробного просмотра.`}
                  className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-950/80 to-yellow-950/80 hover:from-amber-900 hover:to-yellow-900 border border-amber-500/70 text-amber-300 text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs shadow-amber-950/60"
                >
                  <span>{levelInfo.badgeIcon}</span>
                  <span>Ур. {levelInfo.level}</span>
                  <span className="text-zinc-400 font-sans hidden sm:inline">• {levelInfo.title}</span>
                </button>
              </div>

              {/* Quick Experience Scale Bar */}
              <div 
                onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
                title={`Шкала опыта: ${levelInfo.xpInCurrentLevel} / ${levelInfo.xpNeededForNextLevel} XP (${levelInfo.progressPercent}%). Нажмите для подробного просмотра шкалы опыта.`}
                className="mt-1 flex items-center gap-2 cursor-pointer group"
              >
                <div className="w-36 sm:w-48 h-2 bg-zinc-800/90 rounded-full overflow-hidden border border-zinc-700/80 relative">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 rounded-full transition-all duration-500 group-hover:brightness-110 shadow-xs shadow-amber-500/50"
                    style={{ width: `${levelInfo.progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono font-bold text-amber-400 group-hover:text-amber-300">
                  {levelInfo.xpInCurrentLevel}/{levelInfo.xpNeededForNextLevel} XP ({levelInfo.progressPercent}%)
                </span>
                <span className="text-[10px] text-zinc-500 hidden md:inline">
                  • Всего: {levelInfo.totalXp.toLocaleString()} XP
                </span>
              </div>

              <p className="text-xs text-zinc-400 mt-0.5">{user.email}</p>
            </div>
          </div>

          {/* Balance Badges & Close Button */}
          <div className="flex items-center gap-3">
            {isSuperAdmin && onOpenAdmin && (
              <button
                onClick={() => {
                  sounds.playTick();
                  onOpenAdmin();
                }}
                title="Панель Главного Администратора"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-600/70 bg-gradient-to-r from-amber-950/70 to-orange-950/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Админ-панель</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              {/* Daily Streak Flame Indicator */}
              <div 
                onClick={() => {
                  setActiveTab('streak');
                  sounds.playTick();
                }}
                title={streakInfo.claimedToday ? `Ежедневный стрик: ${streakInfo.streak} дн. (сегодня собран)` : `Ежедневный стрик: День ${streakInfo.targetDay} готов к получению (+${streakInfo.todayRewardCredits} кр)!`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer transition-all ${
                  streakInfo.claimedToday
                    ? 'bg-orange-950/40 border-orange-700/60 text-orange-300 hover:border-orange-500'
                    : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white animate-pulse shadow-md shadow-orange-950/50'
                }`}
              >
                <Flame className={`w-4 h-4 ${streakInfo.claimedToday ? 'text-amber-400' : 'text-yellow-200 fill-current'}`} />
                <span>{streakInfo.streak > 0 ? `${streakInfo.streak} дн.` : 'Бонус'}</span>
                {!streakInfo.claimedToday && (
                  <span className="text-[10px] bg-black/40 px-1 rounded text-yellow-300">
                    +{streakInfo.todayRewardCredits}
                  </span>
                )}
              </div>

              <div 
                title="Внутриигровые кредиты" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-300 font-bold text-xs shadow-inner"
              >
                <Coins className="w-4 h-4 text-amber-400" />
                <span>{userCredits} кр</span>
              </div>

              <div 
                onClick={() => { setActiveTab('nickname'); sounds.playTick(); }}
                title="Сертификаты на смену никнейма" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/60 text-blue-300 font-bold text-xs cursor-pointer transition-colors"
              >
                <span className="text-sm">📜</span>
                <span>{certificateCount} шт</span>
              </div>

              <div 
                onClick={() => { setActiveTab('avatar'); sounds.playTick(); }}
                title="Сертификаты на смену аватара" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 font-bold text-xs cursor-pointer transition-colors"
              >
                <span className="text-sm">🎭</span>
                <span>{avatarCertificateCount} шт</span>
              </div>
              {onOpenFeedback && (
                <button
                  onClick={() => {
                    sounds.playTick();
                    onOpenFeedback();
                  }}
                  title="Связь с Администратором: сообщить о баге или предложить идею (награда кр.)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900 border border-amber-600/70 text-amber-300 font-bold text-xs transition-colors shadow-sm cursor-pointer"
                >
                  <span>💡</span>
                  <span className="hidden sm:inline">Связь с Доном</span>
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= MOBILE TOP HEADER (md:hidden) ================= */}
        <div className="md:hidden bg-gradient-to-r from-[#171824] via-[#141520] to-[#12131a] border-b border-zinc-850 px-3 py-2.5 flex flex-col gap-2 shrink-0">
          {/* Top Line: Avatar + User Info + Admin / Feedback / Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => { setActiveTab('avatar'); sounds.playTick(); }}
                title="Нажмите, чтобы сменить аватар профиля"
                className="relative group w-10 h-10 rounded-xl bg-gradient-to-br from-purple-900 via-indigo-900 to-amber-950 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-purple-950/40 border border-purple-500/40 shrink-0 cursor-pointer overflow-hidden transition-all active:scale-95"
              >
                <span className="text-lg drop-shadow-md">
                  {user.avatarSeed && user.avatarSeed.length <= 4 ? user.avatarSeed : user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-purple-300 font-bold transition-opacity">
                  <Camera className="w-4 h-4 text-purple-300" />
                </div>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-bold text-white tracking-tight truncate max-w-[140px]">
                    {user.displayName}
                  </h3>
                  {user.clanTag && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300 text-[9px] font-mono font-black shrink-0">
                      [{user.clanTag}]
                    </span>
                  )}
                  {user.equippedCosmetics?.title && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-950/70 border border-amber-600/60 text-amber-300 text-[9px] font-bold truncate max-w-[90px]">
                      {user.equippedCosmetics.title}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5 truncate">
                  <span className="text-amber-400 font-mono font-bold">{levelInfo.badgeIcon} Ур. {levelInfo.level}</span>
                  <span>•</span>
                  <span className="truncate">{levelInfo.title}</span>
                </div>
              </div>
            </div>

            {/* Quick Top Right Icons: SuperAdmin, Feedback, Close */}
            <div className="flex items-center gap-1 shrink-0">
              {isSuperAdmin && onOpenAdmin && (
                <button
                  onClick={() => {
                    sounds.playTick();
                    onOpenAdmin();
                  }}
                  title="Панель Администратора"
                  className="p-1.5 rounded-lg bg-amber-950/80 border border-amber-600/70 text-amber-300 hover:text-white"
                >
                  <Crown className="w-4 h-4 text-amber-400" />
                </button>
              )}

              {onOpenFeedback && (
                <button
                  onClick={() => {
                    sounds.playTick();
                    onOpenFeedback();
                  }}
                  title="Связь с Администратором"
                  className="p-1.5 rounded-lg bg-amber-950/70 border border-amber-600/70 text-amber-300 hover:text-white"
                >
                  <span className="text-xs">💡</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-850 border border-zinc-750 transition-colors cursor-pointer"
                title="Закрыть профиль"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Stats & Balances Ribbon (Horizontal swipeable on mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
            {/* Daily Streak Pill */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('streak');
                sounds.playTick();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-[11px] shrink-0 transition-all cursor-pointer ${
                streakInfo.claimedToday
                  ? 'bg-orange-950/40 border-orange-700/60 text-orange-300'
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white animate-pulse shadow-sm shadow-orange-950/50'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${streakInfo.claimedToday ? 'text-amber-400' : 'text-yellow-200 fill-current'}`} />
              <span>{streakInfo.streak > 0 ? `${streakInfo.streak} дн.` : 'Бонус'}</span>
              {!streakInfo.claimedToday && (
                <span className="text-[9px] bg-black/40 px-1 rounded text-yellow-300">
                  +{streakInfo.todayRewardCredits}
                </span>
              )}
            </button>

            {/* Credits Pill */}
            <div 
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/50 border border-amber-800/60 text-amber-300 font-bold text-[11px] shrink-0"
              title="Внутриигровые кредиты"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{userCredits} кр</span>
            </div>

            {/* Elo Rating Pill */}
            <button
              type="button"
              onClick={() => { setActiveTab('history'); sounds.playTick(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-750 text-amber-400 font-mono font-bold text-[11px] shrink-0 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>{stats.rating} Elo</span>
            </button>

            {/* Role Mastery Pill */}
            <button
              type="button"
              onClick={() => { setActiveTab('mastery'); sounds.playTick(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-750 text-amber-300 font-mono font-bold text-[11px] shrink-0 cursor-pointer"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>{masterySummary.masteredCount > 0 ? `${masterySummary.masteredCount} знач.` : 'Мастерство'}</span>
            </button>

            {/* Certs Pill */}
            <button
              type="button"
              onClick={() => { setActiveTab('nickname'); sounds.playTick(); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-800/60 text-blue-300 font-bold text-[11px] shrink-0 cursor-pointer"
            >
              <span>📜</span>
              <span>{certificateCount} шт</span>
            </button>
          </div>

          {/* Quick Experience Bar Strip (Clickable to open Experience tab) */}
          <div
            onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#11121a] border border-zinc-800/80 cursor-pointer active:scale-[0.99] transition-all"
            title="Открыть шкалу опыта"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[10px] font-mono leading-none mb-1">
                <span className="text-zinc-300 font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Ур. {levelInfo.level}</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-amber-400 truncate">{levelInfo.title}</span>
                </span>
                <span className="text-amber-400 font-bold">{levelInfo.progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 rounded-full"
                  style={{ width: `${Math.max(3, levelInfo.progressPercent)}%` }}
                />
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          </div>
        </div>

        {/* ================= MOBILE NAVIGATION BAR & HORIZONTAL TAB STRIP (md:hidden) ================= */}
        <div className="md:hidden bg-[#101117] border-b border-zinc-850 px-2.5 py-1.5 flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar scroll-smooth">
          {/* Quick All Sections Drawer Button */}
          <button
            onClick={() => {
              sounds.playTick();
              setIsMobileSectionsDrawerOpen(true);
            }}
            className="h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-750 text-amber-400 font-bold text-xs flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-sm cursor-pointer"
            title="Все разделы профиля"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-mono font-bold">Разделы</span>
            <span className="text-[9px] font-mono px-1 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60">
              {profileTabsConfig.length}
            </span>
          </button>

          <div className="w-px h-5 bg-zinc-800 shrink-0" />

          {/* Scrollable Tabs */}
          {profileTabsConfig.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  sounds.playTick();
                  setActiveTab(tab.id);
                }}
                className={`h-8 px-2.5 rounded-lg border text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-600 to-amber-600 border-orange-400/80 text-white shadow-sm shadow-orange-950/40'
                    : 'bg-[#14151e] border-zinc-800/90 text-zinc-300 hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                <span>{tab.shortTitle}</span>
                {tab.isAlert ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                ) : (
                  <span className={`text-[9px] font-mono px-1 rounded ${
                    isActive ? 'bg-black/30 text-white' : 'bg-black/40 text-zinc-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ================= DESKTOP TAB NAVIGATION (hidden on mobile, md:flex) ================= */}
        <div className="hidden md:flex border-b border-zinc-800 px-6 bg-[#13141d] shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'experience'
                ? 'border-amber-500 text-white bg-amber-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Шкала опыта (Ур. {levelInfo.level})</span>
          </button>

          <button
            onClick={() => { setActiveTab('inventory'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'inventory'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-orange-400" />
            <span>Инвентарь ({inventory.reduce((acc, i) => acc + i.quantity, 0)})</span>
          </button>

          <button
            onClick={() => { setActiveTab('friends'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'friends'
                ? 'border-amber-500 text-white bg-amber-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>Друзья</span>
          </button>

          <button
            onClick={() => { setActiveTab('mastery'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'mastery'
                ? 'border-amber-500 text-white bg-amber-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Мастерство ролей {masterySummary.masteredCount > 0 ? `(👑 ${masterySummary.masteredCount})` : ''}</span>
          </button>

          <button
            onClick={() => { setActiveTab('webrtc'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'webrtc'
                ? 'border-indigo-500 text-white bg-indigo-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-indigo-400" />
            <span>Видеосвязь WebRTC</span>
          </button>

          <button
            onClick={() => { setActiveTab('language'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'language'
                ? 'border-amber-500 text-white bg-amber-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('profile.tab_language', 'Язык и Настройки')}</span>
          </button>

          <button
            onClick={() => { setActiveTab('nickname'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'nickname'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-400" />
            <span>Смена никнейма</span>
          </button>

          <button
            onClick={() => { setActiveTab('catalog'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'catalog'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>Все предметы ({ITEMS_LIST.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'history'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5 text-orange-400" />
            <span>История игр {stats.gamesPlayed > 0 ? `(${stats.gamesPlayed})` : ''}</span>
          </button>

          <button
            onClick={() => { setActiveTab('stats'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'stats'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-yellow-400" />
            <span>Статистика</span>
          </button>

          <button
            onClick={() => { setActiveTab('streak'); sounds.playTick(); }}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeTab === 'streak'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-orange-400 fill-current" />
            <span>Серия входов (🔥 {streakInfo.streak} дн.)</span>
            {!streakInfo.claimedToday && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500 text-zinc-950 font-black animate-pulse">
                +{streakInfo.todayRewardCredits}
              </span>
            )}
          </button>
        </div>

        {/* Global Feedback notification */}
        {actionFeedback && (
          <div className={`px-6 py-2 text-xs font-bold text-center border-b ${
            actionFeedback.type === 'success' 
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}>
            {actionFeedback.text}
          </div>
        )}

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 font-sans">
          
          {/* TAB 0: EXPERIENCE SCALE (ШКАЛА ОПЫТА И УРОВНИ ИГРОКА) */}
          {activeTab === 'experience' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              
              {/* Hero Level & Experience Scale Card */}
              <div className={`p-5 rounded-3xl bg-gradient-to-r ${levelInfo.bgGradient} border ${levelInfo.borderColor} shadow-xl relative overflow-hidden`}>
                <div className="absolute -right-8 -top-8 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                  {/* Left: Level Emblem & Title */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-black/40 border border-amber-500/60 flex items-center justify-center text-3xl shadow-xl shrink-0">
                      {levelInfo.badgeIcon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-black text-white">
                          Уровень {levelInfo.level}
                        </span>
                        <span className="text-sm font-bold text-amber-300">
                          • {levelInfo.title}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-black/50 border border-amber-500/50 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                          Лига {levelInfo.tier}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 max-w-md">
                        Шкала опыта отображает ваш игровой авторитет в Городе. Зарабатывайте XP за действия в партии и открывайте новые звания!
                      </p>
                    </div>
                  </div>

                  {/* Right: Total Lifetime XP Counter */}
                  <div className="px-4 py-2.5 rounded-2xl bg-black/50 border border-zinc-700/80 text-right shrink-0">
                    <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      Всего очков опыта (XP)
                    </div>
                    <div className="text-lg font-mono font-black text-amber-400">
                      {levelInfo.totalXp.toLocaleString()} XP
                    </div>
                  </div>
                </div>

                {/* The Main Experience Bar (Шкала опыта) */}
                <div className="mt-5 space-y-2 relative z-10">
                  <div className="flex items-center justify-between text-xs font-mono font-bold">
                    <span className="text-zinc-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Прогресс уровня:</span>
                      <strong className="text-amber-400">{levelInfo.xpInCurrentLevel} / {levelInfo.xpNeededForNextLevel} XP</strong>
                    </span>
                    <span className="text-amber-400">
                      {levelInfo.progressPercent}%
                    </span>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="w-full h-4 bg-black/60 rounded-full overflow-hidden border border-zinc-700/90 relative p-0.5 shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 rounded-full transition-all duration-700 shadow-sm shadow-amber-500/50 relative"
                      style={{ width: `${Math.max(2, levelInfo.progressPercent)}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <span>Начало ур. {levelInfo.level} ({levelInfo.currentLevelXp} XP)</span>
                    <span className="text-amber-300 font-bold">До ур. {levelInfo.level + 1}: осталось {levelInfo.remainingXpToNextLevel} XP</span>
                    <span>Ур. {levelInfo.level + 1} ({levelInfo.nextLevelXp} XP)</span>
                  </div>
                </div>

                {/* 4 Quick Stat Cards */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 relative z-10">
                  <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Текущий ранг</div>
                    <div className="text-xs font-bold text-white mt-0.5 truncate">{levelInfo.title}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Опыт в ранге</div>
                    <div className="text-xs font-bold text-amber-400 mt-0.5 font-mono">{levelInfo.xpInCurrentLevel} XP</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">До следующего</div>
                    <div className="text-xs font-bold text-orange-400 mt-0.5 font-mono">{levelInfo.remainingXpToNextLevel} XP</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Процент шкалы</div>
                    <div className="text-xs font-bold text-yellow-300 mt-0.5 font-mono">{levelInfo.progressPercent}%</div>
                  </div>
                </div>
              </div>

              {/* Promo Banner: Quests & Events XP */}
              {onOpenTasks && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/60 via-[#181926] to-indigo-950/50 border border-amber-600/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-900/60 border border-amber-500/60 flex items-center justify-center text-xl shrink-0">
                      🎯
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">Бонусный опыт за выполнение задач и ивентов</h4>
                      <p className="text-[11px] text-zinc-300 mt-0.5">
                        Выполняйте общие, вводные, личные и клановые задачи, чтобы быстрее повышать уровень и открывать ранги!
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sounds.playTick();
                      onOpenTasks();
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs uppercase tracking-wider shrink-0 transition-all shadow-md shadow-amber-950/40"
                  >
                    Квесты и Ивенты
                  </button>
                </div>
              )}

              {/* SECTION: КАК ПОЛУЧАТЬ ОЧКИ ОПЫТА В ИГРЕ */}
              <div className="p-5 rounded-2xl bg-[#141521] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>Как получать очки опыта за действия в партии</span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Очки опыта зачисляются в режиме реального времени за результативные действия и повышают вашу шкалу
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {activeActionRules.map(action => (
                    <div 
                      key={action.id}
                      className="p-3 rounded-xl bg-[#10111a] border border-zinc-850 flex items-start justify-between gap-2.5 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-xl shrink-0 mt-0.5">{action.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-white leading-snug">{action.name}</div>
                          <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{action.description}</div>
                        </div>
                      </div>
                      <div className="px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-600/70 text-amber-300 font-mono font-black text-xs shrink-0">
                        +{action.xp} XP
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION: ДОРОЖНАЯ КАРТА УРОВНЕЙ И НАГРАД (ROADMAP) */}
              <div className="p-5 rounded-2xl bg-[#141521] border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span>Дорожная карта рангов и званий Города (Уровни 1 — {expConfig.maxLevel || activeMilestones.length})</span>
                    </h4>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Достигайте новых отметок шкалы опыта, чтобы подтверждать свой авторитет
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 max-h-[380px] overflow-y-auto pr-1">
                  {activeMilestones.map(milestone => {
                    const isReached = levelInfo.level >= milestone.level;
                    const isCurrent = levelInfo.level === milestone.level;

                    return (
                      <div 
                        key={milestone.level}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isCurrent
                            ? 'bg-gradient-to-r from-amber-950/60 to-yellow-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                            : isReached
                            ? 'bg-[#10111a] border-emerald-800/60'
                            : 'bg-[#0f1017]/70 border-zinc-850 opacity-75'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                            isCurrent ? 'bg-amber-950 border border-amber-400' : isReached ? 'bg-emerald-950/80 border border-emerald-700' : 'bg-zinc-900 border border-zinc-800'
                          }`}>
                            {milestone.badgeIcon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white truncate">
                                Ур. {milestone.level} · {milestone.title}
                              </span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-zinc-950 text-[9px] font-black font-mono">
                                  ВЫ ЗДЕСЬ
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                              {milestone.perkDescription}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[10px] font-mono text-zinc-400">
                            {milestone.requiredXp.toLocaleString()} XP
                          </div>
                          {isReached ? (
                            <span className="text-[10px] font-bold text-emerald-400 font-mono">✓ Получено</span>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-mono">🔒 Заблокировано</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* TAB 1: INVENTORY (РЮКЗАК ИГРОКА) */}
          {activeTab === 'inventory' && (
            <div className="space-y-4">
              
              {/* Daily Streak Highlight Banner inside Inventory */}
              <div 
                onClick={() => {
                  setActiveTab('streak');
                  sounds.playTick();
                }}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  streakInfo.canClaimToday
                    ? 'bg-gradient-to-r from-orange-950/60 via-amber-950/50 to-[#161724] border-orange-500/80 shadow-md shadow-orange-950/30 hover:border-orange-400'
                    : 'bg-[#151622] border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl shrink-0 ${streakInfo.canClaimToday ? 'bg-orange-600 text-white animate-bounce' : 'bg-orange-950/80 text-orange-400'}`}>
                    <Flame className="w-5 h-5 fill-current text-yellow-200" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white uppercase font-mono">
                        Серия ежедневных входов: {streakInfo.streak} {streakInfo.streak === 1 ? 'день' : streakInfo.streak < 5 ? 'дня' : 'дней'}
                      </span>
                      {streakInfo.canClaimToday ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-zinc-950 text-[10px] font-black font-mono animate-pulse">
                          ДОСТУПНА НАГРАДА
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 text-[10px] font-mono">
                          СЕГОДНЯ ЗАБРАНО
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-zinc-400 block mt-0.5">
                      {streakInfo.canClaimToday 
                        ? `Заберите награду за День ${streakInfo.targetDay} (+${streakInfo.todayRewardCredits} кр)!` 
                        : `Серия активна! Завтра вас ждет День ${streakInfo.nextDay} (+${streakInfo.nextRewardCredits} кр)`}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs tracking-tight transition-colors shrink-0 shadow-sm"
                >
                  {streakInfo.canClaimToday ? 'Забрать' : 'Обзор'}
                </button>
              </div>
              {/* Category Filter Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                      selectedCategory === 'all'
                        ? 'bg-orange-600 text-white'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    Все
                  </button>
                  {Object.entries(CATEGORY_CONFIG).map(([catKey, cat]) => (
                    <button
                      key={catKey}
                      onClick={() => setSelectedCategory(catKey as ItemCategory)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 cursor-pointer ${
                        selectedCategory === catKey
                          ? 'bg-orange-600 text-white font-bold'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                {onOpenShop && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenShop();
                    }}
                    className="text-xs font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1"
                  >
                    <span>Перейти в магазин</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Items Grid */}
              {filteredInventory.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#151620] border border-dashed border-zinc-800 text-center space-y-3">
                  <Package className="w-10 h-10 text-zinc-600 mx-auto" />
                  <div className="text-sm font-bold text-zinc-300">Инвентарь пуст в этой категории</div>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Вы можете приобрести сундуки, сертификаты и косметику в Магазине Города за кредиты.
                  </p>
                  {onOpenShop && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenShop();
                      }}
                      className="mt-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                    >
                      Открыть Магазин
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredInventory.map(invItem => {
                    const itemDef = ALL_GAME_ITEMS[invItem.itemId];
                    if (!itemDef) return null;
                    const rarity = RARITY_CONFIG[itemDef.rarity];
                    const isEquipped = itemDef.cosmeticType === 'title' 
                      ? user.equippedCosmetics?.title === itemDef.name
                      : itemDef.cosmeticType === 'ui_skin'
                        ? user.equippedCosmetics?.uiSkin === itemDef.id.replace('skin_', '')
                        : user.equippedCosmetics?.cardBack === itemDef.id;

                    return (
                      <div
                        key={invItem.itemId}
                        className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${rarity.bg} ${rarity.border}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-3xl p-2 rounded-xl bg-black/40 border border-white/10 shrink-0">
                            {itemDef.icon}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`text-[10px] uppercase font-mono font-bold ${rarity.color}`}>
                                {rarity.label}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-black/60 text-zinc-200 text-[10px] font-mono font-bold">
                                {invItem.quantity} шт
                              </span>
                            </div>

                            <h4 className="text-xs font-bold text-white tracking-tight truncate mt-0.5">
                              {itemDef.name}
                            </h4>
                            <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-tight">
                              {itemDef.description}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                          {itemDef.id === ROLE_SELECT_CARD_ID ? (
                            <div className="flex-1 py-1.5 px-3 rounded-xl bg-amber-950/70 border border-amber-600/60 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                              <span>🎴 Активируется в лобби перед игрой</span>
                            </div>
                          ) : itemDef.id === NICKNAME_CHANGE_CERTIFICATE_ID ? (
                            <button
                              onClick={() => handleUseItem(itemDef.id)}
                              className="flex-1 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-950/40"
                            >
                              <span>Сменить никнейм</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          ) : itemDef.category === 'chests' ? (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleUseItem(itemDef.id)}
                              className="flex-1 py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-orange-950/40"
                            >
                              <Gift className="w-3.5 h-3.5" />
                              <span>Открыть сундук</span>
                            </button>
                          ) : itemDef.category === 'cosmetics' ? (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleUseItem(itemDef.id)}
                              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                                isEquipped
                                  ? 'bg-emerald-950/80 border border-emerald-600 text-emerald-300'
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                              }`}
                            >
                              {isEquipped ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Sparkles className="w-3.5 h-3.5" />}
                              <span>{isEquipped ? 'Экипировано' : 'Экипировать'}</span>
                            </button>
                          ) : itemDef.pawnValue ? (
                            <button
                              disabled={actionLoading}
                              onClick={() => handlePawnItem(itemDef.id)}
                              className="flex-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Scale className="w-3.5 h-3.5 text-amber-400" />
                              <span>Сдать в ломбард (+{itemDef.pawnValue} кр)</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NICKNAME CHANGE (СМЕНА НИКНЕЙМА СЕРТИФИКАТОМ / КРЕДИТАМИ) */}
          {activeTab === 'nickname' && (
            <div className="space-y-5 max-w-lg mx-auto">
              <div className="p-4 rounded-2xl bg-[#161724] border border-zinc-800 space-y-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-600/50 flex items-center justify-center text-blue-400 mx-auto">
                  <Edit3 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">Смена игрового никнейма</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Стоимость смены никнейма по умолчанию составляет <span className="text-amber-400 font-bold">{DEFAULT_NICKNAME_CHANGE_COST} кредитов</span>. 
                  Если у вас есть «Сертификат на смену никнейма», вы можете сменить имя <span className="text-emerald-400 font-bold">бесплатно</span>.
                </p>
              </div>

              {nameSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{nameSuccess}</span>
                </div>
              )}

              {nameError && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{nameError}</span>
                </div>
              )}

              <form onSubmit={handleChangeNickname} className="space-y-4">
                {/* Input New Nickname */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                    Новый никнейм:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    placeholder="Введите новое имя..."
                    className="w-full bg-zinc-900/90 border border-zinc-700 focus:border-orange-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none font-semibold transition-colors"
                  />
                  <div className="flex justify-between text-[11px] text-zinc-400 px-1">
                    <span>От 2 до 30 символов</span>
                    <span>Текущее: {user.displayName}</span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                    Способ оплаты:
                  </label>

                  {/* Option 1: Certificate */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('certificate')}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      paymentMethod === 'certificate'
                        ? 'bg-blue-950/50 border-blue-500 shadow-md shadow-blue-950/40'
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">📜</div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Сертификат на смену никнейма</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-950 border border-blue-800 text-blue-300 text-[10px]">
                            Бесплатно
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          В вашем инвентаре: <span className="font-bold text-blue-300">{certificateCount} шт.</span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      paymentMethod === 'certificate' ? 'border-blue-400 bg-blue-600' : 'border-zinc-700'
                    }`}>
                      {paymentMethod === 'certificate' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>

                  {/* Option 2: Credits */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credits')}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      paymentMethod === 'credits'
                        ? 'bg-amber-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-800 flex items-center justify-center text-amber-400">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Внутриигровые кредиты ({DEFAULT_NICKNAME_CHANGE_COST} кр)</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Ваш баланс: <span className="font-bold text-amber-300">{userCredits} кр</span>
                          {userCredits < DEFAULT_NICKNAME_CHANGE_COST && (
                            <span className="text-rose-400 ml-1.5 font-semibold">(недостаточно)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      paymentMethod === 'credits' ? 'border-amber-400 bg-amber-600' : 'border-zinc-700'
                    }`}>
                      {paymentMethod === 'credits' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={loadingName}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2"
                >
                  {loadingName ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Обновление...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Подтвердить смену никнейма</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB: AVATAR CHANGE (СМЕНА АВАТАРА СЕРТИФИКАТОМ / КРЕДИТАМИ) */}
          {activeTab === 'avatar' && (
            <div className="space-y-5 max-w-xl mx-auto">
              <div className="p-4 rounded-2xl bg-[#161724] border border-zinc-800 space-y-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-purple-950/60 border border-purple-600/50 flex items-center justify-center text-purple-400 mx-auto">
                  <Camera className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">Смена аватара профиля</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Стоимость смены аватара составляет <span className="text-amber-400 font-bold">{DEFAULT_AVATAR_CHANGE_COST} кредитов</span>. 
                  Если у вас есть одноразовый «Сертификат на смену аватара», вы можете обновить свой облик <span className="text-purple-300 font-bold">бесплатно</span>.
                </p>
              </div>

              {avatarSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{avatarSuccess}</span>
                </div>
              )}

              {avatarError && (
                <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{avatarError}</span>
                </div>
              )}

              <form onSubmit={handleChangeAvatar} className="space-y-4">
                {/* Avatar Preview & Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                    Выберите стиль или иконку аватара:
                  </label>

                  {/* Preset Gangster & Noir Icons Grid */}
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 p-2 rounded-2xl bg-zinc-900/90 border border-zinc-800">
                    {[
                      { icon: '🎩', label: 'Дон' },
                      { icon: '🕶️', label: 'Босс' },
                      { icon: '⭐', label: 'Шериф' },
                      { icon: '💋', label: 'Красотка' },
                      { icon: '💉', label: 'Доктор' },
                      { icon: '🔪', label: 'Маньяк' },
                      { icon: '🛡️', label: 'Охрана' },
                      { icon: '🥃', label: 'Гангстер' },
                      { icon: '💼', label: 'Дипломат' },
                      { icon: '🎭', label: 'Облик' },
                      { icon: '🔱', label: 'Дьявол' },
                      { icon: '🚬', label: 'Барон' },
                      { icon: '🕵️', label: 'Агент' },
                      { icon: '🦅', label: 'Орёл' },
                      { icon: '👑', label: 'Король' },
                      { icon: '🔥', label: 'Капо' }
                    ].map(preset => {
                      const isSelected = newAvatarSeed === preset.icon;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setNewAvatarSeed(preset.icon);
                            sounds.playTick();
                          }}
                          className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-purple-950/80 border-2 border-purple-500 shadow-md shadow-purple-950/60 scale-105'
                              : 'bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-800 hover:border-zinc-600'
                          }`}
                        >
                          <span className="text-2xl">{preset.icon}</span>
                          <span className="text-[9px] font-bold text-zinc-400 mt-1 truncate max-w-full">
                            {preset.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Seed / URL / Emoji Input */}
                  <div className="pt-2 space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Или введите произвольный текст / эмодзи / код аватара:
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        required
                        maxLength={50}
                        value={newAvatarSeed}
                        onChange={e => setNewAvatarSeed(e.target.value)}
                        placeholder="Например: 🎩 или MrMafia..."
                        className="flex-1 bg-zinc-900/90 border border-zinc-700 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none font-semibold transition-colors"
                      />
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-800 to-indigo-900 border border-purple-500/50 flex items-center justify-center text-xl text-white shadow-md shrink-0">
                        {newAvatarSeed || '❓'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                    Способ оплаты:
                  </label>

                  {/* Option 1: Certificate */}
                  <button
                    type="button"
                    onClick={() => setAvatarPaymentMethod('certificate')}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      avatarPaymentMethod === 'certificate'
                        ? 'bg-purple-950/50 border-purple-500 shadow-md shadow-purple-950/40'
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">🎭</div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Сертификат на смену аватара</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-950 border border-purple-800 text-purple-300 text-[10px]">
                            Бесплатно
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          В вашем инвентаре: <span className="font-bold text-purple-300">{avatarCertificateCount} шт.</span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      avatarPaymentMethod === 'certificate' ? 'border-purple-400 bg-purple-600' : 'border-zinc-700'
                    }`}>
                      {avatarPaymentMethod === 'certificate' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>

                  {/* Option 2: Credits */}
                  <button
                    type="button"
                    onClick={() => setAvatarPaymentMethod('credits')}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      avatarPaymentMethod === 'credits'
                        ? 'bg-amber-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                        : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-800 flex items-center justify-center text-amber-400">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Внутриигровые кредиты ({DEFAULT_AVATAR_CHANGE_COST} кр)</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Ваш баланс: <span className="font-bold text-amber-300">{userCredits} кр</span>
                          {userCredits < DEFAULT_AVATAR_CHANGE_COST && (
                            <span className="text-rose-400 ml-1.5 font-semibold">(недостаточно)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      avatarPaymentMethod === 'credits' ? 'border-amber-400 bg-amber-600' : 'border-zinc-700'
                    }`}>
                      {avatarPaymentMethod === 'credits' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={loadingAvatar}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-amber-600 hover:from-purple-500 hover:to-amber-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-purple-950/40 flex items-center justify-center gap-2"
                >
                  {loadingAvatar ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Обновление аватара...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Подтвердить смену аватара</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: COMPLETE ITEMS CATALOG (СКВОЗНОЙ КАТАЛОГ ВСЕХ ПРЕДМЕТОВ) */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-2 justify-between">
                {/* Search input */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    placeholder="Поиск по предметам..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-700"
                  />
                </div>

                {/* Category filters */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto">
                  <button
                    onClick={() => setCatalogCategory('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      catalogCategory === 'all'
                        ? 'bg-amber-600 text-white'
                        : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                    }`}
                  >
                    Все ({ITEMS_LIST.length})
                  </button>
                  {Object.entries(CATEGORY_CONFIG).map(([k, c]) => (
                    <button
                      key={k}
                      onClick={() => setCatalogCategory(k as ItemCategory)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors shrink-0 ${
                        catalogCategory === k
                          ? 'bg-amber-600 text-white font-bold'
                          : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white'
                      }`}
                    >
                      <span>{c.icon}</span>
                      <span>{c.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Catalog list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredCatalog.map(item => {
                  const rarity = RARITY_CONFIG[item.rarity];
                  const inUserInventory = inventory.find(i => i.itemId === item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItemDetail(item)}
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all hover:scale-[1.01] ${rarity.bg} ${rarity.border}`}
                    >
                      <div className="text-3xl p-2 rounded-xl bg-black/40 border border-white/10 shrink-0">
                        {item.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[10px] uppercase font-mono font-bold ${rarity.color}`}>
                            {rarity.label}
                          </span>
                          {inUserInventory && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[9px] font-bold">
                              В наличии: {inUserInventory.quantity}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-white tracking-tight truncate mt-0.5">
                          {item.name}
                        </h4>
                        <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-tight">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono">
                          <span className="text-amber-400 font-bold">Магазин: {item.cost} кр</span>
                          {item.pawnValue && (
                            <span className="text-zinc-400">Ломбард: {item.pawnValue} кр</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: FRIENDS & SOCIAL SYSTEM */}
          {activeTab === 'friends' && (
            <FriendsView
              user={user}
              currentRoomCode={currentRoomCode}
              onJoinRoom={onJoinRoom}
              onCloseParentModal={onClose}
            />
          )}

          {/* TAB 4: ROLE MASTERY PROGRESSION SYSTEM & BADGES */}
          {activeTab === 'mastery' && (
            <RoleMasteryView user={user} onUpdateUser={onUpdateUser} />
          )}

          {/* TAB 5: GAME HISTORY & RECENT MATCHES SUMMARY */}
          {activeTab === 'history' && (
            <GameHistoryView user={user} />
          )}

          {/* TAB 5: DETAILED STATS, CHARTS & PROGRESSION */}
          {activeTab === 'stats' && (
            <DetailedStatsView user={user} />
          )}

          {/* TAB 5: DAILY STREAK & CONSECUTIVE LOGIN BONUSES */}
          {activeTab === 'streak' && (
            <div className="space-y-4">
              <DailyStreakWidget
                user={user}
                onUpdateUser={onUpdateUser}
                onOpenBonusModal={onOpenBonus}
                variant="profile_full"
              />
            </div>
          )}

          {/* TAB 6: WEBRTC P2P AUDIO & VIDEO SETTINGS */}
          {activeTab === 'webrtc' && (
            <div className="p-2 sm:p-4 max-w-2xl mx-auto">
              <WebRtcSettingsPanel
                settings={webrtcSettings}
                onUpdateSettings={(partial) => {
                  const updated = { ...webrtcSettings, ...partial };
                  setWebrtcSettings(updated);
                  saveWebRtcSettings(updated);
                }}
              />
            </div>
          )}

          {/* TAB 7: LANGUAGE & PREFERENCES */}
          {activeTab === 'language' && (
            <div className="p-2 sm:p-4 max-w-2xl mx-auto space-y-6">
              <div className="p-5 rounded-2xl bg-[#161722] border border-zinc-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {t('profile.language_heading', 'Языковые предпочтения')}
                    </h4>
                    <p className="text-xs text-zinc-400">
                      {t('profile.language_subheading', 'Выберите предпочтительный язык для вашего профиля и сообщений')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {languages.map((item) => {
                    const isSelected = language === item.code;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          sounds.playTick();
                          setLanguage(item.code);
                          if (onUpdateUser && user) {
                            onUpdateUser({
                              ...user,
                              preferredLanguage: item.code
                            });
                          }
                          setActionFeedback({
                            type: 'success',
                            text: t('profile.save_success', 'Настройки успешно сохранены')
                          });
                          setTimeout(() => setActionFeedback(null), 2500);
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 text-amber-200 shadow-md ring-1 ring-amber-500/50'
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl leading-none">{item.flag}</span>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{item.nativeName}</span>
                              <span className="text-[10px] text-zinc-400 font-normal">({item.name})</span>
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono">ISO: {item.code.toUpperCase()}</div>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-zinc-700/60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="p-3 sm:p-4 bg-[#12131b] border-t border-zinc-800 flex justify-between items-center shrink-0 gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Выйти из аккаунта</span>
              <span className="sm:hidden">Выйти</span>
            </button>

            {isSuperAdmin && onOpenAdmin && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAdmin();
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-950/70 border border-amber-600/70 text-amber-300 hover:text-white hover:bg-amber-900/60 text-xs font-bold transition-colors cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Панель Администратора</span>
                <span className="sm:hidden">Админка</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 sm:px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>

        {/* CHEST UNBOXING CELEBRATION MODAL */}
        {unboxedLoot && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-full max-w-sm bg-[#161724] border border-amber-600/70 rounded-3xl p-6 text-center shadow-2xl shadow-amber-950/80 space-y-4">
              <div className="text-5xl animate-bounce">🎁</div>
              <h3 className="text-lg font-bold text-white">Сундук открыт!</h3>
              <p className="text-xs text-amber-200 leading-relaxed font-medium bg-amber-950/40 p-3 rounded-xl border border-amber-800/50">
                {unboxedLoot.message}
              </p>
              <button
                onClick={() => {
                  setUnboxedLoot(null);
                  sounds.playTick();
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs transition-colors shadow-lg shadow-orange-950/40"
              >
                Отлично!
              </button>
            </div>
          </div>
        )}

        {/* ================= MOBILE ALL SECTIONS BOTTOM DRAWER ================= */}
        {isMobileSectionsDrawerOpen && (
          <div className="fixed inset-0 z-60 flex flex-col justify-end bg-black/85 backdrop-blur-xs select-none md:hidden animate-in fade-in duration-150">
            <div 
              className="absolute inset-0"
              onClick={() => setIsMobileSectionsDrawerOpen(false)}
            />
            <div className="relative w-full max-h-[85vh] bg-[#101118] border-t border-zinc-700/80 rounded-t-3xl shadow-2xl p-4 space-y-3.5 overflow-y-auto z-10 animate-in slide-in-from-bottom duration-200">
              
              {/* Drag Handle */}
              <div className="w-10 h-1.5 bg-zinc-700 rounded-full mx-auto -mt-1 mb-1" />

              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    Разделы профиля
                  </h3>
                  <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-700/60">
                    {profileTabsConfig.length} РАЗДЕЛОВ
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileSectionsDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-850 border border-zinc-750 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Player Mini-Card inside Drawer */}
              <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-950/30 via-[#141520] to-[#12131a] border border-amber-600/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{user.displayName}</div>
                    <div className="text-[10px] text-amber-400 font-mono truncate">
                      {levelInfo.badgeIcon} Ур. {levelInfo.level} · {stats.rating} Elo
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-amber-400 flex items-center justify-end gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>{userCredits} кр</span>
                  </div>
                  <div className="text-[10px] text-orange-400 font-mono font-semibold">
                    🔥 Стрик: {streakInfo.streak} дн.
                  </div>
                </div>
              </div>

              {/* Sections List */}
              <div className="space-y-1.5">
                {profileTabsConfig.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        sounds.playTick();
                        setActiveTab(tab.id);
                        setIsMobileSectionsDrawerOpen(false);
                      }}
                      className={`w-full p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-orange-950/80 to-amber-950/60 border-orange-500 text-white shadow-md'
                          : 'bg-[#14151e] border-zinc-800 text-zinc-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          isActive
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-850 text-zinc-400'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
                            {tab.title}
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate">
                            {tab.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${tab.badgeColor}`}>
                          {tab.badge}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-zinc-600'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Drawer Quick Action Footer Links */}
              <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                {onOpenShop && (
                  <button
                    onClick={() => {
                      setIsMobileSectionsDrawerOpen(false);
                      onClose();
                      onOpenShop();
                    }}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-orange-600/20 border border-orange-500/50 hover:bg-orange-600/30 text-orange-300 text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Магазин Города
                  </button>
                )}
                {onOpenTasks && (
                  <button
                    onClick={() => {
                      setIsMobileSectionsDrawerOpen(false);
                      onOpenTasks();
                    }}
                    className="flex-1 py-2 px-2.5 rounded-xl bg-amber-600/20 border border-amber-500/50 hover:bg-amber-600/30 text-amber-300 text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Задачи и Квесты
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= SELECTED ITEM DETAIL PREVIEW MODAL ================= */}
        {selectedItemDetail && (
          <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-full max-w-sm bg-[#161724] border border-zinc-700 rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl p-2.5 rounded-2xl bg-black/50 border border-white/10">
                    {selectedItemDetail.icon}
                  </div>
                  <div>
                    <span className={`text-[10px] uppercase font-mono font-bold ${RARITY_CONFIG[selectedItemDetail.rarity].color}`}>
                      {RARITY_CONFIG[selectedItemDetail.rarity].label}
                    </span>
                    <h4 className="text-sm font-bold text-white">{selectedItemDetail.name}</h4>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedItemDetail(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-850 border border-zinc-750 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed bg-black/30 p-3 rounded-xl border border-zinc-800">
                {selectedItemDetail.description}
              </p>
              {selectedItemDetail.effectDescription && (
                <div className="text-[11px] text-amber-300 bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/50 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{selectedItemDetail.effectDescription}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <span className="text-amber-400 font-bold">Цена в магазине: {selectedItemDetail.cost} кр</span>
                {selectedItemDetail.pawnValue && (
                  <span className="text-zinc-400">Ломбард: {selectedItemDetail.pawnValue} кр</span>
                )}
              </div>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
