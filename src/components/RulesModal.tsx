import React, { useState } from 'react';
import { X, Shield, Skull, HeartPulse, Sparkles, Crown, Users, Flame, BookOpen } from 'lucide-react';
import { ROLE_DEFINITIONS } from '../data/roles';
import { RoleId } from '../types/mafia';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'roles'>('rules');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-rose-500" />
            <h3 className="font-serif-title text-lg font-bold text-zinc-100">
              Кодекс города и правила игры
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-6 pt-3 gap-6 text-sm">
          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Основные правила и фазы
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              activeTab === 'roles'
                ? 'border-rose-500 text-rose-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Справочник ролей
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-zinc-300">
          {activeTab === 'rules' ? (
            <div className="space-y-5">
              <section>
                <h4 className="text-zinc-100 font-semibold text-base mb-2 font-serif-title flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Цель игры
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  Жители города разделились на две непримиримые стороны: честные горожане и коварная мафия.
                  Цель <strong className="text-blue-400">Мирных жителей</strong> — вычислить и казнить всех членов мафии.
                  Цель <strong className="text-rose-400">Мафии</strong> — сравнять свою численность с мирным населением или превзойти его.
                </p>
              </section>

              <section className="space-y-3">
                <h4 className="text-zinc-100 font-semibold text-base font-serif-title flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Фазы игры
                </h4>
                <div className="space-y-2.5">
                  <div className="p-3 rounded bg-zinc-900/70 border border-zinc-800">
                    <strong className="text-amber-400 block text-xs uppercase tracking-wider mb-1">
                      1. Дневное обсуждение
                    </strong>
                    <span className="text-xs text-zinc-300 leading-relaxed block">
                      Все живые игроки открыто обсуждают подозрения, приводят логические цепочки и выводят мафию на чистую воду.
                      Любой живой гражданин может выдвинуть кандидатуру игрока на суд города.
                    </span>
                  </div>

                  <div className="p-3 rounded bg-zinc-900/70 border border-zinc-800">
                    <strong className="text-rose-400 block text-xs uppercase tracking-wider mb-1">
                      2. Городской суд (Голосование)
                    </strong>
                    <span className="text-xs text-zinc-300 leading-relaxed block">
                      Игроки голосуют за казнь одного из выставленных кандидатов либо воздерживаются. Кандидат с наибольшим числом голосов исключается из игры.
                    </span>
                  </div>

                  <div className="p-3 rounded bg-zinc-900/70 border border-zinc-800">
                    <strong className="text-blue-400 block text-xs uppercase tracking-wider mb-1">
                      3. Наступление ночи
                    </strong>
                    <span className="text-xs text-zinc-300 leading-relaxed block">
                      Город засыпает. Мафия просыпается и единогласно выбирает жертву. Шериф проверяет документы подозрительного гражданина. Доктор спешит на помощь одному из жителей.
                    </span>
                  </div>

                  <div className="p-3 rounded bg-zinc-900/70 border border-zinc-800">
                    <strong className="text-emerald-400 block text-xs uppercase tracking-wider mb-1">
                      4. Утренние вести
                    </strong>
                    <span className="text-xs text-zinc-300 leading-relaxed block">
                      Город узнаёт, кого настигла пуля бандитов, спас ли кого-то доктор, и начинается новый цикл дневных баталий.
                    </span>
                  </div>
                </div>
              </section>

              <section className="p-3.5 bg-amber-950/20 border border-amber-900/40 rounded text-xs text-amber-200/90 leading-relaxed">
                💡 <strong>Совет для победы:</strong> Обращайте внимание на то, кто за кого голосовал на прошлых кругах, кто первым выдвигал обвинения, и как реагируют игроки в стрессовых ситуациях.
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.values(ROLE_DEFINITIONS).map(role => (
                <div
                  key={role.id}
                  className="p-4 rounded border border-zinc-800 bg-zinc-900/60 flex items-start gap-3.5"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: `${role.color}15`,
                      borderColor: `${role.color}40`,
                      color: role.color
                    }}
                  >
                    {role.id === 'don' && <Crown className="w-5 h-5" />}
                    {role.id === 'mafia' && <Skull className="w-5 h-5" />}
                    {role.id === 'sheriff' && <Shield className="w-5 h-5" />}
                    {role.id === 'doctor' && <HeartPulse className="w-5 h-5" />}
                    {role.id === 'courtesan' && <Sparkles className="w-5 h-5" />}
                    {role.id === 'maniac' && <Flame className="w-5 h-5" />}
                    {role.id === 'civilian' && <Users className="w-5 h-5" />}
                    {role.id === 'bodyguard' && <Shield className="w-5 h-5" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif-title font-semibold text-zinc-100" style={{ color: role.color }}>
                        {role.name}
                      </h4>
                      <span className="text-[11px] text-zinc-400">
                        {role.team === 'mafia' ? 'Преступный синдикат' : role.team === 'maniac' ? 'Нейтральный одиночка' : 'Мирные жители'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {role.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-6 py-3.5 bg-zinc-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-xs transition-colors"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};
