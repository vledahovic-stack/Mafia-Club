import React from 'react';
import { Player, GamePhase, RoleId } from '../types/mafia';
import { ROLE_DEFINITIONS } from '../data/roles';
import { GangsterIcon } from './GangsterIcon';
import { Skull, Crown, Shield, HeartPulse, Sparkles, Flame, Users, Gavel, Check, Flag } from 'lucide-react';
import { sounds } from '../utils/audio';

interface GameTableProps {
  players: Player[];
  myId: string;
  phase: GamePhase;
  nominatedPlayerIds: string[];
  onNominatePlayer: (playerId: string) => void;
  onVotePlayer: (targetId: string | 'skip') => void;
  anonymousVoting: boolean;
  onReportPlayer?: (player: Player) => void;
}

export const GameTable: React.FC<GameTableProps> = ({
  players,
  myId,
  phase,
  nominatedPlayerIds,
  onNominatePlayer,
  onVotePlayer,
  anonymousVoting,
  onReportPlayer
}) => {
  const me = players.find(p => p.id === myId);
  const isMeAlive = me?.isAlive ?? false;

  const handleNominate = (targetId: string) => {
    onNominatePlayer(targetId);
    sounds.playGavel();
  };

  const handleVote = (targetId: string | 'skip') => {
    onVotePlayer(targetId);
    sounds.playGavel();
  };

  // Tally votes if in voting phase
  const voteTallies: Record<string, number> = {};
  let skipVoteCount = 0;
  players.forEach(p => {
    if (p.votedFor === 'skip') {
      skipVoteCount++;
    } else if (p.votedFor) {
      voteTallies[p.votedFor] = (voteTallies[p.votedFor] || 0) + 1;
    }
  });

  return (
    <div className="w-full space-y-4 select-none">
      
      {/* Voting Phase Actions Banner */}
      {phase === 'VOTING' && isMeAlive && (
        <div className="p-4 bg-[#14151f] border border-amber-900/60 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/60 flex items-center justify-center text-amber-400">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-sans font-bold text-white uppercase tracking-wider">
                Городской трибунал: Голосование
              </h4>
              <p className="text-xs text-zinc-400">
                {me?.votedFor
                  ? me.votedFor === 'skip'
                    ? 'Вы воздержались от голосования'
                    : `Ваш выбор: ${players.find(p => p.id === me.votedFor)?.name}`
                  : 'Выберите кандидата на казнь или воздержитесь:'}
              </p>
            </div>
          </div>

          <button
            onClick={() => handleVote('skip')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
              me?.votedFor === 'skip'
                ? 'bg-zinc-800 border-amber-500 text-amber-300 ring-2 ring-amber-500/30'
                : 'bg-[#181924] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            Воздержаться ({skipVoteCount})
          </button>
        </div>
      )}

      {/* Players Grid Table */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {players.map((player, index) => {
          const isMe = player.id === myId;
          const isNominated = nominatedPlayerIds.includes(player.id);
          const votesForThisPlayer = voteTallies[player.id] || 0;
          const roleDef = player.role ? ROLE_DEFINITIONS[player.role] : null;

          return (
            <div
              key={player.id}
              className={`relative rounded-2xl border p-3.5 flex flex-col justify-between transition-all duration-200 ${
                !player.isAlive
                  ? 'bg-[#0f1015]/60 border-zinc-900 opacity-55'
                  : isNominated
                  ? 'bg-[#181318] border-rose-600/80 shadow-lg shadow-rose-950/30'
                  : 'bg-[#13141a] border-zinc-800/80 hover:border-zinc-700'
              } ${isMe ? 'ring-1 ring-amber-500/60' : ''}`}
            >
              {/* Player Top Meta */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold text-amber-500">#{index + 1}</span>
                    <span className={`w-2 h-2 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {player.isHost && (
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                        <Crown className="w-3 h-3" /> Ведущий
                      </span>
                    )}
                    {player.isBot && (
                      <span className="text-[9px] text-zinc-400 font-mono bg-zinc-900 px-1.5 py-0.5 rounded">
                        БОТ
                      </span>
                    )}
                    {!isMe && onReportPlayer && (
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playTick();
                          onReportPlayer(player);
                        }}
                        title="Пожаловаться на игрока"
                        className="p-1 rounded-md bg-zinc-850 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-400 transition-colors"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Avatar & Name */}
                <div className="flex flex-col items-center text-center space-y-2 py-1">
                  <div className="relative">
                    <div className={`w-13 h-13 rounded-full flex items-center justify-center border shadow-inner ${
                      !player.isAlive
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-200'
                    }`}>
                      {player.isAlive ? (
                        <GangsterIcon size={34} className="w-8 h-8" />
                      ) : (
                        <Skull className="w-7 h-7 text-rose-500" />
                      )}
                    </div>

                    {!player.isAlive && (
                      <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center text-rose-500">
                        <Skull className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  <div className="w-full">
                    <h5 className={`text-xs font-bold truncate ${!player.isAlive ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                      {player.name}
                    </h5>
                    {isMe && <span className="text-[10px] text-amber-400 font-medium">(Вы)</span>}
                  </div>
                </div>

                {/* Role badge if revealed */}
                {roleDef && (
                  <div 
                    className="mt-1.5 py-0.5 px-2 rounded-lg text-[10px] font-bold text-center border truncate font-mono"
                    style={{
                      backgroundColor: `${roleDef.color}15`,
                      borderColor: `${roleDef.color}40`,
                      color: roleDef.color
                    }}
                  >
                    {roleDef.name}
                  </div>
                )}

                {/* Nomination Badge */}
                {isNominated && (
                  <div className="mt-1.5 py-1 px-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-[10px] font-bold text-center flex items-center justify-center gap-1">
                    <Gavel className="w-3 h-3 text-rose-400" />
                    <span>НА СУДЕ</span>
                  </div>
                )}
              </div>

              {/* Action Buttons & Votes Footer */}
              <div className="mt-3 pt-2.5 border-t border-zinc-850 space-y-2">
                
                {/* Nomination Button during DAY_DISCUSSION */}
                {phase === 'DAY_DISCUSSION' && isMeAlive && player.isAlive && !isNominated && player.id !== myId && (
                  <button
                    onClick={() => handleNominate(player.id)}
                    className="w-full py-2 px-2 rounded-xl bg-[#181924] hover:bg-[#222432] border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Gavel className="w-3.5 h-3.5 text-amber-500" />
                    <span>На суд</span>
                  </button>
                )}

                {/* Voting button during VOTING */}
                {phase === 'VOTING' && isNominated && (
                  <div className="space-y-1.5">
                    {isMeAlive && (
                      <button
                        onClick={() => handleVote(player.id)}
                        className={`w-full py-2 px-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1 ${
                          me?.votedFor === player.id
                            ? 'bg-rose-600 text-white border border-rose-500 shadow-rose-950/50'
                            : 'bg-gradient-to-r from-[#b85820] to-[#8c3d12] hover:from-[#c96226] hover:to-[#9e4616] text-white border border-amber-900/60 shadow-orange-950/30'
                        }`}
                      >
                        {me?.votedFor === player.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Ваш голос</span>
                          </>
                        ) : (
                          <span>Казнить</span>
                        )}
                      </button>
                    )}

                    {/* Votes Count Tally */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 font-mono">
                      <span>Голосов:</span>
                      <span className="font-bold text-amber-400">{votesForThisPlayer}</span>
                    </div>
                  </div>
                )}

                {/* Show who player voted for if not anonymous */}
                {!anonymousVoting && phase === 'VOTING' && player.votedFor && (
                  <div className="text-[10px] text-zinc-400 text-center truncate">
                    Голос: {player.votedFor === 'skip' ? 'Воздержался' : players.find(p => p.id === player.votedFor)?.name || '...'}
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};
