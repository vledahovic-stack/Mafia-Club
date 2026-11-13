import { PublicRoomSummary, PublicRoomsStatus } from '../types/mafia';

function isValidPublicRoomSummary(item: unknown): item is PublicRoomSummary {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return false;
  }
  const r = item as Record<string, unknown>;
  return (
    typeof r.roomCode === 'string' &&
    r.roomCode.trim().length > 0 &&
    typeof r.roomName === 'string' &&
    typeof r.playerCount === 'number' &&
    Number.isFinite(r.playerCount) &&
    typeof r.maxPlayers === 'number' &&
    Number.isFinite(r.maxPlayers) &&
    typeof r.inGame === 'boolean' &&
    typeof r.hostName === 'string'
  );
}

/**
 * Validates the JSON payload from GET /api/rooms.
 * Returns null if the structure is invalid so callers can treat it as an error
 * instead of silently falling back to an empty list or fake rooms.
 */
export function parsePublicRoomsResponse(payload: unknown): PublicRoomSummary[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const rooms = (payload as { rooms?: unknown }).rooms;
  if (!Array.isArray(rooms)) {
    return null;
  }
  if (!rooms.every(isValidPublicRoomSummary)) {
    return null;
  }
  return rooms;
}

export interface PublicRoomsFetchCallbacks {
  fetchImpl?: typeof fetch;
  onStart?: (isLatest: () => boolean) => void;
  onSuccess: (rooms: PublicRoomSummary[]) => void;
  onError: () => void;
  onFinish?: (isLatest: () => boolean) => void;
}

/**
 * Creates a concurrency-safe public rooms loader where stale/out-of-order
 * responses never overwrite newer requests or their status.
 */
export function createPublicRoomsLoader() {
  let latestRequestId = 0;

  return async function loadPublicRooms(callbacks: PublicRoomsFetchCallbacks): Promise<PublicRoomsStatus | 'stale'> {
    const requestId = ++latestRequestId;
    const isLatest = () => requestId === latestRequestId;
    const fetchFn = callbacks.fetchImpl ?? fetch;

    callbacks.onStart?.(isLatest);

    try {
      const res = await fetchFn('/api/rooms', { cache: 'no-store' });
      if (!isLatest()) return 'stale';
      if (!res.ok) {
        callbacks.onError();
        return 'error';
      }
      const data: unknown = await res.json();
      if (!isLatest()) return 'stale';
      const parsedRooms = parsePublicRoomsResponse(data);
      if (!parsedRooms) {
        callbacks.onError();
        return 'error';
      }
      callbacks.onSuccess(parsedRooms);
      return 'loaded';
    } catch {
      if (!isLatest()) return 'stale';
      callbacks.onError();
      return 'error';
    } finally {
      callbacks.onFinish?.(isLatest);
    }
  };
}
