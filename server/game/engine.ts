import { GamePhase, GameWinner, NightActions, NightResult, Player, RoleId, RoomSettings, RoomState, Team } from '../../src/types/mafia';

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

  /**
   * Statistically uniform Fisher-Yates (Knuth) Shuffle
   */
  private static shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  public static distributeRoles(players: Player[], settings: RoomSettings): Player[] {
    const count = players.length;
    if (count < 4) {
      throw new Error('Для старта игры требуется минимум 4 участника.');
    }

    const rolesPool: RoleId[] = [];

    // 1. Calculate mafia count based on player count
    // Standard rule: ~1/3 of players are mafia
    let mafiaCount = 1;
    if (count >= 6 && count <= 8) mafiaCount = 2;
    else if (count >= 9 && count <= 11) mafiaCount = 3;
    else if (count >= 12) mafiaCount = Math.min(4, Math.floor(count / 3));

    if (settings.gameMode === 'sport') {
      // Classic Sport Mafia: 1 Don, remaining mafia (up to mafiaCount), 1 Sheriff, rest Civilians
      rolesPool.push('don');
      mafiaCount--;
      for (let i = 0; i < mafiaCount; i++) {
        rolesPool.push('mafia');
      }
      rolesPool.push('sheriff');
    } else {
      // Custom / Standard Room Mode
      // Don
      if (settings.enabledRoles.don && mafiaCount > 0) {
        rolesPool.push('don');
        mafiaCount--;
      }
      // Ordinary mafia
      for (let i = 0; i < mafiaCount; i++) {
        rolesPool.push('mafia');
      }

      // Special roles (ordered by general game priority)
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

    // Balance Guard: Ensure there is at least 1 civilian and rolesPool does not exceed total players
    // If too many special roles were enabled for the room size, prune from least essential
    const prunePriority: RoleId[] = ['bodyguard', 'maniac', 'courtesan', 'doctor'];
    while (rolesPool.length >= count && prunePriority.length > 0) {
      const roleToPrune = prunePriority.shift()!;
      const idx = rolesPool.lastIndexOf(roleToPrune);
      if (idx !== -1) {
        rolesPool.splice(idx, 1);
      }
    }

    // Fill remaining spots with civilians so rolesPool.length === count exactly
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

    // Resolve requests: 100% guarantee if no competition; uniform random contest if multiple contenders
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
        // Unbiased shuffle of candidates to pick winner(s)
        const shuffled = MafiaEngine.shuffle(candidates);
        const winners = shuffled.slice(0, availableSlots);
        winners.forEach(winner => {
          assignedRoles.set(winner.id, roleId);
          const idx = remainingRolesPool.indexOf(roleId);
          if (idx !== -1) remainingRolesPool.splice(idx, 1);
        });
        // Losers do not get their preference, they will receive a random remaining role
      }
    });

    // Unbiased Fisher-Yates shuffle on remaining roles pool
    const shuffledRoles = MafiaEngine.shuffle(remainingRolesPool);

    // Assign remaining roles to players without guaranteed roles
    const unassignedPlayers = players.filter(p => !assignedRoles.has(p.id));
    const shuffledUnassigned = MafiaEngine.shuffle(unassignedPlayers);

    shuffledUnassigned.forEach((player, idx) => {
      assignedRoles.set(player.id, shuffledRoles[idx] || 'civilian');
    });

    // Return updated players with assigned roles
    return players.map(player => ({
      ...player,
      role: assignedRoles.get(player.id) || 'civilian',
      isAlive: true,
      votedFor: null,
      nominatedBy: null,
      // Preserve hasUsedRoleCard and preferredRole for transparency on client
      hasUsedRoleCard: player.hasUsedRoleCard,
      preferredRole: player.preferredRole
    }));
  }

  public static resolveMafiaKillTarget(state: RoomState, actions: NightActions): string | null {
    const aliveMafiaMembers = state.players.filter(
      p => p.isAlive && (p.role === 'mafia' || p.role === 'don')
    );
    if (aliveMafiaMembers.length === 0) {
      return null;
    }

    const mafiaVotes = actions.mafiaVotes || {};
    const isValidAliveTarget = (targetId: string | undefined): targetId is string =>
      Boolean(targetId && state.players.some(p => p.id === targetId && p.isAlive));

    const gameMode = state.settings?.gameMode || 'classic';

    if (gameMode === 'sport') {
      // Sport Mafia: ALL living mafia members (including Don) must select the exact same target.
      // If at least one living mafia member did not make a choice or selected a different target, the shot misses.
      const chosenTargets = new Set<string>();
      for (const member of aliveMafiaMembers) {
        const targetId = mafiaVotes[member.id];
        if (!isValidAliveTarget(targetId)) {
          return null;
        }
        chosenTargets.add(targetId);
      }
      if (chosenTargets.size !== 1) {
        return null;
      }
      return Array.from(chosenTargets)[0];
    }

    // City Mafia ('classic'):
    // 1. Each mafia member, including Don, may skip their night choice.
    // 2. If a living Don made a valid choice, the Don's target becomes the shot target regardless of other mafia votes.
    const aliveDon = aliveMafiaMembers.find(p => p.role === 'don');
    if (aliveDon) {
      const donTargetId = mafiaVotes[aliveDon.id];
      if (isValidAliveTarget(donTargetId)) {
        return donTargetId;
      }
    }

    // 3. If the Don did not make a choice or is eliminated:
    //    - Only regular mafia members ('mafia') who made a valid choice are considered.
    //    - Skipped turns do not interfere with the shot.
    //    - If nobody made a choice -> no shot.
    //    - If all who voted chose the same target (even a single regular mafia) -> shot succeeds.
    //    - If they chose different targets -> miss.
    const aliveRegularMafia = aliveMafiaMembers.filter(p => p.role === 'mafia');
    const regularChosenTargets = new Set<string>();

    for (const member of aliveRegularMafia) {
      const targetId = mafiaVotes[member.id];
      if (!targetId) continue; // skipped choice does not block the shot
      if (!isValidAliveTarget(targetId)) continue;
      regularChosenTargets.add(targetId);
    }

    if (regularChosenTargets.size === 1) {
      return Array.from(regularChosenTargets)[0];
    }

    return null;
  }

  public static resolveNight(state: RoomState, actions: NightActions): {
    nextState: Partial<RoomState>;
    result: NightResult;
  } {
    const narrativeText: string[] = [];
    const killedPlayerIds: string[] = [];
    const healedPlayerIds: string[] = [];
    const blockedPlayerId = actions.courtesanBlock || (actions as any).courtesanVisit;

    narrativeText.push(`Наступило утро дня ${state.dayNumber + 1}. Город просыпается...`);

    // 1. Courtesan (Putana) night visit: does NOT cancel or block night abilities of the chosen player
    if (blockedPlayerId) {
      const chosenPlayer = state.players.find(p => p.id === blockedPlayerId);
      if (chosenPlayer) {
        narrativeText.push(`Путана провела ночь с одним из жителей.`);
      }
    }

    // 2. Mafia kill resolution (mode-specific rules for Sport and City Mafia; unaffected by Putana visit)
    const mafiaTargetId = MafiaEngine.resolveMafiaKillTarget(state, actions);

    // 3. Maniac kill (maniac shoots freely, regardless of Putana visit)
    let maniacTargetId: string | null = null;
    if (actions.maniacKill) {
      const maniac = state.players.find(p => p.isAlive && p.role === 'maniac');
      if (maniac) {
        maniacTargetId = actions.maniacKill;
      }
    }

    // 4. Doctor heal (doctor heals freely, regardless of Putana visit; cannot heal the same player two nights in a row)
    const doctor = state.players.find(p => p.isAlive && p.role === 'doctor');
    const rawDoctorTargetId = doctor ? actions.doctorHeal : undefined;
    const validDoctorTarget = rawDoctorTargetId
      ? state.players.find(p => p.id === rawDoctorTargetId && p.isAlive)
      : undefined;
    const doctorTargetId =
      validDoctorTarget && validDoctorTarget.id !== state.doctorLastHealedPlayerId
        ? validDoctorTarget.id
        : undefined;
    if (doctorTargetId) {
      healedPlayerIds.push(doctorTargetId);
    }

    // 5. Bodyguard protection (bodyguard protects freely, regardless of Putana visit)
    const bodyguard = state.players.find(p => p.isAlive && p.role === 'bodyguard');
    const bodyguardTargetId = bodyguard ? actions.bodyguardProtect : undefined;

    // Apply primary kills (Mafia & Maniac)
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
        if (!killedPlayerIds.includes(bodyguard.id)) {
          killedPlayerIds.push(bodyguard.id);
        }
        return;
      }

      if (!killedPlayerIds.includes(victimId)) {
        killedPlayerIds.push(victimId);
        narrativeText.push(`Этой ночью погиб игрок ${victim.name}.`);
      }
    });

    // 6. Joint Death with Putana (Совместная гибель)
    // If Putana died tonight from any cause (mafia, maniac, etc.)
    const courtesan = state.players.find(p => p.isAlive && p.role === 'courtesan');
    const courtesanDied = courtesan ? killedPlayerIds.includes(courtesan.id) : false;

    if (courtesan && courtesanDied && blockedPlayerId) {
      const chosenPlayer = state.players.find(p => p.id === blockedPlayerId);
      if (chosenPlayer && chosenPlayer.isAlive) {
        // Prevent double processing if already killed by direct attack
        if (!killedPlayerIds.includes(chosenPlayer.id)) {
          const doctorSaves = state.settings?.doctorSavesFromCourtesanDeath === true;
          const wasHealedByDoctor = healedPlayerIds.includes(chosenPlayer.id);

          if (doctorSaves && wasHealedByDoctor) {
            narrativeText.push(`Путана погибла этой ночью, но Доктор спас выбранного ею жителя ${chosenPlayer.name}!`);
          } else {
            killedPlayerIds.push(chosenPlayer.id);
            narrativeText.push(`Путана погибла этой ночью, и вместе с ней погиб житель ${chosenPlayer.name}.`);
          }
        }
      }
    }

    if (killedPlayerIds.length === 0) {
      narrativeText.push(`Удивительно, но этой ночью никто не погиб! Город в безопасности.`);
    }

    // 7. Investigations (Sheriff & Don checks proceed freely, regardless of Putana visit)
    let sheriffInvestigation: NightResult['sheriffInvestigation'] = undefined;
    const sheriff = state.players.find(p => p.isAlive && p.role === 'sheriff');
    if (sheriff && actions.sheriffCheck) {
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
    const don = state.players.find(p => p.isAlive && p.role === 'don');
    if (don && actions.donCheck) {
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

    const chosenStillAlive = Boolean(blockedPlayerId && !killedPlayerIds.includes(blockedPlayerId));

    return {
      nextState: {
        players: updatedPlayers,
        lastNightResult: result,
        courtesanBlockedPlayerId: chosenStillAlive ? blockedPlayerId : null,
        doctorLastHealedPlayerId: doctor ? (doctorTargetId ?? null) : null,
        dayNumber: state.dayNumber,
      },
      result,
    };
  }

  public static checkWinner(players: Player[]): GameWinner | null {
    const alivePlayers = players.filter(p => p.isAlive);

    // If no alive players remain -> immediate Draw (no winning side)
    if (alivePlayers.length === 0) {
      return 'draw';
    }

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
