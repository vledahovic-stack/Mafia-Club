import React, { useState, useEffect } from 'react';
import { 
  X, 
  Shield, 
  Users, 
  Crown, 
  Plus, 
  Search, 
  Trophy, 
  LogOut, 
  UserMinus, 
  Check, 
  AlertCircle, 
  Sparkles, 
  Flame, 
  Calendar,
  Award,
  ChevronRight
} from 'lucide-react';
import { Clan, ClanMember, CreateClanPayload } from '../types/clan';
import { AuthUser } from './AuthModal';
import { sounds } from '../utils/audio';

interface ClansModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onOpenAuth?: () => void;
  onOpenClanTasks?: () => void;
}

const CLAN_ICONS = ['👑', '🛡️', '💀', '🔥', '⚔️', '🎩', '🦅', '⚡', '🍷', '💎'];

export const ClansModal: React.FC<ClansModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenAuth,
  onOpenClanTasks
}) => {
  const [activeTab, setActiveTab] = useState<'my_clan' | 'browse' | 'create'>('browse');
  const [clansList, setClansList] = useState<Clan[]>([]);
  const [myClan, setMyClan] = useState<Clan | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create form state
  const [formData, setFormData] = useState<CreateClanPayload>({
    name: '',
    tag: '',
    description: '',
    avatarIcon: '👑'
  });

  const loadClansData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('mafia_auth_token');
      const [allRes, myRes] = await Promise.all([
        fetch(`/api/clans${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`),
        token ? fetch('/api/clans/my', { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null)
      ]);

      if (allRes.ok) {
        const allData = await allRes.json();
        setClansList(allData.clans || []);
      }

      if (myRes && myRes.ok) {
        const myData = await myRes.json();
        setMyClan(myData.clan || null);
        if (myData.clan && activeTab === 'browse' && !searchQuery) {
          setActiveTab('my_clan');
        }
      } else {
        setMyClan(null);
      }
    } catch (e) {
      console.error('Error loading clans:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadClansData();
      if (user?.clanId) {
        setActiveTab('my_clan');
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        loadClansData();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleCreateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (!formData.name.trim() || formData.name.trim().length < 3) {
      setFeedback({ type: 'error', text: 'Название клана должно содержать не менее 3 символов.' });
      return;
    }

    if (!formData.tag.trim() || formData.tag.trim().length < 2) {
      setFeedback({ type: 'error', text: 'Тег клана должен содержать от 2 до 6 символов.' });
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/clans/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при создании клана');
      }

      sounds.playGavel();
      setMyClan(data.clan);
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }

      setFeedback({ type: 'success', text: `Клан «${data.clan.name}» [${data.clan.tag}] успешно основан!` });
      setActiveTab('my_clan');
      loadClansData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при создании клана';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinClan = async (clanId: string) => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    setActionLoading(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/clans/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ clanId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при вступлении');
      }

      sounds.playTick();
      setMyClan(data.clan);
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }

      setFeedback({ type: 'success', text: `Вы успешно вступили в клан «${data.clan.name}»!` });
      setActiveTab('my_clan');
      loadClansData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при вступлении в клан';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveClan = async () => {
    if (!confirm('Вы уверены, что хотите покинуть клан?')) return;

    setActionLoading(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/clans/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка выхода из клана');
      }

      sounds.playTick();
      setMyClan(null);
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }

      setFeedback({ type: 'success', text: 'Вы покинули клан.' });
      setActiveTab('browse');
      loadClansData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при выходе из клана';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickMember = async (targetUserId: string, targetName: string) => {
    if (!confirm(`Исключить игрока ${targetName} из клана?`)) return;

    setActionLoading(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/clans/kick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при исключении игрока');
      }

      sounds.playTick();
      setMyClan(data.clan);
      setFeedback({ type: 'success', text: `Игрок ${targetName} исключён из клана.` });
      loadClansData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при исключении';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  const isLeader = myClan && user && myClan.leaderId === user.id;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-black/80 backdrop-blur-xs select-none animate-in fade-in duration-200 overflow-x-hidden"
      onClick={onClose}
    >
      <div 
        className="w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[#0f1017] border-0 md:border md:border-zinc-800 rounded-none md:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-850 px-6 py-4 bg-gradient-to-r from-[#171826] via-[#141520] to-[#12131b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white text-xl shadow-lg shadow-amber-950/40">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-sans font-black text-white text-base tracking-tight">
                  Синдикаты и Кланы
                </h3>
                {myClan && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950/80 border border-amber-600/70 text-amber-300">
                    [{myClan.tag}] {myClan.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400">
                Создавайте кланы, объединяйтесь с друзьями и поднимайте общий рейтинг
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-850 bg-[#12131d] px-6 pt-2 gap-2 text-xs font-bold">
          {myClan && (
            <button
              onClick={() => {
                sounds.playTick();
                setActiveTab('my_clan');
              }}
              className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'my_clan'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span>👑</span>
              <span>Мой Клан</span>
              <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.2 rounded text-zinc-300">
                {myClan.memberCount}
              </span>
            </button>
          )}

          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('browse');
            }}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'browse'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>📜</span>
            <span>Все Кланы ({clansList.length})</span>
          </button>

          {!myClan && (
            <button
              onClick={() => {
                sounds.playTick();
                setActiveTab('create');
              }}
              className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === 'create'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Основать Клан</span>
            </button>
          )}
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`mx-6 mt-4 p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-300'
              : 'bg-rose-950/70 border-rose-600/70 text-rose-300'
          }`}>
            {feedback.type === 'success' ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin text-zinc-300">
          
          {/* ================= TAB 1: MY CLAN ================= */}
          {activeTab === 'my_clan' && myClan && (
            <div className="space-y-5 animate-in fade-in duration-200">
              
              {/* Clan Main Card Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1b1c2b] to-[#12131d] border border-amber-500/50 relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-amber-950/20">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/50 flex items-center justify-center text-3xl shadow-inner shrink-0">
                    {myClan.avatarIcon || '👑'}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-sans font-black text-white">
                        {myClan.name}
                      </h2>
                      <span className="text-xs font-mono font-black px-2 py-0.5 rounded bg-amber-500 text-zinc-950">
                        [{myClan.tag}]
                      </span>
                      {isLeader ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 border border-amber-600/70 text-amber-300 flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5" /> Вы Лидер
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                          Участник
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                      {myClan.description || 'Синдикат честных жителей и мафиози.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:flex-col sm:items-end shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 font-mono block">Общий рейтинг:</span>
                    <span className="text-lg font-mono font-bold text-amber-400">
                      {myClan.totalRating} Elo
                    </span>
                  </div>
                  <button
                    disabled={actionLoading}
                    onClick={handleLeaveClan}
                    className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Покинуть клан</span>
                  </button>
                </div>
              </div>

              {/* Clan Event Milestones Banner (WoT Blitz Style) */}
              {onOpenClanTasks && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/70 via-[#181926] to-amber-950/50 border border-rose-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-rose-950/30">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-rose-900/80 border border-rose-600/70 flex items-center justify-center text-xl shadow-inner shrink-0">
                      🛡️
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">Клановые этапы и задачи (WoT Blitz)</h4>
                        <span className="px-1.5 py-0.2 rounded bg-rose-950 border border-rose-600 text-rose-300 font-mono text-[9px] font-bold">СЕЗОН</span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-0.5">
                        Выполняйте задачи синдиката, зарабатывайте очки клана и открывайте общие сундуки этапов!
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sounds.playTick();
                      onOpenClanTasks();
                    }}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs uppercase tracking-wider shrink-0 transition-all shadow-md shadow-rose-950/40"
                  >
                    Открыть этапы
                  </button>
                </div>
              )}

              {/* Clan Info Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-[#141520] border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Участников</span>
                  <span className="text-sm font-mono font-bold text-white mt-0.5 block">{myClan.members.length} чел.</span>
                </div>
                <div className="p-3 rounded-xl bg-[#141520] border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Лидер синдиката</span>
                  <span className="text-sm font-bold text-amber-300 mt-0.5 block truncate">{myClan.leaderName}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#141520] border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Основан</span>
                  <span className="text-xs font-mono text-zinc-300 mt-1 block">
                    {new Date(myClan.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#141520] border border-zinc-800 text-center">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Тег в игре</span>
                  <span className="text-xs font-mono font-black text-amber-400 mt-1 block">[{myClan.tag}]</span>
                </div>
              </div>

              {/* Clan Members List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span>Состав синдиката ({myClan.members.length})</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {myClan.members.map((member, idx) => {
                    const isMemberLeader = member.role === 'leader';
                    const isMemberMe = user && member.userId === user.id;

                    return (
                      <div
                        key={member.userId}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isMemberMe
                            ? 'bg-[#181926] border-amber-500/50'
                            : 'bg-[#13141d] border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono font-bold text-zinc-500 w-5">
                            #{idx + 1}
                          </span>

                          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-white shrink-0">
                            {member.displayName.slice(0, 1).toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white truncate">
                                {member.displayName}
                              </span>
                              {isMemberMe && <span className="text-[10px] text-amber-400 font-medium">(Вы)</span>}
                              {isMemberLeader && (
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-950 border border-amber-600/70 text-amber-300 flex items-center gap-0.5">
                                  <Crown className="w-2.5 h-2.5" /> Лидер
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              Вступил: {new Date(member.joinedAt).toLocaleDateString('ru-RU')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-mono font-bold text-amber-400">{member.rating}</span>
                            <span className="text-[10px] text-zinc-500 ml-1">Elo</span>
                          </div>

                          {/* Leader kick button */}
                          {isLeader && !isMemberMe && (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleKickMember(member.userId, member.displayName)}
                              title="Исключить из клана"
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-950/40 transition-colors"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* ================= TAB 2: BROWSE ALL CLANS ================= */}
          {activeTab === 'browse' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              
              {/* Search Bar */}
              <div className="flex items-center gap-2 bg-[#13141d] border border-zinc-800 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск синдиката по названию или тегу [TAG]..."
                  className="bg-transparent text-xs text-white placeholder-zinc-500 flex-1 focus:outline-none"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="text-zinc-500 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Clans Grid */}
              {loading ? (
                <div className="p-8 text-center text-xs text-zinc-400">
                  <span className="inline-block w-5 h-5 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin mb-2" />
                  <div>Загрузка каталога синдикатов...</div>
                </div>
              ) : clansList.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#13141d] border border-dashed border-zinc-800 text-center space-y-3">
                  <Shield className="w-10 h-10 text-zinc-600 mx-auto" />
                  <div className="text-sm font-bold text-zinc-300">Кланы не найдены</div>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    Вы можете стать первым и основать собственный синдикат города!
                  </p>
                  {!myClan && (
                    <button
                      onClick={() => setActiveTab('create')}
                      className="mt-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors"
                    >
                      Основать Клан
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clansList.map(clan => {
                    const isMyCurrentClan = myClan && myClan.id === clan.id;
                    const canJoin = !myClan;

                    return (
                      <div
                        key={clan.id}
                        className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${
                          isMyCurrentClan
                            ? 'bg-gradient-to-br from-[#181926] to-[#12131d] border-amber-500/70 shadow-md'
                            : 'bg-[#13141d] border-zinc-800/80 hover:border-zinc-700 hover:bg-[#151622]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-2xl shrink-0">
                              {clan.avatarIcon || '👑'}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="text-xs font-bold text-white truncate">
                                  {clan.name}
                                </h4>
                                <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded bg-amber-950 border border-amber-600/70 text-amber-300">
                                  [{clan.tag}]
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                Лидер: <strong className="text-zinc-300">{clan.leaderName}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold text-amber-400 block">
                              {clan.totalRating}
                            </span>
                            <span className="text-[9px] font-mono text-zinc-500 block">
                              {clan.memberCount} уч.
                            </span>
                          </div>
                        </div>

                        {clan.description && (
                          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                            {clan.description}
                          </p>
                        )}

                        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                          <span className="text-[10px] font-mono text-zinc-500">
                            Создан {new Date(clan.createdAt).toLocaleDateString('ru-RU')}
                          </span>

                          {isMyCurrentClan ? (
                            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>Ваш клан</span>
                            </span>
                          ) : canJoin ? (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleJoinClan(clan.id)}
                              className="px-3 py-1 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1"
                            >
                              <span>Вступить</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-zinc-500 font-medium">
                              Состоите в клане
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* ================= TAB 3: CREATE CLAN ================= */}
          {activeTab === 'create' && !myClan && (
            <form onSubmit={handleCreateClan} className="space-y-4 animate-in fade-in duration-200 max-w-xl mx-auto">
              
              <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1b1c2b] to-[#12131d] border border-amber-500/40 text-xs space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Основание нового синдиката</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Создатель клана автоматически становится его лидером. Тег клана отображается рядом с именами всех участников за игровыми столами.
                </p>
              </div>

              {/* Clan Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">
                  Название клана <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={24}
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Например: Сицилийская Семья"
                  className="w-full bg-[#13141d] border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 block">От 3 до 24 символов</span>
              </div>

              {/* Clan Tag */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">
                  Тег клана <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formData.tag}
                  onChange={e => setFormData(prev => ({ ...prev, tag: e.target.value.toUpperCase() }))}
                  placeholder="Например: DON или MAFIA"
                  className="w-full bg-[#13141d] border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white font-mono font-bold tracking-widest uppercase placeholder-zinc-500 focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 block">От 2 до 6 символов, отображается как [{formData.tag || 'TAG'}]</span>
              </div>

              {/* Icon Selector */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">
                  Эмблема синдиката
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {CLAN_ICONS.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, avatarIcon: icon }))}
                      className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border transition-all ${
                        formData.avatarIcon === icon
                          ? 'bg-amber-500/20 border-amber-400 shadow-md scale-105'
                          : 'bg-[#13141d] border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-300 block">
                  Описание / Девиз синдиката
                </label>
                <textarea
                  rows={2}
                  maxLength={150}
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Например: Мы защищаем честь семьи и никогда не сдаём своих."
                  className="w-full bg-[#13141d] border border-zinc-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none resize-none"
                />
              </div>

              {/* Live Preview */}
              <div className="p-3.5 rounded-xl bg-[#141520] border border-zinc-800 space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block">Превью отображения в игре:</span>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-lg">{formData.avatarIcon}</span>
                  <span className="font-bold text-white">
                    {formData.name || 'Название Клана'}
                  </span>
                  <span className="font-mono font-black text-amber-400 px-1.5 py-0.2 rounded bg-amber-950 border border-amber-600/70 text-[10px]">
                    [{formData.tag || 'TAG'}]
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-bold text-xs tracking-wider uppercase transition-all shadow-md flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Crown className="w-4 h-4" />
                    <span>Основать синдикат</span>
                  </>
                )}
              </button>

            </form>
          )}

        </div>

      </div>
    </div>
  );
};
