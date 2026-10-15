import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Player, Team } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { Trophy, RotateCcw, Skull, Crown, Shield, Users, Flame, HeartPulse, Check, Sparkles, ChevronDown, ChevronUp, Award } from 'lucide-react';
import { sounds } from '../utils/audio';
import { calculateLevelInfo } from '../utils/experience';
import { AuthUser } from './AuthModal';

interface GameOverModalProps {
  winner?: Team | null;
  players: Player[];
  isHost: boolean;
  onRestart: () => void;
  roomCode: string;
  gameOverReward?: { 
    xpEarned: number; 
    totalXp: number; 
    oldLevel: number; 
    newLevel: number; 
    leveledUp: boolean; 
    awards: Array<{ reason: string; xp: number }>;
  } | null;
  currentUser?: AuthUser | null;
  onOpenProfile?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner = 'civilians',
  players,
  isHost,
  onRestart,
  roomCode,
  gameOverReward,
  currentUser,
  onOpenProfile
}) => {
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

  const WINNER_CONFIG: Record<Team, { title: string; subtitle: string; color: string; badgeBg: string }> = {
    civilians: {
      title: 'ПОБЕДА МИРНЫХ ЖИТЕЛЕЙ',
      subtitle: 'Преступный синдикат ликвидирован. В городе воцарился закон и порядок!',
      color: 'text-emerald-400',
      badgeBg: 'bg-emerald-950/60 border-emerald-700/60'
    },
    mafia: {
      title: 'ПОБЕДА МАФИИ',
      subtitle: 'Семья захватила полный контроль над городом. Закон пал перед силой мафии.',
      color: 'text-rose-400',
      badgeBg: 'bg-rose-950/60 border-rose-700/60'
    },
    maniac: {
      title: 'ПОБЕДА МАНЬЯКА',
      subtitle: 'Одинокий убийца расправился со всеми соперниками. Город опустел.',
      color: 'text-purple-400',
      badgeBg: 'bg-purple-950/60 border-purple-700/60'
    }
  };

  const winInfo = winner ? WINNER_CONFIG[winner] : WINNER_CONFIG.civilians;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#111219] border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 bg-[#161722] border-b border-zinc-850 text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-750 flex items-center justify-center mx-auto shadow-xl">
            <Trophy className={`w-8 h-8 ${winInfo.color}`} />
          </div>
          <h2 className={`text-2xl font-sans font-black uppercase tracking-wider ${winInfo.color}`}>
            {winInfo.title}
          </h2>
          <p className="text-xs text-zinc-300 max-w-md mx-auto leading-relaxed">
            {winInfo.subtitle}
          </p>
        </div>

        {/* Experience Scale & Match Rewards */}
        {gameOverReward && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-gradient-to-r from-[#171824] via-[#141521] to-[#12131b] border border-amber-500/40 shadow-lg shadow-black/40 space-y-3">
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
                    <span className="text-xs font-bold text-amber-300">
                      Уровень {levelInfo.level}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      • {levelInfo.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-300 font-medium">
                    Всего опыта: <strong className="text-amber-400 font-mono">{levelInfo.totalXp.toLocaleString()} XP</strong>
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
                    onClick={onOpenProfile}
                    title="Перейти в профиль и открыть шкалу опыта"
                    className="px-2.5 py-1 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-amber-300 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    В профиль
                  </button>
                )}
              </div>
            </div>

            {/* Experience Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px] text-zinc-400 font-mono">
                <span>Прогресс до Ур. {levelInfo.level + 1}</span>
                <span className="text-amber-300 font-bold">
                  {levelInfo.xpInCurrentLevel} / {levelInfo.xpNeededForNextLevel} XP ({levelInfo.progressPercent}%)
                </span>
              </div>
              <div className="w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-750 relative p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500 rounded-full transition-all duration-1000 shadow-sm shadow-amber-500/50 relative"
                  style={{ width: `${levelInfo.progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-500">
                <span>Осталось до повышения: {levelInfo.remainingXpToNextLevel} XP</span>
                {gameOverReward.awards && gameOverReward.awards.length > 0 && (
                  <button 
                    onClick={() => setShowXpDetails(!showXpDetails)}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-0.5 underline font-sans cursor-pointer"
                  >
                    <span>{showXpDetails ? 'Скрыть детали' : `Детализация (${gameOverReward.awards.length})`}</span>
                    {showXpDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Accordion / Itemized breakdown */}
            {showXpDetails && gameOverReward.awards && gameOverReward.awards.length > 0 && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5 animate-in fade-in">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Начисления опыта за действия в этой партии:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {gameOverReward.awards.map((award, i) => (
                    <div 
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-black/40 border border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <span className="text-zinc-300 truncate text-[11px]">{award.reason}</span>
                      <span className="text-amber-400 font-mono font-bold text-[11px] shrink-0 ml-1">+{award.xp} XP</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Players Dossier: True Roles Revealed */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider">
            <span>Раскрытие всех ролей партии</span>
            <span className="font-mono">Стол #{roomCode}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {players.map(player => {
              const roleDef = player.role ? ROLE_DEFINITIONS[player.role] : null;
              return (
                <div
                  key={player.id}
                  className="p-3 rounded-2xl bg-[#151620] border border-zinc-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                      {player.isAlive ? (
                        <GangsterIcon size={30} className="w-7 h-7" />
                      ) : (
                        <Skull className="w-5 h-5 text-rose-500" />
                      )}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">{player.name}</span>
                        {!player.isAlive && (
                          <span className="text-[10px] text-rose-400 font-mono">(Погиб)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {roleDef?.team === 'mafia' ? 'Мафия' : roleDef?.team === 'maniac' ? 'Маньяк' : 'Город'}
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
        <div className="p-5 border-t border-zinc-850 bg-[#13141c] flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {isHost ? 'Вы можете запустить новую партию с теми же игроками' : 'Ожидание решения ведущего'}
          </span>

          {isHost ? (
            <button
              onClick={() => {
                sounds.playGavel();
                onRestart();
              }}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md flex items-center gap-2 border border-amber-900/60"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Сыграть снова</span>
            </button>
          ) : (
            <div className="text-xs font-bold text-amber-400">
              Ожидание перезапуска...
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
