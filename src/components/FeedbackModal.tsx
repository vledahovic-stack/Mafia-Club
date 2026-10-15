import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Image as ImageIcon, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  Bug, 
  Lightbulb, 
  Clock, 
  Trash2, 
  Coins, 
  History,
  MessageSquarePlus,
  Loader2
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';
import { FeedbackRecord, FeedbackType, FeedbackStatus } from '../types/feedback';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: AuthUser | null;
  onOpenAuth?: () => void;
  onUpdateUser?: (updated: AuthUser) => void;
}

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: typeof Bug; color: string; desc: string }> = {
  bug: {
    label: 'Ошибка / Баг',
    icon: Bug,
    color: 'text-rose-400 bg-rose-950/60 border-rose-700/60',
    desc: 'Сообщите о неполадке или сбое в игре'
  },
  idea: {
    label: 'Идея / Предложение',
    icon: Lightbulb,
    color: 'text-amber-400 bg-amber-950/60 border-amber-700/60',
    desc: 'Предложите новую механику или улучшение'
  },
  improvement: {
    label: 'Улучшение баланса',
    icon: Sparkles,
    color: 'text-cyan-400 bg-cyan-950/60 border-cyan-700/60',
    desc: 'Замечания по ролям, правилам и экономике'
  },
  other: {
    label: 'Другое',
    icon: MessageSquarePlus,
    color: 'text-indigo-400 bg-indigo-950/60 border-indigo-700/60',
    desc: 'Вопросы и пожелания главному Дону'
  }
};

const STATUS_CONFIG: Record<FeedbackStatus, { label: string; color: string }> = {
  pending: { label: 'На рассмотрении', color: 'text-amber-400 bg-amber-950/60 border-amber-700/60' },
  reviewed: { label: 'Изучается', color: 'text-blue-400 bg-blue-950/60 border-blue-700/60' },
  rewarded: { label: 'Одобрено + Награда', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-700/60' },
  declined: { label: 'Отклонено', color: 'text-zinc-400 bg-zinc-900 border-zinc-700/60' },
  fixed: { label: 'Исправлено в игре', color: 'text-teal-400 bg-teal-950/60 border-teal-700/60' }
};

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  user,
  onOpenAuth,
  onUpdateUser
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // History list
  const [historyList, setHistoryList] = useState<FeedbackRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      loadHistory();
    }
  }, [isOpen, activeTab]);

  const loadHistory = async () => {
    const token = localStorage.getItem('mafia_auth_token');
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/feedback/my', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.feedbacks || []);
      }
    } catch {
      // Continue
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 3) {
      setErrorMessage('Максимум 3 скриншота.');
      return;
    }

    setErrorMessage(null);

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Пожалуйста, загружайте только изображения.');
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        setErrorMessage('Размер каждого изображения не должен превышать 4MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setImages(prev => [...prev.slice(0, 2), result]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    sounds.playTick();
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Укажите краткую тему обращения.');
      return;
    }
    if (!description.trim()) {
      setErrorMessage('Опишите суть бага или идеи подробнее.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          images
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка отправки обращения');
      }

      sounds.playGunshot();
      setSuccessMessage(data.message || 'Обращение отправлено главному Дону Города!');
      setTitle('');
      setDescription('');
      setImages([]);

      // Refresh history if opened later
      setTimeout(() => {
        setSuccessMessage(null);
        setActiveTab('history');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка отправки';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-black/85 backdrop-blur-xs select-none overflow-x-hidden animate-in fade-in duration-200">
      
      {/* Container: 65vw & 98vh on desktop, 100% on mobile */}
      <div className="relative w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[#0d0e13]/95 border-0 md:border md:border-zinc-800/90 rounded-none md:rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col backdrop-blur-md">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-850 flex items-center justify-between bg-[#111218]/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white text-xl shadow-lg shadow-amber-950/50">
              💡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-sans font-bold text-base text-white tracking-wide uppercase">
                  Связь с Администратором
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/60 text-amber-300 font-mono text-[10px] font-bold">
                  НАГРАДА КРЕДИТАМИ
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Сообщите о баге или предложите идею. За ценный вклад Дон начисляет валюту на баланс.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-zinc-850 bg-[#12131c] px-6 pt-3 gap-6 text-xs font-bold uppercase tracking-wider shrink-0">
          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('create');
            }}
            className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'create'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>Новое обращение</span>
          </button>
          <button
            onClick={() => {
              sounds.playTick();
              setActiveTab('history');
            }}
            className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Мои обращения ({historyList.length})</span>
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-7">
          {activeTab === 'create' ? (
            <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
              
              {/* Type selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Тип обращения:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(TYPE_CONFIG) as FeedbackType[]).map(t => {
                    const cfg = TYPE_CONFIG[t];
                    const Icon = cfg.icon;
                    const isSelected = type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          sounds.playTick();
                          setType(t);
                        }}
                        className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                          isSelected
                            ? 'bg-[#181926] border-amber-500 shadow-md shadow-amber-950/30'
                            : 'bg-[#13141d] border-zinc-850 hover:border-zinc-700'
                        }`}
                      >
                        <div className={`p-2 rounded-lg border ${cfg.color} shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-bold ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                            {cfg.label}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                            {cfg.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Тема / Краткая суть:
                </label>
                <input
                  type="text"
                  value={title}
                  maxLength={120}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={type === 'bug' ? 'Например: Не срабатывает таймер ночи при 3 игроках' : 'Например: Добавить роль Журналист в городскую мафию'}
                  className="w-full bg-[#13141d] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Description input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Подробное описание:
                </label>
                <textarea
                  value={description}
                  rows={5}
                  maxLength={2500}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={
                    type === 'bug'
                      ? 'Опишите пошагово, что произошло, в каком браузере или на каком устройстве...'
                      : 'Опишите вашу идею: как это сделает игру интереснее, какие правила или награды предусмотреть...'
                  }
                  className="w-full bg-[#13141d] border border-zinc-800 rounded-xl p-4 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors leading-relaxed"
                />
                <div className="text-right text-[11px] font-mono text-zinc-500">
                  {description.length} / 2500 символов
                </div>
              </div>

              {/* Image attachment section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Скриншоты и изображения (до 3 шт):</span>
                  </label>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {images.length}/3 прикреплено
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative w-24 h-24 rounded-xl border border-zinc-700 bg-black/60 overflow-hidden group shadow-md">
                      <img src={img} alt="Вложение" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        title="Удалить скриншот"
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}

                  {images.length < 3 && (
                    <label className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-750 hover:border-amber-500 bg-[#13141d]/50 hover:bg-[#181926] flex flex-col items-center justify-center cursor-pointer transition-all text-zinc-400 hover:text-amber-400">
                      <ImageIcon className="w-5 h-5 mb-1 text-zinc-400 group-hover:text-amber-400" />
                      <span className="text-[10px] font-bold">+ Добавить</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Feedback messages */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-950/80 border border-red-700 text-red-200 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Submit button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Отправка обращения...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Отправить главному Дону</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {loadingHistory ? (
                <div className="py-16 text-center text-zinc-400 text-xs flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                  <span>Загрузка ваших обращений...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-16 text-center text-zinc-400 text-xs space-y-2">
                  <div className="text-3xl mb-1">📬</div>
                  <div className="text-white font-bold text-sm">У вас пока нет отправленных обращений</div>
                  <p className="text-zinc-500 max-w-sm mx-auto">
                    Если вы заметили ошибку в интерфейсе или механике партии, отправьте баг-репорт через вкладку «Новое обращение».
                  </p>
                </div>
              ) : (
                historyList.map(item => {
                  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                  const typeCfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.other;
                  const Icon = typeCfg.icon;

                  return (
                    <div
                      key={item.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#13141d] border border-zinc-800 space-y-3.5 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-850 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-1.5 rounded-lg border ${typeCfg.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white tracking-tight">
                              {item.title}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 ml-2">
                              #{item.id.slice(-6)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-wrap">
                        {item.description}
                      </p>

                      {/* Attached images */}
                      {item.images && item.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {item.images.map((img, i) => (
                            <a
                              key={i}
                              href={img}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-16 h-16 rounded-xl border border-zinc-750 overflow-hidden hover:opacity-80 transition-opacity"
                            >
                              <img src={img} alt="Скриншот" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Reward banner if granted */}
                      {item.rewardCredits && item.rewardCredits > 0 && (
                        <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/80 to-teal-950/80 border border-emerald-600/70 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-md">
                          <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>
                              Вам начислена награда от <strong>{item.rewardedByAdminName || 'Администратора'}</strong>:
                            </span>
                          </div>
                          <span className="font-mono font-bold text-emerald-300 text-sm">
                            +{item.rewardCredits} кр.
                          </span>
                        </div>
                      )}

                      {/* Admin response note */}
                      {item.adminNote && (
                        <div className="p-3 rounded-xl bg-[#171824] border border-zinc-800 text-xs text-zinc-300 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Ответ Администрации:
                          </div>
                          <p className="italic text-zinc-300">{item.adminNote}</p>
                        </div>
                      )}

                      <div className="text-[10px] font-mono text-zinc-500 pt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Отправлено: {new Date(item.createdAt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
