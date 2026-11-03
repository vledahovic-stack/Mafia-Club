import React, { useState } from 'react';
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
  Check, 
  ShoppingCart, 
  Sparkle, 
  HelpCircle,
  AlertCircle,
  Lock,
  Dice5
} from 'lucide-react';
import { ClientRoomState, RoleId, Team } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { getItemDefinition, ROLE_SELECT_CARD_ID } from '../data/items';
import { sounds } from '../utils/audio';
import { AuthUser } from './AuthModal';

interface RoleSelectCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomState: ClientRoomState;
  myId: string;
  user?: AuthUser | null;
  onUpdateUser?: (u: AuthUser) => void;
  onOpenShop?: () => void;
  onOpenAuth?: () => void;
  onRoleSelected?: (roleId: RoleId) => void;
}

export const RoleSelectCardModal: React.FC<RoleSelectCardModalProps> = ({
  isOpen,
  onClose,
  roomState,
  myId,
  user,
  onUpdateUser,
  onOpenShop,
  onOpenAuth,
  onRoleSelected
}) => {
  const myPlayer = roomState.players.find(p => p.id === myId);
  const currentPreferred = myPlayer?.preferredRole || 'sheriff';
  const [selectedRole, setSelectedRole] = useState<RoleId>(currentPreferred);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  // Calculate available roles for this room based on host settings and player count
  const playerCount = roomState.players.length;
  const settings = roomState.settings;

  const availableRoleIds: RoleId[] = ['civilian', 'mafia'];
  if (settings.gameMode === 'sport') {
    availableRoleIds.push('don', 'sheriff');
  } else {
    if (settings.enabledRoles.don) availableRoleIds.push('don');
    if (settings.enabledRoles.sheriff && playerCount >= 4) availableRoleIds.push('sheriff');
    if (settings.enabledRoles.doctor && playerCount >= 5) availableRoleIds.push('doctor');
    if (settings.enabledRoles.courtesan && playerCount >= 7) availableRoleIds.push('courtesan');
    if (settings.enabledRoles.maniac && playerCount >= 8) availableRoleIds.push('maniac');
    if (settings.enabledRoles.bodyguard && playerCount >= 9) availableRoleIds.push('bodyguard');
  }

  // Check card count in user inventory
  const roleCardItem = getItemDefinition(ROLE_SELECT_CARD_ID);
  const inventoryItem = user?.inventory?.find(i => i.itemId === ROLE_SELECT_CARD_ID);
  const cardsCount = inventoryItem ? inventoryItem.quantity : 0;
  const alreadyUsedInThisLobby = myPlayer?.hasUsedRoleCard === true;
  const hasCards = cardsCount > 0 || alreadyUsedInThisLobby;

  const handleConfirmSelection = async () => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (!hasCards) {
      setFeedback({
        type: 'error',
        message: 'У вас нет «Карточки выбора роли» в инвентаре. Приобретите её в Магазине.'
      });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const token = localStorage.getItem('mafia_auth_token');
      const res = await fetch('/api/room/select-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          roomCode: roomState.roomCode,
          playerId: myId,
          roleId: selectedRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при выборе роли');
      }

      sounds.playCardFlip();
      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
      if (onRoleSelected) {
        onRoleSelected(selectedRole);
      }

      setFeedback({
        type: 'success',
        message: data.message || 'Роль успешно выбрана!'
      });

      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось активировать карточку';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const renderRoleIcon = (roleId: RoleId, size = 'w-6 h-6') => {
    switch (roleId) {
      case 'don':
        return <Crown className={size} />;
      case 'mafia':
        return <Skull className={size} />;
      case 'sheriff':
        return <ShieldAlert className={size} />;
      case 'doctor':
        return <HeartPulse className={size} />;
      case 'courtesan':
        return <Sparkles className={size} />;
      case 'maniac':
        return <Flame className={size} />;
      case 'bodyguard':
        return <Shield className={size} />;
      case 'civilian':
      default:
        return <Users className={size} />;
    }
  };

  const getTeamBadge = (team: Team) => {
    switch (team) {
      case 'civilians':
        return { label: 'Мирные', color: 'bg-blue-950/70 text-blue-300 border-blue-700/60' };
      case 'mafia':
        return { label: 'Мафия', color: 'bg-rose-950/70 text-rose-300 border-rose-700/60' };
      case 'maniac':
        return { label: 'Одиночка', color: 'bg-purple-950/70 text-purple-300 border-purple-700/60' };
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--skin-bg-backdrop)] backdrop-blur-xs select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="skin-modal w-full max-w-2xl bg-[var(--skin-bg-modal)] border border-[var(--skin-border-card)] rounded-[var(--skin-radius-modal)] shadow-[var(--skin-shadow-modal)] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="skin-header flex items-center justify-between border-b border-[var(--skin-border-header)] px-5 py-4 bg-[var(--skin-bg-header)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] flex items-center justify-center text-xl shadow-[var(--skin-glow-accent)]">
              🎴
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className="font-sans font-black text-[var(--skin-text-primary)] text-base tracking-tight"
                  style={{ textShadow: 'var(--skin-text-shadow-title, none)' }}
                >
                  Карточка выбора роли
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/70 text-[var(--skin-text-accent)] font-bold">
                  {alreadyUsedInThisLobby ? 'Активна в этом лобби' : `В наличии: ${cardsCount} шт.`}
                </span>
              </div>
              <p className="text-[11px] text-[var(--skin-text-muted)]">
                Заказ желаемой роли перед началом партии
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playTick();
              onClose();
            }}
            className="p-1.5 rounded-xl text-[var(--skin-text-muted)] hover:text-[var(--skin-text-primary)] hover:bg-[var(--skin-bg-elevated)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin text-[var(--skin-text-secondary)]">
          
          {/* Rules and Competition Explanation Banner */}
          <div className="skin-card p-4 rounded-2xl bg-gradient-to-br from-[var(--skin-bg-elevated)] to-[var(--skin-bg-subcard)] border border-[var(--skin-border-accent)] space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--skin-text-accent)] uppercase tracking-wider">
              <Sparkle className="w-4 h-4 text-[var(--skin-accent-primary)]" />
              <span>Правила и механика распределения роли:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[11px] space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>🎯 100% Гарантия</span>
                </div>
                <p className="text-[var(--skin-text-muted)] leading-relaxed">
                  Если на выбранную роль претендуете только вы — вы гарантированно получите её в партии.
                </p>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[11px] space-y-1">
                <div className="font-bold text-[var(--skin-text-accent)] flex items-center gap-1.5">
                  <Dice5 className="w-3.5 h-3.5" />
                  <span>Рандом при споре</span>
                </div>
                <p className="text-[var(--skin-text-muted)] leading-relaxed">
                  Если 2 или более игроков выбрали одну роль, она разыгрывается между ними случайно.
                </p>
              </div>

              <div className="skin-subcard p-2.5 rounded-xl bg-[var(--skin-bg-card)] border border-[var(--skin-border-base)] text-[11px] space-y-1">
                <div className="font-bold text-rose-400 flex items-center gap-1.5">
                  <span>🔥 Одноразовый расход</span>
                </div>
                <p className="text-[var(--skin-text-muted)] leading-relaxed">
                  Карточка расходуется при использовании. В случае поражения в рандоме карта не возвращается.
                </p>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {feedback && (
            <div className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-600/70 text-emerald-300'
                : 'bg-rose-950/60 border-rose-600/70 text-rose-300'
            }`}>
              {feedback.type === 'success' ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Role Selection Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-[var(--skin-text-secondary)]">
                Доступные роли в этой комнате ({availableRoleIds.length}):
              </span>
              <span className="text-[var(--skin-text-muted)] text-[11px]">
                Нажмите на роль для выбора
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {availableRoleIds.map(roleId => {
                const def = ROLE_DEFINITIONS[roleId];
                if (!def) return null;

                const isSelected = selectedRole === roleId;
                const teamBadge = getTeamBadge(def.team);

                return (
                  <div
                    key={roleId}
                    onClick={() => {
                      sounds.playTick();
                      setSelectedRole(roleId);
                    }}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between space-y-2 relative ${
                      isSelected
                        ? 'bg-gradient-to-br from-[var(--skin-bg-elevated)] to-[var(--skin-bg-card)] shadow-md'
                        : 'skin-subcard bg-[var(--skin-bg-subcard)] border-[var(--skin-border-base)] hover:border-[var(--skin-border-strong)] hover:bg-[var(--skin-bg-elevated)]'
                    }`}
                    style={{
                      borderColor: isSelected ? `${def.color}` : undefined,
                      boxShadow: isSelected ? `0 0 16px ${def.color}35` : undefined
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center border shrink-0"
                          style={{
                            backgroundColor: `${def.color}15`,
                            borderColor: `${def.color}50`,
                            color: def.color
                          }}
                        >
                          {renderRoleIcon(roleId, 'w-5 h-5')}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-sans font-bold text-[var(--skin-text-primary)] text-xs sm:text-sm"
                              style={{ color: isSelected ? def.color : undefined }}
                            >
                              {def.name}
                            </span>
                          </div>
                          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border font-semibold ${teamBadge.color}`}>
                            {teamBadge.label}
                          </span>
                        </div>
                      </div>

                      {/* Radio indicator */}
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'border-[var(--skin-border-accent)] bg-[var(--skin-accent-primary)] text-zinc-950 shadow-sm'
                          : 'border-[var(--skin-border-strong)] bg-[var(--skin-bg-card)] text-transparent'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--skin-text-muted)] leading-snug line-clamp-2">
                      {def.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* No Cards Warning / Buy in Shop prompt */}
          {!hasCards && (
            <div className="skin-subcard p-4 rounded-2xl bg-[var(--skin-bg-subcard)] border border-[var(--skin-border-accent)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--skin-bg-elevated)] border border-[var(--skin-border-accent)] flex items-center justify-center text-[var(--skin-text-accent)] shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-[var(--skin-text-primary)]">У вас закончились Карточки выбора роли</div>
                  <div className="text-[11px] text-[var(--skin-text-muted)]">Стоимость в магазине: 250 кредитов.</div>
                </div>
              </div>

              {onOpenShop && (
                <button
                  onClick={() => {
                    sounds.playTick();
                    onOpenShop();
                  }}
                  className="skin-btn-primary w-full sm:w-auto px-4 py-2 rounded-xl border text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Купить в Магазине (250 кр)</span>
                </button>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="border-t border-[var(--skin-border-header)] px-5 py-3.5 bg-[var(--skin-bg-header)] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-[var(--skin-text-muted)] text-center sm:text-left">
            {alreadyUsedInThisLobby ? (
              <span className="text-emerald-400 font-semibold">
                ✓ Вы уже применили карту в этом лобби. Вы можете изменить выбранную роль бесплатно до старта.
              </span>
            ) : hasCards ? (
              <span>
                При подтверждении спишется 1 шт. «Карточка выбора роли».
              </span>
            ) : (
              <span className="text-[var(--skin-text-accent)]">
                Для активации необходима «Карточка выбора роли».
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                sounds.playTick();
                onClose();
              }}
              className="skin-btn-secondary flex-1 sm:flex-none px-4 py-2 rounded-xl bg-[var(--skin-btn-secondary-bg)] hover:bg-[var(--skin-btn-secondary-bg-hover)] border border-[var(--skin-btn-secondary-border)] text-[var(--skin-btn-secondary-text)] hover:text-[var(--skin-text-primary)] text-xs font-semibold transition-colors"
            >
              Отмена
            </button>

            <button
              disabled={loading || !hasCards}
              onClick={handleConfirmSelection}
              className="cyber-room-join-btn skin-btn-join flex-1 sm:flex-none px-5 py-2 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 border"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>🎴</span>
                  <span>{alreadyUsedInThisLobby ? 'Сменить выбранную роль' : 'Применить и выбрать роль'}</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
