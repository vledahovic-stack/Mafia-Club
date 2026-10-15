import React, { useState } from 'react';
import { Player, RoleId } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { 
  Skull, 
  Crown, 
  Shield, 
  HeartPulse, 
  Sparkles, 
  Flame, 
  Check, 
  Moon, 
  AlertTriangle, 
  FastForward, 
  Info, 
  HelpCircle, 
  Trophy, 
  Target, 
  X,
  Users
} from 'lucide-react';
import { sounds } from '../utils/audio';

interface NightPhaseViewProps {
  myRole?: RoleId;
  myId: string;
  players: Player[];
  timeRemaining: number;
  isSpectator?: boolean;
  onSubmitNightAction: (actionType: string, targetId: string) => void;
  onSkipPhase?: () => void;
  isNightActionCompleted?: boolean;
  isSkipVoted?: boolean;
  totalNightActiveRoles?: number;
  nightSkipVotesCount?: number;
  sheriffLastCheckResult?: { targetId: string; isMafia: boolean } | null;
  donLastCheckResult?: { targetId: string; isSheriff: boolean } | null;
  sheriffCurrentCheckResult?: { targetId: string; isMafia: boolean } | null;
  donCurrentCheckResult?: { targetId: string; isSheriff: boolean } | null;
}

export const NightPhaseView: React.FC<NightPhaseViewProps> = ({
  myRole = 'civilian',
  myId,
  players,
  timeRemaining,
  isSpectator = false,
  onSubmitNightAction,
  onSkipPhase,
  isNightActionCompleted = false,
  isSkipVoted = false,
  totalNightActiveRoles = 1,
  nightSkipVotesCount = 0,
  sheriffLastCheckResult,
  donLastCheckResult,
  sheriffCurrentCheckResult,
  donCurrentCheckResult
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedDonTargetId, setSelectedDonTargetId] = useState<string | null>(null);
  const [isRoleHelpOpen, setIsRoleHelpOpen] = useState<boolean>(false);

  const me = players.find(p => p.id === myId);
  const isAlive = me?.isAlive ?? false;

  const roleDef = ROLE_DEFINITIONS[myRole] || ROLE_DEFINITIONS.civilian;
  const alivePlayers = players.filter(p => p.isAlive);

  const handleSelectTarget = (targetId: string, actionType: string) => {
    setSelectedTargetId(targetId);
    onSubmitNightAction(actionType, targetId);
    sounds.playTick();
  };

  const handleSelectDonTarget = (targetId: string) => {
    setSelectedDonTargetId(targetId);
    onSubmitNightAction('don_check', targetId);
    sounds.playTick();
  };

  // Target candidate lists based on role
  let eligibleTargets = alivePlayers;
  let actionTitle = 'Выберите цель';
  let actionType = '';

  if (myRole === 'mafia' || myRole === 'don') {
    // Exclude fellow mafia from kill targets
    eligibleTargets = alivePlayers.filter(p => p.role !== 'mafia' && p.role !== 'don');
    actionTitle = '🎯 Выберите жертву выстрела мафии';
    actionType = 'mafia_kill';
  } else if (myRole === 'sheriff') {
    // Sheriff checks other players
    eligibleTargets = alivePlayers.filter(p => p.id !== myId);
    actionTitle = '🔍 Проверка документов на причастность к мафии';
    actionType = 'sheriff_check';
  } else if (myRole === 'doctor') {
    eligibleTargets = alivePlayers; // can heal anyone
    actionTitle = '💉 Выберите пациента для лечения этой ночью';
    actionType = 'doctor_heal';
  } else if (myRole === 'courtesan') {
    eligibleTargets = alivePlayers.filter(p => p.id !== myId);
    actionTitle = '💋 Выберите игрока для блокировки его действия';
    actionType = 'courtesan_block';
  } else if (myRole === 'maniac') {
    eligibleTargets = alivePlayers.filter(p => p.id !== myId);
    actionTitle = '🔪 Выберите цель для ночной расправы';
    actionType = 'maniac_kill';
  } else if (myRole === 'bodyguard') {
    eligibleTargets = alivePlayers.filter(p => p.id !== myId);
    actionTitle = '🛡️ Защитите гражданина этой ночью';
    actionType = 'bodyguard_protect';
  }

  const teamName = roleDef.team === 'civilians'
    ? 'Мирный город 🛡️'
    : roleDef.team === 'mafia'
    ? 'Синдикат Мафии 💀'
    : 'Одиночка 🔥';

  return (
    <div className="w-full space-y-4 select-none relative">
      
      {/* Night Header Banner */}
      <div className="p-4 rounded-2xl bg-[#0f1118] border border-blue-950/80 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-950/60 border border-blue-800/40 flex items-center justify-center text-blue-400">
            <Moon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-sans font-bold text-white uppercase tracking-wider">
              Город засыпает. Просыпается мафия...
            </h3>
            <p className="text-[11px] text-zinc-400">
              Улицы опустели. Ночные роли делают свои ходы.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Role Help Trigger Button */}
          <button
            type="button"
            onClick={() => {
              sounds.playTick();
              setIsRoleHelpOpen(prev => !prev);
            }}
            title="Цель роли и условие победы"
            className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
              isRoleHelpOpen
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/40'
                : 'bg-zinc-900/80 hover:bg-zinc-850 border-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            <HelpCircle className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Цель роли</span>
          </button>

          <div className="px-3.5 py-1.5 rounded-xl bg-blue-950/60 border border-blue-700/60 text-blue-300 text-xs font-mono font-bold shadow-inner">
            Рассвет через {timeRemaining}с
          </div>
        </div>
      </div>

      {/* Role Win Condition & Objective Modal / Popover */}
      {isRoleHelpOpen && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#141622] border border-amber-500/60 space-y-3.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center border text-xs font-bold"
                style={{ backgroundColor: `${roleDef.color}20`, borderColor: `${roleDef.color}60`, color: roleDef.color }}
              >
                {myRole === 'don' && <Crown className="w-4 h-4" />}
                {myRole === 'mafia' && <Skull className="w-4 h-4" />}
                {myRole === 'sheriff' && <Shield className="w-4 h-4" />}
                {myRole === 'doctor' && <HeartPulse className="w-4 h-4" />}
                {myRole === 'courtesan' && <Sparkles className="w-4 h-4" />}
                {myRole === 'maniac' && <Flame className="w-4 h-4" />}
                {myRole === 'bodyguard' && <Shield className="w-4 h-4" />}
                {myRole === 'civilian' && <Users className="w-4 h-4" />}
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{roleDef.name}</span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    {teamName}
                  </span>
                </h4>
                <p className="text-[11px] text-zinc-400">Справка по целям и условиям победы</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsRoleHelpOpen(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Objective */}
            <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase text-[10px] tracking-wider">
                <Target className="w-3.5 h-3.5" />
                <span>Главная цель роли:</span>
              </div>
              <p className="text-zinc-200 leading-relaxed text-[11px]">
                {roleDef.objective || roleDef.description}
              </p>
            </div>

            {/* Win Condition */}
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase text-[10px] tracking-wider">
                <Trophy className="w-3.5 h-3.5" />
                <span>Условие победы (Win Condition):</span>
              </div>
              <p className="text-amber-100/90 leading-relaxed text-[11px] font-medium">
                {roleDef.winCondition || 'Выполнить задачу своей команды до конца игры.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Spectator Night View */}
      {isSpectator && (
        <div className="p-8 bg-[#12131b] border border-indigo-900/60 rounded-2xl text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-3xl bg-indigo-950/70 border border-indigo-700/60 flex items-center justify-center mx-auto text-3xl shadow-lg shadow-indigo-950/50">
            👁️
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h4 className="text-base font-sans font-bold text-white">
              Город погрузился в ночную тишину
            </h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Вы наблюдаете за игрой в режиме зрителя. Сейчас мафия и активные спецслужбы делают свои секретные ночные ходы.
            </p>
          </div>

          <div className="p-3 bg-[#161725] border border-indigo-800/40 rounded-xl text-center max-w-sm mx-auto text-xs text-indigo-300 font-mono">
            💬 Вы можете общаться с другими зрителями и игроками в общем чате.
          </div>
        </div>
      )}

      {/* Dead Player Screen */}
      {!isAlive && !isSpectator && (
        <div className="p-6 bg-[#13141a] border border-zinc-800 rounded-2xl text-center space-y-2">
          <Skull className="w-9 h-9 text-rose-500 mx-auto" />
          <h3 className="font-sans text-sm font-bold text-white uppercase tracking-wider">
            Вы погибли и наблюдаете за столом как призрак
          </h3>
          <p className="text-xs text-zinc-400">
            Вы можете переписываться в чате «Кладбище» с другими выбывшими игроками.
          </p>
        </div>
      )}

      {/* Civilian Night Sleeping Screen */}
      {isAlive && myRole === 'civilian' && (
        <div className="p-8 bg-[#12131b] border border-zinc-850 rounded-2xl text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-full bg-blue-950/40 border border-blue-800/40 flex items-center justify-center mx-auto text-blue-400">
            <Moon className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h4 className="text-base font-sans font-bold text-white">
              Вы мирно спите в своей постели
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              У мирных жителей нет ночных действий. Дождитесь наступления утра, чтобы узнать результаты ночи и найти преступников!
            </p>
          </div>

          <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-left max-w-md mx-auto space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold uppercase text-[10px]">
              <Trophy className="w-3.5 h-3.5" />
              <span>Ваша цель: {roleDef.winCondition}</span>
            </div>
            <p className="text-zinc-300 text-[11px]">
              {roleDef.objective}
            </p>
          </div>
        </div>
      )}

      {/* Active Role Action Console */}
      {isAlive && myRole !== 'civilian' && (
        <div className="p-5 bg-[#12131b] border border-zinc-850 rounded-2xl space-y-4 shadow-2xl">
          {/* Role Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3.5">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
                style={{ backgroundColor: `${roleDef.color}15`, borderColor: `${roleDef.color}50`, color: roleDef.color }}
              >
                {myRole === 'don' && <Crown className="w-5 h-5" />}
                {myRole === 'mafia' && <Skull className="w-5 h-5" />}
                {myRole === 'sheriff' && <Shield className="w-5 h-5" />}
                {myRole === 'doctor' && <HeartPulse className="w-5 h-5" />}
                {myRole === 'courtesan' && <Sparkles className="w-5 h-5" />}
                {myRole === 'maniac' && <Flame className="w-5 h-5" />}
                {myRole === 'bodyguard' && <Shield className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-sans font-bold text-white tracking-wide">
                    {roleDef.name}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsRoleHelpOpen(prev => !prev)}
                    className="text-zinc-400 hover:text-amber-400 transition-colors"
                    title="Узнать цель и условие победы роли"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-zinc-400">{roleDef.actionPrompt}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedTargetId && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-bold bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-xl">
                  <Check className="w-3.5 h-3.5" /> Выбор зафиксирован
                </span>
              )}

              {onSkipPhase && (
                <button
                  type="button"
                  onClick={() => {
                    sounds.playTick();
                    onSkipPhase();
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                    isSkipVoted
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/40'
                      : 'bg-[#181924] hover:bg-[#202230] border-zinc-700 text-zinc-100 hover:text-white'
                  }`}
                >
                  <FastForward className={`w-3.5 h-3.5 ${isSkipVoted ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>
                    {isSkipVoted
                      ? `Готов к утру (${nightSkipVotesCount}/${totalNightActiveRoles})`
                      : `Завершить ночь (${nightSkipVotesCount}/${totalNightActiveRoles})`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Realtime Sheriff check prompt */}
          {myRole === 'sheriff' && (sheriffCurrentCheckResult || selectedTargetId) && (
            <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 animate-in fade-in duration-200 shadow-lg ${
              sheriffCurrentCheckResult?.isMafia
                ? 'bg-rose-950/70 border-rose-600 text-rose-100 ring-1 ring-rose-500/50'
                : 'bg-emerald-950/70 border-emerald-600 text-emerald-100 ring-1 ring-emerald-500/50'
            }`}>
              <Shield className={`w-5 h-5 shrink-0 ${sheriffCurrentCheckResult?.isMafia ? 'text-rose-400' : 'text-emerald-400'}`} />
              <div className="space-y-0.5">
                <div className="font-bold uppercase tracking-wider text-[10px] text-amber-400">
                  🔍 Результат ночной проверки документов
                </div>
                <div className="text-sm">
                  Гражданин{' '}
                  <strong className="text-white underline">
                    {players.find(p => p.id === (sheriffCurrentCheckResult?.targetId || selectedTargetId))?.name || 'Выбранный игрок'}
                  </strong>{' '}
                  —{' '}
                  {sheriffCurrentCheckResult ? (
                    sheriffCurrentCheckResult.isMafia ? (
                      <span className="text-rose-300 font-extrabold uppercase tracking-wide bg-rose-900/60 px-2 py-0.5 rounded border border-rose-700">
                        ЧЛЕН МАФИИ ⚠️
                      </span>
                    ) : (
                      <span className="text-emerald-300 font-extrabold uppercase tracking-wide bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700">
                        МИРНЫЙ ЖИТЕЛЬ 🛡️
                      </span>
                    )
                  ) : (
                    <span className="text-amber-300">Проверка документов...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Previous Sheriff check prompt */}
          {myRole === 'sheriff' && sheriffLastCheckResult && !sheriffCurrentCheckResult && !selectedTargetId && (
            <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              sheriffLastCheckResult.isMafia
                ? 'bg-rose-950/50 border-rose-800 text-rose-200'
                : 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Прошлая проверка: игрок{' '}
                <strong className="text-white">
                  {players.find(p => p.id === sheriffLastCheckResult.targetId)?.name || 'Неизвестный'}
                </strong>{' '}
                — {sheriffLastCheckResult.isMafia ? 'ЧЛЕН МАФИИ ⚠️' : 'МИРНЫЙ ЖИТЕЛЬ 🛡️'}
              </span>
            </div>
          )}

          {/* Realtime Don check prompt */}
          {myRole === 'don' && (donCurrentCheckResult || selectedDonTargetId) && (
            <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 animate-in fade-in duration-200 shadow-lg ${
              donCurrentCheckResult?.isSheriff
                ? 'bg-amber-950/70 border-amber-500 text-amber-100 ring-1 ring-amber-500/50'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200'
            }`}>
              <Crown className="w-5 h-5 shrink-0 text-amber-400" />
              <div className="space-y-0.5">
                <div className="font-bold uppercase tracking-wider text-[10px] text-amber-400">
                  👑 Результат проверки на Шерифа
                </div>
                <div className="text-sm">
                  Гражданин{' '}
                  <strong className="text-white underline">
                    {players.find(p => p.id === (donCurrentCheckResult?.targetId || selectedDonTargetId))?.name || 'Выбранный игрок'}
                  </strong>{' '}
                  —{' '}
                  {donCurrentCheckResult ? (
                    donCurrentCheckResult.isSheriff ? (
                      <span className="text-amber-300 font-extrabold uppercase tracking-wide bg-amber-900/60 px-2 py-0.5 rounded border border-amber-600">
                        ЭТО ШЕРИФ! 🎯
                      </span>
                    ) : (
                      <span className="text-zinc-300 font-medium">Не является шерифом.</span>
                    )
                  ) : (
                    <span className="text-amber-300">Проверка...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Primary Action Target Grid */}
          <div className="space-y-2.5">
            <h5 className="text-[11px] font-bold uppercase text-zinc-400 tracking-wider">
              {actionTitle}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {eligibleTargets.map(player => {
                const isSelected = selectedTargetId === player.id;
                return (
                  <button
                    key={player.id}
                    onClick={() => handleSelectTarget(player.id, actionType)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-[#241a18] border-orange-500 text-white shadow-lg shadow-orange-950/40 ring-1 ring-orange-500/50'
                        : 'bg-[#151620] border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-[#1a1b26]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center font-mono font-bold text-xs text-amber-500">
                        #{players.findIndex(p => p.id === player.id) + 1}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-bold block truncate text-white">{player.name}</span>
                        {player.id === myId && (
                          <span className="text-[10px] text-amber-400 font-medium">(Вы)</span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-orange-600 flex items-center justify-center text-white shrink-0">
                        <Check className="w-3 h-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Don Secondary Investigation: Search for Sheriff */}
          {myRole === 'don' && (
            <div className="space-y-2.5 border-t border-zinc-850 pt-4">
              <h5 className="text-[11px] font-bold uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" />
                Особое право Дона: Поиск Шерифа города
              </h5>
              <p className="text-xs text-zinc-400">
                Укажите гражданина, чьи документы вы хотите тайно проверить на должность Шерифа:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {alivePlayers.filter(p => p.id !== myId).map(player => {
                  const isSelected = selectedDonTargetId === player.id;
                  return (
                    <button
                      key={`don_${player.id}`}
                      onClick={() => handleSelectDonTarget(player.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                          : 'bg-[#151620] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate">{player.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom helper tip */}
          <div className="text-[11px] text-zinc-400 bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Выбор можно изменить до конца ночи. Ночь закончится по таймеру или когда все активные роли нажмут «Завершить ночь».
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsRoleHelpOpen(true)}
              className="text-amber-400 hover:underline shrink-0 font-medium"
            >
              Цель роли
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
