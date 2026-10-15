import React, { useState } from 'react';
import { 
  X, 
  ShoppingCart, 
  Coins, 
  Sparkles, 
  Check, 
  Loader2, 
  AlertCircle, 
  Gift, 
  Scroll, 
  Tag,
  ArrowRight
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { 
  ALL_GAME_ITEMS, 
  ITEMS_LIST, 
  ItemDefinition, 
  ItemCategory, 
  RARITY_CONFIG, 
  CATEGORY_CONFIG 
} from '../data/items';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onOpenAuth?: () => void;
  onOpenInventory?: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = ({ 
  isOpen, 
  onClose,
  user,
  onUpdateUser,
  onOpenAuth,
  onOpenInventory
}) => {
  const [activeCategory, setActiveCategory] = useState<ItemCategory | 'all'>('certificates');
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveItems, setLiveItems] = useState<ItemDefinition[]>(ITEMS_LIST);
  const [shopSettings, setShopSettings] = useState<{ globalDiscount: number; bannerMessage?: string } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      fetch('/api/shop/items')
        .then(r => r.json())
        .then(data => {
          if (data.items && Array.isArray(data.items)) {
            setLiveItems(data.items);
          }
          if (data.settings) {
            setShopSettings(data.settings);
          }
        })
        .catch(() => {
          // Fallback to default ITEMS_LIST
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const userCredits = user && typeof user.credits === 'number' ? user.credits : 250;
  const userInventory = user?.inventory || [];

  const handleBuy = async (item: ItemDefinition) => {
    if (!user) {
      if (onOpenAuth) {
        onClose();
        onOpenAuth();
      }
      return;
    }

    const effectiveDiscount = item.discountPercent !== undefined ? item.discountPercent : (shopSettings?.globalDiscount || 0);
    const finalCost = effectiveDiscount > 0 
      ? Math.max(1, Math.round(item.cost * (1 - effectiveDiscount / 100))) 
      : item.cost;

    if (userCredits < finalCost) {
      setFeedback({ 
        type: 'error', 
        text: `Недостаточно кредитов для покупки (требуется ${finalCost} кр, у вас ${userCredits} кр).` 
      });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }

    setLoadingItemId(item.id);
    setFeedback(null);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/user/buy-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ itemId: item.id })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при покупке');
      }

      sounds.playTick();
      if (onUpdateUser) {
        onUpdateUser(data.user);
      }
      setFeedback({ type: 'success', text: data.message || `Приобретено: «${item.name}»!` });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось завершить покупку';
      setFeedback({ type: 'error', text: msg });
      setTimeout(() => setFeedback(null), 3500);
    } finally {
      setLoadingItemId(null);
    }
  };

  const displayedItems = liveItems
    .filter(i => i.inShop !== false)
    .filter(item => {
      if (activeCategory === 'all') return true;
      return item.category === activeCategory;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-black/80 backdrop-blur-xs select-none overflow-x-hidden">
      <div className="w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[#121319] border-0 md:border md:border-zinc-800 rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-850 bg-[#151620] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-950/60 border border-orange-700/60 flex items-center justify-center text-orange-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Магазин Города
              </h3>
              <p className="text-xs text-zinc-400">Сертификаты, сундуки, титулы и кредиты</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-300 font-bold text-xs shadow-inner">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{userCredits} кредитов</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-zinc-850 px-6 bg-[#13141c] shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => { setActiveCategory('certificates'); sounds.playTick(); }}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeCategory === 'certificates'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>📜</span>
            <span>Сертификаты</span>
          </button>

          <button
            onClick={() => { setActiveCategory('chests'); sounds.playTick(); }}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeCategory === 'chests'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🧰</span>
            <span>Сундуки и кейсы</span>
          </button>

          <button
            onClick={() => { setActiveCategory('cosmetics'); sounds.playTick(); }}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeCategory === 'cosmetics'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>✨</span>
            <span>Рубашки и титулы</span>
          </button>

          <button
            onClick={() => { setActiveCategory('all'); sounds.playTick(); }}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors shrink-0 ${
              activeCategory === 'all'
                ? 'border-orange-500 text-white bg-orange-950/20'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>Все товары</span>
          </button>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div className={`px-6 py-2.5 text-xs font-bold text-center border-b shrink-0 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}>
            {feedback.text}
          </div>
        )}

        {/* Goods Grid */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 font-sans">
          
          {/* Featured Banner when looking at certificates */}
          {activeCategory === 'certificates' && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-[#151a2d] to-[#12131f] border border-blue-600/50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="text-4xl p-2 rounded-2xl bg-blue-900/40 border border-blue-500/30">
                  📜
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase text-blue-400 tracking-wider">
                    Официальный документ
                  </span>
                  <h4 className="text-sm font-bold text-white">Сертификат на смену никнейма</h4>
                  <p className="text-[11px] text-zinc-300 mt-0.5 max-w-md">
                    Дает право на одну бесплатную смену имени в профиле. Сохраняется в вашем инвентаре.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {displayedItems.map(item => {
              const rarity = RARITY_CONFIG[item.rarity];
              const ownedCount = userInventory.find(i => i.itemId === item.id)?.quantity || 0;
              const isLoading = loadingItemId === item.id;
              const canAfford = userCredits >= item.cost;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${rarity.bg} ${rarity.border}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl p-2.5 rounded-xl bg-black/40 border border-white/10 shrink-0">
                      {item.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] uppercase font-mono font-bold ${rarity.color}`}>
                          {rarity.label}
                        </span>
                        {ownedCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[9px] font-bold">
                            У вас: {ownedCount}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-white tracking-tight truncate mt-0.5">
                        {item.name}
                      </h4>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-tight">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Price & Buy Button */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs font-mono">
                      <Coins className="w-3.5 h-3.5" />
                      <span>{item.cost} кр</span>
                    </div>

                    <button
                      disabled={isLoading}
                      onClick={() => handleBuy(item)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        !user 
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' 
                          : canAfford
                          ? 'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-md shadow-orange-950/40'
                          : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Покупка...</span>
                        </>
                      ) : !user ? (
                        <span>Войти для покупки</span>
                      ) : (
                        <span>Купить</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#12131b] border-t border-zinc-800 flex items-center justify-between shrink-0 text-xs">
          {onOpenInventory && user ? (
            <button
              onClick={() => {
                onClose();
                onOpenInventory();
              }}
              className="text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1.5"
            >
              <span>Открыть инвентарь профиля</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-zinc-500">Предметы мгновенно доставляются в инвентарь</span>
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold transition-colors"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
};
