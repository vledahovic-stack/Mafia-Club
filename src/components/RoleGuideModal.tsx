import React, { useState, useEffect } from 'react';
import { 
  X, 
  Crown, 
  Skull, 
  ShieldAlert, 
  HeartPulse, 
  Sparkles, 
  Flame, 
  Users, 
  Shield, 
  BookOpen, 
  CheckCircle2, 
  Trophy, 
  Zap, 
  Lightbulb, 
  Moon, 
  Sun,
  Target
} from 'lucide-react';
import { RoleId, Team } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { sounds } from '../utils/audio';

interface RoleGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignedRole?: RoleId;
}

const ALL_ROLES: RoleId[] = [
  'civilian',
  'sheriff',
  'doctor',
  'courtesan',
  'bodyguard',
  'mafia',
  'don',
  'maniac'
];

export const RoleGuideModal: React.FC<RoleGuideModalProps> = ({
  isOpen,
  onClose,
  assignedRole = 'civilian'
}) => {
  const [selectedRole, setSelectedRole] = useState<RoleId>(assignedRole);

  // Sync selected role when modal opens or assignedRole changes
  useEffect(() => {
    if (isOpen) {
      setSelectedRole(assignedRole);
    }
  }, [isOpen, assignedRole]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentRole = ROLE_DEFINITIONS[selectedRole] || ROLE_DEFINITIONS.civilian;
  const isAssigned = selectedRole === assignedRole;

  const getTeamName = (team: Team) => {
    switch (team) {
      case 'civilians':
        return 'Мирные жители';
      case 'mafia':
        return 'Преступный синдикат (Мафия)';
      case 'maniac':
        return 'Одиночный убийца (Маньяк)';
    }
  };

  const getTeamColorBadge = (team: Team) => {
    switch (team) {
      case 'civilians':
        return 'bg-blue-950/80 text-blue-300 border-blue-700/60';
      case 'mafia':
        return 'bg-rose-950/80 text-rose-300 border-rose-700/60';
      case 'maniac':
        return 'bg-purple-950/80 text-purple-300 border-purple-700/60';
    }
  };

  const renderRoleIcon = (roleId: RoleId, sizeClass = 'w-6 h-6') => {
    switch (roleId) {
      case 'don':
        return <Crown className={sizeClass} />;
      case 'mafia':
        return <Skull className={sizeClass} />;
      case 'sheriff':
        return <ShieldAlert className={sizeClass} />;
      case 'doctor':
        return <HeartPulse className={sizeClass} />;
      case 'courtesan':
        return <Sparkles className={sizeClass} />;
      case 'maniac':
        return <Flame className={sizeClass} />;
      case 'civilian':
        return <Users className={sizeClass} />;
      case 'bodyguard':
        return <Shield className={sizeClass} />;
    }
  };

  const getPriorityLabel = (priority: number, nightAction: boolean) => {
    if (!nightAction) {
      return { text: 'Ночью спит (нет ночного хода)', color: 'text-zinc-400 border-zinc-700 bg-zinc-900/60' };
    }
    if (priority === 1) {
      return { text: 'Приоритет №1: Блокирует действия до выстрелов и проверок', color: 'text-pink-300 border-pink-700/70 bg-pink-950/60' };
    }
    if (priority === 2) {
      return { text: 'Приоритет №2: Выстрелы мафии и охота маньяка', color: 'text-rose-300 border-rose-700/70 bg-rose-950/60' };
    }
    if (priority === 3) {
      return { text: 'Приоритет №3: Ночной допрос и следствие шерифа', color: 'text-amber-300 border-amber-700/70 bg-amber-950/60' };
    }
    if (priority === 4) {
      return { text: 'Приоритет №4: Медицинская помощь доктора и охрана', color: 'text-emerald-300 border-emerald-700/70 bg-emerald-950/60' };
    }
    return { text: `Приоритет №${priority}`, color: 'text-zinc-300 border-zinc-700 bg-zinc-900/60' };
  };

  const priorityInfo = getPriorityLabel(currentRole.nightPriority, currentRole.nightAction);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-[#0f1017] border border-zinc-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-850 px-5 py-3.5 bg-[#141520]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-sans text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Справочник и гайд по ролям</span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Условия победы, специальные способности и тактика
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Roles Quick Switcher Bar */}
        <div className="bg-[#12131d] border-b border-zinc-850 px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          {ALL_ROLES.map(roleKey => {
            const roleDef = ROLE_DEFINITIONS[roleKey];
            const isCurrent = selectedRole === roleKey;
            const isUserRole = roleKey === assignedRole;

            return (
              <button
                key={roleKey}
                onClick={() => {
                  sounds.playTick();
                  setSelectedRole(roleKey);
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all flex-shrink-0 ${
                  isCurrent
                    ? 'bg-gradient-to-r from-zinc-800 to-zinc-750 text-white border ring-1 shadow-sm'
                    : 'bg-[#181926] text-zinc-400 hover:text-zinc-200 hover:bg-[#202232] border border-zinc-850'
                }`}
                style={{
                  borderColor: isCurrent ? `${roleDef.color}90` : undefined,
                  boxShadow: isCurrent ? `0 0 12px ${roleDef.color}30` : undefined
                }}
              >
                <span style={{ color: roleDef.color }}>
                  {renderRoleIcon(roleKey, 'w-3.5 h-3.5')}
                </span>
                <span>{roleDef.name}</span>
                {isUserRole && (
                  <span className="text-[9px] font-mono px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded font-bold">
                    ВЫ
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-zinc-300 scrollbar-thin">
          
          {/* Main Role Banner */}
          <div 
            className="p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden"
            style={{
              backgroundColor: `${currentRole.color}0c`,
              borderColor: `${currentRole.color}40`
            }}
          >
            <div className="flex items-center gap-3.5">
              <div 
                className="w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg flex-shrink-0"
                style={{
                  backgroundColor: `${currentRole.color}20`,
                  borderColor: `${currentRole.color}60`,
                  color: currentRole.color
                }}
              >
                {renderRoleIcon(selectedRole, 'w-7 h-7')}
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-sans font-black text-white" style={{ color: currentRole.color }}>
                    {currentRole.name}
                  </h2>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getTeamColorBadge(currentRole.team)}`}>
                    {getTeamName(currentRole.team)}
                  </span>
                  {isAssigned && (
                    <span className="text-[10px] uppercase font-mono font-black px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 animate-pulse">
                      ★ ВАША РОЛЬ В ЭТОЙ ИГРЕ
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans max-w-lg">
                  {currentRole.description}
                </p>
              </div>
            </div>
          </div>

          {/* Section 1: Win Condition & Main Objective */}
          <div className="p-4 rounded-2xl bg-[#141520] border border-zinc-800/80 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Условия победы и главная цель</span>
            </div>
            
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs leading-relaxed text-amber-200">
              <strong className="font-bold text-white block mb-0.5">Условие победы:</strong>
              {currentRole.winCondition || 'Достичь поставленной цели команды.'}
            </div>

            {currentRole.objective && (
              <div className="p-3 rounded-xl bg-[#181926] border border-zinc-800 text-xs leading-relaxed text-zinc-300 flex items-start gap-2">
                <Target className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-medium text-white block mb-0.5">Тактическая задача:</strong>
                  {currentRole.objective}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Special Abilities & Mechanics */}
          <div className="p-4 rounded-2xl bg-[#141520] border border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider">
                <Zap className="w-4 h-4 text-sky-400" />
                <span>Особые способности и ночная механика</span>
              </div>
              <div className={`text-[10px] font-mono px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 ${priorityInfo.color}`}>
                <Moon className="w-3 h-3" />
                <span>{priorityInfo.text}</span>
              </div>
            </div>

            {/* Abilities List */}
            <div className="space-y-2">
              {(currentRole.specialAbilities || [
                currentRole.actionPrompt || 'Принимайте активное участие в дневных дискуссиях и голосованиях.'
              ]).map((ability, idx) => (
                <div 
                  key={idx}
                  className="p-3 rounded-xl bg-[#171824] border border-zinc-800/90 text-xs text-zinc-200 flex items-start gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{ability}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Pro Tips & Strategy */}
          {currentRole.tips && currentRole.tips.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#141520] border border-zinc-800/80 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                <Lightbulb className="w-4 h-4 text-emerald-400" />
                <span>Тактические советы и стратегия победы</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {currentRole.tips.map((tip, idx) => (
                  <div 
                    key={idx}
                    className="p-2.5 rounded-xl bg-emerald-950/15 border border-emerald-900/30 text-xs text-emerald-200/90 flex items-start gap-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="border-t border-zinc-850 px-5 py-3.5 bg-[#141520] flex items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-400 hidden sm:block">
            Подсказка: нажимайте на вкладки ролей вверху для просмотра других персонажей
          </div>
          <button
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
          >
            <span>Понятно, к игре!</span>
          </button>
        </div>

      </div>
    </div>
  );
};
