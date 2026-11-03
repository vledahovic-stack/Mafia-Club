import React, { useEffect } from 'react';
import { Gift, Sparkles, X, CheckCircle2, Package, Coins } from 'lucide-react';
import { sounds } from '../utils/audio';
import { RARITY_CONFIG, LOYALTY_CREDITS_ITEM_ID } from '../data/items';
import { CampaignClaimRecord, CampaignGrantedRewardSnapshot } from './AdminCampaignsSubView';

interface CampaignGiftNotificationModalProps {
  claim: CampaignClaimRecord | null;
  onClose: (claimId: string) => void;
}

export const CampaignGiftNotificationModal: React.FC<CampaignGiftNotificationModalProps> = ({
  claim,
  onClose,
}) => {
  useEffect(() => {
    if (claim) {
      try {
        sounds.playTick();
      } catch {}
    }
  }, [claim]);

  if (!claim) return null;

  const handleClose = () => {
    sounds.playTick();
    onClose(claim.id);
  };

  const rewards = claim.rewardsGranted || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-md skin-modal bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-3xl shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Glow ambient background behind the card */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-[var(--skin-accent-primary)]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative p-5 pb-3 border-b border-[var(--skin-border-base)] skin-header bg-[var(--skin-bg-header)] flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-950/50 shrink-0 border border-amber-400/40">
              <Gift className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>ПОДАРОК ПО АКЦИИ</span>
              </div>
              <h3 className="text-base font-bold text-[var(--skin-text-primary)] tracking-tight leading-snug">
                {claim.campaignTitleSnapshot || 'Подарок в Mafia Club!'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="relative p-5 overflow-y-auto space-y-4 flex-1 text-xs font-sans text-[var(--skin-text-primary)]">
          {claim.campaignDescriptionSnapshot ? (
            <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed bg-[var(--skin-bg-subcard)] p-3 rounded-xl border border-[var(--skin-border-base)]">
              {claim.campaignDescriptionSnapshot}
            </p>
          ) : (
            <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
              Поздравляем! Вам начислен подарок за посещение Mafia Club во время проведения акции.
            </p>
          )}

          {/* List of granted rewards */}
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase text-[var(--skin-text-muted)] font-bold tracking-wider">
              Полученные награды:
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {rewards.map((reward: CampaignGrantedRewardSnapshot, idx: number) => {
                const isCredits = reward.itemId === LOYALTY_CREDITS_ITEM_ID;
                const rarity = (RARITY_CONFIG as Record<string, any>)[reward.rarity] || RARITY_CONFIG.common;

                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl skin-subcard bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border ${rarity.bg} ${rarity.border}`}
                      >
                        {reward.icon || '🎁'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-[var(--skin-text-primary)] text-xs truncate">
                          {reward.name}
                        </div>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border uppercase font-bold inline-block ${rarity.bg} ${rarity.border} ${rarity.color}`}
                        >
                          {rarity.label}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-amber-300 text-sm">
                        {isCredits ? `+${reward.quantity} кр.` : `x${reward.quantity}`}
                      </div>
                      <span className="text-[10px] text-[var(--skin-text-muted)] font-mono">
                        {isCredits ? 'на баланс' : 'в инвентарь'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--skin-border-base)] bg-[var(--skin-bg-header)] flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-[var(--skin-text-muted)] font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Награды добавлены в ваш профиль</span>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="skin-btn-primary px-5 py-2.5 rounded-xl text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer active:scale-95"
          >
            Забрать подарок
          </button>
        </div>
      </div>
    </div>
  );
};
