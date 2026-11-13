import React, { useState } from 'react';
import { GangsterIcon } from './GangsterIcon';
import { resolvePlayerAvatarView } from '../utils/avatarGalleryUi';

export interface PlayerAvatarProps {
  userId?: string | null;
  avatarSeed?: string | null;
  displayName?: string | null;
  activeAvatarId?: string | null;
  /**
   * When true and `activeAvatarId` is undefined (not explicitly `null`),
   * attempts to load `/api/users/:userId/avatar` for registered user IDs
   * and falls back cleanly on 404/error.
   */
  tryLoadByUserId?: boolean;
  /**
   * Fallback mode when the user has no active custom image and no custom emoji seed:
   * - 'initials' (default): renders the uppercase first character of displayName / avatarSeed
   * - 'gangster': renders `<GangsterIcon />` (used on game table / lobby video slots & top bars)
   */
  fallbackMode?: 'initials' | 'gangster';
  gangsterSize?: number;
  gangsterClassName?: string;
  imgClassName?: string;
  textClassName?: string;
  alt?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  userId,
  avatarSeed,
  displayName,
  activeAvatarId,
  tryLoadByUserId = false,
  fallbackMode = 'initials',
  gangsterSize = 24,
  gangsterClassName = 'w-5 h-5',
  imgClassName = 'w-full h-full object-cover select-none',
  textClassName = 'select-none leading-none',
  alt
}) => {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);

  // First compute candidate URL without failure state
  const candidate = resolvePlayerAvatarView({
    userId,
    avatarSeed,
    displayName,
    activeAvatarId,
    tryLoadByUserId,
    fallbackMode,
    imageLoadFailed: false
  });

  const isCurrentUrlFailed =
    Boolean(candidate.imageUrl) && failedImageUrl === candidate.imageUrl;

  const resolved = isCurrentUrlFailed
    ? resolvePlayerAvatarView({
        userId,
        avatarSeed,
        displayName,
        activeAvatarId,
        tryLoadByUserId,
        fallbackMode,
        imageLoadFailed: true
      })
    : candidate;

  if (resolved.kind === 'image' && resolved.imageUrl) {
    return (
      <img
        src={resolved.imageUrl}
        alt={alt ?? displayName ?? 'Аватар'}
        onError={() => setFailedImageUrl(resolved.imageUrl)}
        className={imgClassName}
        draggable={false}
      />
    );
  }

  if (resolved.kind === 'gangster') {
    return <GangsterIcon size={gangsterSize} className={gangsterClassName} />;
  }

  return <span className={textClassName}>{resolved.text}</span>;
};
