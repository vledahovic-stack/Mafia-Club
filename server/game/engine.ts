import { GamePhase, NightActions, NightResult, Player, RoleId, RoomSettings, RoomState, Team } from '../../src/types/mafia';

export class MafiaEngine {
  public static getAvailableRolesForRoom(settings: RoomSettings, playerCount: number): RoleId[] {
    const available: RoleId[] = ['civilian', 'mafia'];

    if (settings.gameMode === 'sport') {
      available.push('don');
      available.push('sheriff');
      return available;
    }

    if (settings.enabledRoles.don) {
      available.push('don');
    }
    if (settings.enabledRoles.sheriff && playerCount >= 4) {
      available.push('sheriff');
    }
    if (settings.enabledRoles.doctor && playerCount >= 5) {
      available.push('doctor');
    }
    if (settings.enabledRoles.courtesan && playerCount >= 7) {
      available.push('courtesan');
    }
    if (settings.enabledRoles.maniac && playerCount >= 8) {
      available.push('maniac');
    }
    if (settings.enabledRoles.bodyguard && playerCount >= 9) {
      available.push('bodyguard');
    }

    return available;
  }

  public static distributeRoles(players: Player[], settings: RoomSettings): Player[] {
    const count = players.length;
    const rolesPool: RoleId[] = [];

    // Calculate mafia count based on player count
    // Standard rule: ~1/3 of players are mafia
    let mafiaCount = 1;
    if (count >= 6 && count <= 8) mafiaCount = 2;
    else if (count >= 9 && count <= 11) mafiaCount = 3;
    else if (count >= 12) mafiaCount = 4;

    if (settings.gameMode === 'sport') {
      // Classic Sport Mafia: 1 Don, remaining mafia (up to mafiaCount), 1 Sheriff, rest Civilians
      rolesPool.push('don');
      mafiaCount--;
      for (let i = 0; i < mafiaCount; i++) {
        rolesPool.push('mafia');
      }
      rolesPool.push('sheriff');
    } else {
      // Don
      if (settings.enabledRoles.don && mafiaCount > 0) {
        rolesPool.push('don');
        mafiaCount--;
      }
      // Ordinary mafia
      for (let i = 0; i < mafiaCount; i++) {
        rolesPool.push('mafia');
      }

      // Special roles
      if (settings.enabledRoles.sheriff && count >= 4) {
        rolesPool.push('sheriff');
      }
      if (settings.enabledRoles.doctor && count >= 5) {
        rolesPool.push('doctor');
      }
      if (settings.enabledRoles.courtesan && count >= 7) {
        rolesPool.push('courtesan');
      }
      if (settings.enabledRoles.maniac && count >= 8) {
        rolesPool.push('maniac');
      }
      if (settings.enabledRoles.bodyguard && count >= 9) {
        rolesPool.push('bodyguard');
      }
    }

    // Fill remaining spots with civilians
    while (rolesPool.length < count) {
      rolesPool.push('civilian');
    }

    // Process role preferences from Role Selection Card
    const assignedRoles = new Map<string, RoleId>();
    const remainingRolesPool = [...rolesPool];

    // Group players by preferred role
    const roleRequesters = new Map<RoleId, Player[]>();
    for (const player of players) {
      if (player.preferredRole && player.hasUsedRoleCard) {
        const list = roleRequesters.get(player.preferredRole) || [];
        list.push(player);
        roleRequesters.set(player.preferredRole, list);
      }
    }

    // Resolve requests: 100% guarantee if no competition; random contest if multiple contenders
    roleRequesters.forEach((candidates, roleId) => {
      const availableSlots = remainingRolesPool.filter(r => r === roleId).length;
      if (availableSlots <= 0) return;

      if (candidates.length <= availableSlots) {
        // 100% guarantee for each candidate
        candidates.forEach(candidate => {
          assignedRoles.set(candidate.id, roleId);
          const idx = remainingRolesPool.indexOf(roleId);
          if (idx !== -1) remainingRolesPool.splice(idx, 1);
        });
      } else {
        // Contested! More players wanted this role than slots exist.
        // Shuffle candidates to pick winner(s) at random.
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(0, availableSlots);
        winners.forEach(winner => {
          assignedRoles.set(winner.id, roleId);
          const idx = remainingRolesPool.indexOf(roleId);
          if (idx !== -1) remainingRolesPool.splice(idx, 1);
        });
        // Losers do not get the role, card is consumed (burned), they get a random remaining role
      }
    });

    // Shuffle remaining roles pool
    remainingRolesPool.sort(() => Math.random() - 0.5);

    // Assign remaining roles to players without guaranteed roles
    const unassignedPlayers = players.filter(p => !assignedRoles.has(p.id));
    const shuffledUnassigned = [...unassignedPlayers].sort(() => Math.random() - 0.5);

    shuffledUnassigned.forEach((player, idx) => {
      assignedRoles.set(player.id, remainingRolesPool[idx]);
    });

    // Assign to players and reset phase fields
    return players.map(player => ({
      ...player,
      role: assignedRoles.get(player.id) || 'civilian',
      isAlive: true,
      votedFor: null,
      nominatedBy: null,
    }));
  }

  public static resolveNight(state: RoomState, actions: NightActions): {
    nextState: Partial<RoomState>;
    result: NightResult;
  } {
    const narrativeText: string[] = [];
    const killedPlayerIds: string[] = [];
    const healedPlayerIds: string[] = [];
    const blockedPlayerId = actions.courtesanBlock;

    narrativeText.push(`Наступило утро дня ${state.dayNumber + 1}. Город просыпается...`);

    // 1. Check courtesan block
    if (blockedPlayerId) {
      const blockedPlayer = state.players.find(p => p.id === blockedPlayerId);
      if (blockedPlayer) {
        narrativeText.push(`Куртизанка провела ночь с одним из жителей.`);
      }
    }

    // 2. Mafia kill resolution
    const mafiaMembers = state.players.filter(p => p.isAlive && (p.role === 'mafia' || p.role === 'don'));
    const don = mafiaMembers.find(p => p.role === 'don');

    // Count votes for target
    const targetVoteCounts: Record<string, number> = {};
    for (const [voterId, targetId] of Object.entries(actions.mafiaVotes)) {
      if (voterId === blockedPlayerId) continue; // blocked mafia cannot shoot!
      const voter = state.players.find(p => p.id === voterId);
      if (!voter || !voter.isAlive) continue;

      const weight = (voter.role === 'don') ? 1.5 : 1;
      targetVoteCounts[targetId] = (targetVoteCounts[targetId] || 0) + weight;
    }

    let mafiaTargetId: string | null = null;
    let highestVote = 0;
    for (const [targetId, votes] of Object.entries(targetVoteCounts)) {
      if (votes > highestVote) {
        highestVote = votes;
        mafiaTargetId = targetId;
      }
    }

    // 3. Maniac kill
    let maniacTargetId: string | null = null;
    if (actions.maniacKill && actions.maniacKill !== blockedPlayerId) {
      const maniac = state.players.find(p => p.isAlive && p.role === 'maniac');
      if (maniac && maniac.id !== blockedPlayerId) {
        maniacTargetId = actions.maniacKill;
      }
    }

    // 4. Doctor heal
    const doctor = state.players.find(p => p.isAlive && p.role === 'doctor');
    const doctorTargetId = (doctor && doctor.id !== blockedPlayerId) ? actions.doctorHeal : undefined;
    if (doctorTargetId) {
      healedPlayerIds.push(doctorTargetId);
    }

    // 5. Bodyguard protection
    const bodyguard = state.players.find(p => p.isAlive && p.role === 'bodyguard');
    const bodyguardTargetId = (bodyguard && bodyguard.id !== blockedPlayerId) ? actions.bodyguardProtect : undefined;

    // Apply kills
    const potentialKills = new Set<string>();
    if (mafiaTargetId) potentialKills.add(mafiaTargetId);
    if (maniacTargetId) potentialKills.add(maniacTargetId);

    potentialKills.forEach(victimId => {
      const victim = state.players.find(p => p.id === victimId);
      if (!victim || !victim.isAlive) return;

      // Check if healed by doctor
      if (healedPlayerIds.includes(victimId)) {
        narrativeText.push(`Доктор совершил чудо и спас раненого жителя этой ночью!`);
        return;
      }

      // Check bodyguard
      if (bodyguardTargetId === victimId && bodyguard && bodyguard.isAlive) {
        narrativeText.push(`Телохранитель заслонил собой жертву и погиб героической смертью!`);
        killedPlayerIds.push(bodyguard.id);
        return;
      }

      killedPlayerIds.push(victimId);
      narrativeText.push(`Этой ночью погиб игрок ${victim.name}.`);
    });

    if (killedPlayerIds.length === 0) {
      narrativeText.push(`Удивительно, но этой ночью никто не погиб! Город в безопасности.`);
    }

    // 6. Investigations
    let sheriffInvestigation: NightResult['sheriffInvestigation'] = undefined;
    const sheriff = state.players.find(p => p.isAlive && p.role === 'sheriff');
    if (sheriff && sheriff.id !== blockedPlayerId && actions.sheriffCheck) {
      const target = state.players.find(p => p.id === actions.sheriffCheck);
      if (target) {
        const isMafia = target.role === 'mafia' || target.role === 'don';
        sheriffInvestigation = {
          targetId: target.id,
          isMafia,
        };
      }
    }

    let donInvestigation: NightResult['donInvestigation'] = undefined;
    if (don && don.id !== blockedPlayerId && actions.donCheck) {
      const target = state.players.find(p => p.id === actions.donCheck);
      if (target) {
        const isSheriff = target.role === 'sheriff';
        donInvestigation = {
          targetId: target.id,
          isSheriff,
        };
      }
    }

    // Update players alive status
    const updatedPlayers = state.players.map(p => {
      if (killedPlayerIds.includes(p.id)) {
        return { ...p, isAlive: false };
      }
      return p;
    });

    const result: NightResult = {
      killedPlayerIds,
      healedPlayerIds,
      blockedPlayerId,
      sheriffInvestigation,
      donInvestigation,
      narrativeText,
    };

    return {
      nextState: {
        players: updatedPlayers,
        lastNightResult: result,
        dayNumber: state.dayNumber + 1,
      },
      result,
    };
  }

  public static checkWinner(players: Player[]): Team | null {
    const alivePlayers = players.filter(p => p.isAlive);
    const aliveMafia = alivePlayers.filter(p => p.role === 'mafia' || p.role === 'don');
    const aliveManiac = alivePlayers.filter(p => p.role === 'maniac');
    const aliveCivilians = alivePlayers.filter(p => p.role !== 'mafia' && p.role !== 'don' && p.role !== 'maniac');

    // If no mafia and no maniac left -> Civilians win
    if (aliveMafia.length === 0 && aliveManiac.length === 0) {
      return 'civilians';
    }

    // If only maniac is alive or maniac with 1 civilian/mafia -> Maniac wins
    if (aliveManiac.length > 0 && alivePlayers.length <= 2 && aliveMafia.length === 0) {
      return 'maniac';
    }

    // If mafia equals or outnumbers all other alive players combined and no maniac
    if (aliveMafia.length >= (aliveCivilians.length + aliveManiac.length) && aliveManiac.length === 0) {
      return 'mafia';
    }

    return null;
  }
}
