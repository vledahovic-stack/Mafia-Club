import React, { useState, useEffect, useRef } from 'react';
import { ClientRoomState, Player, RoleId, Team } from '../types/mafia';
import { 
  Skull, 
  Shield, 
  Crown, 
  Gavel, 
  Moon, 
  Sun, 
  Mic, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  HeartPulse, 
  Flame, 
  Sparkles, 
  X, 
  History, 
  ChevronRight,
  Target
} from 'lucide-react';
import { sounds } from '../utils/audio';

export interface GameEventItem {
  id: string;
  type: 'phase' | 'elimination' | 'investigation' | 'nomination' | 'winner' | 'save' | 'speaker';
  title: string;
  description?: string;
  badge: string;
  icon: React.ReactNode;
  bgGradient: string;
  borderColor: string;
  textColor: string;
  timestamp: number;
}

interface EventFeedOverlayProps {
  roomState: ClientRoomState;
  myId: string;
}

export const EventFeedOverlay: React.FC<EventFeedOverlayProps> = ({ roomState, myId }) => {
  const [activeEvents, setActiveEvents] = useState<GameEventItem[]>([]);
  const [historyEvents, setHistoryEvents] = useState<GameEventItem[]>([]);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState<boolean>(false);

  // Previous state refs for diffing
  const prevPhaseRef = useRef<string>(roomState.phase);
  const prevDayRef = useRef<number>(roomState.dayNumber);
  const prevEliminatedRef = useRef<string | null>(null);
  const prevSpeakerRef = useRef<string | null>(null);
  const prevNomineesRef = useRef<string[]>([]);
  const prevSheriffCheckRef = useRef<string | null>(null);
  const prevDonCheckRef = useRef<string | null>(null);
  const prevWinnerRef = useRef<string | null>(null);
  const prevNightResultRef = useRef<string | null>(null);

  const addEvent = (event: Omit<GameEventItem, 'id' | 'timestamp'>) => {
    const newEvent: GameEventItem = {
      ...event,
      id: 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now()
    };

    setActiveEvents(prev => [newEvent, ...prev.slice(0, 3)]);
    setHistoryEvents(prev => [newEvent, ...prev.slice(0, 20)]);

    // Auto-dismiss from active overlay after 4.8 seconds
    setTimeout(() => {
      setActiveEvents(prev => prev.filter(e => e.id !== newEvent.id));
    }, 4800);
  };

  const dismissEvent = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveEvents(prev => prev.filter(item => item.id !== id));
  };

  // Detect Phase Transitions
  useEffect(() => {
    if (prevPhaseRef.current !== roomState.phase || prevDayRef.current !== roomState.dayNumber) {
      const prevPhase = prevPhaseRef.current;
      prevPhaseRef.current = roomState.phase;
      prevDayRef.current = roomState.dayNumber;

      switch (roomState.phase) {
        case 'ROLE_REVEAL':
          addEvent({
            type: 'phase',
            title: 'Карты розданы!',
            description: 'Ознакомьтесь со своей тайной ролью. Никому не показывайте экран!',
            badge: 'РАЗДАЧА КАРТ',
            icon: <Sparkles className="w-4 h-4 text-amber-400" />,
            bgGradient: 'from-amber-950/90 via-[#181622]/95 to-[#12131c]/95',
            borderColor: 'border-amber-600/70',
            textColor: 'text-amber-300'
          });
          break;

        case 'MAFIA_MEETING':
          addEvent({
            type: 'phase',
            title: 'Нулевая минута: Знакомство синдиката',
            description: 'Город мирно спит. Мафия вырабатывает стратегию отстрела в секретном чате.',
            badge: 'НОЧЬ ЗНАКОМСТВА',
            icon: <Moon className="w-4 h-4 text-rose-400" />,
            bgGradient: 'from-rose-950/90 via-[#19131d]/95 to-[#12131c]/95',
            borderColor: 'border-rose-600/70',
            textColor: 'text-rose-300'
          });
          break;

        case 'DAY_DISCUSSION':
          addEvent({
            type: 'phase',
            title: `Наступил День #${roomState.dayNumber}`,
            description: 'Горожане собрались на площади для общего обсуждения и дебатов.',
            badge: `ДЕНЬ ${roomState.dayNumber}`,
            icon: <Sun className="w-4 h-4 text-amber-400" />,
            bgGradient: 'from-amber-950/80 via-[#1a1720]/95 to-[#12131c]/95',
            borderColor: 'border-amber-500/70',
            textColor: 'text-amber-300'
          });
          break;

        case 'INDIVIDUAL_SPEECHES':
          addEvent({
            type: 'phase',
            title: 'Индивидуальные речи игроков',
            description: 'Участники высказываются по очереди. Оратор имеет право выставить подозреваемого на суд.',
            badge: 'РЕЧИ ИГРОКОВ',
            icon: <Mic className="w-4 h-4 text-amber-400" />,
            bgGradient: 'from-amber-950/80 via-[#181624]/95 to-[#12131c]/95',
            borderColor: 'border-amber-600/70',
            textColor: 'text-amber-200'
          });
          break;

        case 'VOTING':
          addEvent({
            type: 'phase',
            title: 'Городской суд: Начало голосования!',
            description: 'Выбирайте кандидата на казнь среди выставленных игроков.',
            badge: 'СУДЕБНЫЙ ПРОЦЕСС',
            icon: <Gavel className="w-4 h-4 text-rose-400" />,
            bgGradient: 'from-rose-950/90 via-[#1b1420]/95 to-[#12131c]/95',
            borderColor: 'border-rose-600/70',
            textColor: 'text-rose-300'
          });
          break;

        case 'DEFENSE_SPEECH':
          addEvent({
            type: 'phase',
            title: 'Ничья при голосовании: Оправдательная речь',
            description: 'Кандидатам с равным количеством голосов даётся шанс убедить город.',
            badge: 'ОПРАВДАНИЕ',
            icon: <Shield className="w-4 h-4 text-purple-400" />,
            bgGradient: 'from-purple-950/90 via-[#181422]/95 to-[#12131c]/95',
            borderColor: 'border-purple-600/70',
            textColor: 'text-purple-300'
          });
          break;

        case 'REVOTE':
          addEvent({
            type: 'phase',
            title: 'Переголосование при ничьей',
            description: 'Город голосует повторно только между кандидатами с ничейными голосами.',
            badge: 'ПЕРЕСУД',
            icon: <Gavel className="w-4 h-4 text-rose-400" />,
            bgGradient: 'from-rose-950/90 via-[#1b1420]/95 to-[#12131c]/95',
            borderColor: 'border-rose-600/70',
            textColor: 'text-rose-300'
          });
          break;

        case 'NIGHT':
          addEvent({
            type: 'phase',
            title: 'Город засыпает. Наступила ночь...',
            description: 'Мафия выходит на охоту. Шериф, Доктор и спецслужбы совершают ночные ходы.',
            badge: 'НОЧНАЯ ОХОТА',
            icon: <Moon className="w-4 h-4 text-sky-400" />,
            bgGradient: 'from-blue-950/90 via-[#131726]/95 to-[#12131c]/95',
            borderColor: 'border-blue-600/70',
            textColor: 'text-blue-300'
          });
          break;

        case 'MORNING_REPORT':
          addEvent({
            type: 'phase',
            title: 'Утренняя сводка происшествий',
            description: 'Город просыпается. Оглашаются ночные жертвы и отчёты комиссариата.',
            badge: 'УТРЕННИЙ ВЕСТНИК',
            icon: <Sun className="w-4 h-4 text-amber-400" />,
            bgGradient: 'from-amber-950/80 via-[#191522]/95 to-[#12131c]/95',
            borderColor: 'border-amber-600/70',
            textColor: 'text-amber-300'
          });
          break;
      }
    }
  }, [roomState.phase, roomState.dayNumber]);

  // Detect Eliminations
  useEffect(() => {
    const currentElim = roomState.lastEliminatedPlayer;
    if (!currentElim) return;
    const currentElimId = `${currentElim.player.id}_${currentElim.reason}`;
    if (prevEliminatedRef.current !== currentElimId) {
      prevEliminatedRef.current = currentElimId;
      const player = currentElim.player;
      const reasonText = currentElim.reason === 'vote'
        ? 'казнён решением городского суда'
        : currentElim.reason === 'mafia'
        ? 'пал жертвой ночного выстрела мафии'
        : 'убит маньяком в ночной тишине';

      addEvent({
        type: 'elimination',
        title: `Игрок ${player.name} выбыл из партии`,
        description: `${player.name} ${reasonText}.`,
        badge: currentElim.reason === 'vote' ? 'СУДЕБНАЯ КАЗНЬ' : 'НОЧНАЯ РАСПРАВА',
        icon: <Skull className="w-4 h-4 text-rose-400" />,
        bgGradient: 'from-rose-950/95 via-[#201117]/95 to-[#14121a]/95',
        borderColor: 'border-rose-600/90',
        textColor: 'text-rose-200'
      });
    }
  }, [roomState.lastEliminatedPlayer]);

  // Detect Winner / Game Over
  useEffect(() => {
    if (roomState.winner && prevWinnerRef.current !== roomState.winner) {
      prevWinnerRef.current = roomState.winner;
      const teamNames: Record<Team, string> = {
        civilians: 'Мирные жители',
        mafia: 'Синдикат Мафии',
        maniac: 'Одиночный Маньяк'
      };
      const teamColor = roomState.winner === 'civilians'
        ? 'text-emerald-300 border-emerald-600/80 from-emerald-950/90'
        : roomState.winner === 'mafia'
        ? 'text-rose-300 border-rose-600/80 from-rose-950/90'
        : 'text-purple-300 border-purple-600/80 from-purple-950/90';

      addEvent({
        type: 'winner',
        title: `Победа: ${teamNames[roomState.winner]}!`,
        description: 'Партия завершена. Все тайные роли раскрыты в протоколе стола.',
        badge: 'ТРИУМФ',
        icon: <Crown className="w-4 h-4 text-amber-400" />,
        bgGradient: `${teamColor} via-[#181524]/95 to-[#12131c]/95`,
        borderColor: roomState.winner === 'civilians' ? 'border-emerald-500' : 'border-rose-500',
        textColor: 'text-white'
      });
    }
  }, [roomState.winner]);

  // Detect Sheriff Investigation Finding
  useEffect(() => {
    const sheriffRes = roomState.sheriffCurrentCheckResult || roomState.sheriffLastCheckResult;
    if (sheriffRes && roomState.myRole === 'sheriff') {
      const key = `${sheriffRes.targetId}_${sheriffRes.isMafia}`;
      if (prevSheriffCheckRef.current !== key) {
        prevSheriffCheckRef.current = key;
        const targetPlayer = roomState.players.find(p => p.id === sheriffRes.targetId);
        const name = targetPlayer?.name || 'Подозреваемый';

        addEvent({
          type: 'investigation',
          title: `Шериф: Проверка игрока ${name}`,
          description: sheriffRes.isMafia
            ? `⚠️ Внимание! ${name} является членом МАФИИ (черный игрок)!`
            : `🛡️ ${name} — честный гражданин города (красный игрок).`,
          badge: sheriffRes.isMafia ? 'МАФИЯ ОБНАРУЖЕНА' : 'МИРНЫЙ ЖИТЕЛЬ',
          icon: <Shield className={`w-4 h-4 ${sheriffRes.isMafia ? 'text-rose-400' : 'text-sky-400'}`} />,
          bgGradient: sheriffRes.isMafia 
            ? 'from-rose-950/95 via-[#221218]/95 to-[#14121a]/95' 
            : 'from-sky-950/95 via-[#121a28]/95 to-[#12131c]/95',
          borderColor: sheriffRes.isMafia ? 'border-rose-600' : 'border-sky-500',
          textColor: sheriffRes.isMafia ? 'text-rose-200' : 'text-sky-200'
        });
      }
    }
  }, [roomState.sheriffCurrentCheckResult, roomState.sheriffLastCheckResult, roomState.myRole, roomState.players]);

  // Detect Don Investigation Finding
  useEffect(() => {
    const donRes = roomState.donCurrentCheckResult || roomState.donLastCheckResult;
    if (donRes && roomState.myRole === 'don') {
      const key = `${donRes.targetId}_${donRes.isSheriff}`;
      if (prevDonCheckRef.current !== key) {
        prevDonCheckRef.current = key;
        const targetPlayer = roomState.players.find(p => p.id === donRes.targetId);
        const name = targetPlayer?.name || 'Подозреваемый';

        addEvent({
          type: 'investigation',
          title: `Дон: Проверка игрока ${name}`,
          description: donRes.isSheriff
            ? `⭐ Бинго! ${name} — это НАСТОЯЩИЙ ШЕРИФ города!`
            : `✗ ${name} не является шерифом.`,
          badge: donRes.isSheriff ? 'ШЕРИФ НАЙДЕН' : 'НЕ ШЕРИФ',
          icon: <Crown className="w-4 h-4 text-amber-400" />,
          bgGradient: donRes.isSheriff
            ? 'from-amber-950/95 via-[#221815]/95 to-[#14121a]/95'
            : 'from-zinc-900/95 via-[#171822]/95 to-[#12131c]/95',
          borderColor: donRes.isSheriff ? 'border-amber-500' : 'border-zinc-700',
          textColor: donRes.isSheriff ? 'text-amber-200' : 'text-zinc-300'
        });
      }
    }
  }, [roomState.donCurrentCheckResult, roomState.donLastCheckResult, roomState.myRole, roomState.players]);

  // Detect Doctor Saves in Morning Report
  useEffect(() => {
    if (roomState.lastNightResult && roomState.phase === 'MORNING_REPORT') {
      const key = JSON.stringify(roomState.lastNightResult.healedPlayerIds || []);
      if (prevNightResultRef.current !== key) {
        prevNightResultRef.current = key;
        const healed = roomState.lastNightResult.healedPlayerIds || [];
        if (healed.length > 0) {
          addEvent({
            type: 'save',
            title: 'Ночное чудо: Доктор спас жителя!',
            description: 'Медицинская служба предотвратила гибель гражданина этой ночью.',
            badge: 'СПАСЕНИЕ ЖИЗНИ',
            icon: <HeartPulse className="w-4 h-4 text-emerald-400" />,
            bgGradient: 'from-emerald-950/90 via-[#131d1a]/95 to-[#12131c]/95',
            borderColor: 'border-emerald-600/80',
            textColor: 'text-emerald-200'
          });
        }
      }
    }
  }, [roomState.lastNightResult, roomState.phase]);

  // Detect New Nominations
  useEffect(() => {
    const currentNominees = roomState.nominatedPlayerIds || [];
    if (currentNominees.length > prevNomineesRef.current.length) {
      const newNomineeIds = currentNominees.filter(id => !prevNomineesRef.current.includes(id));
      newNomineeIds.forEach(id => {
        const player = roomState.players.find(p => p.id === id);
        if (player) {
          addEvent({
            type: 'nomination',
            title: `${player.name} выставлен на суд!`,
            description: `Игрок ${player.name} номинирован на городское голосование.`,
            badge: 'КАНДИДАТ НА КАЗНЬ',
            icon: <Gavel className="w-4 h-4 text-amber-400" />,
            bgGradient: 'from-amber-950/80 via-[#191522]/95 to-[#12131c]/95',
            borderColor: 'border-amber-600/70',
            textColor: 'text-amber-200'
          });
        }
      });
    }
    prevNomineesRef.current = currentNominees;
  }, [roomState.nominatedPlayerIds, roomState.players]);

  // Detect Speaker Change during Speeches
  useEffect(() => {
    if (
      (roomState.phase === 'INDIVIDUAL_SPEECHES' || roomState.phase === 'DEFENSE_SPEECH' || roomState.phase === 'LAST_WORDS_ARREST' || roomState.phase === 'LAST_WORDS_KILLED') &&
      roomState.currentSpeakerId &&
      roomState.currentSpeakerId !== prevSpeakerRef.current
    ) {
      prevSpeakerRef.current = roomState.currentSpeakerId;
      const speaker = roomState.players.find(p => p.id === roomState.currentSpeakerId);
      if (speaker) {
        const isMe = speaker.id === myId;
        addEvent({
          type: 'speaker',
          title: isMe ? 'Ваша очередь говорить!' : `Говорит игрок ${speaker.name}`,
          description: isMe ? 'Вам предоставлено слово. Вы можете выставить кандидата на голосование.' : 'Слушайте выступление оратора и не перебивайте.',
          badge: isMe ? 'ВАША РЕЧЬ' : 'ОРАТОР СТОЛА',
          icon: <Mic className={`w-4 h-4 ${isMe ? 'text-amber-300 animate-pulse' : 'text-amber-400'}`} />,
          bgGradient: isMe ? 'from-amber-900/90 via-[#221815]/95 to-[#12131c]/95' : 'from-[#1a1724]/90 via-[#151622]/95 to-[#12131c]/95',
          borderColor: isMe ? 'border-amber-400 shadow-md ring-1 ring-amber-400/50' : 'border-zinc-700/80',
          textColor: isMe ? 'text-amber-300 font-bold' : 'text-zinc-200'
        });
      }
    }
  }, [roomState.currentSpeakerId, roomState.phase, roomState.players, myId]);

  return (
    <>
      {/* FLOATING ACTIVE EVENT OVERLAY (STACKED AT TOP-RIGHT) */}
      <aside 
        aria-label="Игровые оповещения" 
        className="fixed top-16 right-3 sm:right-6 z-40 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none"
      >
        {activeEvents.map(event => (
          <div
            key={event.id}
            onClick={() => dismissEvent(event.id)}
            className={`pointer-events-auto cursor-pointer p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r ${event.bgGradient} border ${event.borderColor} shadow-2xl shadow-black/80 backdrop-blur-md flex items-start gap-3 transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.99] animate-in slide-in-from-right-4 fade-in`}
          >
            {/* Left Emblem */}
            <div className="w-8 h-8 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
              {event.icon}
            </div>

            {/* Content Details */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className={`text-[9px] font-mono uppercase tracking-wider font-extrabold px-1.5 py-0.2 rounded bg-black/40 border border-white/10 ${event.textColor}`}>
                  {event.badge}
                </span>

                <span className="text-[9px] text-zinc-400 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <h4 className="text-xs font-bold text-white leading-tight tracking-tight">
                {event.title}
              </h4>

              {event.description && (
                <p className="text-[11px] text-zinc-300 leading-snug font-sans line-clamp-2">
                  {event.description}
                </p>
              )}
            </div>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={(e) => dismissEvent(event.id, e)}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-black/40 transition-colors shrink-0"
              title="Закрыть уведомление"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </aside>

      {/* QUICK FLOATING EVENT LOG TRIGGER BUTTON */}
      <button
        onClick={() => {
          sounds.playTick();
          setIsHistoryDrawerOpen(prev => !prev);
        }}
        title="Лента событий партии (Event Feed)"
        className={`fixed bottom-5 left-5 z-40 px-3 py-2 rounded-2xl bg-[#141522]/90 hover:bg-[#1c1d2e] border border-zinc-700/80 text-zinc-200 hover:text-white text-xs font-bold transition-all shadow-xl backdrop-blur-md flex items-center gap-2 ${
          historyEvents.length > 0 ? 'border-amber-600/60 text-amber-300' : ''
        }`}
      >
        <History className="w-4 h-4 text-amber-400" />
        <span className="hidden sm:inline">Лента событий</span>
        {historyEvents.length > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-zinc-950 font-mono text-[10px] font-black">
            {historyEvents.length}
          </span>
        )}
      </button>

      {/* EVENT LOG HISTORY DRAWER / MODAL */}
      {isHistoryDrawerOpen && (
        <div 
          onClick={() => setIsHistoryDrawerOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-end p-2 sm:p-4 select-none animate-in fade-in duration-150"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md h-[90vh] max-h-[700px] bg-[#12131c] border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-6 duration-200"
          >
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-zinc-800 bg-[#161725] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-amber-700/60 flex items-center justify-center text-amber-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Хроника событий стола
                  </h3>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Стол #{roomState.roomCode} · {historyEvents.length} зафиксированных событий
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Event List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {historyEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-2">
                  <History className="w-8 h-8 opacity-40" />
                  <p className="text-xs">События партии начнут фиксироваться после старта игры.</p>
                </div>
              ) : (
                historyEvents.map(event => (
                  <div
                    key={event.id}
                    className={`p-3 rounded-2xl bg-gradient-to-r ${event.bgGradient} border ${event.borderColor} flex items-start gap-3 shadow-sm`}
                  >
                    <div className="w-7 h-7 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center shrink-0">
                      {event.icon}
                    </div>

                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[9px] font-mono font-bold uppercase ${event.textColor}`}>
                          {event.badge}
                        </span>
                        <span className="text-[9px] text-zinc-400 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <h5 className="text-xs font-bold text-white leading-tight">
                        {event.title}
                      </h5>

                      {event.description && (
                        <p className="text-[11px] text-zinc-300 leading-tight">
                          {event.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 bg-[#141520] border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-400 font-mono shrink-0">
              <span>Автосохранение хроники</span>
              <button
                onClick={() => setIsHistoryDrawerOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
