import { Clan, ClanMember, CreateClanPayload } from '../../src/types/clan';
import { userDb, UserProfile } from './users';
import { getDatabase } from './database';
import { DatabaseSync } from 'node:sqlite';

export class ClanDatabase {
  private get db(): DatabaseSync {
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

  private saveClanToDb(clan: Clan) {
    const stmt = this.db.prepare(`
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
    `);

    stmt.run(
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
    );
  }

  public getAllClans(searchQuery?: string): Clan[] {
    let rows: any[];
    if (!searchQuery || !searchQuery.trim()) {
      rows = this.db.prepare('SELECT * FROM clans').all();
    } else {
      const q = `%${searchQuery.trim().toLowerCase()}%`;
      const qTag = `%${searchQuery.trim().toUpperCase()}%`;
      rows = this.db.prepare(`
        SELECT * FROM clans
        WHERE LOWER(name) LIKE ? OR UPPER(tag) LIKE ? OR LOWER(description) LIKE ?
      `).all(q, qTag, q);
    }

    const list = rows.map(r => this.rowToClan(r));
    return list.sort((a, b) => b.totalRating - a.totalRating);
  }

  public getClanById(id: string): Clan | null {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM clans WHERE id = ?').get(id);
    if (!row) return null;
    return this.rowToClan(row);
  }

  public getMyClan(userId: string): Clan | null {
    const user = userDb.getUserById(userId);
    if (!user || !user.clanId) return null;
    return this.getClanById(user.clanId);
  }

  public createClan(leaderId: string, payload: CreateClanPayload): { clan: Clan; user: UserProfile } {
    const user = userDb.getUserById(leaderId);
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

    const existingName = this.db.prepare('SELECT id FROM clans WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existingName) {
      throw new Error(`Клан с названием «${cleanName}» уже существует.`);
    }

    const existingTag = this.db.prepare('SELECT id FROM clans WHERE UPPER(tag) = UPPER(?)').get(cleanTag);
    if (existingTag) {
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

    const insert = this.db.prepare(`
      INSERT INTO clans (
        id, name, tag, description, avatar_url, rating, leader_id, leader_name, members, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
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
    );

    // Update user record
    const updatedUser = userDb.updateUserClan(user.id, {
      clanId,
      clanName: cleanName,
      clanTag: cleanTag,
      clanRole: 'leader'
    });

    return { clan: newClan, user: updatedUser };
  }

  public joinClan(userId: string, clanId: string): { clan: Clan; user: UserProfile } {
    const user = userDb.getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден.');
    }

    if (user.clanId) {
      throw new Error('Вы уже состоите в клане. Сначала покиньте текущий клан.');
    }

    const clan = this.getClanById(clanId);
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
    this.saveClanToDb(clan);

    // Update user record
    const updatedUser = userDb.updateUserClan(user.id, {
      clanId: clan.id,
      clanName: clan.name,
      clanTag: clan.tag,
      clanRole: 'member'
    });

    return { clan, user: updatedUser };
  }

  public leaveClan(userId: string): { success: boolean; user: UserProfile; disbanded?: boolean } {
    const user = userDb.getUserById(userId);
    if (!user || !user.clanId) {
      throw new Error('Вы не состоите ни в одном клане.');
    }

    const clan = this.getClanById(user.clanId);
    if (!clan) {
      const updatedUser = userDb.updateUserClan(user.id, {
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
      this.db.prepare('DELETE FROM clans WHERE id = ?').run(clan.id);
      disbanded = true;
    } else if (clan.leaderId === userId) {
      const newLeader = clan.members[0];
      newLeader.role = 'leader';
      clan.leaderId = newLeader.userId;
      clan.leaderName = newLeader.displayName;

      this.saveClanToDb(clan);

      userDb.updateUserClan(newLeader.userId, {
        clanId: clan.id,
        clanName: clan.name,
        clanTag: clan.tag,
        clanRole: 'leader'
      });
    } else {
      this.saveClanToDb(clan);
    }

    const updatedUser = userDb.updateUserClan(user.id, {
      clanId: null,
      clanName: null,
      clanTag: null,
      clanRole: null
    });

    return { success: true, user: updatedUser, disbanded };
  }

  public kickMember(leaderId: string, targetUserId: string): { clan: Clan } {
    const leader = userDb.getUserById(leaderId);
    if (!leader || !leader.clanId || leader.clanRole !== 'leader') {
      throw new Error('Только лидер клана имеет право исключать участников.');
    }

    if (leaderId === targetUserId) {
      throw new Error('Лидер не может исключить самого себя. Используйте кнопку «Покинуть клан».');
    }

    const clan = this.getClanById(leader.clanId);
    if (!clan) {
      throw new Error('Клан не найден.');
    }

    clan.members = clan.members.filter(m => m.userId !== targetUserId);
    clan.memberCount = clan.members.length;
    clan.totalRating = clan.members.reduce((acc, m) => acc + m.rating, 0);
    this.saveClanToDb(clan);

    const targetUser = userDb.getUserById(targetUserId);
    if (targetUser && targetUser.clanId === clan.id) {
      userDb.updateUserClan(targetUserId, {
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
