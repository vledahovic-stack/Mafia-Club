import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { GameWinner, Player } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { Trophy, RotateCcw, Skull, Crown, Shield, Users, Flame, HeartPulse, Check, Sparkles, ChevronDown, ChevronUp, Award, LogOut, Clock } from 'lucide-react';
import { sounds } from '../utils/audio';
import { calculateLevelInfo } from '../utils/experience';
import { AuthUser } from './AuthModal';
import { useLanguage } from '../context/LanguageContext';

interface GameOverModalProps {
  winner?: GameWinner | null;
  players: Player[];
  isHost: boolean;
  onRestart: () => void;
  onLeaveRoom?: () => void;
  roomCode: string;
  gameOverReward?: { 
    xpEarned: number; 
    totalXp: number; 
    oldLevel: number; 
    newLevel: number; 
    leveledUp: boolean; 
    awards: Array<{ reason: string; xp: number }>;
  } | null;
  closingAfterMatch?: boolean;
  closingCountdownSeconds?: number | null;
  currentUser?: AuthUser | null;
  onOpenProfile?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner = 'civilians',
  players,
  isHost,
  onRestart,
  onLeaveRoom,
  roomCode,
  gameOverReward,
  closingAfterMatch = false,
  closingCountdownSeconds = null,
  currentUser,
  onOpenProfile
}) => {
  const { t } = useLanguage();
  const [showXpDetails, setShowXpDetails] = useState(false);

  useEffect(() => {
    sounds.playVictory();
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 }
    });

    if (gameOverReward?.leveledUp) {
      setTimeout(() => {
        sounds.playGavel();
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.4 }
        });
      }, 700);
    }
  }, [gameOverReward?.leveledUp]);

  const rawXp = gameOverReward?.totalXp ?? currentUser?.xp ?? 0;
  const levelInfo = calculateLevelInfo(rawXp);

  const WINNER_CONFIG: Record<GameWinner, { title: string; subtitle: string; color: string; badgeBg: string }> = {
    civilians: {
      title: t('game.winner_civilians_title', 'ПОБЕДА МИРНЫХ ЖИТЕЛЕЙ'),
      subtitle: t('game.winner_civilians_sub', 'Преступный синдикат ликвидирован. В городе воцарился закон и порядок!'),
      color: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/60 border-emerald-700/60'
    },
    mafia: {
      title: t('game.winner_mafia_title', 'ПОБЕДА МАФИИ'),
      subtitle: t('game.winner_mafia_sub', 'Семья захватила полный контроль над городом. Закон пал перед силой мафии.'),
      color: 'text-rose-400',
      badgeBg: 'bg-rose-950/60 border-rose-700/60'
    },
    maniac: {
      title: t('game.winner_maniac_title', 'ПОБЕДА МАНЬЯКА'),
      subtitle: t('game.winner_maniac_sub', 'Одинокий убийца расправился со всеми соперниками. Город опустел.'),
      color: 'text-purple-400',
      badgeBg: 'bg-purple-950/60 border-purple-700/60'
    },
    draw: {
      title: t('game.winner_draw_title', 'НИЧЬЯ'),
      subtitle: t('game.winner_draw_sub', 'В городе не осталось ни одного живого жителя. Победившей стороны нет.'),
      color: 'text-amber-400',
      badgeBg: 'bg-amber-950/60 border-amber-700/60'
    }
  };

  const winInfo = winner ? WINNER_CONFIG[winner] : WINNER_CONFIG.civilians;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="skin-modal w-full max-w-2xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-base)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="skin-header p-6 bg-[var(--skin-bg-header)] border-b border-[var(--skin-border-subtle)] text-center space-y-2 shrink-0">
          <div className="w-14 h-14 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-strong)] flex items-center justify-center mx-auto shadow-xl">
            <Trophy className={`w-8 h-8 ${winInfo.color}`} />
          </div>
          <h2 className={`text-2xl font-sans font-black uppercase tracking-wider ${winInfo.color}`} style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}>
            {winInfo.title}
          </h2>
          <p className="text-xs text-[var(--skin-text-secondary)] max-w-md mx-auto leading-relaxed">
            {winInfo.subtitle}
          </p>
        </div>

        {/* Experience Scale & Match Rewards */}
        {gameOverReward && (
          <div className="skin-subcard mx-6 mt-4 p-4 rounded-2xl bg-gradient-to-r from-[var(--skin-bg-elevated)] via-[var(--skin-bg-subcard)] to-[var(--skin-bg-card)] border border-[var(--skin-border-accent)] shadow-lg shadow-black/40 space-y-3 shrink-0">
            {gameOverReward.leveledUp && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-orange-500/20 border border-amber-400 text-center animate-bounce duration-1000">
                <div className="flex items-center justify-center gap-2 text-amber-300 font-black text-sm uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
                  <span>Поздравляем! Новый уровень: {gameOverReward.newLevel}!</span>
                  <Sparkles className="w-4 h-4 text-yellow-300 animate-spin" />
                </div>
                <p className="text-xs text-yellow-200/80 mt-0.5">
                  Присвоено новое звание: <strong className="text-white">{levelInfo.title}</strong>
                </p>
              </div>
            )}

            {/* Top row: Earned XP and Current Level Badge */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-600/70 flex items-center justify-center text-xl shadow-inner">
                  {levelInfo.badgeIcon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--skin-text-accent)]">
                      Уровень {levelInfo.level}
                    </span>
                    <span className="text-[11px] text-[var(--skin-text-muted)] font-mono">
                      • {levelInfo.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--skin-text-secondary)] font-medium">
                    Всего опыта: <strong className="text-[var(--skin-text-accent)] font-mono">{levelInfo.totalXp.toLocaleString()} XP</strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="px-3 py-1 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-mono font-black text-sm flex items-center gap-1.5 shadow-md shadow-orange-950/50">
                  <Sparkles className="w-4 h-4 text-yellow-200" />
                  <span>+{gameOverReward.xpEarned} XP</span>
                </div>
                {onOpenProfile && (
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    title="Перейти в профиль и открыть шкалу опыта"
                    className="skin-btn-secondary px-2.5 py-1 rounded-xl bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-btn-secondary-bg-hover)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] hover:text-[var(--skin-text-accent)] text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    В профиль
                  </button>
                )}
              </div>
            </div>

            {/* Experience Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px] text-[var(--skin-text-muted)] font-mono">
                <span>Прогресс до Ур. {levelInfo.level + 1}</span>
                <span className="text-[var(--skin-text-accent)] font-bold">
                  {levelInfo.xpInCurrentLevel} / {levelInfo.xpNeededForNextLevel} XP ({levelInfo.progressPercent}%)
                </span>
              </div>
              <div className="w-full h-3 bg-[var(--skin-bg-canvas)] rounded-full overflow-hidden border border-[var(--skin-border-base)] relative p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 rounded-full transition-all duration-1000 shadow-sm shadow-amber-500/50 relative"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-[var(--skin-text-muted)]">
                <span>Осталось до повышения: {levelInfo.remainingXpToNextLevel} XP</span>
                {gameOverReward.awards && gameOverReward.awards.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => setShowXpDetails(!showXpDetails)}
                    className="text-[var(--skin-text-accent)] hover:opacity-80 flex items-center gap-0.5 underline font-sans cursor-pointer"
                  >
                    <span>{showXpDetails ? 'Скрыть детали' : `Детализация (${gameOverReward.awards.length})`}</span>
                    {showXpDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Accordion / Itemized breakdown */}
            {showXpDetails && gameOverReward.awards && gameOverReward.awards.length > 0 && (
              <div className="pt-2 border-t border-[var(--skin-border-subtle)] space-y-1.5 animate-in fade-in">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--skin-text-muted)]">
                  Начисления опыта за действия в этой партии:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {gameOverReward.awards.map((award, i) => (
                    <div 
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-[var(--skin-bg-card)]/70 border border-[var(--skin-border-subtle)] flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--skin-text-secondary)] truncate text-[11px]">{award.reason}</span>
                      <span className="text-[var(--skin-text-accent)] font-mono font-bold text-[11px] shrink-0 ml-1">+{award.xp} XP</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Players Dossier: True Roles Revealed */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
          <div className="flex items-center justify-between text-xs text-[var(--skin-text-muted)] font-bold uppercase tracking-wider">
            <span>Раскрытие всех ролей партии</span>
            <span className="font-mono">Стол #{roomCode}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {players.map(player => {
              const roleDef = player.role ? ROLE_DEFINITIONS[player.role] : null;
              return (
                <div
                  key={player.id}
                  className="skin-subcard p-3 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="cyber-avatar-ring w-10 h-10 rounded-full bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-strong)] flex items-center justify-center shrink-0">
                      {player.isAlive ? (
                        <GangsterIcon size={30} className="w-7 h-7" />
                      ) : (
                        <Skull className="w-5 h-5 text-rose-500" />
                      )}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[var(--skin-text-primary)] truncate">{player.name}</span>
                        {!player.isAlive && (
                          <span className="text-[10px] text-rose-400 font-mono">({t('game.died', 'Погиб')})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--skin-text-muted)]">
                        {roleDef?.team === 'mafia' ? t('game.team_mafia', 'Мафия') : roleDef?.team === 'maniac' ? t('game.team_maniac', 'Маньяк') : t('game.team_civilians', 'Город')}
                      </div>
                    </div>
                  </div>

                  {roleDef && (
                    <div 
                      className="px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 border font-mono"
                      style={{
                        backgroundColor: `${roleDef.color}15`,
                        borderColor: `${roleDef.color}50`,
                        color: roleDef.color
                      }}
                    >
                      {roleDef.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[var(--skin-border-subtle)] bg-[var(--skin-bg-subcard)] flex items-center justify-between gap-3 flex-wrap shrink-0 relative z-10">
          {closingAfterMatch ? (
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
              <span>
                {t('game.closing_after_match', 'Ведущий покинул стол. Автоматическое закрытие комнаты через')}{' '}
                <strong className="font-mono text-white">{closingCountdownSeconds ?? 10} сек.</strong>
              </span>
            </div>
          ) : (
            <span className="text-xs text-[var(--skin-text-muted)]">
              {isHost ? t('game.host_can_restart', 'Вы можете запустить новую партию с теми же игроками') : t('game.waiting_host_restart', 'Ожидание решения ведущего')}
            </span>
          )}

          <div className="flex items-center gap-2.5 ml-auto">
            {onLeaveRoom && (
              <button
                type="button"
                onClick={onLeaveRoom}
                className="skin-btn-secondary py-2.5 px-4 rounded-xl bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-btn-secondary-hover-bg)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('nav.leave_room', 'Покинуть стол')}</span>
              </button>
            )}

            {!closingAfterMatch && isHost ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    sounds.playGavel();
                  } catch {
                    // Ignore sound errors so restart is never blocked
                  }
                  onRestart();
                }}
                className="skin-btn-join py-2.5 px-6 rounded-xl text-[var(--skin-btn-primary-text)] font-bold text-xs tracking-wider uppercase transition-all shadow-md flex items-center gap-2 border border-[var(--skin-btn-join-border)] cursor-pointer shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('game.play_again', 'Сыграть снова')}</span>
              </button>
            ) : !closingAfterMatch ? (
              <div className="text-xs font-bold text-[var(--skin-text-accent)]">
                {t('game.waiting_restart', 'Ожидание перезапуска...')}
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
};
