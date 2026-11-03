import React, { useState } from 'react';
import { X, Shield, Skull, HeartPulse, Sparkles, Crown, Users, Flame, BookOpen } from 'lucide-react';
import { ROLE_DEFINITIONS } from '../data/roles';
import { RoleId } from '../types/mafia';
import { useLanguage } from '../context/LanguageContext';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'rules' | 'roles'>('rules');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-2 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs overflow-x-hidden">
      <div className="skin-modal w-full md:w-[65vw] h-full min-h-screen md:min-h-0 md:h-[98vh] bg-[var(--skin-bg-modal)] border-0 md:border md:border-[var(--skin-border-card)] rounded-none md:rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="skin-header flex items-center justify-between border-b border-[var(--skin-border-header)] px-6 py-4 bg-[var(--skin-bg-header)]">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[var(--skin-accent-primary)]" />
            <h3
              className="font-serif-title text-lg font-bold text-[var(--skin-text-primary)]"
              style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
            >
              {t('rules.modal_title', 'Кодекс города и правила игры')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-[var(--skin-border-subtle)] bg-[var(--skin-bg-subcard)] px-6 pt-3 gap-6 text-sm">
          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              activeTab === 'rules'
                ? 'border-[var(--skin-accent-primary)] text-[var(--skin-text-accent)]'
                : 'border-transparent text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)]'
            }`}
          >
            {t('rules.tab_rules', 'Основные правила и фазы')}
          </button>
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-2.5 font-medium border-b-2 transition-colors ${
              activeTab === 'roles'
                ? 'border-[var(--skin-accent-primary)] text-[var(--skin-text-accent)]'
                : 'border-transparent text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)]'
            }`}
          >
            {t('rules.tab_roles', 'Справочник ролей')}
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-[var(--skin-text-secondary)]">
          {activeTab === 'rules' ? (
            <div className="space-y-5">
              <section>
                <h4 className="text-[var(--skin-text-primary)] font-semibold text-base mb-2 font-serif-title flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Цель игры
                </h4>
                <p className="text-[var(--skin-text-secondary)] leading-relaxed">
                  Жители города разделились на две непримиримые стороны: честные горожане и коварная мафия.
                  Цель <strong className="text-blue-400">Мирных жителей</strong> — вычислить и казнить всех членов мафии.
                  Цель <strong className="text-rose-400">Мафии</strong> — сравнять свою численность с мирным населением или превзойти его.
                </p>
              </section>

              <section className="space-y-3">
                <h4 className="text-[var(--skin-text-primary)] font-semibold text-base font-serif-title flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Фазы игры
                </h4>
                <div className="space-y-2.5">
                  <div className="skin-subcard p-3 rounded bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                    <strong className="text-amber-400 block text-xs uppercase tracking-wider mb-1">
                      1. Дневное обсуждение
                    </strong>
                    <span className="text-xs text-[var(--skin-text-secondary)] leading-relaxed block">
                      Все живые игроки открыто обсуждают подозрения, приводят логические цепочки и выводят мафию на чистую воду.
                      Любой живой гражданин может выдвинуть кандидатуру игрока на суд города.
                    </span>
                  </div>

                  <div className="skin-subcard p-3 rounded bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                    <strong className="text-rose-400 block text-xs uppercase tracking-wider mb-1">
                      2. Городской суд (Голосование)
                    </strong>
                    <span className="text-xs text-[var(--skin-text-secondary)] leading-relaxed block">
                      Игроки голосуют за казнь одного из выставленных кандидатов либо воздерживаются. Кандидат с наибольшим числом голосов исключается из игры.
                    </span>
                  </div>

                  <div className="skin-subcard p-3 rounded bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                    <strong className="text-blue-400 block text-xs uppercase tracking-wider mb-1">
                      3. Наступление ночи
                    </strong>
                    <span className="text-xs text-[var(--skin-text-secondary)] leading-relaxed block">
                      Город засыпает. Мафия просыпается и единогласно выбирает жертву. Шериф проверяет документы подозрительного гражданина. Доктор спешит на помощь одному из жителей.
                    </span>
                  </div>

                  <div className="skin-subcard p-3 rounded bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-base)]">
                    <strong className="text-emerald-400 block text-xs uppercase tracking-wider mb-1">
                      4. Утренние вести
                    </strong>
                    <span className="text-xs text-[var(--skin-text-secondary)] leading-relaxed block">
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
                  className="skin-subcard p-4 rounded border border-[var(--skin-border-base)] bg-[var(--skin-bg-subcard)] flex items-start gap-3.5"
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
                      <h4 className="font-serif-title font-semibold text-[var(--skin-text-primary)]" style={{ color: role.color }}>
                        {role.name}
                      </h4>
                      <span className="text-[11px] text-[var(--skin-text-muted)]">
                        {role.team === 'mafia' ? 'Преступный синдикат' : role.team === 'maniac' ? 'Нейтральный одиночка' : 'Мирные жители'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--skin-text-secondary)] leading-relaxed">
                      {role.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--skin-border-header)] px-6 py-3.5 bg-[var(--skin-bg-header)] flex justify-end">
          <button
            onClick={onClose}
            className="skin-btn-secondary px-5 py-2 rounded bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-btn-secondary-bg-hover)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] font-medium text-xs transition-colors"
          >
            {t('common.close', 'Понятно')}
          </button>
        </div>
      </div>
    </div>
  );
};
