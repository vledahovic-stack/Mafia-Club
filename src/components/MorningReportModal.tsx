import React from 'react';
import { NightResult, Player, RoleId } from '../types/mafia';
import { Newspaper, Skull, Heart, Shield, Crown, X, Ban } from 'lucide-react';
import { GangsterIcon } from './GangsterIcon';

interface MorningReportModalProps {
  dayNumber: number;
  lastNightResult?: NightResult;
  players: Player[];
  timeRemaining: number;
  myRole?: RoleId;
  sheriffLastCheckResult?: { targetId: string; isMafia: boolean } | null;
  donLastCheckResult?: { targetId: string; isSheriff: boolean } | null;
}

export const MorningReportModal: React.FC<MorningReportModalProps> = ({
  dayNumber,
  lastNightResult,
  players,
  timeRemaining,
  myRole,
  sheriffLastCheckResult,
  donLastCheckResult
}) => {
  if (!lastNightResult) return null;

  const killedPlayers = players.filter(p => lastNightResult.killedPlayerIds.includes(p.id));
  const hasKills = killedPlayers.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-[#111219] border border-amber-900/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Newspaper Masthead */}
        <div className="bg-[#161722] p-6 border-b border-zinc-800 text-center space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-amber-500/80 border-b border-zinc-800 pb-2">
            <span>ВЫПУСК № {dayNumber}</span>
            <span className="font-bold">THE DAILY CRIME • ВЕСТНИК ГОРОДА</span>
            <span>ЭКСТРЕННО</span>
          </div>

          <div className="pt-2 flex items-center justify-center gap-3">
            <Newspaper className="w-6 h-6 text-amber-500" />
            <h2 className="text-xl sm:text-2xl font-sans font-black uppercase tracking-wider text-white">
              {hasKills ? 'Кровавый рассвет в городе' : 'Город проснулся в безопасности'}
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            Первые лучи солнца обнажили события прошедшей ночи
          </p>
        </div>

        {/* Newspaper Story */}
        <div className="p-6 space-y-4 bg-[#12131b]">
          {hasKills ? (
            <div className="p-4 rounded-2xl bg-[#1c1216] border border-rose-900/60 space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                <Skull className="w-4 h-4 shrink-0" />
                <span>Жертвы ночной расправы:</span>
              </div>
              <div className="space-y-2.5">
                {killedPlayers.map((p, idx) => {
                  const playerSlot = players.findIndex(item => item.id === p.id) + 1;
                  return (
                    <div 
                      key={p.id} 
                      className="group relative flex items-center justify-between p-3 bg-[#150e12] rounded-2xl border border-rose-950/80 shadow-lg overflow-hidden animate-in fade-in slide-in-from-left duration-500"
                      style={{ animationDelay: `${idx * 150}ms` }}
                    >
                      {/* Left: Cross-out portrait with subtle fade-out transition */}
                      <div className="flex items-center gap-3.5">
                        <div className="relative w-12 h-12 rounded-2xl bg-zinc-950 border border-rose-800/80 flex items-center justify-center overflow-hidden shadow-inner shrink-0 transition-all duration-700">
                          {/* Portrait icon with subtle fade and grayscale */}
                          <div className="transition-all duration-700 opacity-40 grayscale contrast-125">
                            <GangsterIcon size={32} className="w-8 h-8 text-zinc-400" />
                          </div>

                          {/* Red cross-out diagonal lines overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <svg className="w-full h-full text-rose-600/90 drop-shadow-[0_0_4px_rgba(225,29,72,0.8)]" viewBox="0 0 48 48">
                              <line x1="8" y1="8" x2="40" y2="40" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                              <line x1="40" y1="8" x2="8" y2="40" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                            </svg>
                          </div>

                          {/* Center Skull badge */}
                          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center">
                            <Skull className="w-2.5 h-2.5 text-rose-300" />
                          </div>
                        </div>

                        {/* Player name & details with line-through effect */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-950/80 border border-rose-800/60 px-1.5 py-0.2 rounded">
                              #{playerSlot}
                            </span>
                            <h4 className="text-sm font-bold text-zinc-100 line-through decoration-rose-500 decoration-2">
                              {p.name}
                            </h4>
                          </div>
                          <p className="text-[11px] text-rose-300/80 mt-0.5 flex items-center gap-1">
                            <span>Убит этой ночью</span>
                            <span>•</span>
                            <span className="text-zinc-400">Найдено тело на рассвете</span>
                          </p>
                        </div>
                      </div>

                      {/* Right Stamp: ELIMINATED */}
                      <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-950/90 border border-rose-600/80 text-rose-300 text-[10px] font-mono font-extrabold uppercase tracking-widest rotate-[-4deg] shadow-md shadow-rose-950/50">
                        <X className="w-3 h-3 text-rose-400" />
                        <span>ВЫБЫЛ</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-[#121c16] border border-emerald-900/60 space-y-2 text-center">
              <Heart className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="text-sm font-bold text-emerald-300 uppercase tracking-wide">
                Этой ночью никто не погиб!
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Благодаря искусным действиям доктора или осечке нападавших, все граждане проснулись живыми и невредимыми.
              </p>
            </div>
          )}

          {/* Secret Sheriff Report Section */}
          {myRole === 'sheriff' && (sheriffLastCheckResult || lastNightResult.sheriffInvestigation) && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-3 ${
              (lastNightResult.sheriffInvestigation || sheriffLastCheckResult)?.isMafia
                ? 'bg-rose-950/70 border-rose-700 text-rose-100 shadow-md ring-1 ring-rose-600/40'
                : 'bg-emerald-950/70 border-emerald-700 text-emerald-100 shadow-md ring-1 ring-emerald-600/40'
            }`}>
              <Shield className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <div className="font-bold uppercase tracking-wider text-[10px] text-amber-400">
                  🔍 Секретный отчёт Шерифа
                </div>
                <div className="text-xs font-semibold mt-0.5">
                  Проверен гражданин{' '}
                  <strong className="text-white underline">
                    {players.find(p => p.id === (lastNightResult.sheriffInvestigation || sheriffLastCheckResult)?.targetId)?.name || 'Неизвестный'}
                  </strong>{' '}
                  —{' '}
                  {(lastNightResult.sheriffInvestigation || sheriffLastCheckResult)?.isMafia ? (
                    <span className="text-rose-300 font-extrabold uppercase">ЧЛЕН МАФИИ ⚠️</span>
                  ) : (
                    <span className="text-emerald-300 font-extrabold uppercase">МИРНЫЙ ЖИТЕЛЬ 🛡️</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Secret Don Report Section */}
          {myRole === 'don' && (donLastCheckResult || lastNightResult.donInvestigation) && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-3 ${
              (lastNightResult.donInvestigation || donLastCheckResult)?.isSheriff
                ? 'bg-amber-950/70 border-amber-600 text-amber-100 shadow-md ring-1 ring-amber-500/40'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200'
            }`}>
              <Crown className="w-5 h-5 shrink-0 text-amber-400" />
              <div>
                <div className="font-bold uppercase tracking-wider text-[10px] text-amber-400">
                  👑 Секретный отчёт Дона
                </div>
                <div className="text-xs font-semibold mt-0.5">
                  Проверен гражданин{' '}
                  <strong className="text-white underline">
                    {players.find(p => p.id === (lastNightResult.donInvestigation || donLastCheckResult)?.targetId)?.name || 'Неизвестный'}
                  </strong>{' '}
                  —{' '}
                  {(lastNightResult.donInvestigation || donLastCheckResult)?.isSheriff ? (
                    <span className="text-amber-300 font-extrabold uppercase">ЭТО ШЕРИФ! 🎯</span>
                  ) : (
                    <span className="text-zinc-300 font-medium">Не является шерифом</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Narrative text feed */}
          <div className="space-y-1.5 border-t border-zinc-850 pt-3 text-xs text-zinc-300 leading-relaxed">
            {(lastNightResult.narrativeText || []).map((line, idx) => (
              <p key={idx} className="flex items-start gap-2">
                <span className="text-amber-500 font-mono">›</span>
                <span>{line}</span>
              </p>
            ))}
          </div>

          {/* Countdown Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-850 text-xs text-zinc-400">
            <span>Обсуждение начнётся автоматически:</span>
            <span className="font-mono font-bold text-amber-400 text-sm">{timeRemaining}с</span>
          </div>
        </div>

      </div>
    </div>
  );
};
