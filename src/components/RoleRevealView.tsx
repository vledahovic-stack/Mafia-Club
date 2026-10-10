import React, { useState, useEffect, useRef } from 'react';
import { RoleId } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { 
  Crown, 
  Skull, 
  Shield, 
  HeartPulse, 
  Sparkles, 
  Flame, 
  Users, 
  Eye, 
  EyeOff, 
  Clock, 
  BookOpen, 
  Info, 
  RotateCw, 
  Layers, 
  Sparkle,
  ShieldAlert,
  HelpCircle,
  Lock,
  ChevronRight
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { RoleGuideModal } from './RoleGuideModal';

export interface RoleRevealViewProps {
  role?: RoleId;
  teammates?: { id: string; name: string; role: RoleId }[];
  timeRemaining: number;
  isSpectator?: boolean;
  equippedCardBack?: string;
  playerName?: string;
}

type CardBackSkin = 'classic_noir' | 'card_gold' | 'card_crimson';

interface RoleRankMeta {
  rank: string;
  suit: string;
  badge: string;
  subTitle: string;
  glowColor: string;
  accentColor: string;
}

const ROLE_RANK_META: Record<RoleId, RoleRankMeta> = {
  don: {
    rank: 'K',
    suit: '👑',
    badge: 'ГЛАВА СИНДИКАТА',
    subTitle: 'Решающий голос и охота на Шерифа',
    glowColor: '#ef4444',
    accentColor: '#f59e0b'
  },
  mafia: {
    rank: 'J',
    suit: '☠',
    badge: 'ПРЕСТУПНЫЙ СИНДИКАТ',
    subTitle: 'Ночные скоординированные отстрелы',
    glowColor: '#ef4444',
    accentColor: '#dc2626'
  },
  sheriff: {
    rank: 'A',
    suit: '⭐',
    badge: 'ЗАЩИТНИК ЗАКОНА',
    subTitle: 'Ночные проверки на причастность к мафии',
    glowColor: '#f59e0b',
    accentColor: '#fbbf24'
  },
  doctor: {
    rank: 'Q',
    suit: '✚',
    badge: 'СКОРАЯ ПОМОЩЬ',
    subTitle: 'Ночное исцеление и спасение жизней',
    glowColor: '#10b981',
    accentColor: '#34d399'
  },
  courtesan: {
    rank: 'Q',
    suit: '❦',
    badge: 'НОЧНАЯ БЛОКИРОВКА',
    subTitle: 'Блокирует действие любого игрока (№1)',
    glowColor: '#ec4899',
    accentColor: '#f472b6'
  },
  maniac: {
    rank: 'JK',
    suit: '⚔',
    badge: 'ОДИНОЧНЫЙ УБИЙЦА',
    subTitle: 'Охота на всех без подельников',
    glowColor: '#8b5cf6',
    accentColor: '#a78bfa'
  },
  bodyguard: {
    rank: '10',
    suit: '🛡',
    badge: 'ЖИВОЙ ЩИТ',
    subTitle: 'Принимает пулю за подопечного',
    glowColor: '#3b82f6',
    accentColor: '#60a5fa'
  },
  civilian: {
    rank: '7',
    suit: '♟',
    badge: 'МИРНЫЙ ГОРОД',
    subTitle: 'Сила логики и решающий дневной голос',
    glowColor: '#60a5fa',
    accentColor: '#93c5fd'
  }
};

export const RoleRevealView: React.FC<RoleRevealViewProps> = ({
  role = 'civilian',
  teammates = [],
  timeRemaining,
  isSpectator = false,
  equippedCardBack,
  playerName
}) => {
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [selectedSkin, setSelectedSkin] = useState<CardBackSkin>(() => {
    if (equippedCardBack === 'card_gold') return 'card_gold';
    if (equippedCardBack === 'card_crimson') return 'card_crimson';
    return 'classic_noir';
  });

  // Interactive 3D tilt tracking
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [glare, setGlare] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isPeeking, setIsPeeking] = useState<boolean>(false);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const def = ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.civilian;
  const meta = ROLE_RANK_META[role] || ROLE_RANK_META.civilian;

  // Auto-reveal after a dramatic pause at start of round
  useEffect(() => {
    if (isSpectator) return;
    const t = setTimeout(() => {
      setIsRevealed(true);
      sounds.playCardFlip();
      sounds.playDramaticReveal();
    }, 900);
    return () => clearTimeout(t);
  }, [isSpectator]);

  // Pointer move calculation for smooth 3D tilt
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const nx = (px - 0.5) * 2; // -1 to 1
    const ny = (py - 0.5) * 2; // -1 to 1

    setTilt({ x: nx, y: ny });
    setGlare({ x: px * 100, y: py * 100 });
  };

  const handlePointerEnter = () => {
    setIsHovered(true);
    sounds.playCardSlide();
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
    setGlare({ x: 50, y: 50 });
    setIsPeeking(false);
  };

  const handleCardClick = () => {
    setIsFlipping(true);
    const nextState = !isRevealed;
    setIsRevealed(nextState);
    sounds.playCardFlip();
    if (nextState) {
      sounds.playDramaticReveal();
    }
    setTimeout(() => setIsFlipping(false), 700);
  };

  const handleQuickFlip = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleCardClick();
  };

  const handleHideSecret = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRevealed) {
      setIsRevealed(false);
      sounds.playCardFlip();
    }
  };

  const handleOpenGuide = (e: React.MouseEvent) => {
    e.stopPropagation();
    sounds.playTick();
    setIsGuideOpen(true);
  };

  // Render Role Icon
  const renderRoleIcon = () => {
    switch (def.id) {
      case 'don':
        return <Crown className="w-12 h-12 drop-shadow-lg" />;
      case 'mafia':
        return <Skull className="w-12 h-12 drop-shadow-lg" />;
      case 'sheriff':
        return <ShieldAlert className="w-12 h-12 drop-shadow-lg" />;
      case 'doctor':
        return <HeartPulse className="w-12 h-12 drop-shadow-lg" />;
      case 'courtesan':
        return <Sparkles className="w-12 h-12 drop-shadow-lg" />;
      case 'maniac':
        return <Flame className="w-12 h-12 drop-shadow-lg" />;
      case 'bodyguard':
        return <Shield className="w-12 h-12 drop-shadow-lg" />;
      case 'civilian':
      default:
        return <Users className="w-12 h-12 drop-shadow-lg" />;
    }
  };

  if (isSpectator) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
        <div className="max-w-md w-full space-y-5">
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

          <div className="p-3 rounded-xl bg-[#14151f] border border-zinc-800 text-xs text-zinc-300 flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>Начало дня через <strong className="font-mono text-indigo-300 font-bold text-sm">{timeRemaining}</strong> сек.</span>
          </div>
        </div>
      </div>
    );
  }

  // Calculate dynamic 3D rotation based on flip state and mouse tilt
  const baseRotationY = isRevealed ? 180 : 0;
  // If face up (180deg), reverse horizontal tilt so it tilts naturally toward cursor
  const rotY = isRevealed ? (180 - tilt.x * 18) : (tilt.x * 18);
  const rotX = isRevealed ? (tilt.y * 18) : (-tilt.y * 18);
  const peekExtraY = isPeeking && !isRevealed ? 35 : 0;
  const peekExtraX = isPeeking && !isRevealed ? -10 : 0;

  // Dynamic shadow offset opposite to tilt
  const shadowX = -tilt.x * 24;
  const shadowY = 28 + tilt.y * 16;

  return (
    <div className="w-full flex flex-col items-center justify-center px-4 py-6 text-center select-none animate-in fade-in duration-300 relative">
      
      {/* Background ambient lighting centered on card */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[500px] h-[480px] sm:h-[600px] rounded-full blur-3xl pointer-events-none transition-all duration-1000 -z-10"
        style={{
          background: isRevealed 
            ? `radial-gradient(circle, ${meta.glowColor}25 0%, transparent 70%)` 
            : 'radial-gradient(circle, rgba(217, 119, 6, 0.12) 0%, transparent 70%)'
        }}
      />

      <div className="max-w-md w-full space-y-4">
        
        {/* Header Phase Banner */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/90 border border-zinc-800/80 text-[10px] font-mono tracking-widest uppercase text-amber-400 font-bold shadow-md">
            <Sparkle className="w-3 h-3 text-amber-400" />
            <span>РАЗДАЧА КАРТ СТОЛА</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-sans font-black text-white tracking-tight">
            {isRevealed ? 'Ваша тайная роль' : 'Судьба определена'}
          </h2>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
            {isRevealed 
              ? 'Нажмите на карту или используйте «Скрыть», чтобы спрятать экран.' 
              : 'Нажмите на карту или потяните, чтобы открыть ваше секретное призвание.'}
          </p>
        </div>

        {/* 3D INTERACTIVE PLAYING CARD STAGE */}
        <div 
          className="relative py-2 sm:py-3 flex items-center justify-center"
          style={{ perspective: '1400px' }}
        >
          <div
            ref={cardRef}
            onClick={handleCardClick}
            onPointerMove={handlePointerMove}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            className={`relative w-[270px] sm:w-[290px] h-[395px] sm:h-[430px] cursor-pointer select-none card-preserve-3d transition-transform ${
              isFlipping ? 'duration-700 ease-out' : isHovered ? 'duration-100 ease-out' : 'duration-500 ease-out animate-card-float'
            }`}
            style={{
              transform: `rotateY(${rotY + peekExtraY}deg) rotateX(${rotX + peekExtraX}deg) scale(${isHovered ? 1.03 : 1})`,
              filter: `drop-shadow(${shadowX}px ${shadowY}px 32px rgba(0,0,0,0.85))`
            }}
          >

            {/* ============================================================ */}
            {/* CARD BACK (Secret / Hidden State) */}
            {/* ============================================================ */}
            <div 
              className={`absolute inset-0 w-full h-full rounded-3xl p-5 flex flex-col justify-between card-backface-hidden border-2 transition-colors duration-500 overflow-hidden ${
                selectedSkin === 'card_gold'
                  ? 'bg-gradient-to-b from-[#1c180e] via-[#14120a] to-[#0d0c07] border-amber-500/80 shadow-[inset_0_0_24px_rgba(245,158,11,0.25)]'
                  : selectedSkin === 'card_crimson'
                  ? 'bg-gradient-to-b from-[#220e14] via-[#18090d] to-[#0d0407] border-rose-600/80 shadow-[inset_0_0_24px_rgba(225,29,72,0.25)]'
                  : 'bg-gradient-to-b from-[#161822] via-[#0f1118] to-[#0a0b10] border-amber-900/70 shadow-[inset_0_0_20px_rgba(0,0,0,0.9)]'
              }`}
            >
              {/* Foil pattern background overlay */}
              <div 
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 1px, transparent 1px)`,
                  backgroundSize: '16px 16px'
                }}
              />

              {/* Dynamic specular light glare */}
              <div 
                className="absolute inset-0 pointer-events-none rounded-3xl mix-blend-overlay transition-opacity duration-300"
                style={{
                  background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.45) 0%, transparent 65%)`,
                  opacity: isHovered ? 0.9 : 0.2
                }}
              />

              {/* Top Card Index Bar */}
              <div className="relative z-10 w-full flex items-center justify-between text-xs font-mono font-bold">
                <span className={selectedSkin === 'card_gold' ? 'text-amber-400' : selectedSkin === 'card_crimson' ? 'text-rose-400' : 'text-amber-500/80'}>
                  ♠
                </span>
                <span className={`tracking-widest uppercase text-[11px] font-bold ${
                  selectedSkin === 'card_gold' ? 'text-amber-300' : selectedSkin === 'card_crimson' ? 'text-rose-300' : 'text-zinc-400'
                }`}>
                  MAFIA • SYNDICATE
                </span>
                <span className={selectedSkin === 'card_gold' ? 'text-amber-400' : selectedSkin === 'card_crimson' ? 'text-rose-400' : 'text-amber-500/80'}>
                  ♠
                </span>
              </div>

              {/* Center Medallion with 3D Depth */}
              <div className="relative z-10 flex flex-col items-center justify-center my-auto space-y-3 card-layer-lift">
                <div className={`relative w-28 h-28 rounded-full border-2 flex items-center justify-center shadow-2xl ${
                  selectedSkin === 'card_gold'
                    ? 'border-amber-400 bg-gradient-to-b from-amber-950 to-[#120f06] shadow-amber-900/50'
                    : selectedSkin === 'card_crimson'
                    ? 'border-rose-500 bg-gradient-to-b from-rose-950 to-[#120508] shadow-rose-950/60'
                    : 'border-amber-800/60 bg-gradient-to-b from-[#181b26] to-[#0c0d13] shadow-black'
                }`}>
                  {/* Ornate spinning decorative ring */}
                  <div className="absolute inset-1.5 rounded-full border border-dashed border-amber-500/30 animate-[spin_30s_linear_infinite]" />
                  
                  <GangsterIcon size={56} className="w-14 h-14 drop-shadow-2xl" />
                </div>

                <div className="space-y-1">
                  <span className={`text-[12px] font-mono tracking-widest font-black uppercase block ${
                    selectedSkin === 'card_gold' ? 'text-amber-300' : selectedSkin === 'card_crimson' ? 'text-rose-300' : 'text-amber-400'
                  }`}>
                    ТАЙНАЯ РОЛЬ
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 border border-white/10 text-[10px] text-zinc-300 backdrop-blur-xs">
                    <Eye className="w-3 h-3 text-amber-400 animate-pulse" />
                    <span>Нажмите, чтобы открыть</span>
                  </div>
                </div>
              </div>

              {/* Bottom Card Index Bar */}
              <div className="relative z-10 w-full flex items-center justify-between text-xs font-mono font-bold rotate-180">
                <span className={selectedSkin === 'card_gold' ? 'text-amber-400' : selectedSkin === 'card_crimson' ? 'text-rose-400' : 'text-amber-500/80'}>
                  ♠
                </span>
                <span className={`tracking-widest uppercase text-[11px] font-bold ${
                  selectedSkin === 'card_gold' ? 'text-amber-300' : selectedSkin === 'card_crimson' ? 'text-rose-300' : 'text-zinc-400'
                }`}>
                  MAFIA • SYNDICATE
                </span>
                <span className={selectedSkin === 'card_gold' ? 'text-amber-400' : selectedSkin === 'card_crimson' ? 'text-rose-400' : 'text-amber-500/80'}>
                  ♠
                </span>
              </div>
            </div>

            {/* ============================================================ */}
            {/* CARD FRONT (Revealed State - 180 deg) */}
            {/* ============================================================ */}
            <div 
              className="absolute inset-0 w-full h-full rounded-3xl p-5 flex flex-col justify-between card-backface-hidden bg-[#11131a] border-2 shadow-2xl overflow-hidden"
              style={{
                transform: 'rotateY(180deg)',
                borderColor: `${def.color}c0`,
                boxShadow: `inset 0 0 35px ${def.color}20, 0 10px 40px -10px rgba(0,0,0,0.9)`
              }}
            >
              {/* Card texture foil */}
              <div 
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, ${def.color} 1px, transparent 1px)`,
                  backgroundSize: '20px 20px'
                }}
              />

              {/* Dynamic specular glare on face */}
              <div 
                className="absolute inset-0 pointer-events-none rounded-3xl mix-blend-overlay transition-opacity duration-300"
                style={{
                  background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.4) 0%, transparent 60%)`,
                  opacity: isHovered ? 0.8 : 0.2
                }}
              />

              {/* Top-Left & Top-Right Playing Card Indices */}
              <div className="relative z-10 w-full flex items-start justify-between">
                {/* Top-left rank and suit index */}
                <div className="flex flex-col items-center leading-none select-none">
                  <span className="text-lg font-mono font-black" style={{ color: def.color }}>
                    {meta.rank}
                  </span>
                  <span className="text-xs" style={{ color: def.color }}>
                    {meta.suit}
                  </span>
                </div>

                {/* Team Badge Banner */}
                <div 
                  className="px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider shadow-sm"
                  style={{
                    backgroundColor: `${def.color}18`,
                    borderColor: `${def.color}55`,
                    color: def.color
                  }}
                >
                  {def.team === 'mafia' ? 'СИНДИКАТ' : def.team === 'maniac' ? 'МАНЬЯК' : 'МИРНЫЙ ГОРОД'}
                </div>

                {/* Top-right quick hide button */}
                <button
                  type="button"
                  onClick={handleHideSecret}
                  title="Скрыть роль"
                  className="w-7 h-7 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-400 hover:text-white flex items-center justify-center transition-colors shadow-sm"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Center 3D Role Artwork & Medallion (Elevated in 3D) */}
              <div className="relative z-10 flex flex-col items-center justify-center my-auto space-y-2.5 card-layer-lift">
                
                {/* Floating Medallion with Ambient Backlight */}
                <div className="relative">
                  <div 
                    className="absolute inset-0 rounded-2xl blur-xl opacity-60 animate-pulse-glow"
                    style={{ backgroundColor: def.color }}
                  />
                  <div 
                    className="relative w-20 h-20 rounded-2xl flex items-center justify-center border-2 shadow-2xl"
                    style={{
                      backgroundColor: `${def.color}20`,
                      borderColor: `${def.color}90`,
                      color: def.color
                    }}
                  >
                    {renderRoleIcon()}
                  </div>
                </div>

                {/* Role Titles */}
                <div className="space-y-0.5">
                  <h3 
                    className="text-2xl font-sans font-black tracking-wide"
                    style={{ 
                      color: def.color,
                      textShadow: `0 2px 10px ${def.color}40`
                    }}
                  >
                    {def.name}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400 font-semibold uppercase tracking-wider">
                    {meta.badge}
                  </p>
                </div>

                {/* Role Stats Row */}
                <div className="grid grid-cols-2 gap-2 w-full px-2 pt-1 text-[11px]">
                  <div className="p-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-center">
                    <span className="text-[10px] text-zinc-500 block uppercase font-mono">Ночной ход</span>
                    <span className="font-bold text-zinc-200">
                      {def.nightAction ? '⚡ Есть ход' : '🌙 Спит ночью'}
                    </span>
                  </div>
                  <div className="p-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-center">
                    <span className="text-[10px] text-zinc-500 block uppercase font-mono">Приоритет</span>
                    <span className="font-bold text-amber-400 font-mono">
                      {def.nightPriority === 99 ? '—' : `№${def.nightPriority}`}
                    </span>
                  </div>
                </div>

                {/* Short Role Description */}
                <p className="text-[11px] text-zinc-300 leading-snug px-1 line-clamp-3">
                  {def.description}
                </p>
              </div>

              {/* Bottom Card Index Bar */}
              <div className="relative z-10 w-full flex items-end justify-between pt-1">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <RotateCw className="w-3 h-3 text-zinc-400" />
                  <span>Нажмите для оборота</span>
                </div>

                {/* Bottom-right inverted index */}
                <div className="flex flex-col items-center leading-none rotate-180 select-none">
                  <span className="text-lg font-mono font-black" style={{ color: def.color }}>
                    {meta.rank}
                  </span>
                  <span className="text-xs" style={{ color: def.color }}>
                    {meta.suit}
                  </span>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* TACTILE CONTROL ACTION BUTTONS */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {/* Flip / Turn Card Button */}
          <button
            onClick={handleQuickFlip}
            className="px-4 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 hover:border-amber-500/70 text-zinc-200 hover:text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 active:scale-95"
          >
            <RotateCw className="w-3.5 h-3.5 text-amber-400" />
            <span>{isRevealed ? 'Спрятать карту' : 'Показать роль'}</span>
          </button>

          {/* Role Guide Modal Button */}
          <button
            onClick={handleOpenGuide}
            className="px-4 py-2 rounded-xl bg-[#161824] hover:bg-[#202234] border border-amber-500/40 hover:border-amber-400/80 text-zinc-200 hover:text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 active:scale-95"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Гайд и цели</span>
          </button>

          {/* Quick Deck Skin Selector */}
          <div className="inline-flex p-1 bg-zinc-950/80 border border-zinc-800/80 rounded-xl items-center gap-1">
            <span className="text-[10px] font-mono text-zinc-500 px-1.5 uppercase hidden sm:inline">Рубашка:</span>
            <button
              type="button"
              onClick={() => {
                setSelectedSkin('classic_noir');
                sounds.playCardSlide();
              }}
              title="Классический нуар"
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                selectedSkin === 'classic_noir'
                  ? 'bg-zinc-800 text-amber-400 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Нуар
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSkin('card_gold');
                sounds.playCardSlide();
              }}
              title="Золотой Дон"
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                selectedSkin === 'card_gold'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-600/50 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Золото 👑
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSkin('card_crimson');
                sounds.playCardSlide();
              }}
              title="Кровавая Ночь"
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                selectedSkin === 'card_crimson'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-600/50 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Рубин ☠
            </button>
          </div>
        </div>

        {/* TEAMMATES DOSSIER (For Don / Mafia) */}
        {teammates && teammates.length > 1 && (
          <div className="p-3.5 bg-gradient-to-b from-[#1c1216] to-[#140c10] border border-rose-900/70 rounded-2xl text-left text-xs space-y-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <span className="text-rose-400 font-bold flex items-center gap-1.5">
                <Skull className="w-4 h-4 text-rose-500" />
                <span>Досье синдиката (Ваши подельники):</span>
              </span>
              <span className="text-[10px] font-mono text-rose-400/80 bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-800/40">
                {teammates.length} чел.
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-300">
              {teammates.map(t => (
                <div 
                  key={t.id} 
                  className="flex justify-between items-center px-3 py-2 rounded-xl bg-black/40 border border-rose-950/80 text-xs"
                >
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    {t.name}
                  </span>
                  <span className="text-rose-400 text-[11px] font-mono font-bold">
                    {t.role === 'don' ? 'Дон Мафии 👑' : 'Мафия'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase Countdown to Night / Day Start */}
        <div className="p-3 rounded-2xl bg-[#14151f]/90 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-center gap-2 shadow-lg backdrop-blur-xs">
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
