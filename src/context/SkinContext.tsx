import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthUser } from '../components/AuthModal';

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
  colors?: {
    primary: string;
    accent: string;
    bg: string;
    surface: string;
    border: string;
  };
  cssUrl: string;
  hasStyles?: boolean;
}

interface SkinContextType {
  activeSkin: string;
  availableSkins: SkinPackage[];
  loading: boolean;
  equipSkin: (skinId: string, user?: AuthUser | null) => Promise<{ success: boolean; error?: string; updatedUser?: AuthUser }>;
  isSkinUnlocked: (skinId: string, user?: AuthUser | null) => boolean;
}

const STORAGE_KEY = 'mafia_equipped_ui_skin';
const STYLE_ELEMENT_ID = 'dynamic-ui-skin-style';

const SkinContext = createContext<SkinContextType>({
  activeSkin: 'default',
  availableSkins: [],
  loading: false,
  equipSkin: async () => ({ success: false }),
  isSkinUnlocked: () => false
});

// Fallback hardcoded definitions if offline / initial server startup
const DEFAULT_SKIN_PACKAGES: SkinPackage[] = [
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
    cssUrl: '/skins/vintage_gold/styles.css',
    hasStyles: true
  }
];

export const SkinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSkin, setActiveSkin] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'default';
    }
    return 'default';
  });

  const [availableSkins, setAvailableSkins] = useState<SkinPackage[]>(DEFAULT_SKIN_PACKAGES);
  const [loading, setLoading] = useState(false);

  // Apply or remove skin styles from DOM
  const applySkinToDOM = useCallback(async (skinId: string) => {
    if (typeof document === 'undefined') return;

    if (skinId === 'default' || !skinId) {
      document.documentElement.removeAttribute('data-ui-skin');
      const existingStyle = document.getElementById(STYLE_ELEMENT_ID);
      if (existingStyle) {
        existingStyle.remove();
      }
      return;
    }

    // Set data attribute on html root
    document.documentElement.setAttribute('data-ui-skin', skinId);

    // Fetch and inject CSS stylesheet dynamically on the fly
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
  }, []);

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

  // Initial application on mount
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
