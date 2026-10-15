export type ItemCategory = 'certificates' | 'chests' | 'cosmetics' | 'valuables';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  cost: number;             // Стоимость в магазине (кредиты)
  pawnValue?: number;       // Стоимость сдачи в ломбард (кредиты)
  description: string;
  icon: string;             // Иконка или эмодзи
  usable: boolean;          // Можно ли активировать/использовать
  consumable: boolean;      // Расходуется ли при активации
  effectDescription?: string;
  cosmeticType?: 'card_back' | 'title' | 'avatar_frame';
  inShop?: boolean;
  discountPercent?: number;
  featured?: boolean;
}

export interface UserInventoryItem {
  id?: string;
  itemId: string;
  quantity: number;
  acquiredAt: string;
}

// СКВОЗНОЙ КАТАЛОГ ВСЕХ ВНУТРИИГРОВЫХ ПРЕДМЕТОВ
export const ALL_GAME_ITEMS: Record<string, ItemDefinition> = {
  card_role_select: {
    id: 'card_role_select',
    name: 'Карточка выбора роли',
    category: 'certificates',
    rarity: 'epic',
    cost: 250,
    pawnValue: 125,
    icon: '🎴',
    usable: true,
    consumable: true,
    description: 'Особый ордер Синдиката на заказ желаемой роли. Активируется в лобби перед стартом партии. Если нет конкурентов — 100% гарантия роли! При конкуренции роль разыгрывается случайно. Предмет сгорает при использовании.',
    effectDescription: 'Заказ желаемой роли в лобби перед стартом партии (100% без конкурентов или рандом при соперничестве).'
  },
  cert_name_change: {
    id: 'cert_name_change',
    name: 'Сертификат на смену никнейма',
    category: 'certificates',
    rarity: 'rare',
    cost: 250,
    pawnValue: 125,
    icon: '📜',
    usable: true,
    consumable: true,
    description: 'Официальный гербовый бланк Городского Магистрата. Предоставляет право на 1 бесплатную смену игрового никнейма.',
    effectDescription: 'Бесплатная смена никнейма в профиле без списания 250 кредитов.'
  },
  chest_novice: {
    id: 'chest_novice',
    name: 'Сундук Мафиози',
    category: 'chests',
    rarity: 'common',
    cost: 100,
    pawnValue: 50,
    icon: '🧰',
    usable: true,
    consumable: true,
    description: 'Начальный сундук контрабандиста. Содержит монеты, ценности ломбарда или базовые рубашки карт.',
    effectDescription: 'Открывает случайную награду от 50 до 150 кредитов или косметику.'
  },
  chest_don: {
    id: 'chest_don',
    name: 'Сейф Дона',
    category: 'chests',
    rarity: 'epic',
    cost: 300,
    pawnValue: 150,
    icon: '🔒',
    usable: true,
    consumable: true,
    description: 'Тяжёлый сейф с кодовым замком синдиката. Содержит редкие титулы, сертификаты и крупные суммы кредитов.',
    effectDescription: 'Шанс получить сертификат на смену никнейма, титул или 250-400 кредитов.'
  },
  chest_sheriff: {
    id: 'chest_sheriff',
    name: 'Кейс Шерифа',
    category: 'chests',
    rarity: 'legendary',
    cost: 500,
    pawnValue: 250,
    icon: '💼',
    usable: true,
    consumable: true,
    description: 'Архивный дипломат специального отдела полиции. Содержит элитные сертификаты и легендарные титулы.',
    effectDescription: 'Гарантированно содержит ценный предмет или крупный запас кредитов.'
  },
  card_gold: {
    id: 'card_gold',
    name: 'Рубашка «Золотой Дон»',
    category: 'cosmetics',
    rarity: 'epic',
    cost: 150,
    pawnValue: 75,
    icon: '🃏',
    usable: true,
    consumable: false,
    cosmeticType: 'card_back',
    description: 'Эксклюзивная золотая отделка игровых карт с позолоченным тиснением.',
    effectDescription: 'Экипирует золотую рубашку карт на вашем столе.'
  },
  card_crimson: {
    id: 'card_crimson',
    name: 'Рубашка «Кровавая Ночь»',
    category: 'cosmetics',
    rarity: 'rare',
    cost: 120,
    pawnValue: 60,
    icon: '🎴',
    usable: true,
    consumable: false,
    cosmeticType: 'card_back',
    description: 'Тёмно-алая шёлковая отделка рубашки карт в стиле классического гангстерского нуара.',
    effectDescription: 'Экипирует рубиново-красную рубашку карт.'
  },
  title_godfather: {
    id: 'title_godfather',
    name: 'Титул «Крёстный Отец»',
    category: 'cosmetics',
    rarity: 'legendary',
    cost: 200,
    pawnValue: 100,
    icon: '👑',
    usable: true,
    consumable: false,
    cosmeticType: 'title',
    description: 'Уважительный титул, внушающий трепет всему преступному синдикату.',
    effectDescription: 'Отображает золотой титул «Крёстный Отец» в вашем профиле.'
  },
  title_law: {
    id: 'title_law',
    name: 'Титул «Неподкупный»',
    category: 'cosmetics',
    rarity: 'rare',
    cost: 180,
    pawnValue: 90,
    icon: '🛡️',
    usable: true,
    consumable: false,
    cosmeticType: 'title',
    description: 'Почётный знак отличия честных граждан и защитников закона.',
    effectDescription: 'Отображает титул «Неподкупный» в вашем профиле.'
  },
  item_watch: {
    id: 'item_watch',
    name: 'Золотые карманные часы',
    category: 'valuables',
    rarity: 'rare',
    cost: 200,
    pawnValue: 120,
    icon: '⏱️',
    usable: false,
    consumable: true,
    description: 'Швейцарские золотые часы на цепочке. Трофей с громкого дела 1928 года. Можно сдать в ломбард.',
    effectDescription: 'Сдаётся в городском ломбарде за 120 внутриигровых кредитов.'
  },
  item_lighter: {
    id: 'item_lighter',
    name: 'Серебряная зажигалка Zippo',
    category: 'valuables',
    rarity: 'common',
    cost: 120,
    pawnValue: 80,
    icon: '🕯️',
    usable: false,
    consumable: true,
    description: 'Гравированная серебряная зажигалка, найденная в пальто дона. Принимается в ломбарде.',
    effectDescription: 'Сдаётся в городском ломбарде за 80 внутриигровых кредитов.'
  },
  item_cufflinks: {
    id: 'item_cufflinks',
    name: 'Запонки с рубином',
    category: 'valuables',
    rarity: 'epic',
    cost: 240,
    pawnValue: 160,
    icon: '💎',
    usable: false,
    consumable: true,
    description: 'Фамильная реликвия чикагской семьи. Ростовщики платят за неё высокую цену.',
    effectDescription: 'Сдаётся в городском ломбарде за 160 внутриигровых кредитов.'
  }
};

export const ITEMS_LIST = Object.values(ALL_GAME_ITEMS);

export const DEFAULT_NICKNAME_CHANGE_COST = 250;
export const NICKNAME_CHANGE_CERTIFICATE_ID = 'cert_name_change';
export const ROLE_SELECT_CARD_ID = 'card_role_select';

export const RARITY_CONFIG: Record<ItemRarity, { label: string; color: string; bg: string; border: string }> = {
  common: {
    label: 'Обычный',
    color: 'text-zinc-300',
    bg: 'bg-zinc-900/80',
    border: 'border-zinc-700'
  },
  rare: {
    label: 'Редкий',
    color: 'text-blue-400',
    bg: 'bg-blue-950/40',
    border: 'border-blue-600/60'
  },
  epic: {
    label: 'Эпический',
    color: 'text-purple-400',
    bg: 'bg-purple-950/40',
    border: 'border-purple-600/60'
  },
  legendary: {
    label: 'Легендарный',
    color: 'text-amber-400',
    bg: 'bg-amber-950/50',
    border: 'border-amber-500/70'
  }
};

export const CATEGORY_CONFIG: Record<ItemCategory, { label: string; icon: string }> = {
  certificates: { label: 'Сертификаты и документы', icon: '📜' },
  chests: { label: 'Сундуки и кейсы', icon: '🧰' },
  cosmetics: { label: 'Рубашки и титулы', icon: '✨' },
  valuables: { label: 'Ценности ломбарда', icon: '💎' }
};
