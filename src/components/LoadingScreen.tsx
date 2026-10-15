import React from 'react';
import { GangsterIcon } from './GangsterIcon';
import { Sparkles, Shield, Loader2 } from 'lucide-react';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Подключение к Городу...',
  subMessage = 'Проверка учетной записи и синхронизация игровых комнат'
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Загрузка игры"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0b12] text-white select-none transition-opacity duration-500"
    >
      {/* Background with noir image and dark moody overlays */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25 scale-105 filter blur-sm pointer-events-none transition-transform duration-1000"
        style={{ backgroundImage: `url(${noirLobbyBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b12] via-[#0a0b12]/90 to-[#0a0b12]/80 pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.12)_0%,transparent_70%)] pointer-events-none" />

      {/* Decorative ambient glow orbs */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-6 max-w-md w-full text-center">
        {/* Logo Badge Container */}
        <div className="relative mb-6">
          {/* Outer glowing pulsing ring */}
          <div className="absolute -inset-3 rounded-3xl bg-gradient-to-r from-amber-500/20 via-orange-500/30 to-rose-500/20 blur-md animate-pulse" />
          
          {/* Logo Frame */}
          <div className="relative p-4 rounded-3xl bg-gradient-to-b from-[#181a27] to-[#10111a] border border-amber-500/40 shadow-2xl shadow-amber-950/60 flex items-center justify-center">
            <GangsterIcon size={84} className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]" />

            {/* Corner metallic rivets */}
            <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-amber-400/60 shadow-sm" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-400/60 shadow-sm" />
            <span className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-amber-400/60 shadow-sm" />
            <span className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-400/60 shadow-sm" />
          </div>

          {/* Floating badge emblem */}
          <div className="absolute -bottom-2 -right-2 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 border border-amber-400/80 shadow-lg text-[10px] font-black tracking-wider uppercase text-amber-100 flex items-center gap-1">
            <Shield className="w-3 h-3 text-amber-200" />
            <span>NOIR</span>
          </div>
        </div>

        {/* Title & Brand */}
        <div className="space-y-1 mb-8">
          <div className="flex items-center justify-center gap-2">
            <span className="h-px w-6 bg-gradient-to-r from-transparent to-amber-500/70" />
            <span className="text-[11px] font-mono tracking-[0.35em] text-amber-400 uppercase font-bold">
              ОНЛАЙН СИНДИКАТ
            </span>
            <span className="h-px w-6 bg-gradient-to-l from-transparent to-amber-500/70" />
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-100 to-zinc-400 drop-shadow uppercase font-sans">
            МАФИЯ ОНЛАЙН
          </h1>
          
          <p className="text-xs sm:text-sm font-mono tracking-[0.25em] text-zinc-400 uppercase flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400/80 animate-spin" style={{ animationDuration: '6s' }} />
            <span>ГОРОД ЗАСЫПАЕТ</span>
          </p>
        </div>

        {/* Progress Bar & Status Text */}
        <div className="w-full space-y-3 bg-[#121420]/80 p-4 rounded-2xl border border-zinc-800/90 shadow-xl backdrop-blur-md">
          {/* Animated Glowing Progress Track */}
          <div className="relative w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <div className="absolute inset-y-0 bg-gradient-to-r from-amber-600 via-orange-500 to-amber-400 rounded-full animate-indeterminate shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
          </div>

          <div className="flex items-center justify-center gap-2 text-zinc-200">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            <span className="text-xs sm:text-sm font-medium tracking-wide">
              {message}
            </span>
          </div>

          {subMessage && (
            <p className="text-[11px] text-zinc-400 font-mono">
              {subMessage}
            </p>
          )}
        </div>

        {/* Atmosphere hint */}
        <p className="mt-8 text-[11px] text-zinc-400 tracking-wider font-mono">
          Готовьте карты • Выбирайте стратегию • Не доверяйте никому
        </p>
      </div>

      <style>{`
        @keyframes indeterminate {
          0% {
            left: -40%;
            width: 40%;
          }
          50% {
            left: 20%;
            width: 60%;
          }
          100% {
            left: 100%;
            width: 40%;
          }
        }
        .animate-indeterminate {
          position: absolute;
          animation: indeterminate 1.6s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
        }
      `}</style>
    </div>
  );
};
