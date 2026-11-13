import { Clan, ClanMember, CreateClanPayload } from '../../src/types/clan';
import { userDb, UserProfile } from './users';
import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';
import { rewardMutex } from '../utils/asyncLock';

export class ClanDatabase {
  private get db(): Client {
    return getDatabase();
  }

  private rowToClan(row: any): Clan {
    let members: ClanMember[] = [];
    try {
      members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members || [];
    } catch {
      members = [];
    }

    const totalRating = members.reduce((acc, m) => acc + (m.rating || 1000), 0);

    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      description: row.description || '',
      avatarIcon: row.avatar_url || '👑',
      createdAt: row.created_at,
      leaderId: row.leader_id,
      leaderName: row.leader_name,
      memberCount: members.length,
      members,
      totalRating
    };
  }

  private async saveClanToDb(clan: Clan): Promise<void> {
    await this.db.execute({
      sql: `
        UPDATE clans SET
          name = ?,
          tag = ?,
          description = ?,
          avatar_url = ?,
          rating = ?,
          leader_id = ?,
          leader_name = ?,
          members = ?,
          updated_at = ?
        WHERE id = ?
      `,
      args: sanitizeArgs([
        clan.name,
        clan.tag,
        clan.description || '',
        clan.avatarIcon || '👑',
        clan.totalRating,
        clan.leaderId,
        clan.leaderName,
        JSON.stringify(clan.members || []),
        new Date().toISOString(),
        clan.id
      ])
    });
  }

  public async getAllClans(searchQuery?: string): Promise<Clan[]> {
    let res: any;
    if (!searchQuery || !searchQuery.trim()) {
      res = await this.db.execute('SELECT * FROM clans');
    } else {
      const q = `%${searchQuery.trim().toLowerCase()}%`;
      const qTag = `%${searchQuery.trim().toUpperCase()}%`;
      res = await this.db.execute({
        sql: `
          SELECT * FROM clans
          WHERE LOWER(name) LIKE ? OR UPPER(tag) LIKE ? OR LOWER(description) LIKE ?
        `,
        args: [q, qTag, q]
      });
    }

    const list = res.rows.map((r: any) => this.rowToClan(r));
    await this.enrichClansMembersFromUsers(list);
    return list.sort((a: Clan, b: Clan) => b.totalRating - a.totalRating);
  }

  public async getClanById(id: string): Promise<Clan | null> {
    if (!id) return null;
    const res = await this.db.execute({
      sql: 'SELECT * FROM clans WHERE id = ?',
      args: [id]
    });
    const row = res.rows[0];
    if (!row) return null;
    const clan = this.rowToClan(row);
    await this.enrichClansMembersFromUsers([clan]);
    return clan;
  }

  private async enrichClansMembersFromUsers(clans: Clan[]): Promise<void> {
    const userIds = new Set<string>();
    for (const c of clans) {
      for (const m of c.members || []) {
        if (m && m.userId) userIds.add(m.userId);
      }
    }
    if (userIds.size === 0) return;

    const idsArr = Array.from(userIds);
    const placeholders = idsArr.map(() => '?').join(',');
    const res = await this.db.execute({
      sql: `SELECT id, display_name, avatar_seed, active_avatar_id FROM users WHERE id IN (${placeholders})`,
      args: idsArr
    });

    const userMap = new Map<
      string,
      { displayName: string; avatarSeed: string; activeAvatarId: string | null }
    >();
    for (const row of res.rows) {
      const id = String(row.id);
      const displayName = String(row.display_name || '');
      const avatarSeed = String(row.avatar_seed || displayName);
      const activeAvatarId =
        typeof row.active_avatar_id === 'string' && row.active_avatar_id.trim().length > 0
          ? row.active_avatar_id.trim()
          : null;
      userMap.set(id, { displayName, avatarSeed, activeAvatarId });
    }

    for (const c of clans) {
      for (const m of c.members || []) {
        const live = userMap.get(m.userId);
        if (live) {
          if (live.displayName) m.displayName = live.displayName;
          if (live.avatarSeed) m.avatarSeed = live.avatarSeed;
          m.activeAvatarId = live.activeAvatarId;
        }
      }
    }
  }

  public async getMyClan(userId: string): Promise<Clan | null> {
    const user = await userDb.getUserById(userId);
    if (!user || !user.clanId) return null;
    return this.getClanById(user.clanId);
  }

  public async createClan(leaderId: string, payload: CreateClanPayload): Promise<{ clan: Clan; user: UserProfile }> {
    const user = await userDb.getUserById(leaderId);
    if (!user) {
      throw new Error('Пользователь не найден.');
    }

    if (user.clanId) {
      throw new Error('Вы уже состоите в клане. Сначала покиньте текущий клан, чтобы основать новый.');
    }

    const cleanName = (payload.name || '').trim();
    if (cleanName.length < 3 || cleanName.length > 24) {
      throw new Error('Название клана должно содержать от 3 до 24 символов.');
    }

    const cleanTag = (payload.tag || '').trim().toUpperCase();
    if (cleanTag.length < 2 || cleanTag.length > 6) {
      throw new Error('Тег клана должен содержать от 2 до 6 символов (только буквы и цифры).');
    }

    if (!/^[A-Z0-9А-ЯЁ]+$/i.test(cleanTag)) {
      throw new Error('Тег клана может содержать только буквы и цифры без пробелов и спецсимволов.');
    }

    const checkName = await this.db.execute({
      sql: 'SELECT id FROM clans WHERE LOWER(name) = LOWER(?)',
      args: [cleanName]
    });
    if (checkName.rows[0]) {
      throw new Error(`Клан с названием «${cleanName}» уже существует.`);
    }

    const checkTag = await this.db.execute({
      sql: 'SELECT id FROM clans WHERE UPPER(tag) = UPPER(?)',
      args: [cleanTag]
    });
    if (checkTag.rows[0]) {
      throw new Error(`Тег клана «[${cleanTag}]» уже занят другим кланом.`);
    }

    const userRating = user.stats?.rating || 1000;
    const clanId = 'clan_' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const leaderMember: ClanMember = {
      userId: user.id,
      displayName: user.displayName,
      avatarSeed: user.avatarSeed || user.displayName,
      activeAvatarId: user.activeAvatarId || null,
      role: 'leader',
      joinedAt: now,
      rating: userRating
    };

    const newClan: Clan = {
      id: clanId,
      name: cleanName,
      tag: cleanTag,
      description: payload.description?.trim() || 'Синдикат честных игроков и мафиози.',
      createdAt: now,
      leaderId: user.id,
      leaderName: user.displayName,
      memberCount: 1,
      members: [leaderMember],
      totalRating: userRating,
      avatarIcon: payload.avatarIcon || '👑'
    };

    await this.db.execute({
      sql: `
        INSERT INTO clans (
          id, name, tag, description, avatar_url, rating, leader_id, leader_name, members, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: sanitizeArgs([
        newClan.id,
        newClan.name,
        newClan.tag,
        newClan.description || '',
        newClan.avatarIcon || '👑',
        newClan.totalRating,
        newClan.leaderId,
        newClan.leaderName,
        JSON.stringify(newClan.members),
        now,
        now
      ])
    });

    const updatedUser = await userDb.updateUserClan(user.id, {
      clanId,
      clanName: cleanName,
      clanTag: cleanTag,
      clanRole: 'leader'
    });

    return { clan: newClan, user: updatedUser };
  }

  public async joinClan(userId: string, clanId: string): Promise<{ clan: Clan; user: UserProfile }> {
    const user = await userDb.getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден.');
    }

    if (user.clanId) {
      throw new Error('Вы уже состоите в клане. Сначала покиньте текущий клан.');
    }

    const clan = await this.getClanById(clanId);
    if (!clan) {
      throw new Error('Клан не найден.');
    }

    const userRating = user.stats?.rating || 1000;
    const newMember: ClanMember = {
      userId: user.id,
      displayName: user.displayName,
      avatarSeed: user.avatarSeed || user.displayName,
      activeAvatarId: user.activeAvatarId || null,
      role: 'member',
      joinedAt: new Date().toISOString(),
      rating: userRating
    };

    clan.members.push(newMember);
    clan.memberCount = clan.members.length;
    clan.totalRating = clan.members.reduce((acc, m) => acc + m.rating, 0);
    await this.saveClanToDb(clan);

    const updatedUser = await userDb.updateUserClan(user.id, {
      clanId: clan.id,
      clanName: clan.name,
      clanTag: clan.tag,
      clanRole: 'member'
    });

    return { clan, user: updatedUser };
  }

  public async leaveClan(userId: string): Promise<{ success: boolean; user: UserProfile; disbanded?: boolean }> {
    const user = await userDb.getUserById(userId);
    if (!user || !user.clanId) {
      throw new Error('Вы не состоите ни в одном клане.');
    }

    const clan = await this.getClanById(user.clanId);
    if (!clan) {
      const updatedUser = await userDb.updateUserClan(user.id, {
        clanId: null,
        clanName: null,
        clanTag: null,
        clanRole: null
      });
      return { success: true, user: updatedUser };
    }

    clan.members = clan.members.filter(m => m.userId !== userId);
    clan.memberCount = clan.members.length;
    clan.totalRating = clan.members.reduce((acc, m) => acc + m.rating, 0);

    let disbanded = false;
    if (clan.members.length === 0) {
      await this.db.execute({
        sql: 'DELETE FROM clans WHERE id = ?',
        args: [clan.id]
      });
      disbanded = true;
    } else if (clan.leaderId === userId) {
      const newLeader = clan.members[0];
      newLeader.role = 'leader';
      clan.leaderId = newLeader.userId;
      clan.leaderName = newLeader.displayName;

      await this.saveClanToDb(clan);

      await userDb.updateUserClan(newLeader.userId, {
        clanId: clan.id,
        clanName: clan.name,
        clanTag: clan.tag,
        clanRole: 'leader'
      });
    } else {
      await this.saveClanToDb(clan);
    }

    const updatedUser = await userDb.updateUserClan(user.id, {
      clanId: null,
      clanName: null,
      clanTag: null,
      clanRole: null
    });

    return { success: true, user: updatedUser, disbanded };
  }

  public async kickMember(leaderId: string, targetUserId: string): Promise<{ clan: Clan }> {
    const leader = await userDb.getUserById(leaderId);
    if (!leader || !leader.clanId || leader.clanRole !== 'leader') {
      throw new Error('Только лидер клана имеет право исключать участников.');
    }

    if (leaderId === targetUserId) {
      throw new Error('Лидер не может исключить самого себя. Используйте кнопку «Покинуть клан».');
    }

    const clan = await this.getClanById(leader.clanId);
    if (!clan) {
      throw new Error('Клан не найден.');
    }

    clan.members = clan.members.filter(m => m.userId !== targetUserId);
    clan.memberCount = clan.members.length;
    clan.totalRating = clan.members.reduce((acc, m) => acc + m.rating, 0);
    await this.saveClanToDb(clan);

    const targetUser = await userDb.getUserById(targetUserId);
    if (targetUser && targetUser.clanId === clan.id) {
      await userDb.updateUserClan(targetUserId, {
        clanId: null,
        clanName: null,
        clanTag: null,
        clanRole: null
      });
    }

    return { clan };
  }

  public async transferLeadership(
    currentLeaderId: string,
    newLeaderUserId: string
  ): Promise<{ clan: Clan; user: UserProfile }> {
    const cleanLeaderId = typeof currentLeaderId === 'string' ? currentLeaderId.trim() : '';
    const cleanNewLeaderId = typeof newLeaderUserId === 'string' ? newLeaderUserId.trim() : '';

    if (!cleanLeaderId || !cleanNewLeaderId) {
      throw new Error('Укажите текущего и нового лидера клана.');
    }
    if (cleanLeaderId === cleanNewLeaderId) {
      throw new Error('Нельзя передать лидерство самому себе.');
    }

    const initialLeader = await userDb.getUserById(cleanLeaderId);
    if (!initialLeader || !initialLeader.clanId) {
      throw new Error('Вы не состоите в клане.');
    }
    if (initialLeader.clanRole !== 'leader') {
      throw new Error('Только лидер клана может передать лидерство.');
    }

    const clanId = initialLeader.clanId;

    const updatedClan = await rewardMutex.runExclusive(`clan:${clanId}`, async () => {
      const tx = await (this.db as any).transaction('write');
      try {
        const leaderRes = await tx.execute({
          sql: 'SELECT id, display_name, clan_id, clan_role FROM users WHERE id = ? LIMIT 1',
          args: [cleanLeaderId],
        });
        const leaderRow = leaderRes.rows[0];
        if (!leaderRow || String(leaderRow.clan_id || '') !== clanId || String(leaderRow.clan_role || '') !== 'leader') {
          throw new Error('Только действующий лидер клана может передать лидерство.');
        }

        const clanRes = await tx.execute({
          sql: 'SELECT * FROM clans WHERE id = ? LIMIT 1',
          args: [clanId],
        });
        const clanRow = clanRes.rows[0];
        if (!clanRow) {
          throw new Error('Клан не найден.');
        }
        const clan = this.rowToClan(clanRow);
        if (clan.leaderId !== cleanLeaderId) {
          throw new Error('Вы больше не являетесь лидером этого клана.');
        }

        const targetRes = await tx.execute({
          sql: 'SELECT id, display_name, clan_id, is_banned FROM users WHERE id = ? LIMIT 1',
          args: [cleanNewLeaderId],
        });
        const targetRow = targetRes.rows[0];
        if (!targetRow || String(targetRow.clan_id || '') !== clanId) {
          throw new Error('Выбранный игрок не состоит в этом клане.');
        }
        if (Boolean(targetRow.is_banned)) {
          throw new Error('Нельзя передать лидерство заблокированному игроку.');
        }

        const delRes = await tx.execute({
          sql: `SELECT status FROM account_deletion_requests
                WHERE user_id = ? AND status IN ('scheduled', 'processing')
                LIMIT 1`,
          args: [cleanNewLeaderId],
        });
        if (delRes.rows.length > 0) {
          throw new Error('Нельзя передать лидерство игроку, чей аккаунт ожидает удаления.');
        }

        const memberIdx = clan.members.findIndex(m => m.userId === cleanNewLeaderId);
        if (memberIdx === -1) {
          throw new Error('Выбранный игрок не найден в составе клана.');
        }

        const nextMembers = clan.members.map(m => {
          if (m.userId === cleanLeaderId) {
            return { ...m, role: 'member' as const };
          }
          if (m.userId === cleanNewLeaderId) {
            return { ...m, role: 'leader' as const };
          }
          return m;
        });

        const newLeaderName = String(targetRow.display_name || clan.members[memberIdx].displayName || 'Лидер');
        const totalRating = nextMembers.reduce((acc, m) => acc + (m.rating || 1000), 0);
        const nowIso = new Date().toISOString();

        const clanUpd = await tx.execute({
          sql: `
            UPDATE clans SET
              leader_id = ?,
              leader_name = ?,
              members = ?,
              rating = ?,
              updated_at = ?
            WHERE id = ? AND leader_id = ?
          `,
          args: sanitizeArgs([
            cleanNewLeaderId,
            newLeaderName,
            JSON.stringify(nextMembers),
            totalRating,
            nowIso,
            clan.id,
            cleanLeaderId,
          ]),
        });

        if (Number(clanUpd.rowsAffected ?? 0) !== 1) {
          throw new Error('Не удалось передать лидерство клана из-за конкурентного изменения.');
        }

        await tx.execute({
          sql: `UPDATE users SET clan_role = 'member', updated_at = ? WHERE id = ? AND clan_id = ?`,
          args: [nowIso, cleanLeaderId, clan.id],
        });

        await tx.execute({
          sql: `UPDATE users SET clan_role = 'leader', updated_at = ? WHERE id = ? AND clan_id = ?`,
          args: [nowIso, cleanNewLeaderId, clan.id],
        });

        await tx.commit();
        return {
          ...clan,
          leaderId: cleanNewLeaderId,
          leaderName: newLeaderName,
          members: nextMembers,
          memberCount: nextMembers.length,
          totalRating,
        };
      } catch (err) {
        try {
          await tx.rollback();
        } catch {}
        throw err;
      } finally {
        try {
          tx.close();
        } catch {}
      }
    });

    const refreshedLeader = await userDb.getUserById(cleanLeaderId);
    if (!refreshedLeader) {
      throw new Error('Не удалось обновить профиль лидера.');
    }

    return { clan: updatedClan, user: refreshedLeader };
  }
}

export const clanDb = new ClanDatabase();
