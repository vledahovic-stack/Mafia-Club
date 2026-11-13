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
  Camera,
  Mail,
  Lock,
  Trash2,
  ShieldAlert
} from 'lucide-react';
import { AccountDeletionModal } from './AccountDeletionModal';
import { isMainAdminUser } from '../utils/accountDeletionUi';
import { useLanguage } from '../context/LanguageContext';
import { useSkin } from '../context/SkinContext';
import { WebRtcSettingsPanel } from './WebRtcSettingsPanel';
import { loadWebRtcSettings, saveWebRtcSettings } from '../utils/webrtcSettings';
import { WebRtcSettings } from '../types/webrtc';
import { sounds } from '../utils/audio';
import { 
  getItemDefinition,
  getDynamicItemsList,
  syncItemsCatalog,
  subscribeItemsCatalog,
  DEFAULT_NICKNAME_CHANGE_COST, 
  DEFAULT_AVATAR_CHANGE_COST,
  NICKNAME_CHANGE_CERTIFICATE_ID, 
  AVATAR_CHANGE_CERTIFICATE_ID,
  ROLE_SELECT_CARD_ID,
  PREMIUM_CERTIFICATE_ITEM_ID,
  RARITY_CONFIG, 
  CATEGORY_CONFIG,
  ItemDefinition,
  ItemCategory,
  ItemRarity,
  UserInventoryItem,
  LootboxMediaAssetRecord,
  LootboxRuleSnapshot,
  LootboxSoundCategory
} from '../data/items';
import {
  LootboxOpenModal,
  getPendingLootboxStorageKey,
  PendingLootboxOperationRecord,
  ServerLootboxOpenRewardPayload
} from './LootboxOpenModal';

import { FriendsView } from './FriendsView';
import { getUserMasterySummary } from '../data/mastery';
import { calculateDailyStreak } from '../utils/streak';
import { 
  calculateLevelInfo, 
  getRuntimeExperienceConfig, 
  subscribeToExperienceConfig, 
  fetchExperienceConfig 
} from '../utils/experience';

import {
  ProfileMainScreen,
  ProfileScreenHeader,
  ProfilePrimaryScreenId
} from './ProfileMainScreen';
import { PlayerInventoryScreen } from './PlayerInventoryScreen';
import {
  PlayerProgressStatsScreen,
  ProgressSectionTabId
} from './PlayerProgressStatsScreen';
import { UserAvatarGallerySection } from './UserAvatarGallerySection';

export type ProfileTab =
  | 'main'
  | 'inventory'
  | 'progress'
  | 'friends'
  | 'promocodes'
  | 'account'
  | 'experience'
  | 'mastery'
  | 'history'
  | 'stats'
  | 'achievements'
  | 'email'
  | 'nickname'
  | 'avatar'
  | 'catalog'
  | 'streak'
  | 'webrtc'
  | 'language';

export type ProgressSubTab = ProgressSectionTabId;
export type InventorySubView = 'items' | 'catalog';

export function resolveInitialProfileNavigation(initialTab?: ProfileTab): {
  screen: ProfilePrimaryScreenId;
  progressSubTab: ProgressSubTab;
  inventorySubView: InventorySubView;
} {
  switch (initialTab) {
    case 'inventory':
      return { screen: 'inventory', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'catalog':
      return { screen: 'inventory', progressSubTab: 'experience', inventorySubView: 'catalog' };
    case 'progress':
    case 'experience':
    case 'streak':
      return { screen: 'progress', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'stats':
      return { screen: 'progress', progressSubTab: 'stats', inventorySubView: 'items' };
    case 'mastery':
      return { screen: 'progress', progressSubTab: 'mastery', inventorySubView: 'items' };
    case 'history':
      return { screen: 'progress', progressSubTab: 'history', inventorySubView: 'items' };
    case 'achievements':
      return { screen: 'progress', progressSubTab: 'achievements', inventorySubView: 'items' };
    case 'friends':
      return { screen: 'friends', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'promocodes':
      return { screen: 'promocodes', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'account':
    case 'email':
      return { screen: 'account', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'nickname':
      return { screen: 'nickname', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'avatar':
      return { screen: 'avatar', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'webrtc':
      return { screen: 'webrtc', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'language':
      return { screen: 'language', progressSubTab: 'experience', inventorySubView: 'items' };
    case 'main':
    default:
      return { screen: 'main', progressSubTab: 'experience', inventorySubView: 'items' };
  }
}

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
  isInActiveMatch?: boolean;
  initialTab?: ProfileTab;
}

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
  isInActiveMatch = false,
  initialTab = 'main'
}) => {
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState<boolean>(false);
  const initialNav = React.useMemo(() => resolveInitialProfileNavigation(initialTab), [initialTab]);
  const [activeScreen, setActiveScreen] = useState<ProfilePrimaryScreenId>(initialNav.screen);
  const [progressSubTab, setProgressSubTab] = useState<ProgressSubTab>(initialNav.progressSubTab);
  const [inventorySubView, setInventorySubView] = useState<InventorySubView>(initialNav.inventorySubView);

  const setActiveTab = React.useCallback((tab: ProfileTab) => {
    const resolved = resolveInitialProfileNavigation(tab);
    setActiveScreen(resolved.screen);
    setProgressSubTab(resolved.progressSubTab);
    setInventorySubView(resolved.inventorySubView);
  }, []);

  const { language, setLanguage, t, languages } = useLanguage();
  const { activeSkin, equipSkin } = useSkin();

  useEffect(() => {
    if (isOpen) {
      const resolved = resolveInitialProfileNavigation(initialTab);
      setActiveScreen(resolved.screen);
      setProgressSubTab(resolved.progressSubTab);
      setInventorySubView(resolved.inventorySubView);
    } else {
      setIsDeletionModalOpen(false);
    }
  }, [isOpen, initialTab]);

  // Real friends count from /api/friends
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [pendingFriendsCount, setPendingFriendsCount] = useState<number>(0);
  const [friendsLoading, setFriendsLoading] = useState<boolean>(false);

  const fetchFriendsSummary = React.useCallback(async () => {
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) {
      setFriendsCount(null);
      setPendingFriendsCount(0);
      return;
    }
    setFriendsLoading(true);
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.friends) ? data.friends : [];
        const accepted = list.filter((f: any) => f && f.status === 'accepted').length;
        const pending = list.filter((f: any) => f && f.status === 'pending_received').length;
        setFriendsCount(accepted);
        setPendingFriendsCount(pending);
      }
    } catch {
      // keep previous or null on error without fabricating numbers
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && (activeScreen === 'main' || activeScreen === 'friends')) {
      fetchFriendsSummary();
    }
  }, [isOpen, activeScreen, fetchFriendsSummary]);
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
  
  // Email verification state
  const [verificationCode, setVerificationCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeSentNotice, setCodeSentNotice] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendVerificationCode = async () => {
    if (resendCooldown > 0 || isSendingCode) return;
    setIsSendingCode(true);
    setVerifyError(null);
    setVerifySuccess(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/auth/send-verification-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось отправить проверочный код');
      }
      sounds.playTick();
      setCodeSentNotice(data.message || 'Проверочный код отправлен на ваш email.');
      setResendCooldown(45);
    } catch (err: unknown) {
      setVerifyError(err instanceof Error ? err.message : 'Ошибка при отправке кода');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = verificationCode.trim();
    if (!clean || clean.length !== 6) {
      setVerifyError('Введите 6-значный проверочный код.');
      return;
    }
    setIsVerifyingCode(true);
    setVerifyError(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: clean })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка проверки кода');
      }
      sounds.playTick();
      setVerifySuccess(data.message || 'Email успешно подтверждён!');
      if (data.user) {
        onUpdateUser(data.user);
      }
      setVerificationCode('');
    } catch (err: unknown) {
      setVerifyError(err instanceof Error ? err.message : 'Не удалось подтвердить email');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const formatVerifiedDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Promo codes & Partner Referral state (Stage 8.2)
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoActivating, setPromoActivating] = useState(false);
  const [promoLoadingState, setPromoLoadingState] = useState(false);
  const [promoFeedback, setPromoFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    immediatelyGranted?: Array<{ itemId: string; itemTitle: string; quantity: number }>;
    pendingObligationsCount?: number;
  } | null>(null);
  const [myPromoState, setMyPromoState] = useState<{
    partnerBinding: {
      isBound: boolean;
      codeText: string | null;
      boundVia: 'registration' | 'profile' | null;
      boundAt: string | null;
    };
    activations: Array<{
      id: string;
      codeKind: 'regular' | 'partner';
      codeText: string;
      title: string;
      boundVia: 'registration' | 'profile';
      activatedAt: string;
      allPlayerRewardsGranted: boolean;
      obligations: Array<{
        id: string;
        rewardIndex: number;
        itemId: string;
        itemTitle: string;
        itemType: string;
        itemIcon?: string;
        itemImageUrl: string;
        quantity: number;
        grantMode: 'immediate' | 'conditional';
        conditionLogic: 'AND' | 'OR';
        conditions: Array<{
          type: 'matches_completed' | 'active_playtime_minutes' | 'reach_level';
          target: number;
          current: number;
          completed: boolean;
          label: string;
        }>;
        status: 'pending' | 'granted' | 'cancelled_recipient_deleted';
        grantedAt: string | null;
      }>;
    }>;
  } | null>(null);

  const fetchMyPromoState = React.useCallback(async () => {
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;
    setPromoLoadingState(true);
    try {
      const res = await fetch('/api/promocodes/my-state', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyPromoState(data);
      }
    } catch {
      // ignore transient error
    } finally {
      setPromoLoadingState(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMyPromoState();
      try {
        const rawNotice = sessionStorage.getItem('mafia_referral_notice');
        if (rawNotice) {
          sessionStorage.removeItem('mafia_referral_notice');
          const parsed = JSON.parse(rawNotice);
          if (parsed && parsed.text) {
            setPromoFeedback({
              type: parsed.type === 'warning' ? 'error' : 'success',
              text: String(parsed.text),
            });
          }
        }
      } catch {}
    }
  }, [isOpen, activeScreen, fetchMyPromoState]);

  const handleActivatePromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = promoCodeInput.trim().toUpperCase();
    if (!clean) {
      setPromoFeedback({ type: 'error', text: 'Введите промокод или реферальный код партнёра.' });
      return;
    }
    setPromoActivating(true);
    setPromoFeedback(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/promocodes/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ code: clean })
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoFeedback({
          type: 'error',
          text: data.error || 'Не удалось активировать код.'
        });
        return;
      }
      sounds.playTick();
      setPromoCodeInput('');
      setPromoFeedback({
        type: 'success',
        text: data.result?.message || data.message || 'Код успешно активирован!',
        immediatelyGranted: data.result?.immediatelyGranted || [],
        pendingObligationsCount: data.result?.pendingObligationsCount || 0
      });
      if (data.user) {
        onUpdateUser(data.user);
      }
      if (data.state) {
        setMyPromoState(data.state);
      } else {
        fetchMyPromoState();
      }
    } catch (err: unknown) {
      setPromoFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка соединения с сервером.'
      });
    } finally {
      setPromoActivating(false);
    }
  };

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
  
  // Chest unboxing loot modal (legacy fallback) & Stage 4 interactive lootbox opening modal
  const [unboxedLoot, setUnboxedLoot] = useState<{ message: string; reward?: any } | null>(null);
  const [mediaAssetsMap, setMediaAssetsMap] = useState<Record<string, LootboxMediaAssetRecord>>({});
  const [soundDefaults, setSoundDefaults] = useState<Record<LootboxSoundCategory, string | null>>({} as Record<LootboxSoundCategory, string | null>);
  const [deletedReplacements, setDeletedReplacements] = useState<Record<string, any>>({});
  const [activeLootboxModal, setActiveLootboxModal] = useState<{
    inventoryEntry: UserInventoryItem;
    itemDef: ItemDefinition;
    recoveredPayload?: {
      user?: AuthUser;
      resultMessage: string;
      reward: ServerLootboxOpenRewardPayload;
      operationId: string;
    } | null;
  } | null>(null);

  // Dynamic game items catalog
  const [catalogList, setCatalogList] = useState<ItemDefinition[]>(getDynamicItemsList);

  useEffect(() => {
    return subscribeItemsCatalog(items => {
      setCatalogList(items);
    });
  }, []);

  // Helper to resolve an inventory item's definition even if a custom lootbox was deleted from shop_items
  const resolveInventoryItemDef = (invItem: UserInventoryItem): ItemDefinition | null => {
    const direct = getItemDefinition(invItem.itemId);
    if (direct) return direct;
    if (invItem.itemId === PREMIUM_CERTIFICATE_ITEM_ID || Boolean(invItem.premiumPayload)) {
      return {
        id: PREMIUM_CERTIFICATE_ITEM_ID,
        name: 'Премиум-сертификат',
        description: 'Официальный сертификат активации Premium Account на определённый срок.',
        category: 'certificates',
        rarity: 'epic',
        cost: 0,
        pawnValue: 0,
        icon: '📜',
        usable: true,
        consumable: true,
        inShop: false,
        adminHidden: false,
        effectDescription: 'Активация статуса Premium Account соответствующего тарифа на указанный срок.'
      };
    }
    const deletedMeta = deletedReplacements[invItem.itemId];
    const snap = invItem.ruleSnapshot;
    if (snap || deletedMeta) {
      return {
        id: invItem.itemId,
        name: snap?.name || deletedMeta?.deletedItemName || `Архивный сундук (${invItem.itemId})`,
        description: snap?.description || 'Пользовательский лутбокс (снят с публикации, но сохранён в вашем инвентаре со своим неизменяемым снимком правил).',
        category: 'chests',
        rarity: 'epic',
        cost: 100,
        pawnValue: snap?.pawnValue || 50,
        icon: '🧰',
        usable: true,
        consumable: true,
        effectDescription: 'Открывает награды согласно зафиксированному снимку правил.',
        isCustomLootbox: true
      };
    }
    return null;
  };

  // Helper to resolve a stack's ruleSnapshot (or synthesize display snapshot from itemDef.lootboxConfig)
  const resolveStackSnapshot = (invItem: UserInventoryItem, itemDef: ItemDefinition): LootboxRuleSnapshot | null => {
    if (invItem.ruleSnapshot && Array.isArray(invItem.ruleSnapshot.rewards)) {
      return invItem.ruleSnapshot;
    }
    if (itemDef.lootboxConfig && Array.isArray(itemDef.lootboxConfig.rewards)) {
      return {
        lootboxItemId: itemDef.id,
        version: itemDef.lootboxConfig.version || 1,
        snapshotHash: itemDef.lootboxConfig.snapshotHash || 'live',
        capturedAt: invItem.acquiredAt || itemDef.lootboxConfig.updatedAt || new Date().toISOString(),
        name: itemDef.name,
        description: itemDef.description,
        pawnValue: itemDef.pawnValue,
        dropMode: itemDef.lootboxConfig.dropMode,
        allowNestedLootboxes: itemDef.lootboxConfig.allowNestedLootboxes,
        rewards: itemDef.lootboxConfig.rewards,
        consolationPrize: itemDef.lootboxConfig.consolationPrize || null
      };
    }
    return null;
  };

  useEffect(() => {
    if (isOpen) {
      fetch('/api/items')
        .then(r => r.json())
        .then(async (data) => {
          if (data.items && Array.isArray(data.items)) {
            syncItemsCatalog(data.items);
          }
          if (data.mediaAssetsMap && typeof data.mediaAssetsMap === 'object') {
            setMediaAssetsMap(data.mediaAssetsMap);
          }
          if (data.soundDefaults && typeof data.soundDefaults === 'object') {
            setSoundDefaults(data.soundDefaults);
          }
          if (data.deletedReplacements && typeof data.deletedReplacements === 'object') {
            setDeletedReplacements(data.deletedReplacements);
          }

          // Check for any pending/interrupted lootbox opening operation to recover automatically
          try {
            const storageKey = getPendingLootboxStorageKey(user.id);
            const rawPending = localStorage.getItem(storageKey);
            if (rawPending) {
              const pending: PendingLootboxOperationRecord = JSON.parse(rawPending);
              if (pending && pending.operationId && pending.userId === user.id) {
                const token = localStorage.getItem('mafia_auth_token');
                const opRes = await fetch(`/api/user/lootbox-operations/${encodeURIComponent(pending.operationId)}`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (opRes.ok) {
                  const opData = await opRes.json();
                  if (opData.found && opData.operation?.resultPayload) {
                    if (opData.user) {
                      onUpdateUser(opData.user);
                    }
                    const fallbackEntry: UserInventoryItem = {
                      id: pending.inventoryEntryId || `recovered_${pending.operationId}`,
                      itemId: pending.itemId,
                      quantity: 1,
                      acquiredAt: pending.createdAt,
                      ruleSnapshot: opData.operation.resultPayload?.reward?.lootbox?.ruleSnapshot || null
                    };
                    const itemDef = getItemDefinition(pending.itemId) || {
                      id: pending.itemId,
                      name: pending.lootboxName || 'Лутбокс',
                      description: 'Восстановленный результат открытия лутбокса.',
                      category: 'chests',
                      rarity: 'epic',
                      cost: 100,
                      icon: pending.lootboxIcon || '🧰',
                      effectDescription: '',
                      usable: true,
                      consumable: true
                    };
                    setActiveLootboxModal({
                      inventoryEntry: fallbackEntry,
                      itemDef,
                      recoveredPayload: {
                        user: opData.user,
                        resultMessage: opData.operation.resultPayload.resultMessage || 'Лутбокс открыт!',
                        reward: opData.operation.resultPayload.reward,
                        operationId: pending.operationId
                      }
                    });
                  }
                }
              }
            }
          } catch {
            // ignore recovery parse errors
          }
        })
        .catch(() => {});
    }
  }, [isOpen, user.id]);

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

  // Filter user inventory (preserving deleted custom lootboxes that still exist in player inventory)
  const filteredInventory = inventory.filter(invItem => {
    const itemDef = resolveInventoryItemDef(invItem);
    if (!itemDef) return false;
    if (selectedCategory === 'all') return true;
    return itemDef.category === selectedCategory;
  });

  // Filter catalog of all items
  const filteredCatalog = catalogList.filter(item => {
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
        setActiveScreen('main');
      }, 2000);
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
        setActiveScreen('main');
      }, 2000);
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось изменить аватар.');
    } finally {
      setLoadingAvatar(false);
    }
  };

  // Handle using/opening an item from inventory
  const handleUseItem = async (itemId: string, inventoryEntryId?: string, extraOptions?: any) => {
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
      const isCurrentlyEquipped =
        activeSkin === skinId || user.equippedCosmetics?.uiSkin === skinId;

      if (isCurrentlyEquipped) {
        // Unequip back to default
        setActionLoading(true);
        setActionFeedback(null);
        try {
          const res = await equipSkin('default', user);
          if (res.updatedUser) {
            onUpdateUser({
              ...res.updatedUser,
              equippedCosmetics: {
                ...res.updatedUser.equippedCosmetics,
                uiSkin: undefined
              }
            });
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
        body: JSON.stringify({ itemId, inventoryEntryId, ...extraOptions })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка активации предмета');
      }

      sounds.playGunshot();

      if (itemId.startsWith('skin_')) {
        const skinId = itemId.replace('skin_', '');
        const skinRes = await equipSkin(skinId, data.user);
        const finalUser: AuthUser = skinRes.updatedUser || {
          ...data.user,
          equippedCosmetics: {
            ...data.user.equippedCosmetics,
            uiSkin: skinId
          }
        };
        onUpdateUser({
          ...finalUser,
          equippedCosmetics: {
            ...finalUser.equippedCosmetics,
            uiSkin: skinId
          }
        });
      } else {
        onUpdateUser(data.user);
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

  const handleUnequipMasteryTitle = async () => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/equip-mastery-badge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ badgeTitle: '' })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось снять титул');
      }
      sounds.playTick();
      if (data.user) {
        onUpdateUser(data.user);
      }
      setActionFeedback({ type: 'success', text: data.message || 'Титул снят с вашего профиля.' });
      setTimeout(() => setActionFeedback(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при снятии титула';
      setActionFeedback({ type: 'error', text: msg });
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle pawning an item (selling for credits)
  const handlePawnItem = async (itemId: string, inventoryEntryId?: string) => {
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
        body: JSON.stringify({ itemId, inventoryEntryId })
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

  const screenMeta: Record<
    Exclude<ProfilePrimaryScreenId, 'main'>,
    { title: string; subtitle: string; icon: React.ElementType }
  > = {
    inventory: {
      title: 'Инвентарь',
      subtitle: 'Экипировка, сундуки, сертификаты, косметика и каталог предметов',
      icon: Package
    },
    progress: {
      title: 'Прогресс и статистика',
      subtitle: 'Уровень и XP, рейтинг Elo, мастерство ролей, статистика и история игр',
      icon: Trophy
    },
    friends: {
      title: 'Друзья',
      subtitle: 'Список друзей, онлайн-статусы, заявки и приглашения в комнату',
      icon: Users
    },
    promocodes: {
      title: 'Промокоды и партнёрство',
      subtitle: 'Активация кодов, реферальная привязка и прогресс наград',
      icon: Gift
    },
    account: {
      title: 'Аккаунт',
      subtitle: 'Электронная почта, статус подтверждения, смена данных и выход',
      icon: Shield
    },
    nickname: {
      title: 'Смена игрового никнейма',
      subtitle: 'Обновление отображаемого имени за сертификат или кредиты',
      icon: Edit3
    },
    avatar: {
      title: 'Смена аватара профиля',
      subtitle: 'Выбор иконки или кода аватара за сертификат или кредиты',
      icon: Camera
    },
    webrtc: {
      title: 'Видеосвязь WebRTC',
      subtitle: 'Настройка камеры, микрофона и аудиоустройств',
      icon: Video
    },
    language: {
      title: 'Язык интерфейса',
      subtitle: 'Выбор языка профиля и системных сообщений',
      icon: Globe
    }
  };

  return (
    <div
      style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 backdrop-blur-xs select-none overflow-x-hidden"
    >
      {/* Center Noir Hub Card matching the General Lobby structure (65% width, 98% height on desktop; 100% on mobile) */}
      <div
        style={{
          background: 'var(--skin-bg-modal)',
          borderColor: 'var(--skin-border-card)',
          boxShadow: 'var(--skin-shadow-modal)'
        }}
        className="skin-modal relative w-full md:w-[65vw] h-full min-h-[100dvh] md:min-h-0 md:h-[98vh] border-0 md:border rounded-none md:rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        {/* ================= HEADER: MAIN PROFILE SCREEN vs STANDALONE SECTION SCREEN ================= */}
        {activeScreen === 'main' ? (
          <header
            style={{
              background: 'var(--skin-bg-header)',
              borderColor: 'var(--skin-border-header)'
            }}
            className="skin-header px-4 sm:px-6 py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-accent)',
                  color: 'var(--skin-accent-primary)'
                }}
                className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
              >
                <Shield className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-[var(--skin-text-primary)] tracking-tight truncate">
                  Личный профиль игрока
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isSuperAdmin && onOpenAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    onOpenAdmin();
                  }}
                  title="Панель Администратора"
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-amber-600/70 bg-amber-950/70 text-amber-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Админ-панель</span>
                </button>
              )}

              {onOpenFeedback && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    onOpenFeedback();
                  }}
                  title="Связь с Администратором"
                  style={{
                    background: 'var(--skin-bg-elevated)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-secondary)'
                  }}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border hover:opacity-90 font-bold text-xs transition-colors cursor-pointer"
                >
                  <span>💡</span>
                  <span className="hidden sm:inline">Связь с Доном</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'var(--skin-btn-secondary-bg)',
                  borderColor: 'var(--skin-btn-secondary-border)',
                  color: 'var(--skin-text-secondary)'
                }}
                className="p-1.5 sm:p-2 rounded-xl border hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer"
                title="Закрыть профиль"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>
        ) : (
          <ProfileScreenHeader
            title={screenMeta[activeScreen].title}
            subtitle={screenMeta[activeScreen].subtitle}
            icon={screenMeta[activeScreen].icon}
            onBackToMain={() => setActiveScreen('main')}
            onClose={onClose}
          />
        )}

        {/* Global Feedback notification */}
        {actionFeedback && (
          <div className={`px-6 py-2 text-xs font-bold text-center border-b shrink-0 ${
            actionFeedback.type === 'success' 
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}>
            {actionFeedback.text}
          </div>
        )}

        {/* Screen Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-6 space-y-4 font-sans">
          {/* ================= SCREEN 0: MAIN PROFILE SCREEN (CARD + 5 MENU SECTIONS) ================= */}
          {activeScreen === 'main' && (
            <ProfileMainScreen
              user={user}
              levelInfo={levelInfo}
              userCredits={userCredits}
              totalInventoryCount={totalInventoryCount}
              friendsCount={friendsCount}
              pendingFriendsCount={pendingFriendsCount}
              friendsLoading={friendsLoading}
              masteredRolesCount={masterySummary.masteredCount}
              streakDays={streakInfo.streak}
              canClaimStreakToday={!streakInfo.claimedToday}
              hasPromoInProgress={Boolean(myPromoState?.activations?.some(a => !a.allPlayerRewardsGranted))}
              isPartnerBound={Boolean(myPromoState?.partnerBinding?.isBound)}
              certificateCount={certificateCount}
              avatarCertificateCount={avatarCertificateCount}
              onSelectScreen={(screen) => setActiveScreen(screen)}
              onOpenNicknameChange={() => setActiveScreen('nickname')}
              onOpenAvatarChange={() => setActiveScreen('avatar')}
              onOpenShop={onOpenShop}
              onClose={onClose}
            />
          )}

          {/* ================= STANDALONE SCREEN: STAGE 3 PROGRESS & STATISTICS (ЕДИНЫЙ ЭКРАН «ПРОГРЕСС И СТАТИСТИКА») ================= */}
          {activeScreen === 'progress' && (
            <PlayerProgressStatsScreen
              user={user}
              initialSubTab={progressSubTab}
              onSubTabChange={(sub) => setProgressSubTab(sub)}
              onUpdateUser={onUpdateUser}
              onOpenTasks={onOpenTasks}
            />
          )}

          {/* ================= STANDALONE SCREEN: STAGE 2 INVENTORY (ДВУХУРОВНЕВЫЙ ИНВЕНТАРЬ ИГРОКА) ================= */}
          {activeScreen === 'inventory' && (
            <PlayerInventoryScreen
              user={user}
              catalogList={catalogList}
              mediaAssetsMap={mediaAssetsMap}
              deletedReplacements={deletedReplacements}
              actionLoading={actionLoading}
              initialSubView={inventorySubView}
              resolveInventoryItemDef={resolveInventoryItemDef}
              resolveStackSnapshot={resolveStackSnapshot}
              onUseItem={handleUseItem}
              onUnequipMasteryTitle={handleUnequipMasteryTitle}
              onPawnItem={handlePawnItem}
              onOpenLootbox={(invItem, itemDef) => {
                setActiveLootboxModal({
                  inventoryEntry: invItem,
                  itemDef,
                  recoveredPayload: null
                });
              }}
              onOpenShop={onOpenShop}
              onCloseProfile={onClose}
              onUpdateUser={onUpdateUser}
            />
          )}

          {/* (Inventory items view is rendered by PlayerInventoryScreen above) */}

          {/* TAB 2: NICKNAME CHANGE (СМЕНА НИКНЕЙМА СЕРТИФИКАТОМ / КРЕДИТАМИ) */}
          {activeScreen === 'nickname' && (
            <div className="space-y-5 max-w-lg mx-auto">
              <div className="skin-card p-4 rounded-2xl border space-y-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-600/50 flex items-center justify-center text-blue-400 mx-auto">
                  <Edit3 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[var(--skin-text-primary)]">Смена игрового никнейма</h4>
                <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
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
                  <label className="text-xs font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block">
                    Новый никнейм:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={newDisplayName}
                    onChange={e => setNewDisplayName(e.target.value)}
                    placeholder="Введите новое имя..."
                    className="skin-input w-full border rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                  />
                  <div className="flex justify-between text-[11px] text-[var(--skin-text-muted)] px-1">
                    <span>От 2 до 30 символов</span>
                    <span>Текущее: {user.displayName}</span>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block">
                    Способ оплаты:
                  </label>

                  {/* Option 1: Certificate */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('certificate')}
                    style={
                      paymentMethod !== 'certificate'
                        ? {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)'
                          }
                        : undefined
                    }
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      paymentMethod === 'certificate'
                        ? 'bg-blue-950/50 border-blue-500 shadow-md shadow-blue-950/40'
                        : 'hover:border-[var(--skin-border-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">📜</div>
                      <div>
                        <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                          <span>Сертификат на смену никнейма</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-blue-950 border border-blue-800 text-blue-300 text-[10px]">
                            Бесплатно
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                          В вашем инвентаре: <span className="font-bold text-blue-300">{certificateCount} шт.</span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      paymentMethod === 'certificate' ? 'border-blue-400 bg-blue-600' : 'border-[var(--skin-border-strong)]'
                    }`}>
                      {paymentMethod === 'certificate' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>

                  {/* Option 2: Credits */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credits')}
                    style={
                      paymentMethod !== 'credits'
                        ? {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)'
                          }
                        : undefined
                    }
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      paymentMethod === 'credits'
                        ? 'bg-amber-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                        : 'hover:border-[var(--skin-border-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-800 flex items-center justify-center text-amber-400">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                          <span>Внутриигровые кредиты ({DEFAULT_NICKNAME_CHANGE_COST} кр)</span>
                        </div>
                        <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                          Ваш баланс: <span className="font-bold text-amber-300">{userCredits} кр</span>
                          {userCredits < DEFAULT_NICKNAME_CHANGE_COST && (
                            <span className="text-rose-400 ml-1.5 font-semibold">(недостаточно)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      paymentMethod === 'credits' ? 'border-amber-400 bg-amber-600' : 'border-[var(--skin-border-strong)]'
                    }`}>
                      {paymentMethod === 'credits' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={loadingName}
                  style={{
                    background: 'var(--skin-btn-primary-bg)',
                    color: 'var(--skin-btn-primary-text)'
                  }}
                  className="w-full py-3 rounded-xl disabled:opacity-50 text-xs font-bold uppercase tracking-wider transition-all shadow-lg hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer"
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
          {activeScreen === 'avatar' && (
            <div className="space-y-5 max-w-xl mx-auto">
              <div className="skin-card p-4 rounded-2xl border space-y-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-purple-950/60 border border-purple-600/50 flex items-center justify-center text-purple-400 mx-auto">
                  <Camera className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[var(--skin-text-primary)]">Смена аватара профиля</h4>
                <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
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

              {/* Personal Uploaded Avatars Gallery ("Мои аватары") */}
              <UserAvatarGallerySection
                userCredits={userCredits}
                avatarCertificateCount={avatarCertificateCount}
                avatarChangeCost={DEFAULT_AVATAR_CHANGE_COST}
                activeAvatarId={user.activeAvatarId}
                onUserUpdated={(updatedUser) => {
                  onUpdateUser(updatedUser);
                }}
              />

              <form onSubmit={handleChangeAvatar} className="space-y-4">
                {/* Avatar Preview & Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block">
                    Выберите стиль или иконку аватара:
                  </label>

                  {/* Preset Gangster & Noir Icons Grid */}
                  <div
                    style={{
                      backgroundColor: 'var(--skin-bg-card)',
                      borderColor: 'var(--skin-border-base)'
                    }}
                    className="grid grid-cols-4 sm:grid-cols-8 gap-2 p-2 rounded-2xl border"
                  >
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
                          style={
                            !isSelected
                              ? {
                                  backgroundColor: 'var(--skin-bg-subcard)',
                                  borderColor: 'var(--skin-border-base)'
                                }
                              : undefined
                          }
                          className={`p-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-950/80 border-2 border-purple-500 shadow-md shadow-purple-950/60 scale-105'
                              : 'border hover:border-[var(--skin-border-strong)]'
                          }`}
                        >
                          <span className="text-2xl">{preset.icon}</span>
                          <span className="text-[9px] font-bold text-[var(--skin-text-secondary)] mt-1 truncate max-w-full">
                            {preset.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Seed / URL / Emoji Input */}
                  <div className="pt-2 space-y-1.5">
                    <label className="text-[11px] font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block">
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
                        className="skin-input flex-1 border rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                      />
                      <div className="cyber-avatar-ring w-11 h-11 rounded-xl bg-gradient-to-br from-purple-800 to-indigo-900 border border-purple-500/50 flex items-center justify-center text-xl text-white shadow-md shrink-0">
                        {newAvatarSeed || '❓'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-[var(--skin-text-secondary)] uppercase tracking-wider block">
                    Способ оплаты:
                  </label>

                  {/* Option 1: Certificate */}
                  <button
                    type="button"
                    onClick={() => setAvatarPaymentMethod('certificate')}
                    style={
                      avatarPaymentMethod !== 'certificate'
                        ? {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)'
                          }
                        : undefined
                    }
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      avatarPaymentMethod === 'certificate'
                        ? 'bg-purple-950/50 border-purple-500 shadow-md shadow-purple-950/40'
                        : 'hover:border-[var(--skin-border-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">🎭</div>
                      <div>
                        <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                          <span>Сертификат на смену аватара</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-950 border border-purple-800 text-purple-300 text-[10px]">
                            Бесплатно
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                          В вашем инвентаре: <span className="font-bold text-purple-300">{avatarCertificateCount} шт.</span>
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      avatarPaymentMethod === 'certificate' ? 'border-purple-400 bg-purple-600' : 'border-[var(--skin-border-strong)]'
                    }`}>
                      {avatarPaymentMethod === 'certificate' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>

                  {/* Option 2: Credits */}
                  <button
                    type="button"
                    onClick={() => setAvatarPaymentMethod('credits')}
                    style={
                      avatarPaymentMethod !== 'credits'
                        ? {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)'
                          }
                        : undefined
                    }
                    className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      avatarPaymentMethod === 'credits'
                        ? 'bg-amber-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                        : 'hover:border-[var(--skin-border-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-800 flex items-center justify-center text-amber-400">
                        <Coins className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                          <span>Внутриигровые кредиты ({DEFAULT_AVATAR_CHANGE_COST} кр)</span>
                        </div>
                        <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                          Ваш баланс: <span className="font-bold text-amber-300">{userCredits} кр</span>
                          {userCredits < DEFAULT_AVATAR_CHANGE_COST && (
                            <span className="text-rose-400 ml-1.5 font-semibold">(недостаточно)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      avatarPaymentMethod === 'credits' ? 'border-amber-400 bg-amber-600' : 'border-[var(--skin-border-strong)]'
                    }`}>
                      {avatarPaymentMethod === 'credits' && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={loadingAvatar}
                  style={{
                    background: 'var(--skin-btn-primary-bg)',
                    color: 'var(--skin-btn-primary-text)'
                  }}
                  className="w-full py-3 rounded-xl disabled:opacity-50 text-xs font-bold uppercase tracking-wider transition-all shadow-lg hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer"
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

          {/* (Catalog view is rendered inside PlayerInventoryScreen above) */}

          {/* TAB 2: FRIENDS & SOCIAL SYSTEM */}
          {activeScreen === 'friends' && (
            <FriendsView
              user={user}
              currentRoomCode={currentRoomCode}
              onJoinRoom={onJoinRoom}
              onCloseParentModal={onClose}
              onFriendsChanged={fetchFriendsSummary}
            />
          )}

          {/* (Role Mastery, Game History, Detailed Stats are now unified inside PlayerProgressStatsScreen above; duplicate DailyStreakWidget inside profile removed) */}

          {/* TAB 6: WEBRTC P2P AUDIO & VIDEO SETTINGS */}
          {activeScreen === 'webrtc' && (
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
          {activeScreen === 'language' && (
            <div className="p-2 sm:p-4 max-w-2xl mx-auto space-y-6">
              <div className="skin-card p-5 rounded-2xl border space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      backgroundColor: 'var(--skin-bg-subcard)',
                      borderColor: 'var(--skin-border-accent)'
                    }}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center text-[var(--skin-accent-primary)]"
                  >
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">
                      {t('profile.language_heading', 'Языковые предпочтения')}
                    </h4>
                    <p className="text-xs text-[var(--skin-text-secondary)]">
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
                        style={
                          isSelected
                            ? {
                                backgroundColor: 'var(--skin-bg-elevated)',
                                borderColor: 'var(--skin-border-accent)',
                                color: 'var(--skin-text-primary)',
                                boxShadow: 'var(--skin-glow-accent)'
                              }
                            : {
                                backgroundColor: 'var(--skin-bg-subcard)',
                                borderColor: 'var(--skin-border-base)',
                                color: 'var(--skin-text-secondary)'
                              }
                        }
                        className="p-3.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer hover:border-[var(--skin-border-strong)]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl leading-none">{item.flag}</span>
                          <div>
                            <div className="text-xs font-bold text-[var(--skin-text-primary)] flex items-center gap-1.5">
                              <span>{item.nativeName}</span>
                              <span className="text-[10px] text-[var(--skin-text-muted)] font-normal">({item.name})</span>
                            </div>
                            <div className="text-[11px] text-[var(--skin-text-secondary)] font-mono">ISO: {item.code.toUpperCase()}</div>
                          </div>
                        </div>
                        {isSelected ? (
                          <div
                            style={{
                              backgroundColor: 'var(--skin-bg-card)',
                              borderColor: 'var(--skin-border-accent)',
                              color: 'var(--skin-accent-primary)'
                            }}
                            className="w-6 h-6 rounded-full border flex items-center justify-center"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-[var(--skin-border-strong)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PROMO CODES & PARTNER REFERRALS (Stage 8.2) */}
          {activeScreen === 'promocodes' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Promo Code Input Card */}
              <div className="skin-card p-5 rounded-2xl border space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        backgroundColor: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-accent)'
                      }}
                      className="p-3 rounded-xl border text-[var(--skin-accent-primary)]"
                    >
                      <Gift className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-[var(--skin-text-primary)]">Активация промокода или реферального кода</h4>
                      <p className="text-xs text-[var(--skin-text-secondary)] mt-0.5">
                        Введите обычный промокод акции или реферальный код пригласившего вас партнёра Клуба
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleActivatePromoCode} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    placeholder="Введите код (например: MAFIA2026)"
                    className="skin-input flex-1 px-4 py-3 rounded-xl border font-mono font-bold text-sm uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal"
                  />
                  <button
                    type="submit"
                    disabled={promoActivating || !promoCodeInput.trim()}
                    style={{
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)'
                    }}
                    className="px-6 py-3 rounded-xl disabled:opacity-50 font-bold text-xs uppercase tracking-wider transition-all shadow-md hover:brightness-110 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    {promoActivating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Проверка...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Активировать код</span>
                      </>
                    )}
                  </button>
                </form>

                {promoFeedback && (
                  <div
                    className={`p-4 rounded-xl border text-xs space-y-2 animate-in fade-in ${
                      promoFeedback.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-700/70 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-700/70 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      {promoFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{promoFeedback.text}</span>
                    </div>

                    {promoFeedback.immediatelyGranted && promoFeedback.immediatelyGranted.length > 0 && (
                      <div className="pt-2 border-t border-emerald-800/50">
                        <div className="text-[11px] text-emerald-300 font-bold mb-1.5">Мгновенно начислено:</div>
                        <div className="flex flex-wrap gap-2">
                          {promoFeedback.immediatelyGranted.map((r, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-900/50 border border-emerald-600/60 text-emerald-100 font-mono text-xs font-bold"
                            >
                              <span>🎁</span>
                              <span>{r.itemTitle}</span>
                              <span className="text-amber-300">×{r.quantity}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(promoFeedback.pendingObligationsCount ?? 0) > 0 && (
                      <div className="pt-2 border-t border-emerald-800/50">
                        <div className="text-[11px] text-amber-300 font-bold">
                          Отложенных наград в прогрессе: {promoFeedback.pendingObligationsCount} шт. (будут выданы автоматически после выполнения условий).
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Partner Referral Binding Status Card */}
              <div className="skin-card p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-xl border shrink-0 ${
                      myPromoState?.partnerBinding?.isBound
                        ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-400'
                        : 'bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] text-[var(--skin-text-secondary)]'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="text-sm font-bold text-[var(--skin-text-primary)]">Партнёрская привязка аккаунта</h5>
                      {myPromoState?.partnerBinding?.isBound ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
                          Привязан к партнёру
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] text-[10px] font-bold">
                          Свободен (можно ввести 1 реферальный код)
                        </span>
                      )}
                    </div>
                    {myPromoState?.partnerBinding?.isBound ? (
                      <p className="text-xs text-[var(--skin-text-secondary)] mt-1">
                        Вы активировали реферальный код партнёра{' '}
                        <span className="font-mono font-bold text-amber-300">{myPromoState.partnerBinding.codeText}</span> (
                        {myPromoState.partnerBinding.boundVia === 'registration' ? 'при регистрации' : 'в личном кабинете'} •{' '}
                        {myPromoState.partnerBinding.boundAt ? new Date(myPromoState.partnerBinding.boundAt).toLocaleDateString('ru-RU') : ''}). Привязка к партнёру действует бессрочно.
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--skin-text-secondary)] mt-1">
                        Вы ещё не привязаны ни к одному партнёру. Если вы не вводили реферальный код при регистрации, вы можете ввести его один раз в поле выше.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Player Rewards & Conditional Obligations Progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                    <Award className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                    <span>Ваши активированные коды и прогресс наград</span>
                  </h5>
                  {promoLoadingState && <Loader2 className="w-4 h-4 animate-spin text-[var(--skin-accent-primary)]" />}
                </div>

                {!myPromoState || !myPromoState.activations || myPromoState.activations.length === 0 ? (
                  <div className="skin-card p-8 rounded-2xl border text-center space-y-2">
                    <Gift className="w-8 h-8 text-[var(--skin-text-muted)] mx-auto" />
                    <div className="text-xs font-bold text-[var(--skin-text-primary)]">У вас пока нет активированных промо-наград</div>
                    <p className="text-[11px] text-[var(--skin-text-secondary)] max-w-md mx-auto">
                      Активируйте промокод или реферальный код партнёра выше, чтобы получить мгновенные бонусы или отслеживать прогресс наград с условиями.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {myPromoState.activations.flatMap((act) =>
                      act.obligations.map((ob) => {
                        const isGranted = ob.status === 'granted';
                        const hasConditions = Array.isArray(ob.conditions) && ob.conditions.length > 0;

                        return (
                          <div
                            key={ob.id}
                            style={{
                              backgroundColor: 'var(--skin-bg-card)'
                            }}
                            className={`p-4 rounded-2xl border transition-all space-y-3 ${
                              isGranted
                                ? 'border-emerald-800/60'
                                : 'border-amber-700/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3">
                                <div className="text-2xl w-11 h-11 rounded-xl bg-black/40 border border-[var(--skin-border-base)] flex items-center justify-center shrink-0 overflow-hidden">
                                  {ob.itemImageUrl && /^(\/|https?:\/\/|data:image\/)/i.test(ob.itemImageUrl) ? (
                                    <img
                                      src={ob.itemImageUrl}
                                      alt={ob.itemTitle}
                                      className="w-8 h-8 object-contain"
                                    />
                                  ) : (
                                    <span>{ob.itemIcon || ob.itemImageUrl || (ob.itemType === 'credits' ? '💰' : '🎁')}</span>
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-[var(--skin-text-primary)]">
                                      {ob.itemTitle}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 font-mono text-xs font-bold">
                                      ×{ob.quantity}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] font-mono text-[10px]">
                                      Код: {act.codeText}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                                    {act.codeKind === 'partner' ? 'Партнёрская программа' : 'Обычный промокод'} ({act.title}) • Активирован:{' '}
                                    {new Date(act.activatedAt).toLocaleString('ru-RU', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div>
                                {isGranted ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-xs font-bold">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    Выдано
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-600/70 text-amber-300 text-xs font-bold">
                                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                                    Выполняются условия
                                  </span>
                                )}
                              </div>
                            </div>

                            {hasConditions && (
                              <div className="pt-2 border-t border-[var(--skin-border-subtle)] space-y-2.5">
                                <div className="flex items-center justify-between text-[11px] text-[var(--skin-text-secondary)]">
                                  <span>
                                    Условия получения (логика:{' '}
                                    <strong className="text-amber-300">
                                      {ob.conditionLogic === 'OR'
                                        ? 'ИЛИ — достаточно любого одного условия'
                                        : 'И — требуются все условия'}
                                    </strong>
                                    ):
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                  {ob.conditions.map((cond, idx) => {
                                    const currentVal = cond.current || 0;
                                    const targetVal = cond.target || 1;
                                    const done = isGranted || cond.completed || currentVal >= targetVal;
                                    const pct = Math.min(100, Math.round((currentVal / Math.max(1, targetVal)) * 100));

                                    return (
                                      <div
                                        key={idx}
                                        className={`p-2.5 rounded-xl border space-y-1.5 ${
                                          done
                                            ? 'bg-emerald-950/20 border-emerald-700/50'
                                            : 'skin-subcard'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between text-[11px] gap-2">
                                          <span className="font-semibold text-[var(--skin-text-primary)] truncate">{cond.label}</span>
                                          <span
                                            className={`font-mono font-bold shrink-0 ${
                                              done ? 'text-emerald-400' : 'text-amber-300'
                                            }`}
                                          >
                                            {pct}%
                                          </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ${
                                              done
                                                ? 'bg-emerald-500'
                                                : 'bg-gradient-to-r from-amber-500 to-orange-500'
                                            }`}
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ACCOUNT & EMAIL VERIFICATION */}
          {activeScreen === 'account' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header Box */}
              <div className="skin-card p-5 rounded-2xl border">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl border ${
                      user.isEmailVerified
                        ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-400'
                        : 'bg-amber-950/60 border-amber-600/70 text-amber-400'
                    }`}>
                      <Mail className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-[var(--skin-text-primary)] flex items-center gap-2 flex-wrap">
                        <span>Электронная почта</span>
                        {user.isEmailVerified ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Подтверждена
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/70 text-amber-300 text-xs font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                            Не подтверждена
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-[var(--skin-text-secondary)] mt-1 font-mono">
                        {user.email || 'Не указана'}
                      </p>
                    </div>
                  </div>
                </div>

                {user.isEmailVerified && user.emailVerifiedAt && (
                  <div className="mt-4 pt-3 border-t border-[var(--skin-border-subtle)] text-xs text-[var(--skin-text-secondary)] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Почта успешно подтверждена: {formatVerifiedDate(user.emailVerifiedAt)}</span>
                  </div>
                )}
              </div>

              {/* Status Details */}
              {user.isEmailVerified ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-xs leading-relaxed flex items-center gap-3">
                    <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <strong className="block text-emerald-200 font-bold mb-0.5">Аккаунт защищён</strong>
                      Ваш адрес электронной почты подтверждён. В случае утери пароля вы всегда сможете мгновенно восстановить доступ к своему профилю и игровому прогрессу.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="skin-card p-3.5 rounded-xl border space-y-1">
                      <div className="text-emerald-400 text-sm font-bold flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Владение подтверждено
                      </div>
                      <p className="text-[11px] text-[var(--skin-text-secondary)]">Адрес электронной почты проверен и закреплён за вашим профилем</p>
                    </div>
                    <div className="skin-card p-3.5 rounded-xl border space-y-1">
                      <div className="text-emerald-400 text-sm font-bold flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Сброс пароля
                      </div>
                      <p className="text-[11px] text-[var(--skin-text-secondary)]">Возможность безопасного получения одноразового кода восстановления доступа</p>
                    </div>
                    <div className="skin-card p-3.5 rounded-xl border space-y-1">
                      <div className="text-emerald-400 text-sm font-bold flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Защита от подмены
                      </div>
                      <p className="text-[11px] text-[var(--skin-text-secondary)]">Защищает ваш почтовый ящик от привязки сторонними пользователями</p>
                    </div>
                  </div>
                </div>
              ) : user.email ? (
                <div className="space-y-5">
                  {/* Voluntary notice banner */}
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs leading-relaxed flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-amber-100 font-bold mb-0.5">Добровольная процедура</strong>
                      Подтверждение email не является обязательным условием игры: вы можете играть во все режимы и пользоваться сайтом без ограничений. Однако подтверждение гарантирует безопасность вашего профиля и возможность восстановить доступ в случае утери пароля.
                    </div>
                  </div>

                  {/* Verification action card */}
                  <div className="skin-card p-5 rounded-2xl border space-y-4">
                    <h5 className="text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                      Шаги подтверждения почты
                    </h5>

                    {/* Step 1: Send Code */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-[var(--skin-text-secondary)]">
                        <span>1. Запросите проверочный код на адрес <strong className="text-[var(--skin-text-primary)]">{user.email}</strong>:</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSendVerificationCode}
                        disabled={isSendingCode || resendCooldown > 0}
                        style={
                          resendCooldown <= 0
                            ? {
                                background: 'var(--skin-btn-primary-bg)',
                                color: 'var(--skin-btn-primary-text)'
                              }
                            : {
                                backgroundColor: 'var(--skin-bg-subcard)',
                                borderColor: 'var(--skin-border-base)',
                                color: 'var(--skin-text-muted)'
                              }
                        }
                        className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                          resendCooldown > 0
                            ? 'border cursor-not-allowed'
                            : 'shadow-md hover:brightness-110 cursor-pointer'
                        }`}
                      >
                        {isSendingCode ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Отправка кода...</span>
                          </>
                        ) : resendCooldown > 0 ? (
                          <span>Повторный запрос через {resendCooldown} сек.</span>
                        ) : (
                          <>
                            <Mail className="w-4 h-4" />
                            <span>Отправить проверочный код на email</span>
                          </>
                        )}
                      </button>

                      {codeSentNotice && (
                        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>{codeSentNotice}</span>
                        </div>
                      )}
                    </div>

                    {/* Step 2: Enter Code */}
                    <form onSubmit={handleConfirmVerification} className="space-y-3 pt-3 border-t border-[var(--skin-border-subtle)]">
                      <label className="block text-xs font-semibold text-[var(--skin-text-secondary)]">
                        2. Введите 6-значный код из полученного письма:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          className="skin-input flex-1 px-4 py-2.5 rounded-xl border text-center font-mono font-bold text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:font-normal"
                        />
                        <button
                          type="submit"
                          disabled={isVerifyingCode || verificationCode.trim().length !== 6}
                          style={
                            verificationCode.trim().length !== 6 || isVerifyingCode
                              ? {
                                  backgroundColor: 'var(--skin-bg-subcard)',
                                  borderColor: 'var(--skin-border-base)',
                                  color: 'var(--skin-text-muted)'
                                }
                              : undefined
                          }
                          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                            verificationCode.trim().length === 6 && !isVerifyingCode
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-950/40 cursor-pointer'
                              : 'border cursor-not-allowed'
                          }`}
                        >
                          {isVerifyingCode ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Подтвердить</span>
                            </>
                          )}
                        </button>
                      </div>

                      {verifyError && (
                        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>{verifyError}</span>
                        </div>
                      )}

                      {verifySuccess && (
                        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{verifySuccess}</span>
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              ) : null}

              {/* Password Setup (Google Accounts / In Development) */}
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-card)',
                  borderColor: 'var(--skin-border-card)'
                }}
                className="skin-card p-4 sm:p-5 rounded-2xl border space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      style={{
                        backgroundColor: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-base)'
                      }}
                      className="p-2.5 rounded-xl border text-[var(--skin-text-muted)] shrink-0"
                    >
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="text-sm font-bold text-[var(--skin-text-primary)]">
                          Установить пароль
                        </h5>
                        <span className="px-2 py-0.5 rounded-lg bg-zinc-800/90 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-wider">
                          В разработке
                        </span>
                      </div>
                      <p className="text-xs text-[var(--skin-text-secondary)] mt-1 leading-relaxed">
                        {user.hasPassword === false
                          ? 'Ваш аккаунт создан через Google. Возможность установить отдельный пароль для входа по электронной почте появится в следующих обновлениях.'
                          : 'Для вашего аккаунта уже установлен пароль для входа по электронной почте. Функция установки пароля для Google-аккаунтов находится в разработке.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    style={{
                      backgroundColor: 'var(--skin-bg-subcard)',
                      borderColor: 'var(--skin-border-base)',
                      color: 'var(--skin-text-muted)'
                    }}
                    className="px-4 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 opacity-60 cursor-not-allowed select-none shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Установить пароль</span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700 text-[9px] uppercase">
                      В разработке
                    </span>
                  </button>
                </div>
              </div>

              {/* Account Deletion Card (Requirement 1, 2, 4) */}
              {(() => {
                const isMainAdminAccount = isMainAdminUser(user);
                const hasExistingDeletion = Boolean(user.deletionState?.hasActiveRequest);
                const deletionBlocked = isMainAdminAccount || isInActiveMatch || hasExistingDeletion;
                return (
                  <div
                    style={{
                      backgroundColor: 'var(--skin-bg-card)',
                      borderColor: 'var(--skin-border-card)'
                    }}
                    className="skin-card p-4 sm:p-5 rounded-2xl border border-rose-900/50 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-400 shrink-0">
                          <Trash2 className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h5 className="text-sm font-bold text-[var(--skin-text-primary)]">
                            {t('deletion.account_card_title', 'Удаление аккаунта')}
                          </h5>
                          <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
                            {t(
                              'deletion.account_card_desc',
                              'Необратимое удаление учётной записи, прогресса, инвентаря и персональных данных.'
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={deletionBlocked}
                        onClick={() => {
                          sounds.playTick();
                          setIsDeletionModalOpen(true);
                        }}
                        className="px-4 py-2.5 rounded-xl border border-rose-700/80 bg-rose-950/60 hover:bg-rose-900/70 disabled:opacity-50 disabled:cursor-not-allowed text-rose-200 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 min-h-[40px]"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>{t('deletion.account_open_btn', 'Удалить аккаунт')}</span>
                      </button>
                    </div>

                    {isMainAdminAccount && (
                      <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-700/50 text-xs text-amber-200 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          {t(
                            'deletion.account_main_admin_protected',
                            'Главный администратор защищён от самостоятельного удаления.'
                          )}
                        </span>
                      </div>
                    )}

                    {!isMainAdminAccount && isInActiveMatch && (
                      <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-700/50 text-xs text-amber-200 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          {t(
                            'deletion.account_active_match_block',
                            'Удалить аккаунт можно после завершения текущей партии'
                          )}
                        </span>
                      </div>
                    )}

                    {!isMainAdminAccount && !isInActiveMatch && hasExistingDeletion && (
                      <div className="p-3 rounded-xl bg-amber-950/35 border border-amber-700/50 text-xs text-amber-200 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>
                          {t('deletion.account_pending_note', 'Запрос на удаление аккаунта уже оформлен.')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Logout Card inside Account Section */}
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-card)',
                  borderColor: 'var(--skin-border-card)'
                }}
                className="skin-card p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <h5 className="text-sm font-bold text-[var(--skin-text-primary)]">Выход из аккаунта</h5>
                  <p className="text-xs text-[var(--skin-text-secondary)] mt-0.5">
                    Завершить текущую сессию на этом устройстве. Весь прогресс и предметы сохранены на сервере.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-4 py-2.5 rounded-xl border border-rose-800/70 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Выход из аккаунта</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* CHEST UNBOXING CELEBRATION MODAL */}
        {unboxedLoot && (
          <div
            style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
            className="absolute inset-0 z-50 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="skin-modal w-full max-w-sm border rounded-3xl p-6 text-center space-y-4">
              <div className="text-5xl animate-bounce">🎁</div>
              <h3 className="text-lg font-bold text-[var(--skin-text-primary)]">Сундук открыт!</h3>
              <p className="text-xs text-amber-200 leading-relaxed font-medium bg-amber-950/40 p-3 rounded-xl border border-amber-800/50">
                {unboxedLoot.message}
              </p>
              <button
                onClick={() => {
                  setUnboxedLoot(null);
                  sounds.playTick();
                }}
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  color: 'var(--skin-btn-primary-text)'
                }}
                className="w-full py-2.5 rounded-xl font-bold text-xs transition-all hover:brightness-110 shadow-lg cursor-pointer"
              >
                Отлично!
              </button>
            </div>
          </div>
        )}

        {/* ================= SELECTED ITEM DETAIL PREVIEW MODAL ================= */}
        {selectedItemDetail && (
          <div
            style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
            className="fixed inset-0 z-60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="skin-modal w-full max-w-sm border rounded-3xl p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl p-2.5 rounded-2xl bg-black/50 border border-white/10">
                    {selectedItemDetail.icon}
                  </div>
                  <div>
                    <span className={`text-[10px] uppercase font-mono font-bold ${RARITY_CONFIG[selectedItemDetail.rarity].color}`}>
                      {RARITY_CONFIG[selectedItemDetail.rarity].label}
                    </span>
                    <h4 className="text-sm font-bold text-[var(--skin-text-primary)]">{selectedItemDetail.name}</h4>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedItemDetail(null)}
                  className="skin-btn-secondary p-1 rounded-lg border cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="skin-subcard text-xs text-[var(--skin-text-secondary)] leading-relaxed p-3 rounded-xl border">
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
                  <span className="text-[var(--skin-text-secondary)]">Ломбард: {selectedItemDetail.pawnValue} кр</span>
                )}
              </div>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="skin-btn-secondary w-full py-2 rounded-xl border font-bold text-xs transition-colors cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}

        {/* ================= STAGE 4 INTERACTIVE LOOTBOX OPENING MODAL ================= */}
        {activeLootboxModal && (
          <LootboxOpenModal
            user={user}
            inventoryEntry={activeLootboxModal.inventoryEntry}
            itemDef={activeLootboxModal.itemDef}
            mediaAssetsMap={mediaAssetsMap}
            soundDefaults={soundDefaults}
            deletedReplacements={deletedReplacements}
            recoveredPayload={activeLootboxModal.recoveredPayload}
            onClose={() => setActiveLootboxModal(null)}
            onUpdateUser={(updatedUser) => {
              onUpdateUser(updatedUser);
            }}
          />
        )}

        {/* ================= SELF ACCOUNT DELETION CONFIRMATION MODAL ================= */}
        <AccountDeletionModal
          isOpen={isDeletionModalOpen}
          user={user}
          isInActiveMatch={isInActiveMatch}
          onClose={() => setIsDeletionModalOpen(false)}
          onDeletionSubmitted={(updatedUser) => {
            setIsDeletionModalOpen(false);
            onUpdateUser(updatedUser);
            onClose();
          }}
        />

      </div>
    </div>
  );
};
