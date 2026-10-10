import React, { useState } from 'react';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { AlertCircle, Loader2 } from 'lucide-react';
import { sounds } from '../utils/audio';
import { GangsterIcon } from './GangsterIcon';
import noirLobbyBg from '../assets/images/noir_mafia_lobby_bg_1791204529068.jpg';

import { UserInventoryItem } from '../data/items';

export interface MatchRecord {
  id: string;
  playedAt: string;
  role: string;
  roleName: string;
  team: 'civilians' | 'mafia' | 'maniac';
  won: boolean;
  survived: boolean;
  survivalSeconds: number;
  roundsSurvived: number;
  ratingChange: number;
  creditsEarned: number;
  xpEarned?: number;
  xpBreakdown?: Array<{ reason: string; xp: number }>;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
  createdAt: string;
  credits?: number;
  xp?: number;
  level?: number;
  inventory?: UserInventoryItem[];
  role?: 'admin' | 'user';
  isAdmin?: boolean;
  isBanned?: boolean;
  equippedCosmetics?: {
    cardBack?: string;
    title?: string;
  };
  dailyBonusStreak?: number;
  lastDailyBonusClaim?: string;
  clanId?: string | null;
  clanName?: string | null;
  clanTag?: string | null;
  clanRole?: 'leader' | 'member' | null;
  matchHistory?: MatchRecord[];
  stats?: {
    gamesPlayed: number;
    gamesWon: number;
    rating: number;
    mafiaWins: number;
    civilianWins: number;
    totalSurvivalSeconds?: number;
    averageSurvivalSeconds?: number;
    roleStats?: Record<string, {
      role: string;
      roleName: string;
      games: number;
      wins: number;
      survivedCount: number;
      totalSurvivalSeconds: number;
    }>;
  };
}

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSuccess: (user: AuthUser, token?: string) => void;
  initialTab?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialTab = 'login'
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register' | 'forgot'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Заполните email и пароль.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка авторизации');
      }

      sounds.playTick();
      onSuccess(data.user, data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось войти.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Заполните email и пароль.');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка регистрации');
      }

      sounds.playTick();
      onSuccess(data.user, data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось зарегистрироваться.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Заполните email и новый пароль.');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка сброса пароля');
      }

      sounds.playTick();
      onSuccess(data.user, data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить пароль.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      
      // Save/sync with backend
      const res = await fetch('/api/auth/sync-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Игрок',
          photoUrl: fbUser.photoURL
        })
      });

      // Also ensure doc in Firestore
      try {
        const userRef = doc(db, 'users', fbUser.uid);
        await setDoc(userRef, {
          id: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.displayName || 'Игрок',
          createdAt: new Date().toISOString(),
          gamesPlayed: 0,
          gamesWon: 0,
          rating: 1200
        }, { merge: true });
      } catch (firestoreErr) {
        console.warn('Firestore user doc sync note:', firestoreErr);
      }

      if (res.ok) {
        const data = await res.json();
        sounds.playTick();
        onSuccess(data.user, data.token);
      } else {
        // Fallback user object
        const fallbackUser: AuthUser = {
          id: fbUser.uid,
          email: fbUser.email || '',
          displayName: fbUser.displayName || 'Игрок',
          avatarSeed: fbUser.displayName || fbUser.uid,
          createdAt: new Date().toISOString(),
          stats: {
            gamesPlayed: 0,
            gamesWon: 0,
            rating: 1200,
            mafiaWins: 0,
            civilianWins: 0
          }
        };
        onSuccess(fallbackUser);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка входа через Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-cover bg-center select-none animate-in fade-in duration-200 overflow-x-hidden"
      style={{ backgroundImage: `url(${noirLobbyBg})` }}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-xs" />
      <div className="relative z-10 w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[#13151b] border-0 md:border md:border-zinc-800 rounded-none md:rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        
        {/* Left Side: Welcome & Branding Banner (Exact visual replica of screenshot) */}
        <div className="p-8 sm:p-10 flex flex-col justify-between border-b md:border-b-0 md:border-r border-zinc-850 bg-gradient-to-b from-[#181a22] to-[#12141a]">
          {/* Logo & Tag */}
          <div>
            <div className="flex flex-col items-start gap-2">
              <GangsterIcon size={56} className="w-14 h-14 shrink-0 drop-shadow-xl" />
              <span className="text-[12px] font-mono tracking-widest uppercase text-white font-bold mt-1">
                MAFIA GAME
              </span>
            </div>

            {/* Welcome Heading */}
            <div className="mt-14 space-y-3">
              <h2 className="text-3xl sm:text-4xl font-sans font-bold text-white tracking-tight leading-tight">
                Добро пожаловать
              </h2>
              <p className="text-sm text-zinc-400 font-light leading-relaxed">
                Создайте аккаунт или войдите, чтобы продолжить.
              </p>
            </div>
          </div>

          {/* Bottom badge pill */}
          <div className="mt-10">
            <div className="inline-flex items-center px-5 py-2.5 rounded-full bg-[#1c1f27] border border-zinc-700/60 text-xs text-zinc-300 font-medium">
              Игра начинается с первого хода
            </div>
          </div>
        </div>

        {/* Right Side: Auth Form (Exact visual replica of screenshot) */}
        <div className="p-8 sm:p-10 flex flex-col justify-between space-y-6 bg-[#13151b]">
          <div>
            {/* Heading & Subtitle */}
            <div className="space-y-1">
              <h3 className="text-2xl sm:text-3xl font-sans font-bold text-white tracking-tight">
                {activeTab === 'login' ? 'Вход в игру' : activeTab === 'register' ? 'Регистрация' : 'Сброс пароля'}
              </h3>
              <p className="text-xs text-zinc-400">
                {activeTab === 'forgot' ? 'Задайте новый пароль для вашей учётной записи.' : 'Ваш стол уже ждёт.'}
              </p>
            </div>

            {/* Segmented Control Tabs */}
            {activeTab !== 'forgot' && (
              <div className="mt-5 p-1 bg-[#1a1c22] rounded-xl flex gap-1 border border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'login'
                      ? 'bg-[#2b221f] text-white border border-amber-800/70 shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Вход
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'register'
                      ? 'bg-[#2b221f] text-white border border-amber-800/70 shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Регистрация
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            {activeTab === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="player@example.com"
                    className="w-full bg-[#f1f5f9] text-zinc-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium placeholder-zinc-400"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-300">
                      Пароль
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('forgot');
                        setError(null);
                      }}
                      className="text-[11px] text-amber-500 hover:text-amber-400 hover:underline transition-colors"
                    >
                      Забыли пароль?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#181a22] border border-amber-900/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 placeholder-zinc-500 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 rounded-xl bg-[#ea580c] hover:bg-[#f97316] text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Войти</span>}
                </button>
              </form>
            ) : activeTab === 'register' ? (
              <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="player@example.com"
                    className="w-full bg-[#f1f5f9] text-zinc-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium placeholder-zinc-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Пароль
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      minLength={6}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#181a22] border border-amber-900/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Повтор пароля
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      minLength={6}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#181a22] border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-zinc-400">
                  * Никнейм будет сгенерирован автоматически. Вы сможете изменить его в профиле в любой момент.
                </p>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 rounded-xl bg-[#ea580c] hover:bg-[#f97316] text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Зарегистрироваться</span>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                    Email аккаунта
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="player@example.com"
                    className="w-full bg-[#f1f5f9] text-zinc-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium placeholder-zinc-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Новый пароль
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      minLength={6}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#181a22] border border-amber-900/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1.5">
                      Повтор нового пароля
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      minLength={6}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#181a22] border border-zinc-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 rounded-xl bg-[#ea580c] hover:bg-[#f97316] text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Обновить пароль и войти</span>}
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('login');
                      setError(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    ← Вернуться ко входу
                  </button>
                </div>
              </form>
            )}

            {/* Or Google Sign-In */}
            <div className="mt-4 pt-4 border-t border-zinc-850">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#1a1c24] hover:bg-[#20232c] border border-zinc-700/60 text-xs font-medium text-zinc-200 transition-colors flex items-center justify-center gap-2.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Войти через Google</span>
              </button>
            </div>
          </div>

          {/* Footer note */}
          {onClose && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Продолжить как гость
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
