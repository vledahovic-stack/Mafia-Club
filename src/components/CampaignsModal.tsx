import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame,
  X,
  Clock,
  Calendar,
  CheckCircle2,
  Gift,
  Package,
  RefreshCw,
  Loader2,
  Sparkles,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import {
  getClientProjectTimezone,
  subscribeClientProjectTimezone,
  getTimezoneOffsetLabel,
  formatDateTimeInTimezone,
} from '../utils/timezone';
import { RARITY_CONFIG, LOYALTY_CREDITS_ITEM_ID } from '../data/items';
import { CampaignGrantedRewardSnapshot } from './AdminCampaignsSubView';

export interface PlayerCampaignView {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  scheduleTimezone: string;
  effectiveStatus: 'active' | 'upcoming';
  rewards: CampaignGrantedRewardSnapshot[];
  claimedByMe: boolean;
  claimedAt: string | null;
  myGrantedRewards: CampaignGrantedRewardSnapshot[] | null;
}

interface CampaignsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onOpenAuth?: () => void;
}

export const CampaignsModal: React.FC<CampaignsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenAuth,
}) => {
  const [campaigns, setCampaigns] = useState<PlayerCampaignView[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectTz, setProjectTz] = useState<string>(() => getClientProjectTimezone());
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'upcoming'>('all');

  useEffect(() => {
    return subscribeClientProjectTimezone((tz) => setProjectTz(tz));
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('mafia_auth_token') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/campaigns', { headers });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
        if (data.user && onUpdateUser) {
          onUpdateUser(data.user);
        }
      }
    } catch {
      // Continue
    } finally {
      setLoading(false);
    }
  }, [onUpdateUser]);

  useEffect(() => {
    if (isOpen) {
      fetchCampaigns();
    }
  }, [isOpen, fetchCampaigns]);

  if (!isOpen) return null;

  const filteredCampaigns = campaigns.filter((c) => {
    if (activeFilter === 'all') return true;
    return c.effectiveStatus === activeFilter;
  });

  const activeCount = campaigns.filter((c) => c.effectiveStatus === 'active').length;
  const upcomingCount = campaigns.filter((c) => c.effectiveStatus === 'upcoming').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#11121a] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-zinc-850/80 bg-[#13141f] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-950/40 shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold tracking-widest uppercase text-amber-400">
                АКЦИИ И СОБЫТИЯ
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Подарки Mafia Club
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                fetchCampaigns();
              }}
              disabled={loading}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Обновить список"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                onClose();
              }}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Timezone Note & Filter Tabs */}
        <div className="px-5 py-3 bg-[#0e0f17] border-b border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                setActiveFilter('all');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-amber-950/80 border-amber-600/80 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Все ({campaigns.length})
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                setActiveFilter('active');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'active'
                  ? 'bg-emerald-950/80 border-emerald-600/80 text-emerald-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Действующие ({activeCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playTick();
                setActiveFilter('upcoming');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                activeFilter === 'upcoming'
                  ? 'bg-amber-950/80 border-amber-600/80 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Скоро ({upcomingCount})</span>
            </button>
          </div>

          {/* Timezone label */}
          <div className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-amber-400" />
            <span>
              Время клуба: {projectTz} ({getTimezoneOffsetLabel(projectTz)})
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-3.5 flex-1 text-xs font-sans">
          {loading ? (
            <div className="py-16 text-center text-zinc-400 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <span className="text-xs font-mono">Проверка активных акций...</span>
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center space-y-3 bg-[#0d0e16]">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                <Gift className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">В этой категории нет акций</h4>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Следите за обновлениями: в Mafia Club регулярно проходят праздничные и подарочные события!
                </p>
              </div>
            </div>
          ) : (
            filteredCampaigns.map((camp) => {
              const isActive = camp.effectiveStatus === 'active';
              const isClaimed = camp.claimedByMe;

              return (
                <div
                  key={camp.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 shadow-md ${
                    isActive
                      ? isClaimed
                        ? 'bg-[#12141e] border-zinc-800/90'
                        : 'bg-gradient-to-br from-[#18192c] to-[#12131f] border-amber-500/60 shadow-amber-950/20'
                      : 'bg-[#11121a] border-zinc-800/80 opacity-90'
                  }`}
                >
                  {/* Title & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm sm:text-base font-bold text-white tracking-wide">
                          {camp.title}
                        </h4>

                        {/* Status Badges */}
                        {isActive ? (
                          isClaimed ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-emerald-950/80 border-emerald-500 text-emerald-300 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>ПОЛУЧЕНО</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white flex items-center gap-1.5 shadow-sm">
                              <Sparkles className="w-3 h-3 animate-spin" />
                              <span>ДЕЙСТВУЕТ СЕЙЧАС</span>
                            </span>
                          )
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border bg-amber-950/70 border-amber-700/80 text-amber-300 flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>СКОРО НАЧНЁТСЯ</span>
                          </span>
                        )}
                      </div>

                      {camp.description && (
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {camp.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Period info */}
                  <div className="p-2.5 rounded-xl bg-[#0c0d14] border border-zinc-850 flex items-center justify-between gap-3 text-[11px] font-mono text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        Период: {formatDateTimeInTimezone(camp.startsAt, projectTz)} — {formatDateTimeInTimezone(camp.endsAt, projectTz)}
                      </span>
                    </div>

                    {isClaimed && camp.claimedAt && (
                      <span className="text-emerald-400 text-[10px] shrink-0">
                        Зачислено: {formatDateTimeInTimezone(camp.claimedAt, projectTz)}
                      </span>
                    )}
                  </div>

                  {/* Rewards List */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block">
                      Состав подарка:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(camp.rewards || []).map((reward, rIdx) => {
                        const isCredits = reward.itemId === LOYALTY_CREDITS_ITEM_ID;
                        const rarity = (RARITY_CONFIG as Record<string, any>)[reward.rarity] || RARITY_CONFIG.common;

                        return (
                          <div
                            key={rIdx}
                            className={`px-2.5 py-1 rounded-xl border flex items-center gap-2 text-xs ${rarity.bg} ${rarity.border}`}
                          >
                            <span className="text-sm">{reward.icon || '🎁'}</span>
                            <span className="font-bold text-white">{reward.name}</span>
                            <span className="font-mono font-bold text-amber-300">
                              {isCredits ? `+${reward.quantity} кр.` : `x${reward.quantity}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer hint */}
                  {!user ? (
                    <div className="pt-2 border-t border-zinc-850 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">
                        Войдите в аккаунт, чтобы получить подарок
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playTick();
                          onClose();
                          onOpenAuth?.();
                        }}
                        className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors"
                      >
                        Войти
                      </button>
                    </div>
                  ) : isActive && !isClaimed ? (
                    <div className="pt-1 text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium">
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      <span>
                        Вы находитесь в игре в период акции — подарок автоматически зачисляется на ваш аккаунт!
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-850/80 bg-[#13141f] flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
            <span>Каждая акция выдаётся строго 1 раз на аккаунт</span>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
