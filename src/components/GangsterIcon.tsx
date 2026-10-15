import React from 'react';

interface GangsterIconProps {
  className?: string;
  size?: number;
}

export const GangsterIcon: React.FC<GangsterIconProps> = ({ className = 'w-10 h-10', size = 40 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background circle badge */}
      <circle cx="32" cy="32" r="30" fill="#14151b" stroke="#2a2c38" strokeWidth="1.5" />
      
      {/* Fedora Hat */}
      <ellipse cx="32" cy="22" rx="16" ry="3.5" fill="#e4e4e7" />
      <path
        d="M23 21 C23 15, 27 12, 32 12 C37 12, 41 15, 41 21 Z"
        fill="#f4f4f5"
      />
      {/* Hat band */}
      <path d="M23.5 20 C27 21, 37 21, 40.5 20 L40.5 21.5 C37 22.5, 27 22.5, 23.5 21.5 Z" fill="#18181b" />
      
      {/* Face & Shadow */}
      <path d="M27 24 C27 24, 26 31, 32 31 C38 31, 37 24, 37 24 Z" fill="#d4d4d8" />
      {/* Dark Glasses / Shadow */}
      <rect x="27.5" y="24" width="4" height="2" rx="0.5" fill="#09090b" />
      <rect x="32.5" y="24" width="4" height="2" rx="0.5" fill="#09090b" />

      {/* Trench Coat Collars */}
      <path d="M19 48 C20 37, 26 33, 29 32 L32 39 L35 32 C38 33, 44 37, 45 48 Z" fill="#e4e4e7" />
      <path d="M29 32 L26 39 L31 43 L32 37" fill="#fafafa" />
      <path d="M35 32 L38 39 L33 43 L32 37" fill="#fafafa" />
      {/* Dark Tie */}
      <path d="M31.2 34 L32.8 34 L33.5 43 L32 46 L30.5 43 Z" fill="#18181b" />

      {/* Tommy Gun (Thompson Submachine gun with drum) */}
      {/* Barrel */}
      <line x1="16" y1="41" x2="38" y2="35" stroke="#a1a1aa" strokeWidth="2.2" strokeLinecap="round" />
      {/* Heat fins / muzzle */}
      <line x1="14" y1="41.5" x2="18" y2="40.5" stroke="#71717a" strokeWidth="3" strokeLinecap="round" />
      {/* Receiver */}
      <rect x="28" y="35" width="8" height="3" rx="0.8" transform="rotate(-15 28 35)" fill="#52525b" />
      {/* Round Drum Magazine */}
      <circle cx="31" cy="40" r="4.2" fill="#27272a" stroke="#71717a" strokeWidth="1" />
      {/* Wooden Stock */}
      <path d="M37 36 L43 38 L42 41 L36 39 Z" fill="#78350f" />
    </svg>
  );
};
