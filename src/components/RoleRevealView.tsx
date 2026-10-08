import React, { useState, useEffect } from 'react';
import { RoleId, Team } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { Crown, Skull, Shield, HeartPulse, Sparkles, Flame, Users, Eye, EyeOff, Clock, UserCheck, BookOpen, HelpCircle, Info } from 'lucide-react';
import { sounds } from '../utils/audio';
import { RoleGuideModal } from './RoleGuideModal';

interface RoleRevealViewProps {
  role?: RoleId;
  teammates?: { id: string; name: string; role: RoleId }[];
  timeRemaining: number;
  isSpectator?: boolean;
}

export const RoleRevealView: React.FC<RoleRevealViewProps> = ({
  role = 'civilian',
  teammates = [],
  timeRemaining,
  isSpectator = false
}) => {
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const def = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.civilian;

  useEffect(() => {
    if (isSpectator) return;
    // Auto-reveal after a brief dramatic pause
    const t = setTimeout(() => {
      setIsRevealed(true);
      sounds.playCardFlip();
    }, 700);
    return () => clearTimeout(t);
  }, [isSpectator]);

  const handleCardClick = () => {
    setIsRevealed(prev => !prev);
    sounds.playCardFlip();
  };

  const handleOpenGuide = (e: React.MouseEvent) => {
    e.stopPropagation();
    sounds.playTick();
    setIsGuideOpen(true);
  };

  if (isSpectator) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
        <div className="max-w-md w-full space-y-5">
          {/* Spectator Emblem */}
          <div className="w-20 h-20 rounded-3xl bg-indigo-950/80 border border-indigo-700/70 flex items-center justify-center mx-auto shadow-2xl shadow-indigo-950/60 text-4xl">
            👁️
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono uppercase tracking-widest text-indigo-400 font-bold block">
              РЕЖИМ НАБЛЮДАТЕЛЯ
            </span>
            <h2 className="text-2xl font-sans font-bold text-white tracking-tight">
              Партия уже началась
            </h2>
            <p className="text-xs text-zinc-300 leading-relaxed max-w-sm mx-auto">
              Вы подключились к столу после раздачи карт. Вы наблюдаете за ходом игры в режиме зрителя: следите за фазами стола и общайтесь в общем чате.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#12131d] border border-indigo-900/50 space-y-2 text-left text-xs">
            <div className="flex items-center gap-2 text-indigo-300 font-bold">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Правила режима зрителя:</span>
            </div>
            <ul className="text-[11px] text-zinc-400 space-y-1 list-disc list-inside">
              <li>Вы не участвуете в голосованиях и ночных операциях</li>
              <li>Роли игроков скрыты до завершения партии</li>
              <li>Вы можете свободно писать в общий чат стола</li>
            </ul>
          </div>

          {/* Countdown to Next Phase */}
          <div className="p-3 rounded-xl bg-[#14151f] border border-zinc-800 text-xs text-zinc-300 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>Начало дня через <strong className="font-mono text-indigo-300 font-bold text-sm">{timeRemaining}</strong> сек.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
      <div className="max-w-md w-full space-y-4">
        
        {/* Header Prompt */}
        <div className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-amber-500 font-bold block">
            СЕКРЕТНАЯ КАРТА РОЛИ
          </span>
          <h2 className="text-2xl font-sans font-bold text-white tracking-tight">
            Судьба определена
          </h2>
          <p className="text-xs text-zinc-400">
            Нажмите на карту, чтобы скрыть или открыть. Никому не показывайте экран!
          </p>
        </div>

        {/* 3D Flip Card Container */}
        <div 
          onClick={handleCardClick}
          className="relative w-64 h-92 sm:w-72 sm:h-96 mx-auto cursor-pointer perspective-1000 group"
        >
          <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isRevealed ? 'rotate-y-180' : ''}`}>
            
            {/* Card Back (Hidden state) */}
            <div className="absolute inset-0 w-full h-full rounded-2xl bg-[#14151e] border-2 border-amber-900/60 p-5 flex flex-col items-center justify-between backface-hidden shadow-2xl shadow-black/80">
              <div className="w-full flex justify-between text-amber-500/70 text-xs font-mono font-bold">
                <span>♠</span>
                <span>MAFIA GAME</span>
                <span>♠</span>
              </div>

              {/* Center Emblem */}
              <div className="w-24 h-24 rounded-full border border-amber-800/40 bg-[#0e0f14] flex items-center justify-center shadow-inner">
                <GangsterIcon size={56} className="w-14 h-14 drop-shadow-md" />
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-widest text-zinc-300 font-bold">
                  ТАЙНАЯ РОЛЬ
                </p>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Нажмите для открытия</span>
                </div>
              </div>

              <div className="w-full flex justify-between text-amber-500/70 text-xs font-mono font-bold">
                <span>♠</span>
                <span>MAFIA GAME</span>
                <span>♠</span>
              </div>
            </div>

            {/* Card Front (Revealed state) */}
            <div 
              className="absolute inset-0 w-full h-full rounded-2xl bg-[#13141c] border-2 p-5 flex flex-col items-center justify-between backface-hidden rotate-y-180 shadow-2xl shadow-black/90"
              style={{ borderColor: `${def.color}90` }}
            >
              <div className="w-full flex justify-between items-center text-xs font-mono" style={{ color: def.color }}>
                <span className="font-bold tracking-widest uppercase">{def.team.toUpperCase()}</span>
                <span>★ ★ ★</span>
              </div>

              {/* Role Icon & Title */}
              <div className="space-y-2.5 flex flex-col items-center">
                <div 
                  className="w-18 h-18 rounded-2xl flex items-center justify-center border shadow-xl"
                  style={{
                    backgroundColor: `${def.color}15`,
                    borderColor: `${def.color}50`,
                    color: def.color
                  }}
                >
                  {def.id === 'don' && <Crown className="w-9 h-9" />}
                  {def.id === 'mafia' && <Skull className="w-9 h-9" />}
                  {def.id === 'sheriff' && <Shield className="w-9 h-9" />}
                  {def.id === 'doctor' && <HeartPulse className="w-9 h-9" />}
                  {def.id === 'courtesan' && <Sparkles className="w-9 h-9" />}
                  {def.id === 'maniac' && <Flame className="w-9 h-9" />}
                  {def.id === 'civilian' && <Users className="w-9 h-9" />}
                  {def.id === 'bodyguard' && <Shield className="w-9 h-9" />}
                </div>

                <div>
                  <h3 className="text-xl font-sans font-black tracking-wide" style={{ color: def.color }}>
                    {def.name}
                  </h3>
                  <span className="text-[11px] text-zinc-400 font-medium">
                    {def.team === 'mafia' ? 'Преступный синдикат' : def.team === 'maniac' ? 'Одиночный убийца' : 'Честный житель города'}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-zinc-300 leading-relaxed px-2 font-sans">
                {def.description}
              </p>

              <div className="w-full flex items-center justify-center gap-1.5 text-[10px] text-zinc-400">
                <EyeOff className="w-3 h-3" />
                <span>Нажмите, чтобы скрыть</span>
              </div>
            </div>

          </div>
        </div>

        {/* Role Guide Action Button */}
        <div className="flex justify-center">
          <button
            onClick={handleOpenGuide}
            className="group relative px-4 py-2 rounded-xl bg-[#161824] hover:bg-[#202234] border border-amber-500/40 hover:border-amber-400/80 text-zinc-200 hover:text-white text-xs font-bold transition-all shadow-lg hover:shadow-amber-500/10 flex items-center gap-2"
          >
            <div className="w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <span>Гайд по роли и условия победы</span>
            <span className="text-[10px] text-amber-400 font-mono bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">
              Справка
            </span>
          </button>
        </div>

        {/* Teammates Notice for Mafia / Don */}
        {teammates && teammates.length > 1 && (
          <div className="p-3.5 bg-[#1a1215] border border-rose-900/60 rounded-xl text-left text-xs space-y-1.5">
            <span className="text-rose-400 font-bold flex items-center gap-1.5">
              <span>🤝</span> Ваши подельники по мафии:
            </span>
            <div className="space-y-1 text-zinc-300">
              {teammates.map(t => (
                <div key={t.id} className="flex justify-between items-center text-xs">
                  <span className="font-medium text-white">{t.name}</span>
                  <span className="text-rose-400 text-[11px] font-mono">
                    {t.role === 'don' ? 'Дон Мафии 👑' : 'Мафия'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Countdown to Game Start */}
        <div className="p-3 rounded-xl bg-[#14151f] border border-zinc-800 text-xs text-zinc-300 flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
          <span>Игра начнётся через <strong className="font-mono text-amber-400 font-bold text-sm">{timeRemaining}</strong> сек.</span>
        </div>

      </div>

      {/* Role Guide Modal */}
      <RoleGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        assignedRole={role}
      />
    </div>
  );
};
