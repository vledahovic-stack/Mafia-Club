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
  Mail
} from 'lucide-react';
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

type ProfileTab = 'inventory' | 'promocodes' | 'experience' | 'friends' | 'mastery' | 'history' | 'stats' | 'email' | 'nickname' | 'avatar' | 'catalog' | 'streak' | 'webrtc' | 'language';

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
  }, [isOpen, activeTab, fetchMyPromoState]);

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
      id: 'email' as const,
      title: 'Подтверждение Email',
      shortTitle: 'Email',
      subtitle: user.isEmailVerified 
        ? 'Почта подтверждена · Аккаунт защищён' 
        : 'Добровольное подтверждение почты для защиты аккаунта',
      icon: Mail,
      badge: user.isEmailVerified ? '✓ Защищён' : 'Не подтверждён',
      badgeColor: user.isEmailVerified 
        ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300' 
        : 'bg-amber-950/80 border-amber-700/60 text-amber-300',
      isAlert: !user.isEmailVerified
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
      id: 'promocodes' as const,
      title: 'Промокоды и Рефералы',
      shortTitle: 'Промокоды',
      subtitle: 'Ввод промокодов, реферальный код партнёра и прогресс наград',
      icon: Gift,
      badge: myPromoState?.activations?.some(a => !a.allPlayerRewardsGranted)
        ? 'В ПРОГРЕССЕ'
        : 'КОДЫ',
      badgeColor: 'bg-amber-950/80 border-amber-600/70 text-amber-300'
    },
    {
      id: 'catalog' as const,
      title: 'Все предметы',
      shortTitle: 'Каталог',
      subtitle: 'Полная база предметов Города и ломбард',
      icon: Tag,
      badge: `${catalogList.length} предм.`,
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
        
        {/* ================= DESKTOP TOP HEADER (hidden on mobile, md:flex) ================= */}
        <div
          style={{
            background: 'var(--skin-bg-header)',
            borderColor: 'var(--skin-border-header)'
          }}
          className="skin-header hidden md:flex px-6 py-4 border-b items-center justify-between relative shrink-0"
        >
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { setActiveTab('avatar'); sounds.playTick(); }}
              title="Нажмите, чтобы сменить аватар профиля"
              style={{
                background: 'var(--skin-btn-primary-bg)',
                borderColor: 'var(--skin-border-accent)',
                boxShadow: 'var(--skin-glow-accent)'
              }}
              className="cyber-avatar-ring relative group w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-2xl border shrink-0 cursor-pointer overflow-hidden transition-all active:scale-95"
            >
              <span className="text-2xl drop-shadow-md">
                {user.avatarSeed && user.avatarSeed.length <= 4 ? user.avatarSeed : user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-[var(--skin-accent-secondary)] font-bold transition-opacity">
                <Camera className="w-5 h-5 text-[var(--skin-accent-secondary)]" />
              </div>
            </button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-[var(--skin-text-primary)] tracking-tight">{user.displayName}</h3>
                {user.clanTag && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/70 text-amber-300 text-[10px] font-mono font-black" title={user.clanName ? `Клан: ${user.clanName} (${user.clanRole === 'leader' ? 'Лидер' : 'Участник'})` : undefined}>
                    [{user.clanTag}]
                  </span>
                )}
                {user.equippedCosmetics?.title && (
                  <span
                    style={{
                      background: 'var(--skin-bg-elevated)',
                      borderColor: 'var(--skin-border-accent)',
                      color: 'var(--skin-accent-secondary)'
                    }}
                    className="px-2 py-0.5 rounded-md border text-[10px] font-bold"
                  >
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
                    style={{
                      background: 'var(--skin-bg-elevated)',
                      borderColor: 'var(--skin-border-base)',
                      color: 'var(--skin-text-secondary)'
                    }}
                    className="px-2 py-0.5 rounded-full border hover:border-[var(--skin-border-accent)] hover:text-[var(--skin-accent-secondary)] text-[10px] font-mono transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Award className="w-3 h-3 text-[var(--skin-accent-primary)]" />
                    <span>Мастерство</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setActiveTab('history'); sounds.playTick(); }}
                  title="Открыть историю игр и статистику матчей"
                  style={{
                    background: 'var(--skin-bg-elevated)',
                    borderColor: 'var(--skin-border-base)',
                    color: 'var(--skin-accent-secondary)'
                  }}
                  className="px-2.5 py-0.5 rounded-full border hover:border-[var(--skin-border-accent)] text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Trophy className="w-3 h-3 text-[var(--skin-accent-primary)]" />
                  <span>{stats.rating} Elo ({stats.gamesPlayed} игр)</span>
                </button>

                {/* Level & Rank Pill */}
                <button
                  type="button"
                  onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
                  title={`Шкала опыта: Ур. ${levelInfo.level} (${levelInfo.title}). Прогресс: ${levelInfo.xpInCurrentLevel}/${levelInfo.xpNeededForNextLevel} XP (${levelInfo.progressPercent}%). Нажмите для подробного просмотра.`}
                  style={{
                    background: 'var(--skin-bg-elevated)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-secondary)'
                  }}
                  className="px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <span>{levelInfo.badgeIcon}</span>
                  <span>Ур. {levelInfo.level}</span>
                  <span className="text-[var(--skin-text-secondary)] font-sans hidden sm:inline">• {levelInfo.title}</span>
                </button>
              </div>

              {/* Quick Experience Scale Bar */}
              <div 
                onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
                title={`Шкала опыта: ${levelInfo.xpInCurrentLevel} / ${levelInfo.xpNeededForNextLevel} XP (${levelInfo.progressPercent}%). Нажмите для подробного просмотра шкалы опыта.`}
                className="mt-1 flex items-center gap-2 cursor-pointer group"
              >
                <div
                  style={{ background: 'var(--skin-bg-slot)', borderColor: 'var(--skin-border-base)' }}
                  className="w-36 sm:w-48 h-2 rounded-full overflow-hidden border relative"
                >
                  <div 
                    style={{
                      width: `${levelInfo.progressPercent}%`,
                      background: 'var(--skin-btn-primary-bg)'
                    }}
                    className="h-full rounded-full transition-all duration-500 group-hover:brightness-110 shadow-xs"
                  />
                </div>
                <span className="text-[10px] font-mono font-bold text-[var(--skin-accent-primary)] group-hover:text-[var(--skin-accent-secondary)]">
                  {levelInfo.xpInCurrentLevel}/{levelInfo.xpNeededForNextLevel} XP ({levelInfo.progressPercent}%)
                </span>
                <span className="text-[10px] text-[var(--skin-text-muted)] hidden md:inline">
                  • Всего: {levelInfo.totalXp.toLocaleString()} XP
                </span>
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-[var(--skin-text-secondary)] font-mono">{user.email}</span>
                {user.isEmailVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Подтверждён
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setActiveTab('email'); sounds.playTick(); }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 hover:bg-amber-900 border border-amber-600/70 text-amber-300 hover:text-white text-[10px] font-bold cursor-pointer transition-all shadow-xs"
                    title="Нажмите для добровольного подтверждения почты"
                  >
                    <Mail className="w-3 h-3 text-amber-400" />
                    Подтвердить email
                  </button>
                )}
              </div>
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
                style={
                  streakInfo.claimedToday
                    ? {
                        background: 'var(--skin-bg-elevated)',
                        borderColor: 'var(--skin-border-accent)',
                        color: 'var(--skin-accent-secondary)'
                      }
                    : {
                        background: 'var(--skin-btn-primary-bg)',
                        borderColor: 'var(--skin-border-accent)',
                        color: 'var(--skin-btn-primary-text)',
                        boxShadow: 'var(--skin-glow-accent)'
                      }
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs cursor-pointer transition-all ${
                  streakInfo.claimedToday ? '' : 'animate-pulse'
                }`}
              >
                <Flame className={`w-4 h-4 ${streakInfo.claimedToday ? 'text-[var(--skin-accent-primary)]' : 'text-yellow-200 fill-current'}`} />
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
                  style={{
                    background: 'var(--skin-bg-elevated)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-secondary)'
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border hover:opacity-90 font-bold text-xs transition-colors shadow-sm cursor-pointer"
                >
                  <span>💡</span>
                  <span className="hidden sm:inline">Связь с Доном</span>
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'var(--skin-btn-secondary-bg)',
                borderColor: 'var(--skin-btn-secondary-border)',
                color: 'var(--skin-text-secondary)'
              }}
              className="p-1.5 rounded-lg border hover:text-[var(--skin-text-primary)] transition-colors ml-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= MOBILE TOP HEADER (md:hidden) ================= */}
        <div
          style={{
            background: 'var(--skin-bg-header)',
            borderColor: 'var(--skin-border-header)'
          }}
          className="skin-header md:hidden border-b px-3 py-2.5 flex flex-col gap-2 shrink-0"
        >
          {/* Top Line: Avatar + User Info + Admin / Feedback / Close */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => { setActiveTab('avatar'); sounds.playTick(); }}
                title="Нажмите, чтобы сменить аватар профиля"
                style={{
                  background: 'var(--skin-btn-primary-bg)',
                  borderColor: 'var(--skin-border-accent)',
                  boxShadow: 'var(--skin-glow-accent)'
                }}
                className="cyber-avatar-ring relative group w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg border shrink-0 cursor-pointer overflow-hidden transition-all active:scale-95"
              >
                <span className="text-lg drop-shadow-md">
                  {user.avatarSeed && user.avatarSeed.length <= 4 ? user.avatarSeed : user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-[var(--skin-accent-secondary)] font-bold transition-opacity">
                  <Camera className="w-4 h-4 text-[var(--skin-accent-secondary)]" />
                </div>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-sm font-bold text-[var(--skin-text-primary)] tracking-tight truncate max-w-[140px]">
                    {user.displayName}
                  </h3>
                  {user.clanTag && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300 text-[9px] font-mono font-black shrink-0">
                      [{user.clanTag}]
                    </span>
                  )}
                  {user.equippedCosmetics?.title && (
                    <span
                      style={{
                        background: 'var(--skin-bg-elevated)',
                        borderColor: 'var(--skin-border-accent)',
                        color: 'var(--skin-accent-secondary)'
                      }}
                      className="px-1.5 py-0.2 rounded border text-[9px] font-bold truncate max-w-[90px]"
                    >
                      {user.equippedCosmetics.title}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-[var(--skin-text-secondary)] mt-0.5 truncate">
                  <span className="text-[var(--skin-accent-primary)] font-mono font-bold">{levelInfo.badgeIcon} Ур. {levelInfo.level}</span>
                  <span>•</span>
                  <span className="truncate">{levelInfo.title}</span>
                </div>

                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-[var(--skin-text-secondary)] font-mono truncate max-w-[110px]">{user.email}</span>
                  {user.isEmailVerified ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-950/80 border border-emerald-600/70 text-emerald-300 text-[9px] font-bold">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                      ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setActiveTab('email'); sounds.playTick(); }}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-950/80 hover:bg-amber-900 border border-amber-600/70 text-amber-300 text-[9px] font-bold cursor-pointer"
                      title="Подтвердить email"
                    >
                      <Mail className="w-2.5 h-2.5 text-amber-400" />
                      Подтвердить
                    </button>
                  )}
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
                  style={{
                    background: 'var(--skin-bg-elevated)',
                    borderColor: 'var(--skin-border-accent)',
                    color: 'var(--skin-accent-secondary)'
                  }}
                  className="p-1.5 rounded-lg border hover:text-[var(--skin-text-primary)]"
                >
                  <span className="text-xs">💡</span>
                </button>
              )}

              <button
                onClick={onClose}
                style={{
                  background: 'var(--skin-btn-secondary-bg)',
                  borderColor: 'var(--skin-btn-secondary-border)',
                  color: 'var(--skin-text-secondary)'
                }}
                className="p-1.5 rounded-lg hover:text-[var(--skin-text-primary)] border transition-colors cursor-pointer"
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
              style={
                streakInfo.claimedToday
                  ? {
                      background: 'var(--skin-bg-elevated)',
                      borderColor: 'var(--skin-border-accent)',
                      color: 'var(--skin-accent-secondary)'
                    }
                  : {
                      background: 'var(--skin-btn-primary-bg)',
                      borderColor: 'var(--skin-border-accent)',
                      color: 'var(--skin-btn-primary-text)'
                    }
              }
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold text-[11px] shrink-0 transition-all cursor-pointer ${
                streakInfo.claimedToday ? '' : 'animate-pulse shadow-sm'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${streakInfo.claimedToday ? 'text-[var(--skin-accent-primary)]' : 'text-yellow-200 fill-current'}`} />
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
              style={{
                background: 'var(--skin-bg-elevated)',
                borderColor: 'var(--skin-border-base)',
                color: 'var(--skin-accent-primary)'
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono font-bold text-[11px] shrink-0 cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
              <span>{stats.rating} Elo</span>
            </button>

            {/* Role Mastery Pill */}
            <button
              type="button"
              onClick={() => { setActiveTab('mastery'); sounds.playTick(); }}
              style={{
                background: 'var(--skin-bg-elevated)',
                borderColor: 'var(--skin-border-base)',
                color: 'var(--skin-accent-secondary)'
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono font-bold text-[11px] shrink-0 cursor-pointer"
            >
              <Award className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
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
            style={{
              background: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-subtle)'
            }}
            className="flex items-center gap-2 px-2.5 py-1 rounded-lg border cursor-pointer active:scale-[0.99] transition-all"
            title="Открыть шкалу опыта"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[10px] font-mono leading-none mb-1">
                <span className="text-[var(--skin-text-primary)] font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[var(--skin-accent-primary)]" />
                  <span>Ур. {levelInfo.level}</span>
                  <span className="text-[var(--skin-text-muted)]">•</span>
                  <span className="text-[var(--skin-accent-primary)] truncate">{levelInfo.title}</span>
                </span>
                <span className="text-[var(--skin-accent-primary)] font-bold">{levelInfo.progressPercent}%</span>
              </div>
              <div
                style={{ background: 'var(--skin-bg-slot)' }}
                className="w-full h-1.5 rounded-full overflow-hidden relative"
              >
                <div 
                  style={{
                    width: `${Math.max(3, levelInfo.progressPercent)}%`,
                    background: 'var(--skin-btn-primary-bg)'
                  }}
                  className="h-full rounded-full"
                />
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--skin-text-muted)] shrink-0" />
          </div>
        </div>

        {/* ================= MOBILE NAVIGATION BAR & HORIZONTAL TAB STRIP (md:hidden) ================= */}
        <div
          style={{
            background: 'var(--skin-bg-elevated)',
            borderColor: 'var(--skin-border-subtle)'
          }}
          className="md:hidden border-b px-2.5 py-1.5 flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {/* Quick All Sections Drawer Button */}
          <button
            onClick={() => {
              sounds.playTick();
              setIsMobileSectionsDrawerOpen(true);
            }}
            style={{
              background: 'var(--skin-bg-subcard)',
              borderColor: 'var(--skin-border-accent)',
              color: 'var(--skin-accent-primary)'
            }}
            className="h-8 px-2.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-sm cursor-pointer"
            title="Все разделы профиля"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span className="text-[11px] font-mono font-bold">Разделы</span>
            <span
              style={{
                background: 'var(--skin-bg-elevated)',
                borderColor: 'var(--skin-border-accent)',
                color: 'var(--skin-accent-secondary)'
              }}
              className="text-[9px] font-mono px-1 rounded border"
            >
              {profileTabsConfig.length}
            </span>
          </button>

          <div
            style={{ backgroundColor: 'var(--skin-border-base)' }}
            className="w-px h-5 shrink-0"
          />

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
                style={
                  isActive
                    ? {
                        background: 'var(--skin-btn-primary-bg)',
                        borderColor: 'var(--skin-border-accent)',
                        color: 'var(--skin-btn-primary-text)',
                        boxShadow: 'var(--skin-glow-accent)'
                      }
                    : {
                        background: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-base)',
                        color: 'var(--skin-text-secondary)'
                      }
                }
                className="h-8 px-2.5 rounded-lg border text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer hover:text-[var(--skin-text-primary)]"
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-current' : 'text-[var(--skin-text-muted)]'}`} />
                <span>{tab.shortTitle}</span>
                {tab.isAlert ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                ) : (
                  <span className={`text-[9px] font-mono px-1 rounded ${
                    isActive ? 'bg-black/30 text-white' : 'bg-black/40 text-[var(--skin-text-secondary)]'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ================= DESKTOP TAB NAVIGATION (hidden on mobile, md:flex) ================= */}
        <div
          style={{
            background: 'var(--skin-bg-elevated)',
            borderColor: 'var(--skin-border-base)'
          }}
          className="hidden md:flex border-b px-6 shrink-0 gap-1 overflow-x-auto"
        >
          <button
            onClick={() => { setActiveTab('experience'); sounds.playTick(); }}
            style={
              activeTab === 'experience'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>Шкала опыта (Ур. {levelInfo.level})</span>
          </button>

          <button
            onClick={() => { setActiveTab('inventory'); sounds.playTick(); }}
            style={
              activeTab === 'inventory'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Package className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>Инвентарь ({inventory.reduce((acc, i) => acc + i.quantity, 0)})</span>
          </button>

          <button
            onClick={() => { setActiveTab('friends'); sounds.playTick(); }}
            style={
              activeTab === 'friends'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>Друзья</span>
          </button>

          <button
            onClick={() => { setActiveTab('mastery'); sounds.playTick(); }}
            style={
              activeTab === 'mastery'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Award className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>Мастерство ролей {masterySummary.masteredCount > 0 ? `(👑 ${masterySummary.masteredCount})` : ''}</span>
          </button>

          <button
            onClick={() => { setActiveTab('webrtc'); sounds.playTick(); }}
            style={
              activeTab === 'webrtc'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Video className="w-3.5 h-3.5 text-indigo-400" />
            <span>Видеосвязь WebRTC</span>
          </button>

          <button
            onClick={() => { setActiveTab('language'); sounds.playTick(); }}
            style={
              activeTab === 'language'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>{t('profile.tab_language', 'Язык и Настройки')}</span>
          </button>

          <button
            onClick={() => { setActiveTab('email'); sounds.playTick(); }}
            style={
              activeTab === 'email'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Mail className={`w-3.5 h-3.5 ${user.isEmailVerified ? 'text-emerald-400' : 'text-[var(--skin-accent-primary)]'}`} />
            <span>Email</span>
            {user.isEmailVerified ? (
              <span className="text-[9px] font-mono px-1 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">✓</span>
            ) : (
              <span className="text-[9px] font-mono px-1 rounded bg-amber-950/80 text-amber-300 border border-amber-700/60">!</span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('nickname'); sounds.playTick(); }}
            style={
              activeTab === 'nickname'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-blue-400" />
            <span>Смена никнейма</span>
          </button>

          <button
            onClick={() => { setActiveTab('catalog'); sounds.playTick(); }}
            style={
              activeTab === 'catalog'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>Все предметы ({catalogList.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); sounds.playTick(); }}
            style={
              activeTab === 'history'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>История игр {stats.gamesPlayed > 0 ? `(${stats.gamesPlayed})` : ''}</span>
          </button>

          <button
            onClick={() => { setActiveTab('stats'); sounds.playTick(); }}
            style={
              activeTab === 'stats'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />
            <span>Статистика</span>
          </button>

          <button
            onClick={() => { setActiveTab('streak'); sounds.playTick(); }}
            style={
              activeTab === 'streak'
                ? {
                    borderColor: 'var(--skin-accent-primary)',
                    color: 'var(--skin-text-primary)',
                    backgroundColor: 'var(--skin-bg-subcard)'
                  }
                : {
                    borderColor: 'transparent',
                    color: 'var(--skin-text-secondary)'
                  }
            }
            className="py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
          >
            <Flame className="w-3.5 h-3.5 text-[var(--skin-accent-primary)] fill-current" />
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
          <div className={`px-6 py-2 text-xs font-bold text-center border-b shrink-0 ${
            actionFeedback.type === 'success' 
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' 
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}>
            {actionFeedback.text}
          </div>
        )}

        {/* Tab Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 font-sans">
          
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
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-card)',
                    borderColor: 'var(--skin-border-accent)',
                    boxShadow: 'var(--skin-shadow-card)'
                  }}
                  className="p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        backgroundColor: 'var(--skin-bg-subcard)',
                        borderColor: 'var(--skin-border-accent)'
                      }}
                      className="w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0"
                    >
                      🎯
                    </div>
                    <div>
                      <h4 className="font-bold text-[var(--skin-text-primary)] text-xs sm:text-sm">Бонусный опыт за выполнение задач и ивентов</h4>
                      <p className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5">
                        Выполняйте общие, вводные, личные и клановые задачи, чтобы быстрее повышать уровень и открывать ранги!
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sounds.playTick();
                      onOpenTasks();
                    }}
                    style={{
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)'
                    }}
                    className="px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider shrink-0 transition-all shadow-md hover:brightness-110 cursor-pointer"
                  >
                    Квесты и Ивенты
                  </button>
                </div>
              )}

              {/* SECTION: КАК ПОЛУЧАТЬ ОЧКИ ОПЫТА В ИГРЕ */}
              <div className="skin-card p-5 rounded-2xl border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                      <Award className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                      <span>Как получать очки опыта за действия в партии</span>
                    </h4>
                    <p className="text-xs text-[var(--skin-text-secondary)] mt-0.5">
                      Очки опыта зачисляются в режиме реального времени за результативные действия и повышают вашу шкалу
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {activeActionRules.map(action => (
                    <div 
                      key={action.id}
                      className="skin-subcard p-3 rounded-xl border flex items-start justify-between gap-2.5 hover:border-[var(--skin-border-strong)] transition-colors"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-xl shrink-0 mt-0.5">{action.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-[var(--skin-text-primary)] leading-snug">{action.name}</div>
                          <div className="text-[10px] text-[var(--skin-text-secondary)] mt-0.5 leading-tight">{action.description}</div>
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
              <div className="skin-card p-5 rounded-2xl border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[var(--skin-text-primary)] flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                      <span>Дорожная карта рангов и званий Города (Уровни 1 — {expConfig.maxLevel || activeMilestones.length})</span>
                    </h4>
                    <p className="text-xs text-[var(--skin-text-secondary)] mt-0.5">
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
                        style={
                          !isCurrent && !isReached
                            ? {
                                backgroundColor: 'var(--skin-bg-subcard)',
                                borderColor: 'var(--skin-border-subtle)'
                              }
                            : isReached && !isCurrent
                            ? {
                                backgroundColor: 'var(--skin-bg-subcard)'
                              }
                            : undefined
                        }
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isCurrent
                            ? 'bg-gradient-to-r from-amber-950/60 to-yellow-950/50 border-amber-500 shadow-md shadow-amber-950/40'
                            : isReached
                            ? 'border-emerald-800/60'
                            : 'opacity-75'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                            isCurrent ? 'bg-amber-950 border border-amber-400' : isReached ? 'bg-emerald-950/80 border border-emerald-700' : 'bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)]'
                          }`}>
                            {milestone.badgeIcon}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--skin-text-primary)] truncate">
                                Ур. {milestone.level} · {milestone.title}
                              </span>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-zinc-950 text-[9px] font-black font-mono">
                                  ВЫ ЗДЕСЬ
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--skin-text-secondary)] mt-0.5 truncate">
                              {milestone.perkDescription}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[10px] font-mono text-[var(--skin-text-secondary)]">
                            {milestone.requiredXp.toLocaleString()} XP
                          </div>
                          {isReached ? (
                            <span className="text-[10px] font-bold text-emerald-400 font-mono">✓ Получено</span>
                          ) : (
                            <span className="text-[10px] text-[var(--skin-text-muted)] font-mono">🔒 Заблокировано</span>
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
                style={
                  !streakInfo.canClaimToday
                    ? {
                        backgroundColor: 'var(--skin-bg-card)',
                        borderColor: 'var(--skin-border-base)'
                      }
                    : undefined
                }
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                  streakInfo.canClaimToday
                    ? 'bg-gradient-to-r from-orange-950/60 via-amber-950/50 to-[var(--skin-bg-card)] border-orange-500/80 shadow-md shadow-orange-950/30 hover:border-orange-400'
                    : 'hover:border-[var(--skin-border-strong)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl shrink-0 ${streakInfo.canClaimToday ? 'bg-orange-600 text-white animate-bounce' : 'bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-accent-primary)]'}`}>
                    <Flame className="w-5 h-5 fill-current text-yellow-200" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[var(--skin-text-primary)] uppercase font-mono">
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
                    <span className="text-[11px] text-[var(--skin-text-secondary)] block mt-0.5">
                      {streakInfo.canClaimToday 
                        ? `Заберите награду за День ${streakInfo.targetDay} (+${streakInfo.todayRewardCredits} кр)!` 
                        : `Серия активна! Завтра вас ждет День ${streakInfo.nextDay} (+${streakInfo.nextRewardCredits} кр)`}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  style={{
                    background: 'var(--skin-btn-primary-bg)',
                    color: 'var(--skin-btn-primary-text)'
                  }}
                  className="px-3.5 py-1.5 rounded-xl font-bold text-xs tracking-tight transition-all shrink-0 shadow-sm hover:brightness-110 cursor-pointer"
                >
                  {streakInfo.canClaimToday ? 'Забрать' : 'Обзор'}
                </button>
              </div>
              {/* Category Filter Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    style={
                      selectedCategory === 'all'
                        ? {
                            background: 'var(--skin-btn-primary-bg)',
                            color: 'var(--skin-btn-primary-text)'
                          }
                        : {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)',
                            color: 'var(--skin-text-secondary)'
                          }
                    }
                    className="px-3 py-1 rounded-lg text-xs font-bold border transition-colors shrink-0 cursor-pointer hover:text-[var(--skin-text-primary)]"
                  >
                    Все
                  </button>
                  {Object.entries(CATEGORY_CONFIG).map(([catKey, cat]) => (
                    <button
                      key={catKey}
                      onClick={() => setSelectedCategory(catKey as ItemCategory)}
                      style={
                        selectedCategory === catKey
                          ? {
                              background: 'var(--skin-btn-primary-bg)',
                              color: 'var(--skin-btn-primary-text)'
                            }
                          : {
                              backgroundColor: 'var(--skin-bg-subcard)',
                              borderColor: 'var(--skin-border-base)',
                              color: 'var(--skin-text-secondary)'
                            }
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs border flex items-center gap-1 transition-colors shrink-0 cursor-pointer hover:text-[var(--skin-text-primary)] ${
                        selectedCategory === catKey ? 'font-bold' : 'font-medium'
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
                    className="text-xs font-bold text-[var(--skin-accent-primary)] hover:brightness-110 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Перейти в магазин</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Items Grid */}
              {filteredInventory.length === 0 ? (
                <div
                  style={{
                    backgroundColor: 'var(--skin-bg-card)',
                    borderColor: 'var(--skin-border-base)'
                  }}
                  className="p-8 rounded-2xl border border-dashed text-center space-y-3"
                >
                  <Package className="w-10 h-10 text-[var(--skin-text-muted)] mx-auto" />
                  <div className="text-sm font-bold text-[var(--skin-text-primary)]">Инвентарь пуст в этой категории</div>
                  <p className="text-xs text-[var(--skin-text-secondary)] max-w-sm mx-auto">
                    Вы можете приобрести сундуки, сертификаты и косметику в Магазине Города за кредиты.
                  </p>
                  {onOpenShop && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenShop();
                      }}
                      style={{
                        background: 'var(--skin-btn-primary-bg)',
                        color: 'var(--skin-btn-primary-text)'
                      }}
                      className="mt-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:brightness-110 cursor-pointer"
                    >
                      Открыть Магазин
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredInventory.map((invItem, idx) => {
                    const itemDef = resolveInventoryItemDef(invItem);
                    if (!itemDef) return null;
                    const rarity = RARITY_CONFIG[itemDef.rarity] || RARITY_CONFIG.common;
                    const isEquipped = itemDef.cosmeticType === 'title' 
                      ? user.equippedCosmetics?.title === itemDef.name
                      : itemDef.cosmeticType === 'ui_skin'
                        ? user.equippedCosmetics?.uiSkin === itemDef.id.replace('skin_', '')
                        : user.equippedCosmetics?.cardBack === itemDef.id;

                    const isChest = itemDef.category === 'chests';
                    const stackSnapshot = isChest ? resolveStackSnapshot(invItem, itemDef) : null;
                    const snapshotRewards = stackSnapshot?.rewards || [];
                    const totalWeight = snapshotRewards.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

                    const firstIdleFrameUrl =
                      itemDef.presentationConfig?.idleAnimation?.mode === 'custom_frames'
                        ? itemDef.presentationConfig?.idleAnimation?.frames?.[0]?.imageUrl || ''
                        : '';
                    const customPreviewSrc = firstIdleFrameUrl
                      ? firstIdleFrameUrl.startsWith('data:') || firstIdleFrameUrl.startsWith('http') || firstIdleFrameUrl.startsWith('/')
                        ? firstIdleFrameUrl
                        : mediaAssetsMap[firstIdleFrameUrl]?.sourceUrl || `/api/lootboxes/media/${encodeURIComponent(firstIdleFrameUrl)}`
                      : '';

                    return (
                      <div
                        key={invItem.id || `${invItem.itemId}_${idx}`}
                        style={
                          itemDef.rarity === 'common'
                            ? {
                                backgroundColor: 'var(--skin-bg-card)',
                                borderColor: 'var(--skin-border-card)'
                              }
                            : undefined
                        }
                        className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${rarity.bg} ${rarity.border}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-14 h-14 text-3xl p-2 rounded-xl bg-black/40 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                            {customPreviewSrc ? (
                              <img
                                src={customPreviewSrc}
                                alt={itemDef.name}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <span>{itemDef.icon}</span>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] uppercase font-mono font-bold ${rarity.color}`}>
                                  {rarity.label}
                                </span>
                                {isChest && stackSnapshot && (
                                  <span className="px-1.5 py-0.5 rounded bg-orange-950/80 border border-orange-500/40 text-orange-300 text-[9px] font-mono font-bold">
                                    Снимок v{stackSnapshot.version}
                                  </span>
                                )}
                                {isChest && stackSnapshot && (
                                  <span className="px-1.5 py-0.5 rounded bg-black/60 border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] text-[9px] font-mono">
                                    {stackSnapshot.dropMode === 'independent' ? 'Независимые шансы' : '1 награда'}
                                  </span>
                                )}
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-black/60 text-zinc-200 text-[10px] font-mono font-bold shrink-0">
                                {invItem.quantity} шт
                              </span>
                            </div>

                            <h4 className="text-xs font-bold text-[var(--skin-text-primary)] tracking-tight truncate mt-0.5">
                              {stackSnapshot?.name || itemDef.name}
                            </h4>
                            <p className="text-[11px] text-[var(--skin-text-secondary)] line-clamp-2 mt-0.5 leading-tight">
                              {stackSnapshot?.description || itemDef.description}
                            </p>
                          </div>
                        </div>

                        {/* Snapshot drop table preview for lootboxes */}
                        {isChest && stackSnapshot && snapshotRewards.length > 0 && (
                          <div className="p-2.5 rounded-xl bg-black/45 border border-white/10 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                              <span>Возможные награды (из снимка v{stackSnapshot.version}):</span>
                              {stackSnapshot.consolationPrize?.enabled && (
                                <span className="text-emerald-400 font-bold">✓ Гарантия</span>
                              )}
                            </div>
                            <div className="max-h-28 overflow-y-auto pr-1 space-y-1">
                              {snapshotRewards.map((r, rIdx) => {
                                const probPercent = stackSnapshot.dropMode === 'independent'
                                  ? Math.min(100, Math.max(0, Number(r.chancePercent) || 0))
                                  : totalWeight > 0
                                  ? ((Number(r.weight) || 0) / totalWeight) * 100
                                  : 0;

                                const minQ = Math.max(1, Number(r.minQty) || 1);
                                const maxQ = r.maxQty !== undefined && r.maxQty !== null ? Math.max(minQ, Number(r.maxQty)) : minQ;
                                const qtyStr = minQ === maxQ ? `${minQ}` : `${minQ}–${maxQ}`;

                                let rewardLabel = '';
                                let rewardIcon = '🎁';
                                if (r.type === 'credits') {
                                  rewardIcon = '💰';
                                  rewardLabel = `${qtyStr} кр.`;
                                } else if (r.type === 'xp') {
                                  rewardIcon = '⭐';
                                  rewardLabel = `${qtyStr} XP`;
                                } else if ((r.type === 'item' || r.type === 'lootbox') && r.itemId) {
                                  const targetDef = getItemDefinition(r.itemId);
                                  const delMeta = deletedReplacements[r.itemId];
                                  if (targetDef && !delMeta) {
                                    rewardIcon = targetDef.icon;
                                    rewardLabel = `${targetDef.name}${maxQ > 1 ? ` ×${qtyStr}` : ''}`;
                                  } else if (delMeta) {
                                    rewardIcon = '💰';
                                    rewardLabel = `${r.itemNameSnapshot || delMeta.deletedItemName || r.itemId} (замена)`;
                                  } else {
                                    rewardIcon = r.type === 'lootbox' ? '🧰' : '📦';
                                    rewardLabel = `${r.itemNameSnapshot || r.itemId}${maxQ > 1 ? ` ×${qtyStr}` : ''}`;
                                  }
                                }

                                return (
                                  <div
                                    key={r.id || rIdx}
                                    className="flex items-center justify-between gap-2 text-[10px] py-0.5 border-b border-white/5 last:border-0"
                                  >
                                    <span className="text-zinc-200 truncate flex items-center gap-1">
                                      <span>{rewardIcon}</span>
                                      <span className="truncate">{rewardLabel}</span>
                                    </span>
                                    <span className="font-mono font-bold text-amber-300 shrink-0">
                                      {probPercent.toFixed(1)}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                          {itemDef.id === ROLE_SELECT_CARD_ID ? (
                            <div className="flex-1 py-1.5 px-3 rounded-xl bg-amber-950/70 border border-amber-600/60 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5">
                              <span>🎴 Активируется в лобби перед игрой</span>
                            </div>
                          ) : itemDef.id === NICKNAME_CHANGE_CERTIFICATE_ID ? (
                            <button
                              onClick={() => handleUseItem(itemDef.id)}
                              className="flex-1 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-950/40 cursor-pointer"
                            >
                              <span>Сменить никнейм</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          ) : isChest ? (
                            <>
                              <button
                                disabled={actionLoading}
                                onClick={() => {
                                  sounds.playTick();
                                  setActiveLootboxModal({
                                    inventoryEntry: invItem,
                                    itemDef,
                                    recoveredPayload: null
                                  });
                                }}
                                style={{
                                  background: 'var(--skin-btn-primary-bg)',
                                  color: 'var(--skin-btn-primary-text)'
                                }}
                                className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                              >
                                <Gift className="w-3.5 h-3.5" />
                                <span>Открыть сундук</span>
                              </button>
                              {itemDef.pawnValue ? (
                                <button
                                  disabled={actionLoading}
                                  onClick={() => handlePawnItem(itemDef.id, invItem.id)}
                                  title={`Сдать этот стек в ломбард за +${itemDef.pawnValue} кредитов`}
                                  className="skin-btn-secondary py-1.5 px-2.5 rounded-xl border text-amber-300 text-[11px] font-bold transition-colors flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                                >
                                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                                  <span>+{itemDef.pawnValue} кр</span>
                                </button>
                              ) : null}
                            </>
                          ) : itemDef.category === 'cosmetics' ? (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleUseItem(itemDef.id)}
                              className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                                isEquipped
                                  ? 'bg-emerald-950/80 border border-emerald-600 text-emerald-300'
                                  : 'skin-btn-secondary border text-[var(--skin-text-primary)]'
                              }`}
                            >
                              {isEquipped ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Sparkles className="w-3.5 h-3.5 text-[var(--skin-accent-primary)]" />}
                              <span>{isEquipped ? 'Экипировано' : 'Экипировать'}</span>
                            </button>
                          ) : itemDef.pawnValue ? (
                            <button
                              disabled={actionLoading}
                              onClick={() => handlePawnItem(itemDef.id, invItem.id)}
                              className="skin-btn-secondary flex-1 py-1.5 rounded-xl border text-amber-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
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
          {activeTab === 'avatar' && (
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

          {/* TAB 3: COMPLETE ITEMS CATALOG (СКВОЗНОЙ КАТАЛОГ ВСЕХ ПРЕДМЕТОВ) */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-2 justify-between">
                {/* Search input */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[var(--skin-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    placeholder="Поиск по предметам..."
                    className="skin-input w-full border rounded-xl pl-8 pr-3 py-1.5 text-xs"
                  />
                </div>

                {/* Category filters */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto">
                  <button
                    onClick={() => setCatalogCategory('all')}
                    style={
                      catalogCategory === 'all'
                        ? {
                            background: 'var(--skin-btn-primary-bg)',
                            color: 'var(--skin-btn-primary-text)'
                          }
                        : {
                            backgroundColor: 'var(--skin-bg-subcard)',
                            borderColor: 'var(--skin-border-base)',
                            color: 'var(--skin-text-secondary)'
                          }
                    }
                    className="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer"
                  >
                    Все ({catalogList.length})
                  </button>
                  {Object.entries(CATEGORY_CONFIG).map(([k, c]) => (
                    <button
                      key={k}
                      onClick={() => setCatalogCategory(k as ItemCategory)}
                      style={
                        catalogCategory === k
                          ? {
                              background: 'var(--skin-btn-primary-bg)',
                              color: 'var(--skin-btn-primary-text)'
                            }
                          : {
                              backgroundColor: 'var(--skin-bg-subcard)',
                              borderColor: 'var(--skin-border-base)',
                              color: 'var(--skin-text-secondary)'
                            }
                      }
                      className={`px-2 py-1 rounded-lg text-xs border flex items-center gap-1 transition-colors shrink-0 hover:text-[var(--skin-text-primary)] cursor-pointer ${
                        catalogCategory === k ? 'font-bold' : 'font-medium'
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
                      style={
                        item.rarity === 'common'
                          ? {
                              backgroundColor: 'var(--skin-bg-card)',
                              borderColor: 'var(--skin-border-card)'
                            }
                          : undefined
                      }
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

                        <h4 className="text-xs font-bold text-[var(--skin-text-primary)] tracking-tight truncate mt-0.5">
                          {item.name}
                        </h4>
                        <p className="text-[11px] text-[var(--skin-text-secondary)] line-clamp-2 mt-0.5 leading-tight">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono">
                          <span className="text-amber-400 font-bold">Магазин: {item.cost} кр</span>
                          {item.pawnValue && (
                            <span className="text-[var(--skin-text-muted)]">Ломбард: {item.pawnValue} кр</span>
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
          {activeTab === 'promocodes' && (
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

          {/* TAB: EMAIL VERIFICATION */}
          {activeTab === 'email' && (
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
                        {user.email}
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
              ) : (
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
              )}
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div
          style={{
            backgroundColor: 'var(--skin-bg-header)',
            borderColor: 'var(--skin-border-header)'
          }}
          className="p-3 sm:p-4 border-t flex justify-between items-center shrink-0 gap-2"
        >
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
            className="skin-btn-secondary px-4 sm:px-5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer"
          >
            Закрыть
          </button>
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

        {/* ================= MOBILE ALL SECTIONS BOTTOM DRAWER ================= */}
        {isMobileSectionsDrawerOpen && (
          <div
            style={{ backgroundColor: 'var(--skin-bg-backdrop)' }}
            className="fixed inset-0 z-60 flex flex-col justify-end backdrop-blur-xs select-none md:hidden animate-in fade-in duration-150"
          >
            <div 
              className="absolute inset-0"
              onClick={() => setIsMobileSectionsDrawerOpen(false)}
            />
            <div className="skin-drawer relative w-full max-h-[85vh] border-t rounded-t-3xl shadow-2xl p-4 space-y-3.5 overflow-y-auto z-10 animate-in slide-in-from-bottom duration-200">
              
              {/* Drag Handle */}
              <div className="w-10 h-1.5 bg-[var(--skin-border-strong)] rounded-full mx-auto -mt-1 mb-1" />

              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-[var(--skin-border-header)]">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-[var(--skin-accent-primary)]" />
                  <h3 className="text-sm font-bold text-[var(--skin-text-primary)] uppercase tracking-wider font-mono">
                    Разделы профиля
                  </h3>
                  <span
                    style={{
                      backgroundColor: 'var(--skin-bg-subcard)',
                      borderColor: 'var(--skin-border-accent)',
                      color: 'var(--skin-accent-primary)'
                    }}
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border"
                  >
                    {profileTabsConfig.length} РАЗДЕЛОВ
                  </span>
                </div>
                <button
                  onClick={() => setIsMobileSectionsDrawerOpen(false)}
                  className="skin-btn-secondary p-1.5 rounded-lg border cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Player Mini-Card inside Drawer */}
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-card)',
                  borderColor: 'var(--skin-border-accent)'
                }}
                className="p-3 rounded-2xl border flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    style={{
                      background: 'var(--skin-btn-primary-bg)',
                      color: 'var(--skin-btn-primary-text)'
                    }}
                    className="cyber-avatar-ring w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shadow-sm shrink-0"
                  >
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--skin-text-primary)] truncate">{user.displayName}</div>
                    <div className="text-[10px] text-[var(--skin-accent-primary)] font-mono truncate">
                      {levelInfo.badgeIcon} Ур. {levelInfo.level} · {stats.rating} Elo
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono font-bold text-amber-400 flex items-center justify-end gap-1">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span>{userCredits} кр</span>
                  </div>
                  <div className="text-[10px] text-[var(--skin-accent-primary)] font-mono font-semibold">
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
                      style={
                        isActive
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
                      className="w-full p-2.5 sm:p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer hover:text-[var(--skin-text-primary)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          style={
                            isActive
                              ? {
                                  background: 'var(--skin-btn-primary-bg)',
                                  color: 'var(--skin-btn-primary-text)'
                                }
                              : {
                                  backgroundColor: 'var(--skin-bg-card)',
                                  color: 'var(--skin-text-secondary)'
                                }
                          }
                          className="p-2 rounded-lg shrink-0"
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate text-[var(--skin-text-primary)]">
                            {tab.title}
                          </div>
                          <div className="text-[10px] text-[var(--skin-text-secondary)] truncate">
                            {tab.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${tab.badgeColor}`}>
                          {tab.badge}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-[var(--skin-accent-primary)]' : 'text-[var(--skin-text-muted)]'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Drawer Quick Action Footer Links */}
              <div className="pt-2 border-t border-[var(--skin-border-header)] flex items-center justify-between gap-2">
                {onOpenShop && (
                  <button
                    onClick={() => {
                      setIsMobileSectionsDrawerOpen(false);
                      onClose();
                      onOpenShop();
                    }}
                    className="skin-btn-secondary flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer"
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
                    className="skin-btn-secondary flex-1 py-2 px-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer"
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

      </div>
    </div>
  );
};
