import { Clan, ClanMember, CreateClanPayload } from '../../src/types/clan';
import { userDb, UserProfile } from './users';
import { getDatabase, sanitizeArgs } from './database';
import { Client } from '@libsql/client';

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
    return this.rowToClan(row);
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
}

export const clanDb = new ClanDatabase();
