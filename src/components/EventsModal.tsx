import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Sparkles, 
  Trophy, 
  Target, 
  Shield, 
  Users, 
  Coins, 
  Award, 
  Clock, 
  RefreshCw, 
  CheckCircle2, 
  Lock, 
  Calendar, 
  Gift, 
  Flame, 
  ChevronRight, 
  AlertCircle,
  HelpCircle,
  Dices,
  Crown,
  Star,
  Zap,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { 
  TaskDefinition, 
  TaskType, 
  UserTaskProgress, 
  EventDefinition, 
  PersonalTasksState, 
  ClanEventStatus, 
  EventsConfig,
  ClanMilestone 
} from '../types/events';
import { GangsterIcon } from './GangsterIcon';

interface EventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onUpdateUser?: (updated: AuthUser) => void;
  onOpenClans?: () => void;
  onOpenAuth?: () => void;
  defaultTab?: 'global' | 'onboarding' | 'personal' | 'clan';
}

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  play_matches: { label: 'Сыграть матчи', icon: '🎮' },
  win_matches: { label: 'Победить в матчах', icon: '🏆' },
  play_role: { label: 'Сыграть за роль', icon: '🎭' },
  survive_rounds: { label: 'Пережить раунды', icon: '🛡️' },
  use_item: { label: 'Использовать предмет', icon: '📦' },
  send_chat: { label: 'Сообщения в чате', icon: '💬' },
  invite_friend: { label: 'Пригласить друга', icon: '👥' },
  play_with_clan_member: { label: 'Игра с соклановцем', icon: '⚔️' }
};

export const EventsModal: React.FC<EventsModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenClans,
  onOpenAuth,
  defaultTab = 'global'
}) => {
  const [activeTab, setActiveTab] = useState<'global' | 'onboarding' | 'personal' | 'clan'>(defaultTab);
  const [loading, setLoading] = useState(true);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [rerollingTaskId, setRerollingTaskId] = useState<string | null>(null);
  const [claimingMilestoneStage, setClaimingMilestoneStage] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reroll confirmation modal state
  const [confirmRerollTask, setConfirmRerollTask] = useState<UserTaskProgress | null>(null);

  // Data
  const [config, setConfig] = useState<EventsConfig>({
    masterToggles: { global: true, onboarding: true, personal: true, clan: true },
    personalRerollFreeDailyLimit: 1,
    personalRerollCost: 50
  });
  const [globalTasks, setGlobalTasks] = useState<UserTaskProgress[]>([]);
  const [onboardingTasks, setOnboardingTasks] = useState<UserTaskProgress[]>([]);
  const [personalState, setPersonalState] = useState<PersonalTasksState | null>(null);
  const [clanTasks, setClanTasks] = useState<UserTaskProgress[]>([]);
  const [clanEventStatus, setClanEventStatus] = useState<ClanEventStatus | null>(null);
  const [activeEvents, setActiveEvents] = useState<EventDefinition[]>([]);

  // Time remaining timer for countdowns
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const authHeaders = useMemo(() => {
    const token = localStorage.getItem('mafia_auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }, []);

  const fetchTasksData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks/player', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        if (Array.isArray(data.global)) setGlobalTasks(data.global);
        if (Array.isArray(data.onboarding)) setOnboardingTasks(data.onboarding);
        if (data.personal) setPersonalState(data.personal);
        
        // Handle data.clan which can be an object { tasks, status } or direct array
        if (data.clan) {
          if (Array.isArray(data.clan)) {
            setClanTasks(data.clan);
          } else if (typeof data.clan === 'object') {
            if (Array.isArray(data.clan.tasks)) setClanTasks(data.clan.tasks);
            if (data.clan.status) setClanEventStatus(data.clan.status);
          }
        }
        if (data.clanEventStatus) setClanEventStatus(data.clanEventStatus);
        if (Array.isArray(data.activeEvents)) setActiveEvents(data.activeEvents);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTasksData();
    }
  }, [isOpen, user?.id]);

  if (!isOpen) return null;

  // Claim Task Reward
  const handleClaimTask = async (taskId: string) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }

    setClaimingTaskId(taskId);
    try {
      sounds.playTick();
      const res = await fetch(`/api/tasks/${taskId}/claim`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при получении награды');
      }

      sounds.playMorningChime();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      setFeedback({ type: 'success', text: data.message || 'Награда успешно зачислена!' });
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
      // Refresh tasks
      fetchTasksData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось получить награду';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setClaimingTaskId(null);
    }
  };

  // Reroll Personal Task
  const handleRerollTask = async (taskId: string) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }

    setRerollingTaskId(taskId);
    setConfirmRerollTask(null);
    try {
      sounds.playTick();
      const res = await fetch(`/api/tasks/${taskId}/reroll`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при замене задачи');
      }

      sounds.playCardFlip();
      setFeedback({ type: 'success', text: 'Задача успешно заменена на новую!' });
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
      fetchTasksData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось заменить задачу';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setRerollingTaskId(null);
    }
  };

  // Claim Clan Milestone Stage
  const handleClaimMilestone = async (stage: number) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!user.clanId) {
      setFeedback({ type: 'error', text: 'Вы не состоите в клане!' });
      return;
    }

    setClaimingMilestoneStage(stage);
    try {
      sounds.playTick();
      const res = await fetch('/api/clan/milestones/claim', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ stage })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при получении награды за этап');
      }

      sounds.playGavel();
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.5 }
      });

      setFeedback({ type: 'success', text: data.message || `Награда за Этап ${stage} получена!` });
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
      if (data.clanStatus) {
        setClanEventStatus(data.clanStatus);
      }
      fetchTasksData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось получить награду за этап';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setClaimingMilestoneStage(null);
    }
  };

  // Ready to claim count badges
  const globalClaimableCount = (Array.isArray(globalTasks) ? globalTasks : []).filter(t => t.isCompleted && !t.isClaimed).length;
  const onboardingClaimableCount = (Array.isArray(onboardingTasks) ? onboardingTasks : []).filter(t => t.isCompleted && !t.isClaimed).length;
  const personalClaimableCount = (Array.isArray(personalState?.tasks) ? personalState.tasks : []).filter(t => t.isCompleted && !t.isClaimed).length;
  const clanClaimableCount = (Array.isArray(clanTasks) ? clanTasks : []).filter(t => t.isCompleted && !t.isClaimed).length;
  const clanMilestonesClaimableCount = clanEventStatus && clanEventStatus.event && Array.isArray(clanEventStatus.event.clanMilestones)
    ? clanEventStatus.event.clanMilestones.filter(m => m.stage <= clanEventStatus.currentStage && !(clanEventStatus.claimedStages || []).includes(m.stage)).length
    : 0;

  // Format countdown string
  const formatCountdown = (targetTimestamp: number) => {
    if (!targetTimestamp || isNaN(targetTimestamp)) return '00:00:00';
    const diff = Math.max(0, Math.floor((targetTimestamp - now) / 1000));
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs select-none">
      {/* Main Container */}
      <div className="relative w-full max-w-5xl h-[780px] max-h-[95vh] bg-[#0c0d12]/95 border border-zinc-800 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-zinc-850 flex items-center justify-between bg-[#111218]/95 shrink-0">
          <div className="flex items-center gap-3">
            <GangsterIcon size={34} className="w-8 h-8 shrink-0 drop-shadow-md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-bold tracking-widest text-white text-base sm:text-lg uppercase flex items-center gap-2">
                  ИВЕНТЫ И ЗАДАЧИ
                  <span className="text-amber-400 font-mono text-xs px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/60 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    КВЕСТЫ
                  </span>
                </h1>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono tracking-wider leading-none mt-0.5">
                ВЫПОЛНЯЙТЕ ЗАДАНИЯ, ЗАРАБАТЫВАЙТЕ КРЕДИТЫ, ОПЫТ И ОЧКИ СИНДИКАТА
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sounds.playTick();
                fetchTasksData();
              }}
              title="Обновить список"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                sounds.playTick();
                onClose();
              }}
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
            feedback.type === 'success' 
              ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200' 
              : 'bg-rose-950/70 border-rose-800/80 text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Category Tabs Bar */}
        <div className="bg-[#13141c] border-b border-zinc-850 px-4 py-2 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-thin">
          {/* Tab 1: Global */}
          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('global');
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'global'
                ? 'bg-gradient-to-r from-amber-950/80 to-orange-950/60 border-amber-500 text-amber-200 shadow-sm shadow-amber-950/40'
                : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <span>🌟</span>
            <span>Общие и Ивенты</span>
            {config.masterToggles.global === false && (
              <span className="text-[10px] text-rose-400 font-mono">(Откл)</span>
            )}
            {globalClaimableCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-black text-[10px] font-mono font-bold animate-pulse">
                +{globalClaimableCount}
              </span>
            )}
          </button>

          {/* Tab 2: Onboarding */}
          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('onboarding');
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'onboarding'
                ? 'bg-gradient-to-r from-emerald-950/80 to-teal-950/60 border-emerald-500 text-emerald-200 shadow-sm shadow-emerald-950/40'
                : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <span>🔰</span>
            <span>Для новичков</span>
            {config.masterToggles.onboarding === false && (
              <span className="text-[10px] text-rose-400 font-mono">(Откл)</span>
            )}
            {onboardingClaimableCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-black text-[10px] font-mono font-bold animate-pulse">
                +{onboardingClaimableCount}
              </span>
            )}
          </button>

          {/* Tab 3: Personal */}
          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('personal');
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'personal'
                ? 'bg-gradient-to-r from-indigo-950/80 to-purple-950/60 border-indigo-500 text-indigo-200 shadow-sm shadow-indigo-950/40'
                : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <span>🎯</span>
            <span>Личные (3 в день)</span>
            {config.masterToggles.personal === false && (
              <span className="text-[10px] text-rose-400 font-mono">(Откл)</span>
            )}
            {personalClaimableCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-500 text-white text-[10px] font-mono font-bold animate-pulse">
                +{personalClaimableCount}
              </span>
            )}
          </button>

          {/* Tab 4: Clan (WoT Blitz Style) */}
          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('clan');
            }}
            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === 'clan'
                ? 'bg-gradient-to-r from-rose-950/80 to-amber-950/60 border-rose-500 text-rose-200 shadow-sm shadow-rose-950/40'
                : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            <span>🛡️</span>
            <span>Клановые этапы</span>
            {config.masterToggles.clan === false && (
              <span className="text-[10px] text-rose-400 font-mono">(Откл)</span>
            )}
            {(clanClaimableCount + clanMilestonesClaimableCount) > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-mono font-bold animate-pulse">
                +{clanClaimableCount + clanMilestonesClaimableCount}
              </span>
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* ================= TAB 1: GLOBAL & THEMATIC EVENTS ================= */}
          {activeTab === 'global' && (
            <div className="space-y-6">
              {/* Category disabled warning if toggled off */}
              {!config.masterToggles.global && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center gap-3 text-amber-300 text-xs">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold">Категория общих задач временно отключена администрацией.</span> Прогресс и новые задания будут возобновлены при включении.
                  </div>
                </div>
              )}

              {/* Thematic Events Section */}
              {activeEvents.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Тематические ивенты Города ({activeEvents.length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {activeEvents.map(evt => {
                      const endsAtTime = new Date(evt.endsAt).getTime();
                      const isExpired = endsAtTime < now;

                      return (
                        <div key={evt.id} className="relative rounded-2xl bg-gradient-to-r from-[#171824] to-[#12131d] border border-amber-900/40 p-4 sm:p-5 overflow-hidden shadow-lg">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3.5">
                              <div className="w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-600/60 flex items-center justify-center text-2xl shadow-inner shrink-0">
                                {evt.icon || '🌟'}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-white text-sm sm:text-base">{evt.title}</h4>
                                  <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/70 text-amber-300 text-[10px] font-mono font-bold">
                                    ИВЕНТ
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-300 mt-1 max-w-xl">{evt.description}</p>
                              </div>
                            </div>

                            <div className="text-left sm:text-right shrink-0">
                              <div className="text-[10px] text-zinc-400 uppercase font-mono">До завершения:</div>
                              <div className="font-mono font-bold text-xs sm:text-sm text-amber-400 flex items-center sm:justify-end gap-1 mt-0.5">
                                <Clock className="w-3.5 h-3.5 text-amber-400" />
                                {isExpired ? 'Завершен' : formatCountdown(endsAtTime)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Global Tasks List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Задачи для всех игроков ({globalTasks.length})
                  </h3>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Личные награды за завершение
                  </span>
                </div>

                {globalTasks.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs">
                    На данный момент активных общих задач нет. Загляните позже!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {globalTasks.map(item => (
                      <TaskCard
                        key={item.taskId}
                        taskProgress={item}
                        onClaim={handleClaimTask}
                        claiming={claimingTaskId === item.taskId}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 2: ONBOARDING FOR NEWCOMERS ================= */}
          {activeTab === 'onboarding' && (
            <div className="space-y-4">
              {/* Category disabled warning if toggled off */}
              {!config.masterToggles.onboarding && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center gap-3 text-amber-300 text-xs">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold">Категория онбординг-задач отключена администрацией.</span>
                  </div>
                </div>
              )}

              {/* Info banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/50 to-teal-950/30 border border-emerald-800/40 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-900/60 border border-emerald-600/60 flex items-center justify-center text-xl shrink-0">
                  🔰
                </div>
                <div>
                  <h3 className="font-bold text-emerald-200 text-sm">Курс молодого бойца (Онбординг)</h3>
                  <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                    Специальные задачи-знакомство с базовым функционалом: сыграть партию, использовать чат, применить карты ролей. 
                    Доступны игрокам, зарегистрированным после запуска задачи, и выполняются каждым ровно один раз!
                  </p>
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-3">
                {onboardingTasks.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs">
                    Для вашего профиля нет доступных вводных задач онбординга.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {onboardingTasks.map(item => (
                      <TaskCard
                        key={item.taskId}
                        taskProgress={item}
                        onClaim={handleClaimTask}
                        claiming={claimingTaskId === item.taskId}
                        badgeType="onboarding"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 3: PERSONAL TASKS (3 DAILY + REROLL) ================= */}
          {activeTab === 'personal' && (
            <div className="space-y-5">
              {/* Category disabled warning if toggled off */}
              {!config.masterToggles.personal && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center gap-3 text-amber-300 text-xs">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold">Категория личных задач отключена администрацией.</span>
                  </div>
                </div>
              )}

              {/* Top Personal Dashboard Bar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-[#151624] to-purple-950/40 border border-indigo-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-indigo-950 border border-indigo-600/70 flex items-center justify-center text-2xl shadow-inner shrink-0">
                    🎯
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white text-sm sm:text-base">Ежедневный пул личных задач</h3>
                      <span className="px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-600 text-indigo-300 text-[10px] font-mono font-bold">
                        3 В ДЕНЬ
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 mt-0.5">
                      Система формирует случайную тройку задач каждые 24 часа. Не нравится задание? Воспользуйтесь рероллом!
                    </p>
                  </div>
                </div>

                {/* Reroll Status & Reset Timer */}
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto shrink-0">
                  <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-left">
                    <div className="text-[10px] text-zinc-400 uppercase font-mono">Бесплатный реролл:</div>
                    <div className="text-xs font-bold font-mono mt-0.5 flex items-center gap-1.5">
                      {personalState?.freeRerollsRemaining && personalState.freeRerollsRemaining > 0 ? (
                        <span className="text-emerald-400">1 / 1 (Доступен)</span>
                      ) : (
                        <span className="text-amber-400">0 / 1 (Далее {personalState?.rerollCost || 50} кр)</span>
                      )}
                    </div>
                  </div>

                  {personalState?.nextResetTimestamp && (
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-left">
                      <div className="text-[10px] text-zinc-400 uppercase font-mono">Смена пула через:</div>
                      <div className="text-xs font-bold font-mono text-indigo-300 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        {formatCountdown(personalState.nextResetTimestamp)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Personal Tasks Cards */}
              <div className="space-y-3">
                {(!personalState || personalState.tasks.length === 0) ? (
                  <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs">
                    Личные задачи генерируются... Нажмите обновить или войдите в аккаунт.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {personalState.tasks.map(item => (
                      <TaskCard
                        key={item.taskId}
                        taskProgress={item}
                        onClaim={handleClaimTask}
                        claiming={claimingTaskId === item.taskId}
                        onRerollPrompt={(t) => setConfirmRerollTask(t)}
                        rerolling={rerollingTaskId === item.taskId}
                        badgeType="personal"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 4: CLAN PROGRESS (WOT BLITZ STYLE) ================= */}
          {activeTab === 'clan' && (
            <div className="space-y-6">
              {/* Category disabled warning if toggled off */}
              {!config.masterToggles.clan && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center gap-3 text-amber-300 text-xs">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="font-bold">Категория клановых задач отключена администрацией.</span>
                  </div>
                </div>
              )}

              {/* Check if player has clan */}
              {!user?.clanId ? (
                <div className="p-8 rounded-2xl bg-gradient-to-b from-[#161722] to-[#101118] border border-zinc-800 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-950/60 border border-rose-700/60 flex items-center justify-center text-3xl shadow-lg">
                    🛡️
                  </div>
                  <div className="max-w-md mx-auto">
                    <h3 className="font-bold text-white text-base">Вступите в синдикат или создайте свой!</h3>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                      Клановые задачи работают по системе WoT Blitz: выполнение заданий приносит личные награды + очки в общую шкалу синдиката, открывая ценные призы за этапы для всех соклановцев.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      sounds.playTick();
                      onOpenClans?.();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50 transition-all"
                  >
                    Перейти к Синдикатам
                  </button>
                </div>
              ) : !clanEventStatus ? (
                <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs">
                  В данный момент нет активного кланового ивента. Ожидайте запуска сезона!
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Clan Event Header & Info */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-950/50 via-[#171822] to-amber-950/40 border border-rose-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-rose-950 border border-rose-600/70 flex items-center justify-center text-2xl shadow-inner shrink-0">
                        {clanEventStatus.event.icon || '🛡️'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-sm sm:text-base">{clanEventStatus.event.title}</h3>
                          <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-600 text-rose-300 text-[10px] font-mono font-bold">
                            КЛАНОВЫЙ СЕЗОН
                          </span>
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5 max-w-xl">
                          {clanEventStatus.event.description}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <div className="text-[10px] text-zinc-400 uppercase font-mono">До завершения цикла:</div>
                      <div className="font-mono font-bold text-xs sm:text-sm text-rose-300 flex items-center sm:justify-end gap-1 mt-0.5">
                        <Clock className="w-3.5 h-3.5 text-rose-400" />
                        {formatCountdown(now + clanEventStatus.timeRemainingSeconds * 1000)}
                      </div>
                    </div>
                  </div>

                  {/* ================= WoT Blitz Style Milestone Stages Bar ================= */}
                  <div className="p-5 rounded-2xl bg-[#12131b] border border-zinc-800 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-850 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-1.5 font-sans">
                            <Trophy className="w-4 h-4 text-amber-400" />
                            Шкала этапов клана (WoT Blitz Style)
                          </h4>
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600 text-amber-300 font-mono font-bold">
                            Этап {clanEventStatus.currentStage} из {clanEventStatus.maxStages}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Все участники получают награды за открытые этапы по окончании ивента или сразу по их достижению!
                        </p>
                      </div>

                      {/* Clan Points Counters */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] text-zinc-400 uppercase font-mono">Очки клана:</div>
                          <div className="text-sm font-bold text-amber-400 font-mono flex items-center gap-1">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            {clanEventStatus.totalPoints} очков
                          </div>
                        </div>

                        <div className="text-right pl-3 border-l border-zinc-800">
                          <div className="text-[10px] text-zinc-400 uppercase font-mono">Ваш вклад:</div>
                          <div className="text-sm font-bold text-emerald-400 font-mono">
                            {clanEventStatus.myContribution} очков
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stepped Milestones Track */}
                    <div className="overflow-x-auto pb-2 scrollbar-thin">
                      <div className="flex items-stretch gap-3 min-w-[700px] pt-1">
                        {(clanEventStatus.event.clanMilestones || []).map((ms) => {
                          const isUnlocked = ms.stage <= clanEventStatus.currentStage;
                          const isClaimed = (clanEventStatus.claimedStages || []).includes(ms.stage);
                          const isNext = ms.stage === clanEventStatus.currentStage + 1;
                          const pointsNeeded = Math.max(0, ms.pointsRequired - clanEventStatus.totalPoints);

                          return (
                            <div 
                              key={ms.stage} 
                              className={`flex-1 min-w-[130px] p-3 rounded-xl border flex flex-col justify-between transition-all ${
                                isClaimed
                                  ? 'bg-[#151a1e] border-emerald-800/60 opacity-90'
                                  : isUnlocked
                                  ? 'bg-gradient-to-b from-amber-950/60 to-[#181926] border-amber-500 shadow-md shadow-amber-950/40'
                                  : isNext
                                  ? 'bg-[#151620] border-zinc-700'
                                  : 'bg-[#0f1016] border-zinc-850 opacity-60'
                              }`}
                            >
                              {/* Top Stage Indicator */}
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-mono font-bold text-zinc-300">
                                  Этап {ms.stage}
                                </span>
                                {isClaimed ? (
                                  <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-600 text-emerald-400 flex items-center justify-center text-[10px]">
                                    ✓
                                  </span>
                                ) : isUnlocked ? (
                                  <span className="w-5 h-5 rounded-full bg-amber-500 text-black font-bold flex items-center justify-center text-[10px] animate-pulse">
                                    ★
                                  </span>
                                ) : (
                                  <Lock className="w-3.5 h-3.5 text-zinc-500" />
                                )}
                              </div>

                              {/* Milestone Prize Icon & Info */}
                              <div className="my-2.5 text-center">
                                <div className="text-2xl mb-1">{ms.icon || '🎁'}</div>
                                <div className="text-xs font-bold text-white truncate">{ms.title}</div>
                                <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                                  +{ms.rewardCredits} кр
                                </div>
                                {ms.rewardItemName && (
                                  <div className="text-[9px] text-purple-300 truncate">
                                    {ms.rewardItemName}
                                  </div>
                                )}
                              </div>

                              {/* Stage Requirement / Action Button */}
                              <div className="mt-1">
                                {isClaimed ? (
                                  <div className="text-center py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-emerald-400 font-mono">
                                    ЗАБРАНО
                                  </div>
                                ) : isUnlocked ? (
                                  <button
                                    onClick={() => handleClaimMilestone(ms.stage)}
                                    disabled={claimingMilestoneStage === ms.stage}
                                    className="w-full py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-[10px] uppercase tracking-wider transition-all shadow-sm"
                                  >
                                    {claimingMilestoneStage === ms.stage ? 'Зачисление...' : 'ЗАБРАТЬ!'}
                                  </button>
                                ) : (
                                  <div className="text-center text-[9px] font-mono text-zinc-400 py-1 bg-zinc-900/60 rounded border border-zinc-850">
                                    {ms.pointsRequired} очков
                                    <div className="text-amber-500 font-bold">ещё {pointsNeeded}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Clan Tasks List (Double Rewards: Personal + Clan Points) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono flex items-center gap-2">
                        <Flame className="w-4 h-4 text-rose-400" />
                        Клановые боевые задачи ({clanTasks.length})
                      </h4>
                      <span className="text-[10px] text-amber-400 font-mono">
                        Двойная выгода: Личные награды + Очки в шкалу клана
                      </span>
                    </div>

                    {clanTasks.length === 0 ? (
                      <div className="p-8 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs">
                        Нет доступных клановых задач на текущий момент.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {clanTasks.map(item => (
                          <TaskCard
                            key={item.taskId}
                            taskProgress={item}
                            onClaim={handleClaimTask}
                            claiming={claimingTaskId === item.taskId}
                            badgeType="clan"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Leaderboard of Member Contributions */}
                  <div className="p-4 rounded-2xl bg-[#12131b] border border-zinc-800 space-y-3">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                      <Crown className="w-4 h-4 text-amber-400" />
                      Вклад бойцов синдиката в текущий ивент
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(clanEventStatus.memberContributions || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([memberId, points], idx) => {
                          const isMe = Boolean(user?.id && memberId === user.id);

                          return (
                            <div 
                              key={memberId} 
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                isMe 
                                  ? 'bg-amber-950/40 border-amber-600/70 text-amber-200' 
                                  : 'bg-[#181924] border-zinc-800 text-zinc-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[10px] ${
                                  idx === 0 ? 'bg-amber-500 text-black' : idx === 1 ? 'bg-zinc-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                  {idx + 1}
                                </span>
                                <span className="font-bold truncate max-w-[120px]">
                                  {isMe ? `${user?.displayName || 'Вы'} (Вы)` : `Боец #${memberId.slice(-4)}`}
                                </span>
                              </div>

                              <span className="font-mono font-bold text-amber-400">
                                +{points} очков
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Reroll Confirmation Sub-Modal */}
      {confirmRerollTask && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[#13141d] border border-zinc-700 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Dices className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Замена личной задачи (Реролл)</h3>
              </div>
              <button 
                onClick={() => setConfirmRerollTask(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-2">
              <p>
                Вы хотите заменить задачу:
              </p>
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 font-bold text-white">
                «{confirmRerollTask.task.title}»
              </div>
              <p className="text-zinc-400 leading-relaxed">
                {personalState?.freeRerollsRemaining && personalState.freeRerollsRemaining > 0 ? (
                  <span className="text-emerald-400 font-bold">
                    Эта замена БЕСПЛАТНА (первый бесплатный реролл за день)!
                  </span>
                ) : (
                  <span>
                    Лимит бесплатных рероллов исчерпан. Стоимость замены составит{' '}
                    <span className="text-amber-300 font-mono font-bold">{personalState?.rerollCost || 50} кр</span>.
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setConfirmRerollTask(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => handleRerollTask(confirmRerollTask.taskId)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Подтвердить замену</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// Reusable Task Card Component
interface TaskCardProps {
  taskProgress: UserTaskProgress;
  onClaim: (id: string) => void;
  claiming?: boolean;
  onRerollPrompt?: (t: UserTaskProgress) => void;
  rerolling?: boolean;
  badgeType?: 'global' | 'onboarding' | 'personal' | 'clan';
}

const TaskCard: React.FC<TaskCardProps> = ({
  taskProgress,
  onClaim,
  claiming = false,
  onRerollPrompt,
  rerolling = false,
  badgeType = 'global'
}) => {
  const { task, currentCount, targetCount, isCompleted, isClaimed } = taskProgress;
  const progressPercent = Math.min(100, Math.round((currentCount / targetCount) * 100));
  const actionInfo = ACTION_LABELS[task.targetType] || { label: task.targetType, icon: '🎯' };

  return (
    <div className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
      isClaimed
        ? 'bg-[#101117]/80 border-zinc-850 opacity-75'
        : isCompleted
        ? 'bg-gradient-to-r from-[#171c1b] to-[#121817] border-emerald-600/70 shadow-md shadow-emerald-950/20'
        : 'bg-[#13141f] border-zinc-800/90 hover:border-zinc-700'
    }`}>
      {/* Left Details */}
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-inner ${
          isClaimed 
            ? 'bg-zinc-800/60 border border-zinc-700/60 text-zinc-400' 
            : isCompleted 
            ? 'bg-emerald-950 border border-emerald-500 text-emerald-300' 
            : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
        }`}>
          {actionInfo.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-sm font-bold truncate ${isClaimed ? 'text-zinc-400 line-through' : 'text-white'}`}>
              {task.title}
            </h4>

            {task.type === 'clan' && (
              <span className="px-1.5 py-0.2 rounded bg-rose-950 border border-rose-700 text-rose-300 text-[9px] font-mono font-bold">
                КЛАНОВАЯ
              </span>
            )}
            {task.type === 'onboarding' && (
              <span className="px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 text-[9px] font-mono font-bold">
                ОНБОРДИНГ
              </span>
            )}
            {task.isRepeatable && (
              <span className="px-1.5 py-0.2 rounded bg-sky-950 border border-sky-800 text-sky-300 text-[9px] font-mono">
                {task.repeatCycle === 'daily' ? 'ЕЖЕДНЕВНО' : task.repeatCycle === 'weekly' ? 'ЕЖЕНЕДЕЛЬНО' : 'ПОВТОРЯЕМАЯ'}
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
            {task.description}
          </p>

          {/* Progress Bar & Counter */}
          <div className="mt-3 max-w-md">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1">
              <span>Прогресс: {currentCount} / {targetCount}</span>
              <span className={isCompleted ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                {progressPercent}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  isClaimed 
                    ? 'bg-zinc-600' 
                    : isCompleted 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                    : 'bg-gradient-to-r from-amber-500 to-orange-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Rewards & Action Controls */}
      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
        {/* Rewards Tag Stack */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {task.rewardCredits > 0 && (
            <div className="px-2 py-1 rounded-lg bg-amber-950/80 border border-amber-600/60 text-amber-300 text-xs font-mono font-bold flex items-center gap-1 shadow-xs">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>+{task.rewardCredits}</span>
            </div>
          )}

          {task.rewardXp > 0 && (
            <div className="px-2 py-1 rounded-lg bg-orange-950/80 border border-orange-600/60 text-orange-300 text-xs font-mono font-bold flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-orange-400" />
              <span>+{task.rewardXp} XP</span>
            </div>
          )}

          {task.rewardItemName && (
            <div className="px-2 py-1 rounded-lg bg-purple-950/80 border border-purple-600/60 text-purple-300 text-[11px] font-medium flex items-center gap-1">
              <Gift className="w-3 h-3 text-purple-400" />
              <span>{task.rewardItemName}</span>
            </div>
          )}

          {task.clanPoints > 0 && (
            <div className="px-2 py-1 rounded-lg bg-rose-950/90 border border-rose-500 text-rose-300 text-xs font-mono font-bold flex items-center gap-1 shadow-xs">
              <Star className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
              <span>+{task.clanPoints} очков</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {/* Reroll button for personal uncompleted tasks */}
          {badgeType === 'personal' && !isCompleted && onRerollPrompt && (
            <button
              onClick={() => onRerollPrompt(taskProgress)}
              disabled={rerolling}
              title="Заменить эту задачу (Реролл)"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-indigo-500 text-zinc-400 hover:text-indigo-300 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${rerolling ? 'animate-spin' : ''}`} />
            </button>
          )}

          {isClaimed ? (
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-bold flex items-center gap-1.5 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
              <span>Получено</span>
            </div>
          ) : isCompleted ? (
            <button
              onClick={() => onClaim(task.id)}
              disabled={claiming}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-950/60 flex items-center gap-1.5 animate-pulse"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>{claiming ? 'Зачисление...' : 'Забрать награду'}</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400 text-xs font-mono">
              В процессе
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
