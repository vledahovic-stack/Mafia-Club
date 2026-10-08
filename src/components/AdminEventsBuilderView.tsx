import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Calendar, 
  Clock, 
  Layers, 
  Plus, 
  Edit3, 
  Trash2, 
  Copy, 
  Check, 
  X, 
  AlertCircle, 
  Save, 
  RefreshCw, 
  SlidersHorizontal, 
  Users, 
  Shield, 
  Award, 
  Coins, 
  Package, 
  Flame, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Filter, 
  Tag, 
  ToggleLeft, 
  ToggleRight, 
  Gift, 
  Zap, 
  CheckCircle2, 
  HelpCircle,
  Crown,
  Star,
  Activity,
  History,
  Info,
  CalendarRange
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { 
  TaskDefinition, 
  TaskType, 
  TaskStatus, 
  TaskActionType, 
  RepeatCycle, 
  EventDefinition, 
  ClanMilestone, 
  EventsConfig 
} from '../types/events';
import { ALL_GAME_ITEMS, ITEMS_LIST } from '../data/items';

interface AdminEventsBuilderViewProps {
  token?: string | null;
}

export type AdminEventsTab = 'global' | 'onboarding' | 'personal' | 'clan' | 'events' | 'config';

const ACTION_LABELS: Record<TaskActionType, { label: string; icon: string; description: string }> = {
  play_matches: { label: 'Сыграть матчи', icon: '🎮', description: 'Количество сыгранных партий за столом' },
  win_matches: { label: 'Победить в матчах', icon: '🏆', description: 'Количество одержанных побед' },
  play_role: { label: 'Сыграть за роль', icon: '🎭', description: 'Сыграть партию за конкретную указанную роль' },
  survive_rounds: { label: 'Пережить раунды', icon: '🛡️', description: 'Суммарное количество пережитых раундов' },
  use_item: { label: 'Использовать предмет', icon: '📦', description: 'Активировать карту роли или предмет из инвентаря' },
  send_chat: { label: 'Сообщения в чате', icon: '💬', description: 'Отправить сообщения в дневном чате обсуждения' },
  invite_friend: { label: 'Пригласить друга', icon: '👥', description: 'Отправить приглашение или запрос в друзья' },
  play_with_clan_member: { label: 'Игра с соклановцем', icon: '⚔️', description: 'Сыграть за одним столом вместе с членом своего клана' }
};

const TASK_TYPE_LABELS: Record<TaskType, { label: string; icon: string; badgeColor: string; description: string; bannerText: string }> = {
  global: { 
    label: 'Общие задачи', 
    icon: '🌟', 
    badgeColor: 'bg-amber-950 border-amber-600/70 text-amber-300', 
    description: 'Доступны всем игрокам, могут объединяться в ивенты',
    bannerText: 'Общие задачи доступны всем игрокам сервера без ограничений. За выполнение выдаются монеты, опыт и предметы. Могут работать как одиночные квесты или объединяться в городские ивенты.'
  },
  onboarding: { 
    label: 'Для новичков', 
    icon: '🔰', 
    badgeColor: 'bg-emerald-950 border-emerald-600/70 text-emerald-300', 
    description: 'Онбординг-задачи, доступны зарегистрировавшимся после старта',
    bannerText: 'Онбординг-задачи знакомят новичков с базовыми механиками игры. Они доступны ТОЛЬКО тем игрокам, которые зарегистрировались после запуска конкретной задачи, и выполняются ровно один раз.'
  },
  personal: { 
    label: 'Личные задачи', 
    icon: '🎯', 
    badgeColor: 'bg-indigo-950 border-indigo-600/70 text-indigo-300', 
    description: 'Ежедневный персональный пул (по 3 на игрока) с функцией реролла',
    bannerText: 'Пул личных заданий. Система каждый день случайно выбирает по 3 задачи для каждого игрока. Игроки могут заменять задачи через функцию «Реролл» (1 бесплатно в день, далее за игровую валюту).'
  },
  clan: { 
    label: 'Внутриклановые', 
    icon: '🛡️', 
    badgeColor: 'bg-rose-950 border-rose-600/70 text-rose-300', 
    description: 'Двойная выгода: личные награды + Clan Points в шкалу этапов клана',
    bannerText: 'Клановые боевые задачи (в стиле WoT Blitz). Выполняются индивидуально или совместно с соклановцами. Приносят личные награды + Clan Points, которые открывают общие сундуки этапов синдиката.'
  }
};

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; badge: string; activeButtonClass: string }> = {
  active: { 
    label: 'Активен', 
    color: 'text-emerald-400', 
    badge: 'bg-emerald-950 border-emerald-700 text-emerald-300',
    activeButtonClass: 'bg-emerald-600 text-white shadow-xs font-bold'
  },
  scheduled: { 
    label: 'Запланирован', 
    color: 'text-sky-400', 
    badge: 'bg-sky-950 border-sky-700 text-sky-300',
    activeButtonClass: 'bg-sky-600 text-white shadow-xs font-bold'
  },
  draft: { 
    label: 'Черновик', 
    color: 'text-zinc-400', 
    badge: 'bg-zinc-800 border-zinc-700 text-zinc-300',
    activeButtonClass: 'bg-zinc-700 text-white shadow-xs font-bold'
  },
  completed: { 
    label: 'Завершен', 
    color: 'text-rose-400', 
    badge: 'bg-rose-950 border-rose-800 text-rose-300',
    activeButtonClass: 'bg-rose-700 text-white shadow-xs font-bold'
  }
};

const EVENT_PRESET_ICONS = ['🏆', '🍂', '🛡️', '⚔️', '👑', '🎉', '💎', '🎩', '🌟', '🔥', '🍷', '⚡'];

export const AdminEventsBuilderView: React.FC<AdminEventsBuilderViewProps> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<AdminEventsTab>('global');
  const [loading, setLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data states
  const [config, setConfig] = useState<EventsConfig>({
    masterToggles: { global: true, onboarding: true, personal: true, clan: true },
    personalRerollFreeDailyLimit: 1,
    personalRerollCost: 50
  });
  const [tasks, setTasks] = useState<TaskDefinition[]>([]);
  const [events, setEvents] = useState<EventDefinition[]>([]);

  // Search & Filter state for tasks
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  // Task Edit / Create Modal State
  const [editingTask, setEditingTask] = useState<Partial<TaskDefinition> | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Event Edit / Create Modal State
  const [editingEvent, setEditingEvent] = useState<Partial<EventDefinition> | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  const authHeaders = useMemo(() => {
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  }, [token]);

  // Load all data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [cfgRes, tasksRes, eventsRes] = await Promise.all([
        fetch('/api/events/config'),
        fetch('/api/admin/tasks/archive', { headers: authHeaders }),
        fetch('/api/admin/events', { headers: authHeaders })
      ]);

      if (cfgRes.ok) {
        const d = await cfgRes.json();
        if (d.config) setConfig(d.config);
      }
      if (tasksRes.ok) {
        const d = await tasksRes.json();
        if (Array.isArray(d.tasks)) setTasks(d.tasks);
      }
      if (eventsRes.ok) {
        const d = await eventsRes.json();
        if (Array.isArray(d.events)) setEvents(d.events);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Ошибка загрузки данных конструктора ивентов.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [authHeaders]);

  // Save Master Toggles Config
  const handleSaveConfig = async (newConfig: EventsConfig) => {
    try {
      const res = await fetch('/api/admin/events/config', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const d = await res.json();
        setConfig(d.config);
        setFeedback({ type: 'success', text: 'Мастер-настройки успешно сохранены!' });
        sounds.playMorningChime();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch {
      setFeedback({ type: 'error', text: 'Не удалось обновить настройки.' });
    }
  };

  // Quick Instant Status Switcher for Tasks
  const handleQuickUpdateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    sounds.playTick();
    // Optimistic local update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...task, status: newStatus })
      });
      if (res.ok) {
        setFeedback({ 
          type: 'success', 
          text: `Статус задачи «${task.title}» изменен на «${STATUS_CONFIG[newStatus].label}»` 
        });
        setTimeout(() => setFeedback(null), 2500);
      } else {
        fetchData(); // Rollback on error
      }
    } catch {
      fetchData();
    }
  };

  // Quick Instant Status Switcher for Events
  const handleQuickUpdateEventStatus = async (eventId: string, newStatus: TaskStatus) => {
    const ev = events.find(e => e.id === eventId);
    if (!ev || ev.status === newStatus) return;

    sounds.playTick();
    // Optimistic local update
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, status: newStatus } : e));

    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...ev, status: newStatus })
      });
      if (res.ok) {
        setFeedback({ 
          type: 'success', 
          text: `Статус ивента «${ev.title}» изменен на «${STATUS_CONFIG[newStatus].label}»` 
        });
        setTimeout(() => setFeedback(null), 2500);
      } else {
        fetchData(); // Rollback on error
      }
    } catch {
      fetchData();
    }
  };

  // Task Actions
  const handleOpenCreateTask = (presetType?: TaskType) => {
    const targetType = presetType || (activeTab === 'events' || activeTab === 'config' ? 'global' : activeTab);
    const now = new Date().toISOString();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    setEditingTask({
      title: '',
      description: '',
      type: targetType,
      targetType: targetType === 'clan' ? 'play_with_clan_member' : 'play_matches',
      targetCount: 1,
      rewardCredits: 200,
      rewardXp: 150,
      clanPoints: targetType === 'clan' ? 30 : 0,
      startsAt: now,
      endsAt: in30Days,
      status: 'active',
      isRepeatable: false,
      repeatCycle: 'none',
      onboardingMinRegistrationDate: targetType === 'onboarding' ? now : undefined
    });
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (taskData: Partial<TaskDefinition>) => {
    if (!taskData.title?.trim()) {
      alert('Укажите название задачи.');
      return;
    }
    try {
      const res = await fetch('/api/admin/tasks', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(taskData)
      });
      if (res.ok) {
        const d = await res.json();
        setIsTaskModalOpen(false);
        setEditingTask(null);
        setFeedback({ type: 'success', text: `Задача «${d.task.title}» успешно сохранена!` });
        sounds.playMorningChime();
        fetchData();
        setTimeout(() => setFeedback(null), 3000);
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка при сохранении задачи.');
      }
    } catch {
      alert('Ошибка сетевого запроса.');
    }
  };

  const handleCloneTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/clone`, {
        method: 'POST',
        headers: authHeaders
      });
      if (res.ok) {
        sounds.playCardFlip();
        fetchData();
        setFeedback({ type: 'success', text: 'Задача успешно клонирована!' });
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch {}
  };

  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!confirm(`Удалить задачу «${title}»?`)) return;
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) {
        sounds.playTick();
        fetchData();
        setFeedback({ type: 'success', text: `Задача «${title}» удалена.` });
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch {}
  };

  // Event Actions
  const handleOpenCreateEvent = (eventType: 'general' | 'clan' = 'general') => {
    const now = new Date().toISOString();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const defaultMilestones: ClanMilestone[] = [
      { stage: 1, pointsRequired: 50, rewardCredits: 250, title: 'Бронзовый аванс', icon: '🥉', description: '250 кр в казну каждого бойца' },
      { stage: 2, pointsRequired: 120, rewardCredits: 500, rewardItemId: 'chest_novice', rewardItemName: 'Сундук Мафиози', title: 'Оружейный схрон', icon: '📦', description: '500 кр + Сундук' },
      { stage: 3, pointsRequired: 220, rewardCredits: 800, rewardItemId: 'card_role_select', rewardItemName: 'Карточка выбора роли', title: 'Ордер Синдиката', icon: '🎴', description: '800 кр + Выбор роли' },
      { stage: 4, pointsRequired: 350, rewardCredits: 1200, rewardItemId: 'chest_novice', rewardItemName: 'Золотой сундук', title: 'Сейф Магистрата', icon: '💼', description: '1200 кр + Трофеи' },
      { stage: 5, pointsRequired: 500, rewardCredits: 1600, rewardItemId: 'cert_name_change', rewardItemName: 'Сертификат смены ника', title: 'Новое имя', icon: '📜', description: '1600 кр + Сертификат' },
      { stage: 6, pointsRequired: 700, rewardCredits: 2200, rewardItemId: 'card_role_select', rewardItemName: '2х Карты роли', title: 'Контроль квартала', icon: '💎', description: '2200 кр + 2 Карты роли' },
      { stage: 7, pointsRequired: 950, rewardCredits: 3000, title: 'Власть Синдиката', icon: '⭐', description: '3000 кр + Авторитет' },
      { stage: 8, pointsRequired: 1300, rewardCredits: 5000, rewardItemId: 'card_role_select', rewardItemName: 'Легендарный пак', title: 'Крестный Отец Города', icon: '👑', description: '5000 кр + Полный триумф' }
    ];

    setEditingEvent({
      title: eventType === 'clan' ? 'Битва Синдикатов' : 'Городской Ивент',
      description: eventType === 'clan' ? 'Выполняйте клановые задачи, зарабатывайте Clan Points и забирайте этапы наград всей семьей!' : 'Участвуйте в ивенте и выполняйте цепочку задач!',
      icon: eventType === 'clan' ? '🛡️' : '🏆',
      type: eventType,
      startsAt: now,
      endsAt: in7Days,
      status: 'active',
      repeatCycle: eventType === 'clan' ? 'weekly' : 'none',
      taskIds: tasks.filter(t => t.type === (eventType === 'clan' ? 'clan' : 'global')).slice(0, 4).map(t => t.id),
      clanMilestones: eventType === 'clan' ? defaultMilestones : []
    });
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (eventData: Partial<EventDefinition>) => {
    if (!eventData.title?.trim()) {
      alert('Укажите название ивента.');
      return;
    }
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(eventData)
      });
      if (res.ok) {
        setIsEventModalOpen(false);
        setEditingEvent(null);
        setFeedback({ type: 'success', text: 'Ивент успешно сохранен и применен!' });
        sounds.playMorningChime();
        fetchData();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch {
      alert('Ошибка при сохранении ивента.');
    }
  };

  const handleDeleteEvent = async (eventId: string, title: string) => {
    if (!confirm(`Удалить ивент «${title}»?`)) return;
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) {
        sounds.playTick();
        fetchData();
        setFeedback({ type: 'success', text: `Ивент «${title}» удален.` });
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch {}
  };

  // Helper for quick timeline duration presets
  const applyTimelinePreset = (days: number, isEvent: boolean) => {
    sounds.playTick();
    const startDate = isEvent 
      ? (editingEvent?.startsAt ? new Date(editingEvent.startsAt) : new Date())
      : (editingTask?.startsAt ? new Date(editingTask.startsAt) : new Date());

    const newEnds = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    if (isEvent && editingEvent) {
      setEditingEvent({ ...editingEvent, endsAt: newEnds });
    } else if (!isEvent && editingTask) {
      setEditingTask({ ...editingTask, endsAt: newEnds });
    }
  };

  // Format Duration description
  const calculateDurationText = (startsAt?: string, endsAt?: string) => {
    if (!startsAt || !endsAt) return 'Бессрочно';
    const s = new Date(startsAt).getTime();
    const e = new Date(endsAt).getTime();
    const diffMs = e - s;
    if (diffMs <= 0) return 'Дата окончания раньше даты старта!';
    const days = Math.floor(diffMs / (24 * 3600 * 1000));
    const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
    if (days > 0) {
      return `${days} дн. ${hours > 0 ? `${hours} ч.` : ''} (всего ${Math.round(diffMs / 3600000)} ч.)`;
    }
    return `${hours} час(ов)`;
  };

  // Filter tasks for current active task category tab
  const activeCategoryTasks = useMemo(() => {
    if (activeTab === 'events' || activeTab === 'config') return [];
    return tasks.filter(t => {
      if (t.type !== activeTab) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [tasks, activeTab, statusFilter, searchQuery]);

  // Counts for each category
  const counts = useMemo(() => {
    return {
      global: { total: tasks.filter(t => t.type === 'global').length, active: tasks.filter(t => t.type === 'global' && t.status === 'active').length },
      onboarding: { total: tasks.filter(t => t.type === 'onboarding').length, active: tasks.filter(t => t.type === 'onboarding' && t.status === 'active').length },
      personal: { total: tasks.filter(t => t.type === 'personal').length, active: tasks.filter(t => t.type === 'personal' && t.status === 'active').length },
      clan: { total: tasks.filter(t => t.type === 'clan').length, active: tasks.filter(t => t.type === 'clan' && t.status === 'active').length },
      events: { total: events.length, active: events.filter(e => e.status === 'active').length }
    };
  }, [tasks, events]);

  return (
    <div className="space-y-5">
      
      {/* Top Main Navigation Tabs Bar: 4 Types + Events + Master Config */}
      <div className="border-b border-zinc-800 pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <span>Конструктор ивентов и задач</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 font-bold">
                АДМИН-ЦЕНТР
              </span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Управление 4 типами задач, создание ивентов с выбором времени действия и быстрыми переключателями статусов
            </p>
          </div>

          {/* Quick Refresh Button */}
          <button
            onClick={() => { sounds.playTick(); fetchData(); }}
            title="Обновить данные"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 6 Category Tabs with Counts & Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Tab 1: Global */}
          <button
            onClick={() => { setActiveTab('global'); sounds.playTick(); }}
            className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
              activeTab === 'global'
                ? 'bg-gradient-to-br from-amber-950/80 to-[#191512] border-amber-500 shadow-md shadow-amber-950/40'
                : 'bg-[#12131b] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-base">🌟</span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                config.masterToggles.global === false 
                  ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                  : 'bg-zinc-800 text-amber-300'
              }`}>
                {counts.global.active}/{counts.global.total}
              </span>
            </div>
            <div className="mt-2">
              <div className={`text-xs font-bold leading-tight ${activeTab === 'global' ? 'text-white' : 'text-zinc-200'}`}>
                Общие задачи
              </div>
              <div className="text-[10px] text-zinc-500">Доступны всем</div>
            </div>
          </button>

          {/* Tab 2: Onboarding */}
          <button
            onClick={() => { setActiveTab('onboarding'); sounds.playTick(); }}
            className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
              activeTab === 'onboarding'
                ? 'bg-gradient-to-br from-emerald-950/80 to-[#121817] border-emerald-500 shadow-md shadow-emerald-950/40'
                : 'bg-[#12131b] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-base">🔰</span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                config.masterToggles.onboarding === false 
                  ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                  : 'bg-zinc-800 text-emerald-300'
              }`}>
                {counts.onboarding.active}/{counts.onboarding.total}
              </span>
            </div>
            <div className="mt-2">
              <div className={`text-xs font-bold leading-tight ${activeTab === 'onboarding' ? 'text-white' : 'text-zinc-200'}`}>
                Для новичков
              </div>
              <div className="text-[10px] text-zinc-500">Онбординг (1 раз)</div>
            </div>
          </button>

          {/* Tab 3: Personal */}
          <button
            onClick={() => { setActiveTab('personal'); sounds.playTick(); }}
            className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
              activeTab === 'personal'
                ? 'bg-gradient-to-br from-indigo-950/80 to-[#151522] border-indigo-500 shadow-md shadow-indigo-950/40'
                : 'bg-[#12131b] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-base">🎯</span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                config.masterToggles.personal === false 
                  ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                  : 'bg-zinc-800 text-indigo-300'
              }`}>
                {counts.personal.active}/{counts.personal.total}
              </span>
            </div>
            <div className="mt-2">
              <div className={`text-xs font-bold leading-tight ${activeTab === 'personal' ? 'text-white' : 'text-zinc-200'}`}>
                Личные задачи
              </div>
              <div className="text-[10px] text-zinc-500">Пул 3/день + реролл</div>
            </div>
          </button>

          {/* Tab 4: Clan */}
          <button
            onClick={() => { setActiveTab('clan'); sounds.playTick(); }}
            className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
              activeTab === 'clan'
                ? 'bg-gradient-to-br from-rose-950/80 to-[#1b1216] border-rose-500 shadow-md shadow-rose-950/40'
                : 'bg-[#12131b] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-base">🛡️</span>
              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                config.masterToggles.clan === false 
                  ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                  : 'bg-zinc-800 text-rose-300'
              }`}>
                {counts.clan.active}/{counts.clan.total}
              </span>
            </div>
            <div className="mt-2">
              <div className={`text-xs font-bold leading-tight ${activeTab === 'clan' ? 'text-white' : 'text-zinc-200'}`}>
                Внутриклановые
              </div>
              <div className="text-[10px] text-zinc-500">WoT Blitz этапы</div>
            </div>
          </button>

          {/* Tab 5: Events */}
          <button
            onClick={() => { setActiveTab('events'); sounds.playTick(); }}
            className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
              activeTab === 'events'
                ? 'bg-gradient-to-br from-amber-950/80 to-[#1e1520] border-amber-500 shadow-md shadow-amber-950/40'
                : 'bg-[#12131b] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-base">🏆</span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-amber-300">
                {counts.events.active}/{counts.events.total}
              </span>
            </div>
            <div className="mt-2">
              <div className={`text-xs font-bold leading-tight ${activeTab === 'events' ? 'text-white' : 'text-zinc-200'}`}>
                Ивенты и Сезоны
              </div>
              <div className="text-[10px] text-zinc-500">Таймлайны & шкалы</div>
            </div>
          </button>

          {/* Tab 6: Master Config */}
          <button
            onClick={() => { setActiveTab('config'); sounds.playTick(); }}
            className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
              activeTab === 'config'
                ? 'bg-gradient-to-br from-zinc-800 to-[#141520] border-zinc-500 shadow-md'
                : 'bg-[#12131b] border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                4 свитча
              </span>
            </div>
            <div className="mt-2">
              <div className={`text-xs font-bold leading-tight ${activeTab === 'config' ? 'text-white' : 'text-zinc-200'}`}>
                Мастер-свитчи
              </div>
              <div className="text-[10px] text-zinc-500">Глобальные опции</div>
            </div>
          </button>
        </div>
      </div>

      {/* Feedback Alert Toast */}
      {feedback && (
        <div className={`p-3 rounded-2xl text-xs flex items-center justify-between border animate-in fade-in ${
          feedback.type === 'success' ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300' : 'bg-rose-950/80 border-rose-700 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================= TABS 1 - 4: SPECIFIC TASK TYPE WORKSPACES ================= */}
      {activeTab !== 'events' && activeTab !== 'config' && (
        <div className="space-y-4">
          
          {/* Informational Guidance Banner with Type Rules */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#151624] to-[#12131d] border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-black/50 border border-zinc-700 flex items-center justify-center text-2xl shrink-0">
                {TASK_TYPE_LABELS[activeTab].icon}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-white">
                    {TASK_TYPE_LABELS[activeTab].label}
                  </h4>
                  {config.masterToggles[activeTab] === false ? (
                    <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800 text-rose-300 text-[10px] font-mono font-bold animate-pulse">
                      ГЛОБАЛЬНО ОТКЛЮЧЕНО
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-mono font-bold">
                      КАТЕГОРИЯ АКТИВНА
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-300 mt-1 max-w-2xl leading-relaxed">
                  {TASK_TYPE_LABELS[activeTab].bannerText}
                </p>
              </div>
            </div>

            {/* Create Task Button Preset for this Tab */}
            <button
              onClick={() => handleOpenCreateTask(activeTab)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-950/50 transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Создать задачу ({TASK_TYPE_LABELS[activeTab].label})</span>
            </button>
          </div>

          {/* Action Bar: Search & Status Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#12131b] p-2.5 rounded-2xl border border-zinc-850">
            {/* Status Filter Segment */}
            <div className="flex items-center gap-1 overflow-x-auto p-1 bg-black/40 rounded-xl border border-zinc-800 text-xs">
              <button
                onClick={() => { setStatusFilter('all'); sounds.playTick(); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  statusFilter === 'all' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Все ({tasks.filter(t => t.type === activeTab).length})
              </button>
              {(['active', 'scheduled', 'draft', 'completed'] as TaskStatus[]).map(st => {
                const count = tasks.filter(t => t.type === activeTab && t.status === st).length;
                return (
                  <button
                    key={st}
                    onClick={() => { setStatusFilter(st); sounds.playTick(); }}
                    className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold transition-all ${
                      statusFilter === st ? STATUS_CONFIG[st].activeButtonClass : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {STATUS_CONFIG[st].label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию или описанию..."
                className="w-full sm:w-64 bg-[#151624] border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Task Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {activeCategoryTasks.length === 0 ? (
              <div className="col-span-full p-10 rounded-2xl bg-[#11121c] border border-dashed border-zinc-800 text-center space-y-2">
                <Layers className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">
                  В категории «{TASK_TYPE_LABELS[activeTab].label}» задач по заданному фильтру не найдено.
                </p>
                <button
                  onClick={() => handleOpenCreateTask(activeTab)}
                  className="mt-2 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить первую задачу</span>
                </button>
              </div>
            ) : (
              activeCategoryTasks.map(task => {
                const actionMeta = ACTION_LABELS[task.targetType] || { label: task.targetType, icon: '🎯' };
                const durationText = calculateDurationText(task.startsAt, task.endsAt);

                return (
                  <div 
                    key={task.id}
                    className="p-4 rounded-2xl bg-[#131420] border border-zinc-800/90 hover:border-zinc-700 transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header: Title, Action Icon & Controls */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-black/50 border border-zinc-800 flex items-center justify-center text-lg shrink-0">
                            {actionMeta.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate">
                              {task.title}
                            </h4>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              ID: {task.id} {task.repeatCycle !== 'none' ? `• Цикл: ${task.repeatCycle}` : ''}
                            </div>
                          </div>
                        </div>

                        {/* Edit / Clone / Delete Quick Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditingTask({ ...task }); setIsTaskModalOpen(true); }}
                            title="Редактировать задачу"
                            className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-750 text-amber-300 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCloneTask(task.id)}
                            title="Клонировать задачу"
                            className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-750 text-zinc-300 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id, task.title)}
                            title="Удалить задачу"
                            className="p-1.5 rounded-lg bg-zinc-850 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-zinc-300 leading-relaxed mb-3">
                        {task.description}
                      </p>

                      {/* Goal & Requirements Box */}
                      <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-850 flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="text-zinc-300 font-bold">{actionMeta.label}:</span>
                          <span className="text-amber-400 ml-1 font-bold">{task.targetCount} раз(а)</span>
                        </div>
                        {task.targetRole && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-amber-300 font-bold">
                            Роль: {task.targetRole}
                          </span>
                        )}
                      </div>

                      {/* Onboarding Specific Filter Info */}
                      {task.type === 'onboarding' && task.onboardingMinRegistrationDate && (
                        <div className="mt-2 text-[10px] font-mono text-emerald-400 p-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-center gap-1.5">
                          <Info className="w-3 h-3 shrink-0" />
                          <span>Доступно зарегистрированным после: {new Date(task.onboardingMinRegistrationDate).toLocaleString('ru-RU')}</span>
                        </div>
                      )}

                      {/* Rewards Display */}
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 font-mono">Награды:</span>
                        {task.rewardCredits > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/60 text-amber-300 font-mono font-bold flex items-center gap-1">
                            <Coins className="w-3 h-3 text-amber-400" />
                            <span>+{task.rewardCredits} кр</span>
                          </span>
                        )}
                        {task.rewardXp > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-yellow-950/80 border border-yellow-600/60 text-yellow-300 font-mono font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-yellow-400" />
                            <span>+{task.rewardXp} XP</span>
                          </span>
                        )}
                        {task.rewardItemId && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-600/60 text-purple-300 font-mono font-bold flex items-center gap-1">
                            <Gift className="w-3 h-3 text-purple-400" />
                            <span>{task.rewardItemName || task.rewardItemId}</span>
                          </span>
                        )}
                        {task.type === 'clan' && task.clanPoints > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-600/60 text-rose-300 font-mono font-black flex items-center gap-1 shadow-xs">
                            <Shield className="w-3 h-3 text-rose-400" />
                            <span>+{task.clanPoints} Clan Pts</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Status & Timeline Section */}
                    <div className="pt-3 border-t border-zinc-850 space-y-2">
                      {/* Timeline duration info */}
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          <span>Срок: {durationText}</span>
                        </div>
                        {task.endsAt && (
                          <span>До: {new Date(task.endsAt).toLocaleDateString('ru-RU')}</span>
                        )}
                      </div>

                      {/* 1-Click Interactive Activity Status Switcher Bar */}
                      <div className="flex items-center justify-between gap-1 p-1 bg-black/60 rounded-xl border border-zinc-850">
                        <span className="text-[10px] font-mono text-zinc-500 pl-1 uppercase font-bold">
                          Статус:
                        </span>
                        <div className="flex items-center gap-1">
                          {(['draft', 'scheduled', 'active', 'completed'] as TaskStatus[]).map(st => {
                            const isCurrent = task.status === st;
                            return (
                              <button
                                key={st}
                                onClick={() => handleQuickUpdateTaskStatus(task.id, st)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                                  isCurrent 
                                    ? STATUS_CONFIG[st].activeButtonClass 
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                }`}
                              >
                                {STATUS_CONFIG[st].label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 5: EVENTS & SEASONS CONSTRUCTOR ================= */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          
          {/* Top Event Actions Header */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-[#171825] to-[#12131e] border border-amber-900/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <CalendarRange className="w-4 h-4 text-amber-400" />
                  <span>Управление ивентами и клановыми сезонами</span>
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-amber-950 border border-amber-600 text-amber-300 text-[10px] font-mono font-bold">
                  {events.length} СОБЫТИЙ
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1 max-w-2xl">
                Ивенты объединяют цепочки задач во временные рамки (с точным временем старта и окончания) и задают шкалу наград этапов синдиката в стиле World of Tanks Blitz.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={() => handleOpenCreateEvent('general')}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Общий ивент</span>
              </button>

              <button
                onClick={() => handleOpenCreateEvent('clan')}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-amber-700 hover:from-rose-600 hover:to-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-950/40 transition-all cursor-pointer"
              >
                <Shield className="w-4 h-4 text-yellow-300" />
                <span>+ Клановый сезон (WoT Blitz)</span>
              </button>
            </div>
          </div>

          {/* Events List */}
          <div className="space-y-3.5">
            {events.length === 0 ? (
              <div className="p-10 rounded-2xl bg-[#11121c] border border-dashed border-zinc-800 text-center space-y-2">
                <Calendar className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400">Ивентов пока не создано. Нажмите кнопки выше для добавления.</p>
              </div>
            ) : (
              events.map(ev => {
                const isClan = ev.type === 'clan';
                const durationText = calculateDurationText(ev.startsAt, ev.endsAt);

                return (
                  <div
                    key={ev.id}
                    className={`p-5 rounded-3xl border transition-all space-y-4 ${
                      isClan 
                        ? 'bg-gradient-to-r from-[#17111b] via-[#14121d] to-[#12131e] border-rose-900/60 shadow-lg' 
                        : 'bg-[#131420] border-zinc-800 shadow-md'
                    }`}
                  >
                    {/* Top Row: Icon, Title, Type & Action Buttons */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-black/50 border border-zinc-700 flex items-center justify-center text-2xl shadow-inner shrink-0">
                          {ev.icon || '🏆'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-bold text-white">{ev.title}</h4>
                            <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold font-mono ${
                              isClan ? 'bg-rose-950 border-rose-700 text-rose-300' : 'bg-amber-950 border-amber-700 text-amber-300'
                            }`}>
                              {isClan ? 'Клановый ивент (WoT Blitz)' : 'Общий городской ивент'}
                            </span>
                            {ev.repeatCycle !== 'none' && (
                              <span className="px-2 py-0.5 rounded-lg bg-zinc-850 text-[10px] font-mono text-zinc-300">
                                Цикл: {ev.repeatCycle}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-2xl">{ev.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        <button
                          onClick={() => {
                            setEditingEvent({ ...ev });
                            setIsEventModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Настроить</span>
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(ev.id, ev.title)}
                          className="p-1.5 rounded-xl bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Timeline & Attached Tasks Bar */}
                    <div className="p-3 rounded-2xl bg-black/40 border border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-zinc-400">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Период действия:</span>
                        <strong className="text-white">{new Date(ev.startsAt).toLocaleString('ru-RU')}</strong>
                        <span>—</span>
                        <strong className="text-white">{new Date(ev.endsAt).toLocaleString('ru-RU')}</strong>
                        <span className="text-amber-400 font-bold">({durationText})</span>
                      </div>
                      <div>
                        Прикреплено задач: <strong className="text-amber-400">{ev.taskIds.length}</strong>
                      </div>
                    </div>

                    {/* 1-Click Status Switcher for Event */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-black/50 rounded-2xl border border-zinc-850">
                      <span className="text-[11px] font-mono text-zinc-400 pl-1 uppercase font-bold flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                        <span>Статус активности ивента:</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {(['draft', 'scheduled', 'active', 'completed'] as TaskStatus[]).map(st => {
                          const isCurrent = ev.status === st;
                          return (
                            <button
                              key={st}
                              onClick={() => handleQuickUpdateEventStatus(ev.id, st)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                                isCurrent 
                                  ? STATUS_CONFIG[st].activeButtonClass 
                                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                              }`}
                            >
                              {STATUS_CONFIG[st].label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Clan Milestones Stage Preview if clan event */}
                    {isClan && ev.clanMilestones && ev.clanMilestones.length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-zinc-850">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-yellow-400" />
                            <span>Шкала этапов клана (Этапы 1 — {ev.clanMilestones.length})</span>
                          </span>
                          <span className="text-[11px] text-zinc-400 font-mono">
                            Пороги очков синдиката (WoT Blitz)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
                          {ev.clanMilestones.map(m => (
                            <div 
                              key={m.stage}
                              className="p-2 rounded-xl bg-black/60 border border-zinc-800 text-center space-y-1"
                            >
                              <div className="text-[10px] font-mono font-bold text-amber-400">Этап {m.stage}</div>
                              <div className="text-base">{m.icon || '🎁'}</div>
                              <div className="text-[10px] text-zinc-300 font-mono font-bold">{m.pointsRequired} очк.</div>
                              <div className="text-[9px] text-emerald-400 truncate">+{m.rewardCredits} кр</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 6: MASTER TOGGLES & ECONOMY CONFIG ================= */}
      {activeTab === 'config' && (
        <div className="max-w-3xl space-y-4">
          <div className="p-5 rounded-3xl bg-[#131420] border border-zinc-800 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <span>Глобальные мастер-переключатели категорий задач</span>
            </h4>
            <p className="text-xs text-zinc-400">
              Позволяет мгновенно отключить или включить любую категорию задач для всего проекта без необходимости удалять задачи из базы данных.
            </p>

            <div className="space-y-3 pt-1">
              {(['global', 'onboarding', 'personal', 'clan'] as TaskType[]).map(catKey => {
                const meta = TASK_TYPE_LABELS[catKey];
                const isEnabled = config.masterToggles[catKey];

                return (
                  <div 
                    key={catKey}
                    className="p-3.5 rounded-2xl bg-black/40 border border-zinc-850 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xl shrink-0">
                        {meta.icon}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{meta.label}</div>
                        <div className="text-[11px] text-zinc-400">{meta.description}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const newToggles = { ...config.masterToggles, [catKey]: !isEnabled };
                        handleSaveConfig({ ...config, masterToggles: newToggles });
                        sounds.playTick();
                      }}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                        isEnabled
                          ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
                      }`}
                    >
                      {isEnabled ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-zinc-400" />}
                      <span>{isEnabled ? 'Включено' : 'Выключено'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personal Task Reroll Settings */}
          <div className="p-5 rounded-3xl bg-[#131420] border border-zinc-800 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>Параметры реролла личных задач</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-black/40 border border-zinc-850 space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 block">Бесплатных замен в день:</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={config.personalRerollFreeDailyLimit}
                  onChange={e => setConfig({ ...config, personalRerollFreeDailyLimit: Math.max(0, Number(e.target.value)) })}
                  className="w-full bg-[#11121b] border border-zinc-750 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500"
                />
                <span className="text-[10px] text-zinc-500 block">По умолчанию 1 бесплатный реролл</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/40 border border-zinc-850 space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 block">Стоимость платного реролла (кр):</label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={config.personalRerollCost}
                  onChange={e => setConfig({ ...config, personalRerollCost: Math.max(0, Number(e.target.value)) })}
                  className="w-full bg-[#11121b] border border-zinc-750 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500"
                />
                <span className="text-[10px] text-zinc-500 block">Списывается со счета после исчерпания бесплатных</span>
              </div>
            </div>

            <button
              onClick={() => handleSaveConfig(config)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-950/40"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Сохранить параметры реролла</span>
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT TASK ================= */}
      {isTaskModalOpen && editingTask && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-[#131422] border border-zinc-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-bold text-white">
                  {editingTask.id ? 'Редактировать задачу' : 'Создать новую задачу'}
                </h4>
              </div>
              <button 
                onClick={() => { setIsTaskModalOpen(false); setEditingTask(null); }}
                className="p-1 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Task Category (Type) Selector with Description */}
              <div>
                <label className="font-bold text-zinc-300 block mb-1.5">Категория (Тип задачи):</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['global', 'onboarding', 'personal', 'clan'] as TaskType[]).map(t => {
                    const meta = TASK_TYPE_LABELS[t];
                    const isSelected = editingTask.type === t;
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => {
                          sounds.playTick();
                          setEditingTask({
                            ...editingTask,
                            type: t,
                            clanPoints: t === 'clan' ? (editingTask.clanPoints || 30) : 0,
                            targetType: t === 'clan' ? 'play_with_clan_member' : (editingTask.targetType || 'play_matches')
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-950/70 border-amber-500 text-white font-bold'
                            : 'bg-[#10111a] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className="text-base">{meta.icon}</div>
                        <div className="text-xs font-bold mt-1 text-white">{meta.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <label className="font-bold text-zinc-300 block mb-1">Название задачи:</label>
                <input
                  type="text"
                  value={editingTask.title || ''}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                  placeholder="Например: Закон и порядок"
                  className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 block mb-1">Описание задачи для игроков:</label>
                <textarea
                  rows={2}
                  value={editingTask.description || ''}
                  onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                  placeholder="Одержите 2 победы мирными жителями за любым столом..."
                  className="w-full bg-[#11121a] border border-zinc-750 rounded-xl p-3 text-white text-xs focus:border-amber-500"
                />
              </div>

              {/* Target Action & Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 block mb-1">Целевое действие игрока:</label>
                  <select
                    value={editingTask.targetType || 'play_matches'}
                    onChange={e => setEditingTask({ ...editingTask, targetType: e.target.value as TaskActionType })}
                    className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500"
                  >
                    {Object.entries(ACTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-zinc-300 block mb-1">Требуемое количество повторов:</label>
                  <input
                    type="number"
                    min={1}
                    value={editingTask.targetCount || 1}
                    onChange={e => setEditingTask({ ...editingTask, targetCount: Math.max(1, Number(e.target.value)) })}
                    className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Specific role filter if action is play_role */}
              {editingTask.targetType === 'play_role' && (
                <div>
                  <label className="font-bold text-zinc-300 block mb-1">Требуемая роль:</label>
                  <select
                    value={editingTask.targetRole || 'citizen'}
                    onChange={e => setEditingTask({ ...editingTask, targetRole: e.target.value })}
                    className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="citizen">Мирный житель</option>
                    <option value="sheriff">Шериф</option>
                    <option value="doctor">Доктор</option>
                    <option value="mafia">Мафия</option>
                    <option value="don">Дон Мафии</option>
                    <option value="maniac">Маньяк</option>
                    <option value="whore">Любовница / Путана</option>
                  </select>
                </div>
              )}

              {/* Onboarding Specific Registration Date Rule */}
              {editingTask.type === 'onboarding' && (
                <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-emerald-200">
                      Минимальная дата регистрации игрока:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        setEditingTask({ ...editingTask, onboardingMinRegistrationDate: new Date().toISOString() });
                      }}
                      className="text-[10px] text-amber-300 hover:underline font-mono"
                    >
                      Установить текущее время
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={editingTask.onboardingMinRegistrationDate ? editingTask.onboardingMinRegistrationDate.slice(0, 16) : ''}
                    onChange={e => setEditingTask({ ...editingTask, onboardingMinRegistrationDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                    className="w-full bg-[#11121b] border border-zinc-750 rounded-xl px-3 py-1.5 text-white font-mono text-xs"
                  />
                  <p className="text-[10px] text-zinc-400">
                    Только пользователи, зарегистрированные ПОСЛЕ этой даты, увидят и смогут выполнить эту онбординг-задачу.
                  </p>
                </div>
              )}

              {/* Timeline Selection with Quick Presets */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Время действия задачи (Таймлайн):</span>
                  </label>
                  <span className="text-[11px] text-amber-300 font-mono">
                    {calculateDurationText(editingTask.startsAt, editingTask.endsAt)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Дата и время начала:</label>
                    <input
                      type="datetime-local"
                      value={editingTask.startsAt ? editingTask.startsAt.slice(0, 16) : ''}
                      onChange={e => setEditingTask({ ...editingTask, startsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-1.5 text-white text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Дата и время окончания:</label>
                    <input
                      type="datetime-local"
                      value={editingTask.endsAt ? editingTask.endsAt.slice(0, 16) : ''}
                      onChange={e => setEditingTask({ ...editingTask, endsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-1.5 text-white text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Quick Presets Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-mono">Быстрый период:</span>
                  {[
                    { label: '+7 дней', days: 7 },
                    { label: '+14 дней', days: 14 },
                    { label: '+30 дней', days: 30 },
                    { label: '+90 дней (Сезон)', days: 90 },
                    { label: '+1 год (Бессрочно)', days: 365 }
                  ].map(p => (
                    <button
                      type="button"
                      key={p.days}
                      onClick={() => applyTimelinePreset(p.days, false)}
                      className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activity Status Switcher Bar */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-zinc-800 space-y-2">
                <label className="font-bold text-white block">Статус активности задачи:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['draft', 'scheduled', 'active', 'completed'] as TaskStatus[]).map(st => {
                    const isSelected = editingTask.status === st;
                    return (
                      <button
                        type="button"
                        key={st}
                        onClick={() => { sounds.playTick(); setEditingTask({ ...editingTask, status: st }); }}
                        className={`p-2 rounded-xl border text-center font-mono text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? STATUS_CONFIG[st].activeButtonClass
                            : 'bg-[#11121a] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        {STATUS_CONFIG[st].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rewards Configuration */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-zinc-800 space-y-2.5">
                <span className="font-bold text-white block">Награды за выполнение:</span>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Кредиты (Монеты):</label>
                    <input
                      type="number"
                      min={0}
                      value={editingTask.rewardCredits || 0}
                      onChange={e => setEditingTask({ ...editingTask, rewardCredits: Number(e.target.value) })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Опыт (XP):</label>
                    <input
                      type="number"
                      min={0}
                      value={editingTask.rewardXp || 0}
                      onChange={e => setEditingTask({ ...editingTask, rewardXp: Number(e.target.value) })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Клановые очки (Clan Points):</label>
                    <input
                      type="number"
                      min={0}
                      disabled={editingTask.type !== 'clan'}
                      value={editingTask.clanPoints || 0}
                      onChange={e => setEditingTask({ ...editingTask, clanPoints: Number(e.target.value) })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs disabled:opacity-40"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Наградной предмет из каталога (опционально):</label>
                  <select
                    value={editingTask.rewardItemId || ''}
                    onChange={e => {
                      const item = ALL_GAME_ITEMS[e.target.value];
                      setEditingTask({
                        ...editingTask,
                        rewardItemId: e.target.value || undefined,
                        rewardItemName: item ? item.name : undefined
                      });
                    }}
                    className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="">Без предмета (только кредиты / XP)</option>
                    {ITEMS_LIST.map(it => (
                      <option key={it.id} value={it.id}>{it.icon} {it.name} ({it.cost} кр)</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Repeatability */}
              <div>
                <label className="font-bold text-zinc-300 block mb-1">Повторяемый цикл (Репитивность):</label>
                <select
                  value={editingTask.repeatCycle || 'none'}
                  onChange={e => setEditingTask({ 
                    ...editingTask, 
                    repeatCycle: e.target.value as RepeatCycle,
                    isRepeatable: e.target.value !== 'none'
                  })}
                  className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs"
                >
                  <option value="none">Без повторения (Однократно)</option>
                  <option value="daily">Ежедневно (Daily)</option>
                  <option value="weekly">Еженедельно (Weekly)</option>
                  <option value="monthly">Ежемесячно (Monthly)</option>
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-zinc-850 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setIsTaskModalOpen(false); setEditingTask(null); }}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleSaveTask(editingTask)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-950/50 cursor-pointer"
              >
                Сохранить задачу
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT EVENT ================= */}
      {isEventModalOpen && editingEvent && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-3xl bg-[#131422] border border-zinc-800 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-amber-400" />
                <h4 className="text-base font-bold text-white">
                  {editingEvent.id ? 'Настройка ивента' : 'Создать новый ивент'}
                </h4>
              </div>
              <button 
                onClick={() => { setIsEventModalOpen(false); setEditingEvent(null); }}
                className="p-1 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Event Type & Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-zinc-300 block mb-1">Название ивента:</label>
                  <input
                    type="text"
                    value={editingEvent.title || ''}
                    onChange={e => setEditingEvent({ ...editingEvent, title: e.target.value })}
                    placeholder="Например: Битва Синдикатов"
                    className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 block mb-1">Тип ивента:</label>
                  <select
                    value={editingEvent.type || 'general'}
                    onChange={e => setEditingEvent({ ...editingEvent, type: e.target.value as any })}
                    className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    <option value="general">🌟 Общий городской ивент</option>
                    <option value="clan">🛡️ Клановый сезон (WoT Blitz)</option>
                  </select>
                </div>
              </div>

              {/* Icon selector with emoji palette */}
              <div>
                <label className="font-bold text-zinc-300 block mb-1.5">Иконка ивента:</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={editingEvent.icon || '🏆'}
                    onChange={e => setEditingEvent({ ...editingEvent, icon: e.target.value })}
                    className="w-14 text-center bg-[#11121a] border border-zinc-750 rounded-xl py-1.5 text-lg"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    {EVENT_PRESET_ICONS.map(ic => (
                      <button
                        type="button"
                        key={ic}
                        onClick={() => { sounds.playTick(); setEditingEvent({ ...editingEvent, icon: ic }); }}
                        className={`w-8 h-8 rounded-lg border text-sm flex items-center justify-center transition-all cursor-pointer ${
                          editingEvent.icon === ic ? 'bg-amber-600 border-amber-400' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="font-bold text-zinc-300 block mb-1">Описание ивента для игроков:</label>
                <textarea
                  rows={2}
                  value={editingEvent.description || ''}
                  onChange={e => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  placeholder="Выполняйте клановые задачи, зарабатывайте Clan Points и забирайте этапы наград..."
                  className="w-full bg-[#11121a] border border-zinc-750 rounded-xl p-3 text-white text-xs focus:border-amber-500"
                />
              </div>

              {/* Timeline Selection with Presets */}
              <div className="p-4 rounded-2xl bg-black/40 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-white flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Период активности (Таймлайн ивента):</span>
                  </label>
                  <span className="text-[11px] text-amber-300 font-mono font-bold">
                    {calculateDurationText(editingEvent.startsAt, editingEvent.endsAt)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Дата и время старта:</label>
                    <input
                      type="datetime-local"
                      value={editingEvent.startsAt ? editingEvent.startsAt.slice(0, 16) : ''}
                      onChange={e => setEditingEvent({ ...editingEvent, startsAt: new Date(e.target.value).toISOString() })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">Дата и время окончания:</label>
                    <input
                      type="datetime-local"
                      value={editingEvent.endsAt ? editingEvent.endsAt.slice(0, 16) : ''}
                      onChange={e => setEditingEvent({ ...editingEvent, endsAt: new Date(e.target.value).toISOString() })}
                      className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Duration Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-mono">Длительность:</span>
                  {[
                    { label: '+1 день', days: 1 },
                    { label: '+3 дня', days: 3 },
                    { label: '+7 дней (Неделя)', days: 7 },
                    { label: '+14 дней (2 Недели)', days: 14 },
                    { label: '+30 дней (Месяц)', days: 30 }
                  ].map(p => (
                    <button
                      type="button"
                      key={p.days}
                      onClick={() => applyTimelinePreset(p.days, true)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Switcher Bar */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-zinc-800 space-y-2">
                <label className="font-bold text-white block">Статус активности ивента:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['draft', 'scheduled', 'active', 'completed'] as TaskStatus[]).map(st => {
                    const isSelected = editingEvent.status === st;
                    return (
                      <button
                        type="button"
                        key={st}
                        onClick={() => { sounds.playTick(); setEditingEvent({ ...editingEvent, status: st }); }}
                        className={`p-2 rounded-xl border text-center font-mono text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? STATUS_CONFIG[st].activeButtonClass
                            : 'bg-[#11121a] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        {STATUS_CONFIG[st].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Repetition cycle */}
              <div>
                <label className="font-bold text-zinc-300 block mb-1">Повторяемый цикл (Репитивность ивента):</label>
                <select
                  value={editingEvent.repeatCycle || 'none'}
                  onChange={e => setEditingEvent({ ...editingEvent, repeatCycle: e.target.value as RepeatCycle })}
                  className="w-full bg-[#11121a] border border-zinc-750 rounded-xl px-3 py-2 text-white text-xs"
                >
                  <option value="none">Без повторения (Однократный ивент)</option>
                  <option value="daily">Ежедневно</option>
                  <option value="weekly">Еженедельно (Сезон на 7 дней)</option>
                  <option value="monthly">Ежемесячно (Месячный сезон)</option>
                </select>
              </div>

              {/* Attach tasks from archive */}
              <div className="p-4 rounded-2xl bg-black/40 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white block">Привязать задачи из архива:</span>
                  <span className="text-[11px] text-amber-400 font-mono">
                    Выбрано: {editingEvent.taskIds?.length || 0}
                  </span>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                  {tasks.map(t => {
                    const isChecked = editingEvent.taskIds?.includes(t.id);
                    return (
                      <label 
                        key={t.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-amber-950/40 border-amber-600/70 text-amber-200' : 'bg-[#12131e] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const cur = editingEvent.taskIds || [];
                              const next = isChecked ? cur.filter(id => id !== t.id) : [...cur, t.id];
                              setEditingEvent({ ...editingEvent, taskIds: next });
                            }}
                            className="rounded text-amber-600 w-4 h-4"
                          />
                          <div>
                            <div className="font-bold text-white">{t.title}</div>
                            <div className="text-[10px] text-zinc-400">{t.description}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 font-mono text-[11px]">
                          <span className="text-amber-400 font-bold">+{t.rewardCredits} кр</span>
                          {t.clanPoints > 0 && <span className="text-rose-400 ml-1">+{t.clanPoints} pts</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Clan Milestones builder if clan event (WoT Blitz) */}
              {editingEvent.type === 'clan' && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-[#16121f] to-amber-950/40 border border-rose-900/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-yellow-300" />
                        <span>Шкала этапов клана (WoT Blitz Milestones)</span>
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        Настройте пороги Clan Points и ценность призов (от 5 до 10 этапов)
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sounds.playTick();
                        const cur = editingEvent.clanMilestones || [];
                        const nextStage = cur.length + 1;
                        const lastPoints = cur.length > 0 ? cur[cur.length - 1].pointsRequired : 0;
                        const newM: ClanMilestone = {
                          stage: nextStage,
                          pointsRequired: lastPoints + 150,
                          rewardCredits: nextStage * 300,
                          title: `Этап ${nextStage}`,
                          icon: '🎁',
                          description: 'Награда за открытие этапа'
                        };
                        setEditingEvent({ ...editingEvent, clanMilestones: [...cur, newM] });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs cursor-pointer shadow-md"
                    >
                      + Добавить этап
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                    {(editingEvent.clanMilestones || []).map((m, idx) => (
                      <div key={m.stage} className="p-3 rounded-xl bg-black/60 border border-zinc-800 flex items-center gap-2.5 text-xs flex-wrap sm:flex-nowrap">
                        <span className="font-mono font-bold text-amber-400 w-16 shrink-0">Этап {m.stage}</span>
                        
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-zinc-500 font-mono block">Порог очков</span>
                          <input
                            type="number"
                            placeholder="Очки"
                            value={m.pointsRequired}
                            onChange={e => {
                              const cur = [...(editingEvent.clanMilestones || [])];
                              cur[idx].pointsRequired = Number(e.target.value);
                              setEditingEvent({ ...editingEvent, clanMilestones: cur });
                            }}
                            className="w-24 bg-[#11121c] border border-zinc-700 rounded-lg px-2 py-1 text-white font-mono text-xs"
                          />
                        </div>

                        <div className="space-y-0.5">
                          <span className="text-[10px] text-zinc-500 font-mono block">Кредиты</span>
                          <input
                            type="number"
                            placeholder="Кредиты"
                            value={m.rewardCredits}
                            onChange={e => {
                              const cur = [...(editingEvent.clanMilestones || [])];
                              cur[idx].rewardCredits = Number(e.target.value);
                              setEditingEvent({ ...editingEvent, clanMilestones: cur });
                            }}
                            className="w-24 bg-[#11121c] border border-zinc-700 rounded-lg px-2 py-1 text-white font-mono text-xs"
                          />
                        </div>

                        <div className="flex-1 space-y-0.5">
                          <span className="text-[10px] text-zinc-500 font-mono block">Название</span>
                          <input
                            type="text"
                            placeholder="Название"
                            value={m.title}
                            onChange={e => {
                              const cur = [...(editingEvent.clanMilestones || [])];
                              cur[idx].title = e.target.value;
                              setEditingEvent({ ...editingEvent, clanMilestones: cur });
                            }}
                            className="w-full bg-[#11121c] border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            sounds.playTick();
                            const cur = (editingEvent.clanMilestones || []).filter((_, i) => i !== idx);
                            // reindex stages
                            const reindexed = cur.map((item, i) => ({ ...item, stage: i + 1 }));
                            setEditingEvent({ ...editingEvent, clanMilestones: reindexed });
                          }}
                          className="p-1.5 rounded-lg hover:bg-rose-950 text-zinc-500 hover:text-rose-400 cursor-pointer self-end mb-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-zinc-850 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => { setIsEventModalOpen(false); setEditingEvent(null); }}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleSaveEvent(editingEvent)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-950/50 cursor-pointer"
              >
                Сохранить и применить ивент
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
