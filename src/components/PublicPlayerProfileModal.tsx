import React, { useEffect, useRef, useState } from 'react';
import { X, Trophy, Award, Gamepad2, Percent, AlertCircle, Loader2 } from 'lucide-react';
import { sounds } from '../utils/audio';

export interface PublicPlayerProfileTarget {
  id: string;
  name: string;
  avatarSeed?: string;
  clanTag?: string | null;
}

export interface PublicPlayerProfileData {
  id: string;
  displayName: string;
  avatarSeed: string;
  clanTag: string | null;
  level: number;
  rank: {
    title: string;
    badgeIcon: string;
    tier: string;
  };
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    winRate: number | null;
    rating: number;
  };
}

interface PublicPlayerProfileModalProps {
  isOpen: boolean;
  targetPlayer: PublicPlayerProfileTarget | null;
  onClose: () => void;
}

function getAvatarDisplay(avatarSeed: string | undefined, displayName: string): string {
  const cleanSeed = (avatarSeed || '').trim();
  const cleanName = (displayName || '').trim();
  const glyphs = cleanSeed ? Array.from(cleanSeed) : [];
  const isCustomShortAvatar =
    Boolean(cleanSeed) &&
    cleanSeed !== cleanName &&
    glyphs.length > 0 &&
    glyphs.length <= 4;

  if (isCustomShortAvatar) {
    return cleanSeed;
  }
  return (cleanName || '?').slice(0, 1).toUpperCase();
}

export const PublicPlayerProfileModal: React.FC<PublicPlayerProfileModalProps> = ({
  isOpen,
  targetPlayer,
  onClose
}) => {
  const [profile, setProfile] = useState<PublicPlayerProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef<number>(0);

  const targetId = targetPlayer?.id || '';

  useEffect(() => {
    if (!isOpen || !targetId) {
      requestSeqRef.current += 1;
      setProfile(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const seq = ++requestSeqRef.current;
    const controller = new AbortController();

    setProfile(null);
    setError(null);
    setIsLoading(true);

    fetch(`/api/users/${encodeURIComponent(targetId)}/public-profile`, {
      method: 'GET',
      signal: controller.signal
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.profile) {
          throw new Error(data?.error || 'Не удалось загрузить профиль игрока.');
        }
        return data.profile as PublicPlayerProfileData;
      })
      .then((loadedProfile) => {
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setProfile(loadedProfile);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Не удалось загрузить профиль игрока.';
        setError(msg);
      })
      .finally(() => {
        if (controller.signal.aborted || seq !== requestSeqRef.current) return;
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, targetId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !targetPlayer) return null;

  const displayName = profile?.displayName || targetPlayer.name;
  const clanTag = profile ? profile.clanTag : targetPlayer.clanTag || null;
  const avatarDisplay = getAvatarDisplay(profile?.avatarSeed ?? targetPlayer.avatarSeed, displayName);

  const gamesPlayed = profile?.stats.gamesPlayed ?? 0;
  const gamesWon = profile?.stats.gamesWon ?? 0;
  const winRateDisplay =
    profile && profile.stats.gamesPlayed > 0 && profile.stats.winRate !== null
      ? `${profile.stats.winRate}%`
      : '—';
  const rating = profile?.stats.rating ?? 1200;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        sounds.playTick();
        onClose();
      }}
      onTouchStart={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs select-none animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Профиль игрока ${displayName}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--skin-bg-modal)',
          borderColor: 'var(--skin-border-strong)',
          boxShadow: 'var(--skin-shadow-modal)'
        }}
        className="skin-modal w-full max-w-sm border rounded-[var(--skin-radius-modal)] overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* Compact Header */}
        <div
          style={{ borderColor: 'var(--skin-border-subtle)' }}
          className="relative p-4 border-b flex items-center gap-3.5 bg-gradient-to-br from-[var(--skin-bg-elevated)]/90 to-transparent"
        >
          <div
            style={{
              background: 'var(--skin-btn-primary-bg)',
              borderColor: 'var(--skin-border-accent)',
              boxShadow: 'var(--skin-glow-accent)'
            }}
            className="cyber-avatar-ring w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-2xl border shrink-0 overflow-hidden"
          >
            <span className="drop-shadow-md select-none">{avatarDisplay}</span>
          </div>

          <div className="min-w-0 flex-1 pr-7 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {clanTag && (
                <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-600/70 text-[var(--skin-text-accent)] shrink-0">
                  [{clanTag}]
                </span>
              )}
              <h3 className="text-base font-bold text-[var(--skin-text-primary)] truncate">
                {displayName}
              </h3>
            </div>

            {profile && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-accent)] text-[var(--skin-text-accent)]">
                  Ур. {profile.level}
                </span>
                {profile.rank?.title && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] text-[var(--skin-text-secondary)] flex items-center gap-1 truncate max-w-full">
                    {profile.rank.badgeIcon && <span className="shrink-0">{profile.rank.badgeIcon}</span>}
                    <span className="truncate">{profile.rank.title}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            aria-label="Закрыть профиль"
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--skin-bg-subcard)]/80 hover:bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-base)] text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[var(--skin-text-secondary)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--skin-accent-primary)]" />
              <span>Загрузка профиля...</span>
            </div>
          ) : error ? (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/70 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          ) : profile ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-3 rounded-xl border space-y-1 min-w-0"
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--skin-text-secondary)]">
                  <span className="truncate">Сыграно партий</span>
                  <Gamepad2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[var(--skin-text-primary)]">
                  {gamesPlayed}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-3 rounded-xl border space-y-1 min-w-0"
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--skin-text-secondary)]">
                  <span className="truncate">Побед</span>
                  <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">
                  {gamesWon}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-3 rounded-xl border space-y-1 min-w-0"
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--skin-text-secondary)]">
                  <span className="truncate">Процент побед</span>
                  <Percent className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[var(--skin-text-primary)]">
                  {winRateDisplay}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--skin-bg-subcard)',
                  borderColor: 'var(--skin-border-base)'
                }}
                className="p-3 rounded-xl border space-y-1 min-w-0"
              >
                <div className="flex items-center justify-between gap-1 text-[11px] text-[var(--skin-text-secondary)]">
                  <span className="truncate">Рейтинг</span>
                  <Award className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-amber-300">
                  {rating}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
