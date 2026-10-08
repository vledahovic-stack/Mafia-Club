import React from 'react';
import { Volume2, VolumeX, BookOpen, FileText, Clock, Users, Shield, User as UserIcon, Menu, Crown, Flame, Sparkles } from 'lucide-react';
import { GamePhase } from '../types/mafia';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { GangsterIcon } from './GangsterIcon';

interface HeaderProps {
  roomCode?: string;
  phase?: GamePhase;
  phaseTimeRemaining?: number;
  dayNumber?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onOpenNotebook: () => void;
  onLeaveRoom?: () => void;
  user?: AuthUser | null;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenAdmin?: () => void;
  onOpenTasks?: () => void;
  onOpenMenu?: () => void;
}

const PHASE_TITLES: Record<GamePhase, { title: string; subtitle: string; color: string }> = {
  LOBBY: { title: 'Сбор гостей', subtitle: 'Ожидание игроков', color: 'text-zinc-400' },
  ROLE_REVEAL: { title: 'Раздача ролей', subtitle: 'Ознакомьтесь с картой', color: 'text-amber-400' },
  MAFIA_MEETING: { title: 'Знакомство мафии', subtitle: 'Ночная нулевая минута', color: 'text-rose-400' },
  DAY_DISCUSSION: { title: 'Город проснулся', subtitle: 'Открытые дебаты', color: 'text-amber-500' },
  INDIVIDUAL_SPEECHES: { title: 'Индивидуальные речи', subtitle: 'Ораторы выступают по очереди', color: 'text-amber-400' },
  VOTING: { title: 'Городской суд', subtitle: 'Голосование за казнь', color: 'text-rose-500' },
  DEFENSE_SPEECH: { title: 'Оправдательные речи', subtitle: 'Ничья! Защитная речь кандидата', color: 'text-purple-400' },
  REVOTE: { title: 'Переголосование', subtitle: 'Повторное голосование', color: 'text-rose-600' },
  LAST_WORDS_ARREST: { title: 'Последнее слово', subtitle: 'Осужденный судом города', color: 'text-rose-400' },
  NIGHT: { title: 'Город засыпает', subtitle: 'Ночные действия', color: 'text-blue-400' },
  MORNING_REPORT: { title: 'Утренние вести', subtitle: 'Итоги ночи', color: 'text-emerald-400' },
  LAST_WORDS_KILLED: { title: 'Завещание', subtitle: 'Последнее слово погибшего', color: 'text-purple-400' },
  GAME_OVER: { title: 'Финал партии', subtitle: 'Победа определена', color: 'text-yellow-400' }
};

export const Header: React.FC<HeaderProps> = ({
  roomCode,
  phase,
  phaseTimeRemaining,
  dayNumber,
  soundEnabled,
  onToggleSound,
  onOpenRules,
  onOpenNotebook,
  onLeaveRoom,
  user,
  onOpenAuth,
  onOpenProfile,
  onOpenAdmin,
  onOpenTasks,
  onOpenMenu
}) => {
  const currentPhaseInfo = phase ? PHASE_TITLES[phase] : null;
  const isSuperAdmin = user && (user.email.toLowerCase() === 'vledahovic@gmail.com' || user.isAdmin === true);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <GangsterIcon size={32} className="w-8 h-8 rounded-lg drop-shadow-md shrink-0" />
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase font-sans text-white flex items-center gap-2">
              MAFIA GAME
            </h1>
            <p className="text-[10px] text-zinc-400 font-mono tracking-wider leading-none">ГОРОД ЗАСЫПАЕТ</p>
          </div>
        </div>

        {/* Phase & Timer Display in game */}
        {phase && phase !== 'LOBBY' && (
          <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 px-3.5 py-1 rounded-md shadow-inner">
            <div className="text-center">
              <div className="flex items-center gap-1.5 justify-center">
                {dayNumber !== undefined && dayNumber > 0 && (
                  <span className="text-[11px] font-medium text-zinc-400">
                    День {dayNumber} ·
                  </span>
                )}
                <span className={`text-xs font-semibold ${currentPhaseInfo?.color || 'text-zinc-200'}`}>
                  {currentPhaseInfo?.title}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">{currentPhaseInfo?.subtitle}</p>
            </div>

            {phaseTimeRemaining !== undefined && phaseTimeRemaining > 0 && (
              <div className="flex items-center gap-1 pl-3 border-l border-zinc-800 text-rose-400 font-mono font-bold text-sm">
                <Clock className="w-3.5 h-3.5" />
                <span>{phaseTimeRemaining}с</span>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {roomCode && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 border border-zinc-800 bg-zinc-900/50 px-2.5 py-1 rounded">
              <span className="text-zinc-400">Код:</span>
              <span className="font-mono font-bold text-zinc-200 tracking-wider">{roomCode}</span>
            </div>
          )}

          {/* Admin Panel Button (Strictly visible ONLY for vledahovic@gmail.com / admin) */}
          {isSuperAdmin && onOpenAdmin && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenAdmin();
              }}
              title="Панель Главного Администратора"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-600/70 bg-gradient-to-r from-amber-950/70 to-orange-950/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Админ-панель</span>
            </button>
          )}

          {/* Events & Tasks Button */}
          {onOpenTasks && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenTasks();
              }}
              title="Ивенты и Задачи (Квесты)"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-600/70 bg-gradient-to-r from-amber-950/70 to-orange-950/70 text-amber-300 hover:text-white hover:border-amber-500 text-xs font-bold transition-all shadow-sm shadow-amber-950/40"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Задачи</span>
            </button>
          )}

          {/* Daily Streak Indicator */}
          {user && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenProfile();
              }}
              title={user.lastDailyBonusClaim && new Date(user.lastDailyBonusClaim).toDateString() === new Date().toDateString()
                ? `Ежедневный стрик: ${user.dailyBonusStreak || 1} дн. (сегодня собран)`
                : `Ежедневный стрик: доступна награда дня!`}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold transition-all ${
                user.lastDailyBonusClaim && new Date(user.lastDailyBonusClaim).toDateString() === new Date().toDateString()
                  ? 'bg-orange-950/40 border-orange-700/60 text-orange-300 hover:border-orange-500'
                  : 'bg-gradient-to-r from-amber-600 to-orange-600 border-amber-400 text-white animate-pulse shadow-md shadow-orange-950/50'
              }`}
            >
              <Flame className="w-3.5 h-3.5 fill-current text-yellow-200" />
              <span>{user.dailyBonusStreak && user.dailyBonusStreak > 0 ? `${user.dailyBonusStreak} дн.` : 'Бонус'}</span>
            </button>
          )}

          {/* User Account / Profile */}
          {user ? (
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-200 text-xs transition-colors"
            >
              <div className="w-5 h-5 rounded-full bg-orange-600 flex items-center justify-center font-bold text-[10px] text-white">
                {user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <span className="font-medium max-w-[100px] truncate">{user.displayName}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 font-mono text-[10px] font-bold">
                Ур. {user.level || 1}
              </span>
              <span className="text-[10px] text-amber-400 font-mono hidden sm:inline">{user.stats?.rating || 1200}</span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-colors shadow-xs shadow-orange-950/40"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Войти / Регистрация</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => {
              onToggleSound();
              sounds.playTick();
            }}
            title={soundEnabled ? 'Выключить звук' : 'Включить звук'}
            className="p-1.5 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-zinc-400" />}
          </button>

          {/* Detective Notebook */}
          {phase && phase !== 'LOBBY' && (
            <button
              onClick={onOpenNotebook}
              title="Блокнот детектива"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-amber-900/40 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40 text-xs font-medium transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Заметки</span>
            </button>
          )}

          {/* Leave Room Button */}
          {onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              className="px-2.5 py-1 rounded-xl border border-red-900/40 bg-red-950/30 text-red-300 hover:bg-red-900/40 text-xs font-medium transition-colors"
            >
              Выйти
            </button>
          )}

          {/* Hamburger Menu Drawer Button */}
          {onOpenMenu && (
            <button
              onClick={() => {
                sounds.playTick();
                onOpenMenu();
              }}
              title="Меню"
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

