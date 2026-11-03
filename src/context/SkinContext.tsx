import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { AuthUser } from '../components/AuthModal';

export interface SkinThemeDefinition {
  name?: string;
  variables?: Record<string, string>;
}

export interface SkinPackage {
  id: string;
  itemId: string;
  name: string;
  nameEn?: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  author?: string;
  version?: string;
  icon?: string;
  previewImage?: string;
  colors?: {
    primary: string;
    accent: string;
    secondary?: string;
    bg: string;
    surface: string;
    border: string;
  };
  theme?: SkinThemeDefinition | null;
  cssUrl: string;
  hasStyles?: boolean;
}

interface SkinContextType {
  activeSkin: string;
  activeSkinPackage: SkinPackage | null;
  availableSkins: SkinPackage[];
  loading: boolean;
  equipSkin: (skinId: string, user?: AuthUser | null) => Promise<{ success: boolean; error?: string; updatedUser?: AuthUser }>;
  isSkinUnlocked: (skinId: string, user?: AuthUser | null) => boolean;
}

const STORAGE_KEY = 'mafia_equipped_ui_skin';
const TOKENS_ELEMENT_ID = 'dynamic-ui-skin-tokens';
const STYLE_ELEMENT_ID = 'dynamic-ui-skin-style';
const ADMIN_GUARD_ELEMENT_ID = 'admin-panel-skin-isolation-guard';

const SkinContext = createContext<SkinContextType>({
  activeSkin: 'default',
  activeSkinPackage: null,
  availableSkins: [],
  loading: false,
  equipSkin: async () => ({ success: false }),
  isSkinUnlocked: () => false
});

// Fallback hardcoded definitions if offline / initial server startup
const DEFAULT_SKIN_PACKAGES: SkinPackage[] = [
  {
    id: 'cyberpunk_neon',
    itemId: 'skin_cyberpunk_neon',
    name: 'Киберпанк Неон 2088',
    nameEn: 'Cyberpunk Neon 2088',
    description: 'Эксклюзивный неоновый кибер-интерфейс с многослойными светящимися контурами, розово-синей матрицей и футуристическим HUD.',
    rarity: 'legendary',
    author: 'Neo Syndicate Design',
    version: '1.0.0',
    icon: '⚡',
    colors: {
      primary: '#ff007f',
      accent: '#00f0ff',
      secondary: '#f97316',
      bg: '#05020c',
      surface: '#0b0617',
      border: '#f43f5e'
    },
    theme: {
      name: 'Cyberpunk Neon 2088',
      variables: {
        '--skin-primary': '#f43f5e',
        '--skin-primary-glow': '0 0 15px rgba(244, 63, 94, 0.7)',
        '--skin-cyan': '#00f0ff',
        '--skin-cyan-glow': '0 0 15px rgba(0, 240, 255, 0.6)',
        '--skin-orange': '#f97316',
        '--skin-orange-glow': '0 0 15px rgba(249, 115, 22, 0.7)',
        '--skin-bg-canvas': '#05020c',
        '--skin-bg-surface': 'rgba(11, 6, 23, 0.85)',
        '--skin-bg-card': 'rgba(13, 9, 29, 0.88)',
        '--skin-bg-subcard': 'rgba(18, 10, 36, 0.85)',
        '--skin-bg-header': 'rgba(9, 4, 18, 0.85)',
        '--skin-bg-modal': 'rgba(11, 6, 23, 0.94)',
        '--skin-img-canvas': "url('/skins/cyberpunk_neon/assets/bg.jpg')",
        '--skin-img-lobby': "url('/skins/cyberpunk_neon/assets/bg.jpg')",
        '--skin-img-game': "url('/skins/cyberpunk_neon/assets/bg.jpg')",
        '--skin-border-base': '#ff007f',
        '--skin-border-card': '#ff007f',
        '--skin-border-accent': '#00f0ff',
        '--skin-border-magenta': '#ff007f',
        '--skin-border-cyan': '#00f0ff',
        '--skin-accent-primary': '#ff007f',
        '--skin-accent-secondary': '#00f0ff',
        '--skin-text-primary': '#ffffff',
        '--skin-text-secondary': '#e0f2fe',
        '--skin-text-muted': '#7dd3fc',
        '--skin-text-title': '#ffffff',
        '--skin-text-cyan': '#00f0ff',
        '--skin-radius-card': '16px',
        '--skin-card-radius': '16px',
        '--skin-glow-accent': '0 0 18px rgba(0, 240, 255, 0.65)'
      }
    },
    cssUrl: '/skins/cyberpunk_neon/styles.css',
    hasStyles: true
  },
  {
    id: 'crimson_syndicate',
    itemId: 'skin_crimson_syndicate',
    name: 'Синдикат Багровой Луны',
    nameEn: 'Crimson Moon Syndicate',
    description: 'Элитное оформление преступного синдиката в глубоких рубиновых, винных и обсидиановых тонах с кроваво-золотыми акцентами.',
    rarity: 'epic',
    author: 'Don Corleone Studio',
    version: '1.0.0',
    icon: '🩸',
    colors: {
      primary: '#dc2626',
      accent: '#ef4444',
      bg: '#0c0407',
      surface: '#1a080d',
      border: '#881337'
    },
    theme: {
      name: 'Crimson Moon Syndicate',
      variables: {
        '--skin-primary': '#ef4444',
        '--skin-primary-hover': '#dc2626',
        '--skin-accent': '#f87171',
        '--skin-accent-primary': '#ef4444',
        '--skin-accent-secondary': '#f87171',
        '--skin-bg-canvas': '#0d0407',
        '--skin-bg-surface': '#19080d',
        '--skin-bg-card': '#240a13',
        '--skin-bg-subcard': '#300e19',
        '--skin-bg-header': 'rgba(18, 5, 9, 0.95)',
        '--skin-bg-modal': '#1a080d',
        '--skin-border-base': '#9f1239',
        '--skin-border-card': '#9f1239',
        '--skin-border-subtle': 'rgba(244, 63, 94, 0.3)',
        '--skin-border-accent': '#e11d48',
        '--skin-text-primary': '#ffe4e6',
        '--skin-text-secondary': '#fecdd3',
        '--skin-text-title': '#ffe4e6',
        '--skin-text-body': '#fecdd3',
        '--skin-text-muted': '#fb7185',
        '--skin-glow': '0 0 25px rgba(225, 29, 72, 0.4)',
        '--skin-glow-accent': '0 0 25px rgba(225, 29, 72, 0.4)',
        '--skin-radius-card': '18px',
        '--skin-card-radius': '18px'
      }
    },
    cssUrl: '/skins/crimson_syndicate/styles.css',
    hasStyles: true
  },
  {
    id: 'cyber_noir',
    itemId: 'skin_cyber_noir',
    name: 'Неоновый Детектив 2088',
    nameEn: 'Cyberpunk Detective 2088',
    description: 'Футуристический синдикат с неоново-бирюзовыми HUD-контурами, киберпанк-индикаторами и глубоким цифровым сапфиром.',
    rarity: 'legendary',
    author: 'Neo-Chicago Syndicate',
    version: '1.0.0',
    icon: '🌃',
    colors: {
      primary: '#06b6d4',
      accent: '#38bdf8',
      bg: '#030712',
      surface: '#081326',
      border: '#0284c7'
    },
    theme: {
      name: 'Cyberpunk Detective 2088',
      variables: {
        '--skin-primary': '#06b6d4',
        '--skin-primary-hover': '#0891b2',
        '--skin-accent': '#38bdf8',
        '--skin-accent-primary': '#06b6d4',
        '--skin-accent-secondary': '#38bdf8',
        '--skin-bg-canvas': '#030712',
        '--skin-bg-surface': '#081326',
        '--skin-bg-card': '#0f2142',
        '--skin-bg-subcard': '#152c57',
        '--skin-bg-header': 'rgba(6, 15, 30, 0.95)',
        '--skin-bg-modal': '#081326',
        '--skin-border-base': '#0284c7',
        '--skin-border-card': '#0284c7',
        '--skin-border-subtle': 'rgba(6, 182, 212, 0.35)',
        '--skin-border-accent': '#38bdf8',
        '--skin-text-primary': '#e0f2fe',
        '--skin-text-secondary': '#bae6fd',
        '--skin-text-title': '#e0f2fe',
        '--skin-text-body': '#bae6fd',
        '--skin-text-muted': '#7dd3fc',
        '--skin-glow': '0 0 25px rgba(6, 182, 212, 0.4)',
        '--skin-glow-accent': '0 0 25px rgba(6, 182, 212, 0.4)',
        '--skin-radius-card': '12px',
        '--skin-card-radius': '12px'
      }
    },
    cssUrl: '/skins/cyber_noir/styles.css',
    hasStyles: true
  },
  {
    id: 'vintage_gold',
    itemId: 'skin_vintage_gold',
    name: 'Золотой Век Рокфеллера',
    nameEn: 'Rockefeller Vintage Gold',
    description: 'Роскошный классический стиль в традициях Ар-Деко с позолоченными тиснениями, тёмно-изумрудным бархатом и латунью.',
    rarity: 'epic',
    author: 'Manhattan Club 1932',
    version: '1.0.0',
    icon: '⚜️',
    colors: {
      primary: '#d97706',
      accent: '#fbbf24',
      bg: '#0c0b06',
      surface: '#19160d',
      border: '#b45309'
    },
    theme: {
      name: 'Rockefeller Vintage Gold',
      variables: {
        '--skin-primary': '#f59e0b',
        '--skin-primary-hover': '#d97706',
        '--skin-accent': '#fde68a',
        '--skin-accent-primary': '#f59e0b',
        '--skin-accent-secondary': '#fde68a',
        '--skin-bg-canvas': '#0c0b06',
        '--skin-bg-surface': '#19160d',
        '--skin-bg-card': '#262114',
        '--skin-bg-subcard': '#332c1b',
        '--skin-bg-header': 'rgba(20, 18, 10, 0.95)',
        '--skin-bg-modal': '#19160d',
        '--skin-border-base': '#ca8a04',
        '--skin-border-card': '#ca8a04',
        '--skin-border-subtle': 'rgba(234, 179, 8, 0.3)',
        '--skin-border-accent': '#fbbf24',
        '--skin-text-primary': '#fef3c7',
        '--skin-text-secondary': '#fde68a',
        '--skin-text-title': '#fef3c7',
        '--skin-text-body': '#fde68a',
        '--skin-text-muted': '#fbbf24',
        '--skin-glow': '0 0 25px rgba(245, 158, 11, 0.35)',
        '--skin-glow-accent': '0 0 25px rgba(245, 158, 11, 0.35)',
        '--skin-radius-card': '16px',
        '--skin-card-radius': '16px'
      }
    },
    cssUrl: '/skins/vintage_gold/styles.css',
    hasStyles: true
  }
];

/**
 * Builds a scoped CSS stylesheet with all design tokens for the active skin,
 * bridging both legacy theme.json variable names and the unified --skin-* architecture.
 */
function buildSkinTokensStylesheet(skinId: string, skinPackage?: SkinPackage | null): string {
  const vars: Record<string, string> = {};
  const rawVars = skinPackage?.theme?.variables || {};
  const colors = skinPackage?.colors;

  // 1. Seed from manifest.colors fallback if present
  if (colors) {
    if (colors.bg) vars['--skin-bg-canvas'] = colors.bg;
    if (colors.surface) vars['--skin-bg-surface'] = colors.surface;
    if (colors.primary) {
      vars['--skin-primary'] = colors.primary;
      vars['--skin-accent-primary'] = colors.primary;
    }
    if (colors.accent) {
      vars['--skin-accent'] = colors.accent;
      vars['--skin-accent-secondary'] = colors.accent;
    }
    if (colors.border) {
      vars['--skin-border-base'] = colors.border;
      vars['--skin-border-card'] = colors.border;
    }
  }

  // 2. Copy all explicit variables from theme.json
  for (const [k, v] of Object.entries(rawVars)) {
    if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string') {
      vars[k] = v;
    }
  }

  // 3. Bidirectional compatibility aliases so both legacy and unified token names resolve
  if (vars['--skin-primary'] && !vars['--skin-accent-primary']) {
    vars['--skin-accent-primary'] = vars['--skin-primary'];
  }
  if (vars['--skin-accent-primary'] && !vars['--skin-primary']) {
    vars['--skin-primary'] = vars['--skin-accent-primary'];
  }
  if (vars['--skin-accent'] && !vars['--skin-accent-secondary']) {
    vars['--skin-accent-secondary'] = vars['--skin-accent'];
  }
  if (vars['--skin-bg-canvas'] && !vars['--skin-bg']) {
    vars['--skin-bg'] = vars['--skin-bg-canvas'];
    vars['--skin-bg-dark'] = vars['--skin-bg-canvas'];
  }
  if (vars['--skin-bg-surface'] && !vars['--skin-surface']) {
    vars['--skin-surface'] = vars['--skin-bg-surface'];
  }
  if (vars['--skin-bg-card'] && !vars['--skin-card']) {
    vars['--skin-card'] = vars['--skin-bg-card'];
  }
  if (vars['--skin-border-card'] && !vars['--skin-border-base']) {
    vars['--skin-border-base'] = vars['--skin-border-card'];
  }
  if (vars['--skin-border-base'] && !vars['--skin-border-card']) {
    vars['--skin-border-card'] = vars['--skin-border-base'];
  }
  if (vars['--skin-border-base'] && !vars['--skin-border']) {
    vars['--skin-border'] = vars['--skin-border-base'];
  }
  if (vars['--skin-card-radius'] && !vars['--skin-radius-card']) {
    vars['--skin-radius-card'] = vars['--skin-card-radius'];
  }
  if (vars['--skin-radius-card'] && !vars['--skin-card-radius']) {
    vars['--skin-card-radius'] = vars['--skin-radius-card'];
  }
  if (vars['--skin-text-title'] && !vars['--skin-text-primary']) {
    vars['--skin-text-primary'] = vars['--skin-text-title'];
  }
  if (vars['--skin-text-primary'] && !vars['--skin-text-title']) {
    vars['--skin-text-title'] = vars['--skin-text-primary'];
  }
  if (vars['--skin-text-body'] && !vars['--skin-text-secondary']) {
    vars['--skin-text-secondary'] = vars['--skin-text-body'];
  }
  if (vars['--skin-text-secondary'] && !vars['--skin-text-body']) {
    vars['--skin-text-body'] = vars['--skin-text-secondary'];
  }
  if (vars['--skin-glow'] && !vars['--skin-glow-accent']) {
    vars['--skin-glow-accent'] = vars['--skin-glow'];
  }
  if (vars['--skin-primary-glow'] && !vars['--skin-glow-accent']) {
    vars['--skin-glow-accent'] = vars['--skin-primary-glow'];
  }
  if (vars['--skin-glow-accent'] && !vars['--skin-glow']) {
    vars['--skin-glow'] = vars['--skin-glow-accent'];
  }

  const declarations = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  if (!declarations) return '';
  return `:root[data-ui-skin="${skinId}"] {\n${declarations}\n}\n`;
}

/**
 * Ensures the Admin Panel Isolation Guard <style> tag is always the final style element
 * in document.head after any dynamically injected skin stylesheets.
 */
function ensureAdminIsolationGuardInHead(): void {
  if (typeof document === 'undefined') return;
  let guardEl = document.getElementById(ADMIN_GUARD_ELEMENT_ID) as HTMLStyleElement | null;
  if (!guardEl) {
    guardEl = document.createElement('style');
    guardEl.id = ADMIN_GUARD_ELEMENT_ID;
    guardEl.textContent = `
/* Admin Panel Dynamic Skin Isolation Guard (Always last in head) */
html[data-ui-skin] .admin-panel-exempt,
html[data-ui-skin] [data-skin-exempt="true"],
html[data-ui-skin] .admin-panel-exempt *,
html[data-ui-skin] [data-skin-exempt="true"] * {
  --skin-bg-canvas: #0b0d11 !important;
  --skin-bg-surface: #111218 !important;
  --skin-bg-card: #14151e !important;
  --skin-bg-subcard: #13141a !important;
  --skin-border-base: #27272a !important;
  --skin-border-card: #27272a !important;
  --skin-border-accent: #d97706 !important;
  --skin-text-primary: #f8fafc !important;
  --skin-text-secondary: #e2e8f0 !important;
  --skin-glow-accent: none !important;
  --skin-glow: none !important;
}
html[data-ui-skin] .admin-panel-exempt .bg-\\[\\#0d0e13\\]\\/95,
html[data-ui-skin] [data-skin-exempt="true"] .bg-\\[\\#0d0e13\\]\\/95 {
  background-color: rgba(13, 14, 19, 0.95) !important;
}
html[data-ui-skin] .admin-panel-exempt .bg-\\[\\#111218\\]\\/95,
html[data-ui-skin] [data-skin-exempt="true"] .bg-\\[\\#111218\\]\\/95 {
  background-color: rgba(17, 18, 24, 0.95) !important;
}
`;
  }
  // Move to the very end of <head> so it always follows #dynamic-ui-skin-style
  document.head.appendChild(guardEl);
}

export const SkinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSkin, setActiveSkin] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'default';
    }
    return 'default';
  });

  const [availableSkins, setAvailableSkins] = useState<SkinPackage[]>(DEFAULT_SKIN_PACKAGES);
  const [loading, setLoading] = useState(false);

  const activeSkinPackage = useMemo(() => {
    if (!activeSkin || activeSkin === 'default') return null;
    return availableSkins.find(s => s.id === activeSkin) || DEFAULT_SKIN_PACKAGES.find(s => s.id === activeSkin) || null;
  }, [activeSkin, availableSkins]);

  // Apply or remove skin styles and design tokens from DOM
  const applySkinToDOM = useCallback(async (skinId: string) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (skinId === 'default' || !skinId) {
      root.removeAttribute('data-ui-skin');
      root.style.colorScheme = root.classList.contains('light') ? 'light' : 'dark';
      const existingTokens = document.getElementById(TOKENS_ELEMENT_ID);
      if (existingTokens) existingTokens.remove();
      const existingStyle = document.getElementById(STYLE_ELEMENT_ID);
      if (existingStyle) existingStyle.remove();
      return;
    }

    // Set data attribute on html root and lock native color-scheme to dark for custom skins
    root.setAttribute('data-ui-skin', skinId);
    root.style.colorScheme = 'dark';

    // 1. Inject design tokens from skin package (theme.json / manifest colors)
    const matchedPkg =
      availableSkins.find(s => s.id === skinId) ||
      DEFAULT_SKIN_PACKAGES.find(s => s.id === skinId) ||
      null;
    const tokensCss = buildSkinTokensStylesheet(skinId, matchedPkg);
    if (tokensCss) {
      let tokensEl = document.getElementById(TOKENS_ELEMENT_ID) as HTMLStyleElement | null;
      if (!tokensEl) {
        tokensEl = document.createElement('style');
        tokensEl.id = TOKENS_ELEMENT_ID;
        document.head.appendChild(tokensEl);
      }
      tokensEl.textContent = tokensCss;
    }

    // 2. Fetch and inject CSS stylesheet dynamically on the fly
    try {
      const res = await fetch(`/skins/${skinId}/styles.css`);
      if (res.ok) {
        const cssText = await res.text();
        let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = STYLE_ELEMENT_ID;
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = cssText;
      }
    } catch (e) {
      console.warn(`[Skin] Could not fetch dynamic stylesheet for ${skinId}:`, e);
    }

    // 3. Ensure Admin Panel Isolation Guard stays at the end of <head>
    ensureAdminIsolationGuardInHead();
  }, [availableSkins]);

  // Fetch available skins list from server
  useEffect(() => {
    const fetchSkins = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/skins');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.skins) && data.skins.length > 0) {
            setAvailableSkins(data.skins);
          }
        }
      } catch (e) {
        console.warn('[Skin] Falling back to default skin definitions:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchSkins();
  }, []);

  // Application on mount or when activeSkin / availableSkins update
  useEffect(() => {
    applySkinToDOM(activeSkin);
  }, [activeSkin, applySkinToDOM]);

  // Check if a skin is unlocked for a user based on inventory or admin role
  const isSkinUnlocked = useCallback((skinId: string, user?: AuthUser | null): boolean => {
    if (skinId === 'default') return true;
    if (!user) return false;

    // Super Admin check
    if (user.isAdmin || user.role === 'admin' || user.email?.toLowerCase() === 'vledahovic@gmail.com') {
      return true;
    }

    const skinPackage = availableSkins.find(s => s.id === skinId);
    const targetItemId = skinPackage ? skinPackage.itemId : `skin_${skinId}`;

    if (!Array.isArray(user.inventory)) return false;
    return user.inventory.some(i => (i.itemId === targetItemId || i.itemId === skinId) && i.quantity > 0);
  }, [availableSkins]);

  // Equip or unequip a skin
  const equipSkin = useCallback(async (
    skinId: string,
    user?: AuthUser | null
  ): Promise<{ success: boolean; error?: string; updatedUser?: AuthUser }> => {
    // 1. If skin is not default, check user permissions
    if (skinId !== 'default' && user) {
      const unlocked = isSkinUnlocked(skinId, user);
      if (!unlocked) {
        return {
          success: false,
          error: 'Этот стиль отсутствует в вашем инвентаре. Приобретите его на Черном Рынке.'
        };
      }
    }

    // 2. Server API call if logged in
    const token = typeof window !== 'undefined' ? localStorage.getItem('mafia_auth_token') : null;
    let updatedUser: AuthUser | undefined = undefined;

    if (token && user) {
      try {
        const res = await fetch('/api/user/equip-skin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ skinId })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Ошибка экипировки стиля на сервере');
        }
        updatedUser = data.user;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка при сохранении стиля';
        return { success: false, error: msg };
      }
    }

    // 3. Apply to DOM & LocalStorage
    setActiveSkin(skinId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, skinId);
    }
    await applySkinToDOM(skinId);

    return { success: true, updatedUser };
  }, [isSkinUnlocked, applySkinToDOM]);

  return (
    <SkinContext.Provider value={{
      activeSkin,
      activeSkinPackage,
      availableSkins,
      loading,
      equipSkin,
      isSkinUnlocked
    }}>
      {children}
    </SkinContext.Provider>
  );
};

export const useSkin = () => useContext(SkinContext);
