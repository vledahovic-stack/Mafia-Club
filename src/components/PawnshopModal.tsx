import React, { useState } from 'react';
import { 
  X, 
  Scale, 
  Coins, 
  Check, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  Package
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { ALL_GAME_ITEMS, RARITY_CONFIG } from '../data/items';

interface PawnshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onOpenShop?: () => void;
}

export const PawnshopModal: React.FC<PawnshopModalProps> = ({ 
  isOpen, 
  onClose,
  user,
  onUpdateUser,
  onOpenShop
}) => {
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const userCredits = user && typeof user.credits === 'number' ? user.credits : 250;
  const userInventory = user?.inventory || [];

  // Find all items in user's inventory that have a pawnValue
  const pawnableItems = userInventory
    .map(invItem => {
      const itemDef = ALL_GAME_ITEMS[invItem.itemId];
      if (!itemDef || !itemDef.pawnValue) return null;
      return {
        ...itemDef,
        quantity: invItem.quantity,
        payout: itemDef.pawnValue
      };
    })
    .filter((i): i is NonNullable<typeof i> => i !== null);

  const handlePawn = async (itemId: string, itemTitle: string, payout: number) => {
    if (!user) return;

    setLoadingItemId(itemId);
    setFeedback(null);
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
        throw new Error(data.error || 'Ошибка при сдаче предмета');
      }

      sounds.playTick();
      if (onUpdateUser) {
        onUpdateUser(data.user);
      }
      setFeedback({ type: 'success', text: data.message || `Сдано: «${itemTitle}». Получено +${payout} кр!` });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось сдать предмет в ломбард';
      setFeedback({ type: 'error', text: msg });
      setTimeout(() => setFeedback(null), 3500);
    } finally {
      setLoadingItemId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs select-none">
      <div className="w-full max-w-lg bg-[#121319] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-850 bg-[#151620] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-750 flex items-center justify-center text-zinc-300">
              <Scale className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">
                Городской Ломбард
              </h3>
              <p className="text-xs text-zinc-400">Скупка ценностей и сертификатов за кредиты</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-300 font-bold text-xs">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{userCredits} кр</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 font-sans">
          <div className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
            Предметы из вашего инвентаря для сдачи:
          </div>

          {pawnableItems.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#161722] border border-dashed border-zinc-800 text-center space-y-3">
              <Package className="w-10 h-10 text-zinc-600 mx-auto" />
              <div className="text-sm font-bold text-zinc-300">Нет ценных предметов для скупки</div>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Открывайте сундуки в игре или покупайте ценности, чтобы сдавать их в ломбард за кредиты.
              </p>
              {onOpenShop && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenShop();
                  }}
                  className="mt-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                >
                  Перейти в Магазин
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {pawnableItems.map(item => {
                const isLoading = loadingItemId === item.id;
                const rarity = RARITY_CONFIG[item.rarity];

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${rarity.bg} ${rarity.border}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-3xl p-2 rounded-xl bg-black/40 border border-white/10 shrink-0">
                        {item.icon}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                          <span className="px-1.5 py-0.2 rounded bg-black/50 text-zinc-300 text-[9px] font-mono">
                            {item.quantity} шт.
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{item.description}</p>
                      </div>
                    </div>

                    <button
                      disabled={isLoading}
                      onClick={() => handlePawn(item.id, item.name, item.payout)}
                      className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 border border-amber-900/40"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>+{item.payout} кр</span>
                          <Coins className="w-3.5 h-3.5 text-amber-400" />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#12131b] border-t border-zinc-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-colors"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
};
