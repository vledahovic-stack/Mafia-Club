# 🎨 АРХИТЕКТУРА И ПЛАН РЕАЛИЗАЦИИ ПОЛНОЦЕННЫХ СКИНОВ ИНТЕРФЕЙСА «MAFIA CLUB»

> **Версия документа:** 1.5 (Обновлено по итогам реализации Этапа В, Групп 1, 2А, 2Б, 3А и 3Б)  
> **Дата обновления:** 3 ноября 2026 г.  
> **Статус:** **Этап Б, Этап В (Группа 1), Этап В (Группа 2А), Этап В (Группа 2Б), Этап В (Группа 3А) и Этап В (Группа 3Б) выполнены**. Готовность к оставшимся модальным окнам мета-игры (кланы, события, бонусы, промокоды, акции, обратная связь, настройки) и финальной верификации компактности/прокрутки.

---

## 📑 СОДЕРЖАНИЕ

1. [Краткое резюме и статус реализации](#1-краткое-резюме-и-статус-реализации)
2. [Аудит существующей реализации скинов](#2-аудит-существующей-реализации-скинов)
3. [Практическая сверка COSM-01: почему скин сохраняется на сервере и где есть нюансы](#3-практическая-сверка-cosm-01)
4. [Инвентаризация пользовательских компонентов (46 компонентов)](#4-инвентаризация-пользовательских-компонентов)
5. [Реализованная архитектура дизайн-токенов (Этап Б — Выполнено)](#5-реализованная-архитектура-дизайн-токенов)
6. [Реализованная двухуровневая изоляция админки (Этап Б — Выполнено)](#6-реализованная-двухуровневая-изоляция-админки)
7. [Интеграция с экономикой и единым каталогом предметов](#7-интеграция-с-экономикой-и-единым-каталогом-предметов)
8. [Поэтапный план реализации и отметка выполненных работ](#8-поэтапный-план-реализации)
9. [Критерии готовности и тестовая матрица](#9-критерии-готовности-и-тестовая-матрица)

---

## 1. КРАТКОЕ РЕЗЮМЕ И СТАТУС РЕАЛИЗАЦИИ

В рамках **Этапа Б** реализован единый фундамент дизайн-токенов (`--skin-*`) и строгая двухуровневая изоляция административной панели без изменения игровой логики, экономики или существующего визуального облика базового стиля Noir:

1. **Единая система токенов (`src/index.css` + `src/context/SkinContext.tsx`):** Введены семантические CSS-переменные по 7 архитектурным группам (фоны и поверхности, фоновые изображения и текстуры экранов, параметры игрового стола и карточек видео, типографика и шрифты, акценты/кнопки/инпуты, границы/радиусы/свечения, анимации и скроллбары).
2. **Обратная совместимость с существующими пакетами скинов (`server/skins/*/theme.json`):** Настроен двусторонний маппинг между историческими переменными существующих скинов (`--skin-primary`, `--skin-border-card`, `--skin-card-radius`, `--skin-text-title`, `--skin-text-body`, `--skin-glow`) и новой канонической системой `--skin-*`.
3. **Устранение конфликта `SkinContext` и `ThemeContext`:** Светлая тема (`html.light:not([data-ui-skin])`) теперь автоматически уступает приоритет при активации кастомного скина интерфейса и не ломает контрастность текста на тёмных поверхностях скинов.
4. **Двухуровневая изоляция админки (`.admin-panel-exempt` / `[data-skin-exempt="true"]`):** Внедрены селекторный барьер (Уровень 1), принудительный сброс всех `--skin-*` переменных к константам Noir (Уровень 2) и динамический замыкающий тег `<style id="admin-panel-skin-isolation-guard">` в конце `<head>`.

---

## 2. АУДИТ СУЩЕСТВУЮЩЕЙ РЕАЛИЗАЦИИ СКИНОВ

### 2.1. Реестр существующих скинов
В кодовой базе зарегистрировано **4 скина интерфейса** в мастер-каталоге предметов (`server/db/items.ts`, массив `INITIAL_ITEMS`):

| ID предмета | ID скина | Название | Редкость | Стоимость | Ломбард | Каталог на сервере |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `skin_crimson_syndicate` | `crimson_syndicate` | Синдикат Багровой Луны | `epic` | 350 кр. | 175 кр. | `/server/skins/crimson_syndicate/` |
| `skin_vintage_gold` | `vintage_gold` | Золотой Век Рокфеллера | `epic` | 450 кр. | 225 кр. | `/server/skins/vintage_gold/` |
| `skin_cyber_noir` | `cyber_noir` | Неоновый Детектив 2088 | `legendary` | 600 кр. | 300 кр. | `/server/skins/cyber_noir/` |
| `skin_cyberpunk_neon` | `cyberpunk_neon` | Киберпанк Неон 2088 | `legendary` | 750 кр. | 375 кр. | `/server/skins/cyberpunk_neon/` |

*(В директории `/server/skins/` также присутствует дополнительный пакет `cyber_matrix` с `manifest.json`, `theme.json` и `styles.css`).*

Все скины имеют `category: 'cosmetics'`, `cosmeticType: 'ui_skin'`, `usable: true`, `consumable: false`, `inShop: true`.

---

## 3. ПРАКТИЧЕСКАЯ СВЕРКА COSM-01

### 3.1. Почему на рабочем сервере выбранный скин сохраняется после перезагрузки страницы и сервера
Детальная трассировка клиент-серверного цикла показала, почему практическое поведение на сервере работает стабильно и почему вывод первичного статического аудита о «мгновенном сбросе скина при обновлении страницы» оказался неточным:

1. **Клиентское хранилище как основной источник истины (`src/context/SkinContext.tsx`, строки 129–134, 259–263):**  
   При экипировке скина метод `equipSkin` записывает идентификатор скина в `localStorage.setItem('mafia_equipped_ui_skin', skinId)`. При любой перезагрузке страницы или рестарте сервера `SkinProvider` синхронно инициализирует `activeSkin` из `localStorage.getItem('mafia_equipped_ui_skin') || 'default'` и сразу вызывает `applySkinToDOM(activeSkin)`.
2. **Защитное условие в `src/App.tsx` (строки 64–70):**
   ```tsx
   useEffect(() => {
     if (user?.equippedCosmetics?.uiSkin) {
       if (activeSkin !== user.equippedCosmetics.uiSkin) {
         equipSkin(user.equippedCosmetics.uiSkin, user);
       }
     }
   }, [user?.equippedCosmetics?.uiSkin, activeSkin, equipSkin, user]);
   ```
   Когда после перезагрузки страницы клиент запрашивает `GET /api/auth/me`, сервер возвращает профиль пользователя, где `user.equippedCosmetics.uiSkin` равен `undefined`. Благодаря проверке `if (user?.equippedCosmetics?.uiSkin)` (которая выполняется **только если поле заполнено**), `App.tsx` **не перезаписывает и не сбрасывает** `activeSkin` из `localStorage`!
3. **Отображение статуса в `SettingsModal.tsx` (строка 448):**  
   В окне настроек статус «Активен» определяется выражением `const isActive = activeSkin === skin.id;` (напрямую из `SkinContext`), поэтому и сам визуальный скин, и плашка «Активен» в настройках полностью сохраняются после `F5` и перезапуска сервера.
4. **Роль серверного `POST /api/user/equip-skin` (`server/db/users.ts`, строки 1988–2019):**  
   Серверный метод `equipSkin` выполняет **авторизационную проверку владения предметом** в `user.inventory` (либо прав администратора) и возвращает обновлённый объект `user` с `equippedCosmetics.uiSkin = skinId` в ответе API.

### 3.2. Какие реальные узкие места (краевые случаи) существуют в текущей схеме
Хотя скин не сбрасывается в браузере игрока, выявлены два изолированных нюанса:
1. **Индикатор кнопки «Экипировано» на вкладке «Инвентарь» в `UserProfileModal.tsx` (строки 738, 784–789, 1964–1965):**
   * В отличие от `SettingsModal.tsx` (который смотрит на `activeSkin` из `useSkin()`), карточка предмета в `UserProfileModal.tsx` проверяет `user.equippedCosmetics?.uiSkin === itemDef.id.replace('skin_', '')`.
   * Кроме того, при нажатии «Экипировать» в инвентаре (`handleUseItem`, строки 784–789) сначала вызывается `/api/user/use-item`, затем `await equipSkin(skinId, data.user)`, но возвращённый из `equipSkin` `res.updatedUser` не передаётся в `onUpdateUser(res.updatedUser)`.
   * **Следствие:** сам скин на экране активируется и сохраняется в `localStorage`, но кнопка на карточке предмета внутри вкладки «Инвентарь» может показывать «Экипировать» вместо «Экипировано» (если проверять `user.equippedCosmetics?.uiSkin` вместо `activeSkin`).
2. **Синхронизация между разными устройствами (Cross-Device Sync):**
   * Так как `mafia_equipped_ui_skin` хранится в `localStorage` конкретного браузера, а в таблице `users` нет колонки `equipped_ui_skin`, при входе с нового телефона или другого браузера игроку нужно один раз нажать «Активировать» в настройках/инвентаре.

### 3.3. Рекомендация по отдельному точечному улучшению (без вмешательства в БД)
* Миграция БД (`equipped_ui_skin`) **не является обязательной** для работы скинов в рамках браузера пользователя; работающие серверные методы `equipSkin`, `useItem` и `rowToUser` **оставлены без изменений**.
* Чтобы кнопка «Экипировано / Сбросить» в инвентаре (`UserProfileModal.tsx`) работала так же надёжно, как в `SettingsModal.tsx`, на этапе адаптации `UserProfileModal` достаточно сверять статус экипировки скина с `activeSkin` из `useSkin()`.

---

## 4. ИНВЕНТАРИЗАЦИЯ ПОЛЬЗОВАТЕЛЬСКИХ КОМПОНЕНТОВ

В проекте **46 пользовательских компонентов**, которые на следующих этапах (Этап В / Г) будут подключаться к созданному фундаменту дизайн-токенов:

| № | Компонент | Путь к файлу | Текущий способ стилизации | Жёстко заданные элементы (Hardcoded) | Сложность адаптации |
| :---: | :--- | :--- | :--- | :--- | :---: |
| 1 | `Header` | `src/components/Header.tsx` | Tailwind arbitrary | `bg-[#0d0e15]`, `border-zinc-800`, бейджи золота | **Низкая** |
| 2 | `HomeView` | `src/components/HomeView.tsx` | Inline style + Tailwind + частичные `cyber-*` | `style={{ backgroundImage: noirLobbyBg }}`, карточки комнат `#13141a` | **Средняя** |
| 3 | `LobbyView` | `src/components/LobbyView.tsx` | Inline style + Tailwind | `style={{ backgroundImage: noirLobbyBg }}`, слоты `#13141a`, бордеры `#27272a` | **Высокая** |
| 4 | `InGameView` | `src/components/InGameView.tsx` | Inline style + Tailwind | `style={{ backgroundImage: noirLobbyBg }}`, таймер фаз, градиенты плашек | **Высокая** |
| 5 | `GameTable` | `src/components/GameTable.tsx` | Tailwind + SVG | Сукно стола `bg-[#13151f]`, номера слотов, фишки голосования | **Высокая** |
| 6 | `PlayerVideoCard` | `src/components/PlayerVideoCard.tsx` | Tailwind | Рамки видеокарт, статус микрофона/камеры, плашки живой/мертвый | **Средняя** |
| 7 | `PlayerVideoSlot` | `src/components/PlayerVideoSlot.tsx` | Tailwind | Заглушки аватаров, индикатор говорящего | **Низкая** |
| 8 | `NightPhaseView` | `src/components/NightPhaseView.tsx` | Tailwind | Ночная виньетка, прицелы мафии, карточки целей ночи | **Средняя** |
| 9 | `MorningReportModal` | `src/components/MorningReportModal.tsx` | Tailwind modal | Газетный стиль/карточка `#12131b`, заголовки дня, списки жертв | **Средняя** |
| 10 | `GameOverModal` | `src/components/GameOverModal.tsx` | Tailwind modal | Плашки победы (мафия/мирные), таблица наград, карточки ролей | **Средняя** |
| 11 | `ChatPanel` | `src/components/ChatPanel.tsx` | Tailwind | Вкладки чата, пузыри сообщений, инпут ввода текста | **Средняя** |
| 12 | `LobbyChatDrawer` | `src/components/LobbyChatDrawer.tsx` | Tailwind drawer | Выдвижная шторка `#121319`, список сообщений лобби | **Низкая** |
| 13 | `UserProfileModal` | `src/components/UserProfileModal.tsx` | Tailwind modal (3458 строк) | Вкладки досье, карточки инвентаря, списки сертификатов | **Высокая** |
| 14 | `ShopModal` | `src/components/ShopModal.tsx` | Tailwind modal | Сетка товаров «Черного Рынка», фильтры категорий, карточки цен | **Средняя** |
| 15 | `PawnshopModal` | `src/components/PawnshopModal.tsx` | Tailwind modal | Карточки выкупа ломбарда `#161722`, кнопки сдачи | **Низкая** |
| 16 | `LootboxOpenModal` | `src/components/LootboxOpenModal.tsx` | Tailwind + Canvas | 3D-барабан открытия, световые лучи, карточка выпавшего приза | **Высокая** |
| 17 | `DailyBonusModal` | `src/components/DailyBonusModal.tsx` | Tailwind modal | 7 слотов календаря наград, кнопки сбора, баннер серии | **Низкая** |
| 18 | `DailyStreakWidget` | `src/components/DailyStreakWidget.tsx` | Tailwind | Бейдж пламени, счетчик заходов | **Низкая** |
| 19 | `EventsModal` | `src/components/EventsModal.tsx` | Tailwind modal | Карточки заданий, прогресс-бары, клановые вехи | **Средняя** |
| 20 | `ClansModal` | `src/components/ClansModal.tsx` | Tailwind modal | Список кланов, казна, карточки участников, форма основания | **Средняя** |
| 21 | `PromoCodeModal` | `src/components/PromoCodeModal.tsx` | Tailwind modal | Поле ввода кода, история активаций, бейджи статусов | **Низкая** |
| 22 | `CampaignsModal` | `src/components/CampaignsModal.tsx` | Tailwind modal | Список подарочных акций, бейджи наград, таймеры | **Низкая** |
| 23 | `CampaignGiftNotificationModal` | `src/components/CampaignGiftNotificationModal.tsx` | Tailwind modal | Модалка чествования подарка, карточки наград | **Низкая** |
| 24 | `AuthModal` | `src/components/AuthModal.tsx` | Inline style + Tailwind | `style={{ backgroundImage: noirLobbyBg }}`, инпуты, кнопки входа | **Средняя** |
| 25 | `SettingsModal` | `src/components/SettingsModal.tsx` | Tailwind modal | Переключатели тем, звуковые ползунки, селекторы камеры | **Низкая** |
| 26 | `NavigationDrawer` | `src/components/NavigationDrawer.tsx` | Tailwind drawer | Боковое мобильное меню `#111218`, иконки разделов | **Низкая** |
| 27 | `CreateRoomModal` | `src/components/CreateRoomModal.tsx` | Tailwind modal | Селекторы режимов, тумблеры ролей, ползунки таймеров | **Средняя** |
| 28 | `RoleSelectCardModal` | `src/components/RoleSelectCardModal.tsx` | Tailwind modal | Сетка выбора роли перед стартом матча | **Низкая** |
| 29 | `RulesModal` | `src/components/RulesModal.tsx` | Tailwind modal | Книга правил, списки фаз | **Низкая** |
| 30 | `RoleGuideModal` | `src/components/RoleGuideModal.tsx` | Tailwind modal | Досье ролей, карточки команд | **Низкая** |
| 31 | `FeedbackModal` | `src/components/FeedbackModal.tsx` | Tailwind modal | Форма обратной связи, превью скриншотов | **Низкая** |
| 32 | `ReportPlayerModal` | `src/components/ReportPlayerModal.tsx` | Tailwind modal | Форма жалобы, категории нарушений | **Низкая** |
| 33 | `FriendsView` | `src/components/FriendsView.tsx` | Tailwind subview | Список друзей, карточки заявок, поиск | **Низкая** |
| 34 | `GameHistoryView` | `src/components/GameHistoryView.tsx` | Tailwind subview | Таблица истории партий, бейджи побед/поражений | **Низкая** |
| 35 | `DetailedStatsView` | `src/components/DetailedStatsView.tsx` | Tailwind + Recharts | Графики винрейта, круговые диаграммы ролей | **Средняя** |
| 36 | `RoleMasteryView` | `src/components/RoleMasteryView.tsx` | Tailwind subview | Ранги мастерства, золотые вензеля, шкала опыта | **Низкая** |
| 37 | `DetectiveNotebook` | `src/components/DetectiveNotebook.tsx` | Tailwind overlay | Блокнот Шерифа, карточки заметок по игрокам | **Средняя** |
| 38 | `EventFeedOverlay` | `src/components/EventFeedOverlay.tsx` | Tailwind overlay | Всплывающие уведомления о смертях и фолах в игре | **Низкая** |
| 39 | `RoleRevealView` | `src/components/RoleRevealView.tsx` | Tailwind + 3D | Анимация переворота секретной карты роли в начале матча | **Средняя** |
| 40 | `WebRtcControlsBar` | `src/components/WebRtcControlsBar.tsx` | Tailwind floating | Парящая панель микрофона/камеры за столом | **Низкая** |
| 41 | `WebRtcSettingsPanel` | `src/components/WebRtcSettingsPanel.tsx` | Tailwind | Индикатор громкости микрофона, превью видеопотока | **Низкая** |
| 42 | `LoadingScreen` | `src/components/LoadingScreen.tsx` | Inline style + Tailwind | Сплэш-экран, прогресс-бар загрузки | **Низкая** |
| 43 | `GangsterIcon` | `src/components/GangsterIcon.tsx` | SVG | Фирменный логотип мафиози в шляпе | **Низкая** |
| 44 | `OfflineIndicator` | `src/components/OfflineIndicator.tsx` | Tailwind banner | Плашка обрыва интернет-соединения | **Низкая** |
| 45 | `PWAInstallButton` | `src/components/PWAInstallButton.tsx` | Tailwind | Кнопка установки приложения | **Низкая** |
| 46 | `RemoteAudioRenderer` | `src/components/RemoteAudioRenderer.tsx` | Headless React | Невизуальный аудиоплеер P2P-потоков | **Нет (Headless)** |

---

## 5. РЕАЛИЗОВАННАЯ АРХИТЕКТУРА ДИЗАЙН-ТОКЕНОВ (ЭТАП Б — ВЫПОЛНЕНО)

### 5.1. Полный реестр введённых дизайн-токенов (`src/index.css`)
В `:root` (Стандартный Noir) и `html.light:not([data-ui-skin])` (Светлая тема) объявлены 7 групп семантических переменных с двусторонними алиасами совместимости:

1. **Фоны и поверхности:**
   * `--skin-bg-canvas`, `--skin-bg-surface`, `--skin-bg-card`, `--skin-bg-subcard`, `--skin-bg-subtle`, `--skin-bg-elevated`, `--skin-bg-modal`, `--skin-bg-overlay`, `--skin-bg-backdrop`, `--skin-bg-header`, `--skin-bg-drawer`, `--skin-bg-slot`, `--skin-bg-slot-hover`
   * Алиасы совместимости: `--skin-bg`, `--skin-bg-dark`, `--skin-surface`, `--skin-card`
2. **Фоны экранов, визуальные ресурсы и декоративные текстуры:**
   * `--skin-img-canvas`, `--skin-img-lobby`, `--skin-img-game`, `--skin-img-auth`, `--skin-img-table-texture`, `--skin-img-card-texture`, `--skin-img-ornament`, `--skin-img-avatar-ring`, `--skin-overlay-pattern`, `--skin-overlay-opacity`
3. **Игровой стол и элементы матча:**
   * `--skin-bg-table`, `--skin-table-felt-bg`, `--skin-table-rim-border`, `--skin-table-rim-glow`, `--skin-video-card-bg`, `--skin-video-card-border`, `--skin-video-card-speaking-border`, `--skin-video-card-speaking-glow`, `--skin-night-overlay-bg`
4. **Типографика и цвета текста:**
   * `--skin-text-primary`, `--skin-text-secondary`, `--skin-text-muted`, `--skin-text-subtle`, `--skin-text-accent`, `--skin-text-on-accent`, `--skin-text-shadow-title`
   * `--skin-font-heading`, `--skin-font-display`, `--skin-font-body`, `--skin-font-mono`
   * Алиасы совместимости: `--skin-text-title`, `--skin-text-body`, `--skin-text-cyan`
5. **Акценты, кнопки и поля ввода:**
   * `--skin-accent-primary`, `--skin-accent-secondary`, `--skin-primary`, `--skin-primary-hover`, `--skin-accent`, `--skin-accent-hover`, `--skin-btn-enter`
   * `--skin-btn-primary-bg`, `--skin-btn-primary-bg-hover`, `--skin-btn-primary-text`, `--skin-btn-primary-border`, `--skin-btn-primary-glow`
   * `--skin-btn-secondary-bg`, `--skin-btn-secondary-bg-hover`, `--skin-btn-secondary-text`, `--skin-btn-secondary-border`
   * `--skin-btn-join-bg`, `--skin-btn-join-border`, `--skin-btn-join-shadow`
   * `--skin-input-bg`, `--skin-input-text`, `--skin-input-border`, `--skin-input-border-focus`, `--skin-input-placeholder`
6. **Границы, радиусы, тени и свечения:**
   * `--skin-border-base`, `--skin-border-subtle`, `--skin-border-strong`, `--skin-border-accent`, `--skin-border-header`, `--skin-border-table`, `--skin-border-width-card`
   * `--skin-radius-card`, `--skin-radius-modal`, `--skin-radius-btn`, `--skin-radius-input`, `--skin-radius-badge`
   * `--skin-shadow-card`, `--skin-shadow-modal`, `--skin-glow-accent`
   * Алиасы совместимости: `--skin-border`, `--skin-border-card`, `--skin-border-magenta`, `--skin-border-cyan`, `--skin-card-radius`, `--skin-glow`, `--skin-primary-glow`
7. **Анимации, визуальные эффекты и скроллбар:**
   * `--skin-backdrop-blur`, `--skin-transition-fast`, `--skin-transition-base`, `--skin-hover-transform`, `--skin-icon-filter`
   * `--skin-scrollbar-track`, `--skin-scrollbar-thumb`, `--skin-scrollbar-thumb-hover`

### 5.2. Механизм динамической инъекции токенов (`src/context/SkinContext.tsx`)
При выборе любого скина `SkinContext` формирует тег `<style id="dynamic-ui-skin-tokens">` со скоупом `:root[data-ui-skin="<skinId>"]`, автоматически связывая переменные из `server/skins/<skinId>/theme.json` и `manifest.json` с каноническими токенами `--skin-*`. При сбросе на `default` оба динамических тега (`#dynamic-ui-skin-tokens` и `#dynamic-ui-skin-style`) удаляются из DOM, мгновенно возвращая эталонный стиль Noir.

---

## 6. РЕАЛИЗОВАННАЯ ДВУХУРОВНЕВАЯ ИЗОЛЯЦИЯ АДМИНКИ (ЭТАП Б — ВЫПОЛНЕНО)

Для 100% защиты административной панели (`AdminPanelModal.tsx` и всех 9 вложенных административных subview, модальных окон и уведомлений) внедрена тройная защита:

1. **Уровень 1 (Селекторный скоупинг в CSS скинов и светлой темы):**
   * Все правила в `server/skins/*/styles.css` (включая ранее незащищённые фоновые классы `.bg-[#0b0d11]`, `.bg-[#0d0e13]`, `.bg-[#0d0d12]`, `.bg-[#0f1017]`, `.bg-zinc-950`) изолированы селекторами `:not([data-skin-exempt="true"] *):not([data-skin-exempt="true"])`.
   * Все правила светлой темы в `src/index.css` ограничены селектором `html.light:not([data-ui-skin])` и исключают `.admin-panel-exempt` / `[data-skin-exempt="true"] *`.
2. **Уровень 2 (Токен-стена / Token Cascade Wall в `src/index.css`):**
   * На `.admin-panel-exempt, [data-skin-exempt="true"], .admin-panel-exempt *, [data-skin-exempt="true"] *` установлен принудительный сброс всех `--skin-*` переменных к стандартным тёмным константам Noir с директивой `!important` и `color-scheme: dark !important`.
3. **Замыкающий динамический барьер в `<head>` (`#admin-panel-skin-isolation-guard`):**
   * В `SkinContext.tsx` после монтирования `#dynamic-ui-skin-style` в конец `document.head` всегда перемещается замыкающий тег `<style id="admin-panel-skin-isolation-guard">`, гарантирующий приоритет стилей админки по порядку следования в DOM даже при равной специфичности `!important`.

---

## 7. ИНТЕГРАЦИЯ С ЭКОНОМИКОЙ И ЕДИНЫМ КАТАЛОГОМ ПРЕДМЕТОВ

1. **Единый каталог:** Скины регистрируются как обычные предметы в `shop_items` (`category: 'cosmetics'`, `cosmeticType: 'ui_skin'`).
2. **Инвентарь и экипировка:** Игрок может экипировать только скин из своего инвентаря (`quantity > 0`) либо `default` (суперадминистраторы имеют доступ ко всем скинам).
3. **Независимость игроков:** Скин применяется локально на клиенте конкретного игрока (`document.documentElement.setAttribute('data-ui-skin', ...)`).

---

## 8. ПОЭТАПНЫЙ ПЛАН РЕАЛИЗАЦИИ

### Проверка `COSM-01` — ✅ ВЫПОЛНЕНО
* Подтверждён фактический механизм сохранения выбранного скина через `localStorage` (`mafia_equipped_ui_skin`) и защитное условие `if (user?.equippedCosmetics?.uiSkin)` в `App.tsx`.
* Работающие серверные методы `equipSkin`, `useItem`, `rowToUser` и схема БД сохранены без изменений.

### Этап Б: Фундамент дизайн-токенов и надёжная изоляция админки — ✅ ВЫПОЛНЕНО
* **Изменённые файлы:**
  * `src/index.css` — полный набор `--skin-*` токенов в `:root`, семантические классы `.skin-*`, изоляция `html.light:not([data-ui-skin])` и токен-стена `.admin-panel-exempt`.
  * `src/context/SkinContext.tsx` — генерация и инъекция `#dynamic-ui-skin-tokens` из `theme.json`, двусторонние алиасы совместимости, замыкающий `#admin-panel-skin-isolation-guard`.
  * `src/context/ThemeContext.tsx` — согласование `colorScheme` при активном `data-ui-skin`.
  * `src/components/AdminPanelModal.tsx` — добавлены `admin-panel-exempt` и `data-skin-exempt="true"` на резервное окно ограничения доступа.
  * `server/skins/{cyberpunk_neon,crimson_syndicate,vintage_gold,cyber_noir,cyber_matrix}/theme.json` — расширены полным набором `--skin-*` токенов с сохранением существующих ключей.
  * `server/skins/{cyberpunk_neon,crimson_syndicate,vintage_gold,cyber_noir,cyber_matrix}/styles.css` — добавлена защита `:not([data-skin-exempt="true"] *):not([data-skin-exempt="true"])` на правила основных фонов.

### Этап В: Поэтапная адаптация пользовательских экранов

#### Этап В, Группа 1 (Главные пользовательские экраны и каркасы) — ✅ ВЫПОЛНЕНО
* **Адаптированные компоненты (6 экранных компонентов + калибровка токенов в `src/index.css`):**
  1. `src/components/Header.tsx` — верхняя панель приложения, логотип, индикатор фазы/таймера, бейдж кода комнаты, плашка профиля игрока (`.cyber-profile-badge`, `.cyber-avatar-ring`, `.cyber-level-badge`), кнопки звука, темы и меню (`.cyber-icon-cyan`).
  2. `src/components/HomeView.tsx` — главный экран хаба, внешний фон (`--skin-img-lobby`), центральная монолитная консоль (`.skin-console-frame`), шапка консоли (`.skin-header`), левая колонка списка залов (`--skin-bg-surface`), кнопка создания зала (`.cyber-create-room-btn .skin-subcard`), карточки комнат (`.cyber-room-card .skin-card`), кнопки входа/наблюдения (`.cyber-room-join-btn .skin-btn-join`), блок ручного ввода кода (`.skin-input`), правая колонка «Социальный хаб» (`--skin-bg-drawer`, виджеты `.skin-subcard`, кнопка общего чата `.skin-btn-secondary`).
  3. `src/components/LobbyView.tsx` — экран ожидания комнаты, внешний фон (`--skin-img-lobby`), монолитная консоль (`.skin-console-frame`), шапка комнаты (`.skin-header`), переключатель вкладок на мобильных устройствах, сетка карточек мест игроков (`.cyber-room-card .skin-card`) и пустых слотов (`--skin-bg-slot`), список наблюдателей, виджет выбора роли за монеты, нижняя панель действий ведущего/игрока (`.skin-btn-join`, `.skin-btn-secondary`), правая колонка настроек зала (`--skin-bg-drawer`, карточки режима игры, лимит игроков, таймеры, колода ролей), выдвижной боковой чат и журнал стола (`.skin-drawer`, вкладки каналов, лента сообщений, быстрые фразы, поле ввода `.skin-input`).
  4. `src/components/InGameView.tsx` — основной игровой экран, внешний фон (`--skin-img-game` с фоллбэком на `--skin-img-lobby` и `noirLobbyBg`), монолитная консоль (`.skin-console-frame`), верхняя шапка (`.skin-header`), экран «Договорка мафии (Нулевая минута)», компактная панель фазы и таймера (`.skin-subcard`), экран голосования с карточками кандидатов и трекером явки, карточка соло-спикера (`--skin-video-card-bg`, `--skin-video-speaker-border`, `--skin-video-speaker-shadow`), панель выставленных кандидатов, сетка карточек игроков за столом (`--skin-video-card-bg`, `.cyber-room-card`), нижняя панель действий/пропуска речи, правая колонка игрового чата и журнала (`--skin-bg-drawer`, вкладки каналов, статус онлайна, сообщения, быстрые фразы, `.skin-input`), модальное окно подтверждения остановки матча (`.skin-modal`).
  5. `src/components/AuthModal.tsx` — полноэкранное окно авторизации и регистрации, фон экрана (`--skin-img-auth` с фоллбэком на `--skin-img-lobby` и `noirLobbyBg`), подложка (`--skin-bg-backdrop`), контейнер модального окна (`.skin-modal`, `--skin-bg-modal`), левый приветственный баннер (`from-[var(--skin-bg-elevated)] to-[var(--skin-bg-modal)]`), переключатель вкладок «Вход / Регистрация», поля ввода (`.skin-input`), основные кнопки отправки (`.skin-btn-primary`) и кнопка Google (`.skin-btn-secondary`).
  6. `src/components/LoadingScreen.tsx` — загрузочный экран приложения, основной холст (`--skin-bg-canvas`), фоновое изображение (`--skin-img-canvas` с фоллбэком на `--skin-img-lobby` и `noirLobbyBg`), рамка логотипа (`.cyber-avatar-ring`, `--skin-border-accent`, `--skin-glow-accent`), типографика заголовка (`--skin-text-primary`, `--skin-text-shadow-title`) и карточка индикатора загрузки (`.skin-card`, `--skin-bg-surface`).
* **Переведённые жёстко зашитые стили на систему `--skin-*`:**
  * Жёсткие hex-фоны (`bg-[#060608]`, `bg-[#090a0f]`, `bg-[#0d0e13]`, `bg-[#101117]`, `bg-[#111218]`, `bg-[#12131c]`, `bg-[#13141a]`, `bg-[#14151b]`, `bg-[#151620]`, `bg-[#161822]`, `bg-zinc-900/950`) заменены на семантические переменные `--skin-bg-canvas`, `--skin-bg-overlay`, `--skin-bg-surface`, `--skin-bg-drawer`, `--skin-bg-header`, `--skin-bg-card`, `--skin-bg-subcard`, `--skin-bg-elevated`, `--skin-bg-slot`, `--skin-bg-modal`, `--skin-video-card-bg`.
  * Жёсткие рамки (`border-zinc-800`, `border-zinc-800/80`, `border-zinc-800/60`, `border-white/[0.07]`) заменены на `--skin-border-base`, `--skin-border-subtle`, `--skin-border-strong`, `--skin-border-header`, `--skin-border-accent`, `--skin-video-speaker-border`.
  * Жёсткие градиенты основных кнопок (`bg-gradient-to-r from-[#b85820] to-[#8c3d12]`) переведены на `.skin-btn-join` (`--skin-btn-join-bg`, `--skin-btn-join-border`, `--skin-btn-join-shadow`) и `.skin-btn-primary` (`--skin-btn-primary-bg`).
  * Инлайн-фоны `backgroundImage: url(${noirLobbyBg})` переведены на CSS-выражения с цепочкой фоллбэков: `var(--skin-img-lobby, url(${noirLobbyBg}))`, `var(--skin-img-game, var(--skin-img-lobby, url(${noirLobbyBg})))`, `var(--skin-img-auth, var(--skin-img-lobby, url(${noirLobbyBg})))`, `var(--skin-img-canvas, var(--skin-img-lobby, url(${noirLobbyBg})))`. В `:root` пустые `none` для `--skin-img-canvas/lobby/game/auth` убраны, чтобы стандартный Noir и скины без собственных фоновых картинок прозрачно использовали `noirLobbyBg`, а скины с заданным `--skin-img-*` в `theme.json` заменяли фон экрана.
* **Оставшиеся ограничения после Группы 1:**
  * Внутри экранов Группы 1 рендерятся дочерние компоненты, относящиеся к Группе 2 и Группе 3 (видеослоты `PlayerVideoSlot`, оверлей ночной фазы `NightPhaseView`, экран раскрытия роли `RoleRevealView`, лента событий `EventFeedOverlay`, итоги матча `GameOverView`, боковые дроверы `NavigationDrawer`, `GlobalChatDrawer` и модальные окна `UserProfileModal`, `ShopModal`, `ClansModal` и др.), которые сохраняют свои локальные стили до их целевой адаптации на следующих этапах.

#### Этап В, Группа 2А (Игровые компоненты непосредственного хода партии) — ✅ ВЫПОЛНЕНО
* **Адаптированные компоненты (5 компонентов матча):**
  1. `src/components/PlayerVideoSlot.tsx` — видеослот игрока за столом: адаптированы поверхность и рамка слота (`--skin-video-card-bg`, `--skin-video-card-border`), свечение и кольцо активного спикера (`--skin-video-card-speaking-border`, `--skin-video-card-speaking-glow`), градиент и аватар заглушки при выключенной камере (`from-[var(--skin-bg-elevated)] to-[var(--skin-video-card-bg)]`, `.cyber-avatar-ring`), индикатор блокировки входящего видео и локальная панель переключателей микрофона/камеры (`--skin-bg-overlay`, `--skin-border-strong`). Логика WebRTC-потоков, размеры слотов и семантика живого/мёртвого игрока сохранены без изменений.
  2. `src/components/RoleRevealView.tsx` — полноэкранное раскрытие тайной роли: адаптированы экран наблюдателя (`.skin-subcard`, `--skin-bg-subcard`), верхний баннер фазы, стандартная рубашка 3D-карты (`from-[var(--skin-bg-elevated)] via-[var(--skin-bg-card)] to-[var(--skin-bg-canvas)] border-[var(--skin-border-accent)]` при полном сохранении специальных рубашек `card_gold` и `card_crimson`), лицевая сторона карты (`--skin-bg-card`), информационные блоки хода и приоритета, тактические кнопки управления (`.skin-btn-secondary`, `.skin-btn-primary`) и нижняя плашка таймера старта матча. 3D-вращение, блики и фирменные цвета ролей (`def.color`) сохранены.
  3. `src/components/NightPhaseView.tsx` — интерфейс ночной фазы и действий ролей: адаптированы верхняя шапка ночи (`.skin-subcard`), всплывающая справка по целям и условию победы роли (`.skin-modal`, `--skin-bg-modal`, `--skin-border-accent`), экраны наблюдателя, погибшего игрока и спящего мирного жителя (`.skin-card`), консоль активной ночной роли (`.skin-card`), двухшаговый переключатель Дона (`.skin-subcard`), карточки выбора целей в сетке игроков (`.skin-subcard`, `--skin-bg-subcard`, `--skin-border-base`, `hover:bg-[var(--skin-bg-elevated)]`), нижняя подсказка и мобильное модальное окно результата проверки Шерифа (`--skin-bg-backdrop`, `.skin-modal`, `.skin-btn-primary`). Вся логика ночных действий и семантическая цветовая индикация проверок (мафия/мирный/шериф) сохранены.
  4. `src/components/EventFeedOverlay.tsx` — плавающая кнопка и выдвижная шторка хроники событий партии: адаптированы кнопка быстрого вызова (`.skin-btn-secondary`, `--skin-bg-subcard`, `--skin-border-accent`), подложка (`--skin-bg-backdrop`), контейнер шторки (`.skin-modal`, `--skin-bg-modal`), шапка (`.skin-header`, `--skin-bg-header`), нейтральные карточки событий, типографика заголовков/описаний и нижняя панель закрытия. Семантические градиенты фаз, казней, проверок и спасённых игроков сохранены.
  5. `src/components/GameOverModal.tsx` (в первичном плане обозначен как `GameOverView.tsx`) — экран завершения партии и итоговой таблицы результатов: адаптированы подложка (`--skin-bg-backdrop`), основной контейнер (`.skin-modal`, `--skin-bg-modal`), шапка с кубком победителя (`.skin-header`, `--skin-bg-header`), блок начисления опыта и прогресс-бара уровня (`.skin-subcard`, `from-[var(--skin-bg-elevated)] via-[var(--skin-bg-subcard)] to-[var(--skin-bg-card)]`), карточки раскрытия ролей всех игроков (`.skin-subcard`, `.cyber-avatar-ring`) и нижняя панель с кнопкой перезапуска партии (`.skin-btn-join`). Семантические цвета победившей команды и бейджей ролей сохранены.

#### Этап В, Группа 2Б (Навигация, чаты, блокнот детектива и вспомогательные окна комнаты/матча) — ✅ ВЫПОЛНЕНО
* **Адаптированные компоненты и соответствие именований в репозитории:**
  1. `src/components/NavigationDrawer.tsx` — выдвижное бургер-меню навигации: адаптированы затемнение фона (`--skin-bg-backdrop`), панель меню (`.skin-drawer`, `--skin-bg-drawer`, `--skin-border-base`, `--skin-shadow-modal`), шапка (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `--skin-accent-primary`), обычные и активные пункты меню (`.skin-card`, `.skin-subcard`, `--skin-bg-elevated`, `--skin-bg-subcard`, `--skin-border-accent`, `--skin-glow-accent`), значки, типографика и подвал. Строго сохранены пункт «Выйти из комнаты» (`leave_room`), его визуальное отделение от «Выйти из аккаунта» (`logout`), «Остановить партию» (`stop_match`) и компактные размеры элементов.
  2. `src/components/LobbyChatDrawer.tsx` + `src/components/ChatPanel.tsx` (в первичном плане обозначены как `GlobalChatDrawer.tsx`) — выдвижной глобальный чат лобби клуба и вспомогательная панель чата: адаптированы подложка (`--skin-bg-backdrop`), контейнеры (`.skin-modal`, `.skin-drawer`, `--skin-bg-modal`, `--skin-bg-drawer`), шапка и вкладки каналов (`--skin-bg-header`, `--skin-bg-elevated`), карточки чужих и системных сообщений (`.skin-subcard`, `--skin-bg-subcard`), плашки собственных сообщений (`.skin-btn-primary`, `.skin-btn-join`), быстрые фразы, поле ввода (`.skin-input`) и кнопка отправки (`.skin-btn-primary`).
  3. `src/components/DetectiveNotebook.tsx` (в первичном плане обозначен как `DetectiveNotebookModal.tsx`) — модальное окно «Дневник расследования» (блокнот детектива): адаптированы подложка (`--skin-bg-backdrop`), контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-radius-modal`, `--skin-shadow-modal`), шапка (`.skin-header`, `--skin-bg-header`), строки живых (`.skin-subcard`, `--skin-bg-subcard`) и погибших (`--skin-bg-slot`) игроков, нейтральные состояния кнопок меток ролей, поле личных заметок (`.skin-input`) и нижняя панель с кнопкой «Свернуть дневник» (`.skin-btn-secondary`). Семантические цвета выбранных меток ролей (мафия/шериф/доктор/мирный) сохранены.
  4. `src/components/CreateRoomModal.tsx` — модальное окно «Создать комнату»: адаптированы подложка (`--skin-bg-backdrop`), контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`), шапка (`.skin-header`, `--skin-bg-header`, `.cyber-avatar-ring`), поле названия стола (`.skin-input`) и кнопка запуска «Создать и войти» (`.cyber-room-join-btn .skin-btn-join`).
  5. Всплывающее окно приглашения/входа в созданную комнату `activeRoomInvite` в `src/App.tsx` (вместе с плашкой созданной комнаты `#roomCode` в шапке `LobbyView.tsx`, заменяющие отдельный `RoomCreatedModal.tsx` в фактической архитектуре) — адаптированы контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-accent`), плашка кода комнаты `#roomCode` (`--skin-bg-subcard`, `--skin-border-base`), кнопка «Войти в игру» (`.cyber-room-join-btn .skin-btn-join`) и кнопка отмены (`.skin-btn-secondary`). Также адаптированы корневой фон `App.tsx` (`--skin-bg-canvas`) и всплывающий HUD переключения звука (`soundToast`).
  6. `src/components/RoleSelectCardModal.tsx` + `src/components/RoleGuideModal.tsx` (в первичном плане обозначены как `RoleProbabilitiesModal.tsx`) — модальное окно выбора роли по карточкам с блоком механики распределения/вероятностей («100% Гарантия», «Рандом при споре», «Одноразовый расход») и справочник ролей: адаптированы подложка (`--skin-bg-backdrop`), контейнеры (`.skin-modal`), шапки (`.skin-header`), блок правил вероятностей (`.skin-card`) и его 3 информационные подкарточки (`.skin-subcard`), карточки доступных ролей в комнате, предупреждение о нехватке карт и кнопки действий (`.skin-btn-secondary`, `.skin-btn-primary`, `.cyber-room-join-btn .skin-btn-join`).
  7. Вспомогательные модальные окна комнаты и матча: `src/components/MorningReportModal.tsx` (утренняя газета / сводка ночных событий), `src/components/RulesModal.tsx` (правила игры и кодекс клуба) и `src/components/ReportPlayerModal.tsx` (подача жалобы на игрока) — переведены на `--skin-bg-backdrop`, `.skin-modal`, `.skin-header`, `.skin-subcard`, `.skin-input`, `.skin-btn-secondary` при сохранении семантических акцентов потерь, проверок Шерифа/Дона и отправки жалобы.

#### Этап В, Группа 3А (Личный профиль, инвентарь, косметика и вложенные разделы досье) — ✅ ВЫПОЛНЕНО
* **Адаптированные компоненты (8 компонентов досье и инвентаря):**
  1. `src/components/UserProfileModal.tsx` — полнофункциональное окно «Личное дело» (3918 строк): адаптированы затемнение фона (`--skin-bg-backdrop`), главный контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), десктопная и мобильная шапки профиля (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.cyber-avatar-ring`, шкала XP и плашки статусов), десктопная и мобильная панели вкладок (`--skin-bg-elevated`, `--skin-btn-primary-bg`, `--skin-bg-subcard`), скролл-контейнер содержимого (`flex-1 min-h-0 overflow-y-auto`), все внутренние вкладки (`experience`, `inventory`, `nickname`, `avatar`, `catalog`, `language`, `promocodes`, `email`), подвал окна, окно празднования открытия сундука (`unboxedLoot`), мобильная шторка «Все разделы профиля» (`isMobileSectionsDrawerOpen`) и модальное окно детального просмотра предмета (`selectedItemDetail`). Полностью сохранена рабочая логика экипировки/снятия скинов интерфейса (`skin_*`), титулов (`title`), рубашек карт (`card_back`) и использования расходников в `handleUseItem`, а также цветовая семантика редкостей предметов (`RARITY_CONFIG`).
  2. `src/components/FriendsView.tsx` — вкладка «Друзья и связи»: адаптированы блок поиска игроков (`.skin-card`, `.skin-input`), выпадающий список автодополнения (`--skin-bg-modal`, `--skin-border-strong`), панель фильтров и счётчиков, пустое состояние (`.skin-card`), карточки друзей (`.skin-card`) и модальное окно приглашения друга за игровой стол (`.skin-modal`, `.skin-header`, `.skin-subcard`, `.skin-btn-secondary`).
  3. `src/components/RoleMasteryView.tsx` — вкладка «Мастерство ролей»: адаптированы информационная панель критериев мастерства (`.skin-card`), кнопки фильтрации, карточки ролей в процессе прокачки (`--skin-bg-card`, `--skin-bg-subcard`, `--skin-border-base` при сохранении золотого свечения освоенных ролей и цветов фракций) и модальное окно подробного досье роли (`.skin-modal`, `.skin-subcard`, `.skin-btn-secondary`).
  4. `src/components/GameHistoryView.tsx` — вкладка «История матчей»: адаптированы шапка, кнопка обновления (`.skin-btn-secondary`), 4 сводные KPI-карточки (`.skin-card`), блок статистики по ролям (`.skin-card`, `.skin-subcard`), фильтр исходов, поле поиска (`.skin-input`), пустое состояние и список сыгранных партий.
  5. `src/components/DetailedStatsView.tsx` — вкладка «Детальная аналитика»: адаптированы 4 верхние сводные карточки (`.skin-card`), внутренний переключатель аналитических вкладок (`--skin-bg-elevated`, `.skin-btn-primary`), контейнеры графиков Recharts (`.skin-card`), детальные карточки ролей (`.skin-subcard`), фильтры и пустое состояние истории.
  6. `src/components/WebRtcSettingsPanel.tsx` — вкладка «Связь / WebRTC»: адаптированы карточка тестирования веб-камеры и микрофона (`.skin-card`), селекторы разрешений видео и пресетов FPS (`.skin-subcard`), ползунок частоты кадров и карточки переключателей оптимизации трафика (`.skin-subcard`).
  7. `src/components/DailyStreakWidget.tsx` — виджет ежедневной серии входов (рендерится во вкладке `daily_streak` профиля и в социальном хабе): адаптированы нейтральные поверхности, рамки и вторичные кнопки во всех вариантах (`compact_badge`, `lobby_card`, `profile_full`) с сохранением огненных акцентов активной серии.
  8. `src/components/LootboxOpenModal.tsx` — модальное окно интерактивного открытия лутбокса из инвентаря: адаптированы подложка (`--skin-bg-backdrop`), шапка и подвал (`.skin-header`, `--skin-bg-header`, `--skin-border-header`), кнопки управления звуком/закрытия/пропуска/отмены (`.skin-btn-secondary`), скролл-область (`flex-1 min-h-0 overflow-y-auto`) и таблица вероятностей выпадения (`.skin-subcard`) при сохранении фирменных визуальных тем сундуков (`classic_mafia`, `golden_vault`, `police_archive`, `neon_syndicate`) и цветов редкости наград.

#### Этап В, Группа 3Б (Магазин и Городской Ломбард) — ✅ ВЫПОЛНЕНО
* **Адаптированные компоненты (2 модальных окна экономики):**
  1. `src/components/ShopModal.tsx` — модальное окно «Магазин Города»: адаптированы подложка (`--skin-bg-backdrop`), каркас модального окна (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка (`.skin-header`, `--skin-bg-header`, `--skin-border-header`), иконка раздела и кнопка закрытия (`.skin-btn-secondary`), баланс кредитов (`text-amber-300`, `bg-amber-950/50`), панель категорий товаров (`--skin-bg-elevated`, `--skin-border-subtle`, активная вкладка `--skin-accent-primary` / `--skin-bg-subcard`), баннер промо-сертификата (`.skin-card`, `--skin-border-accent`), карточки товаров (`.skin-subcard` с сохранением цветов редкости `RARITY_CONFIG`), кнопки покупки (`.skin-btn-primary`, `--skin-glow-accent`, вторичные кнопки для неавторизованных игроков `.skin-btn-secondary`), пустое состояние раздела (`.skin-card`) и подвал окна с кнопкой перехода в инвентарь и закрытия. Добавлен `min-h-0` для сохранения независимой вертикальной прокрутки каталога. Вся экономическая логика (`/api/shop/items`, `/api/user/buy-item`), проверки баланса и обновление инвентаря сохранены без изменений.
  2. `src/components/PawnshopModal.tsx` — модальное окно «Городской Ломбард»: адаптированы подложка (`--skin-bg-backdrop`), контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), блок баланса кредитов, пустое состояние при отсутствии ценностей на сдачу (`.skin-card`, `--skin-border-base`, кнопка перехода в магазин `.skin-btn-primary`), карточки сдаваемых предметов из инвентаря (`.skin-subcard` с сохранением цветов редкости `RARITY_CONFIG`), кнопки сдачи за кредиты (`.skin-btn-secondary`, `--skin-btn-secondary-bg`, `border-amber-900/60 text-amber-300`) и подвал окна с кнопкой закрытия. Добавлен `min-h-0` для прокрутки списка предметов. Логика сдачи (`/api/user/pawn-item`), расчет выкупной стоимости (`pawnValue`) и обновление баланса игрока сохранены без изменений.

#### Этап В, Группа 3В (Кланы, События, Ежедневные бонусы, Промокоды, Акции, Настройки и Обратная связь) — ✅ ВЫПОЛНЕНО
* **Адаптированные компоненты (8 модальных окон метаигры):**
  1. `src/components/CampaignGiftNotificationModal.tsx` — всплывающее окно получения подарочной кампании/акции: адаптированы подложка (`--skin-bg-backdrop`), модальный контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка с подарком (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.cyber-avatar-ring`), карточка подарочной кампании (`.skin-subcard`, `--skin-bg-subcard`), бейдж типа кампании (`--skin-accent-primary`, `--skin-border-accent`), карточка персональной скидки (`.skin-card`, `bg-amber-950/20 border-amber-500/30 text-amber-200`) и кнопка подтверждения («Забрать подарок» `.skin-btn-primary`, `--skin-glow-accent`). Сохранены расчет таймера истечения и обработка `onClose`.
  2. `src/components/PromoCodeModal.tsx` — модальное окно активации промокода: адаптированы подложка (`--skin-bg-backdrop`), каркас модального окна (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), поле ввода промокода (`.skin-input`, `--skin-input-bg`, `--skin-input-border`, `--skin-input-text`), кнопка активации (`.skin-btn-primary`, `--skin-glow-accent`), карточка успешной награды (`.skin-card`, `border-emerald-500/40`) и подвал окна. Вся логика валидации и API активации (`/api/promo-codes/activate`) сохранены без изменений.
  3. `src/components/DailyBonusModal.tsx` — компактное окно ежедневных наград за вход: адаптированы подложка (`--skin-bg-backdrop`), компактный контейнер (`.skin-modal`, `max-w-xl max-h-[92vh]`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка со счетчиком серии (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), изолированная область вертикальной прокрутки (`min-h-0 flex-1 overflow-y-auto`), карточки 7 дней (`.skin-subcard`, `--skin-bg-subcard`, `--skin-border-base`, активный день с `--skin-border-accent` и `--skin-glow-accent`, пройденные дни с `text-emerald-400 border-emerald-500/30`), карточка мега-награды 7-го дня (`.skin-card`), кнопка получения награды (`.skin-btn-primary`, `--skin-glow-accent`) и подвал. Логика начисления наград (`/api/daily-bonus/claim`), отсчет таймеров и серии сохранена без изменений.
  4. `src/components/CampaignsModal.tsx` — модальное окно действующих городских акций и спецпредложений: адаптированы подложка (`--skin-bg-backdrop`), контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка с таймером и кнопкой закрытия (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), панель вкладок фильтрации акций (`--skin-bg-elevated`, `--skin-border-subtle`, активная вкладка `.skin-btn-primary`), скролл-контейнер (`min-h-0 flex-1 overflow-y-auto`), пустое состояние (`.skin-card`), карточки акций (`.skin-card`, `--skin-bg-card`, `--skin-border-base`), прогресс-бары выполнения условий, подкарточки наград (`.skin-subcard`), кнопки участия/забора наград (`.skin-btn-primary`, `.skin-btn-secondary`, `--skin-glow-accent`) и подвал. Логика кампаний, прогресс задач и условия спецпредложений сохранены без изменений.
  5. `src/components/FeedbackModal.tsx` — модальное окно тикетов и связи с администрацией: адаптированы подложка (`--skin-bg-backdrop`), модальный каркас (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка с переключателем режимов «Новое обращение / Мои тикеты» (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), кнопки выбора категории (`.skin-subcard`, активная категория `--skin-border-accent` и `--skin-glow-accent`), поля темы и описания (`.skin-input`), кнопка отправки (`.skin-btn-primary`), список отправленных тикетов (`.skin-card`, `--skin-bg-card`), статусы (`emerald`, `amber`, `rose`) и подвал. API отправки (`/api/feedback`) и история обращений сохранены.
  6. `src/components/SettingsModal.tsx` — модальное окно системных настроек и выбора скинов: адаптированы подложка (`--skin-bg-backdrop`), контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), скролл-контейнер (`min-h-0 flex-1 overflow-y-auto`), блок общих настроек звука и языка (`.skin-card`), секция оформления стола и карт (`.skin-card`, `.skin-subcard`), и секция выбора тем интерфейса (`.skin-card`, карточки скинов `.skin-subcard`, активная рамка `--skin-border-accent` и свечение `--skin-glow-accent`, кнопки применения `.skin-btn-primary`). **Логика проверки владения скинами намеренно оставлена без изменений до отдельного целевого этапа согласования с `UserProfileModal.tsx`.**
  7. `src/components/ClansModal.tsx` — модальное окно городских синдикатов и кланов: адаптированы подложка (`--skin-bg-backdrop`), контейнер (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка с гербом и переключателем вкладок «Мой синдикат / Рейтинг / Поиск» (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), скролл-контейнер (`min-h-0 flex-1 overflow-y-auto`), карточка клана игрока (`.skin-card`), список участников (`.skin-subcard`), строка поиска и фильтрации (`.skin-input`), карточки синдикатов в рейтинге (`.skin-subcard`, `--skin-bg-subcard`), модальное окно создания синдиката (`.skin-modal`, `.skin-input`, `.skin-btn-primary`) и кнопки вступления (`.skin-btn-primary`, `.skin-btn-secondary`). Вся клановая механика, казна и права ролей сохранены без изменений.
  8. `src/components/EventsModal.tsx` — модальное окно временных игровых событий, заданий и наград: адаптированы подложка (`--skin-bg-backdrop`), модальный каркас (`.skin-modal`, `--skin-bg-modal`, `--skin-border-card`, `--skin-shadow-modal`), шапка с таймером сезона (`.skin-header`, `--skin-bg-header`, `--skin-border-header`, `.skin-btn-secondary`), панель вкладок событий (`--skin-bg-elevated`, активная `.skin-btn-primary`), изолированная прокрутка (`min-h-0 flex-1 overflow-y-auto`), карточки активных заданий `TaskCard` (`.skin-card`, подкарточки наград `.skin-subcard`, шкалы прогресса), кнопки получения наград и реролла (`.skin-btn-primary`, `.skin-btn-secondary`), модальное окно подтверждения реролла задачи (`.skin-modal`, `.skin-header`, `.skin-subcard`, `.skin-btn-secondary`, `.skin-btn-primary`) и подвал. Вся логика трекинга заданий (`/api/events`), рероллы и награды сохранены без изменений.
* **Отложенные технические задачи (выполняются отдельным этапом после завершения адаптации компонентов):**
  1. Устранение расхождения проверки владения скином между инвентарём профиля (`UserProfileModal.tsx`) и окном настроек (`SettingsModal.tsx`).
  2. Исправление прокрутки (скролла) экранов раскрытия роли (`RoleRevealView.tsx`) и ночной фазы (`NightPhaseView.tsx`).
  3. Финальная сквозная проверка компактности и визуальной цельности всех пользовательских экранов на всех шести скинах (`default` Noir, `cyberpunk_neon`, `crimson_syndicate`, `vintage_gold`, `cyber_noir`, `cyber_matrix`).

---

## 9. КРИТЕРИИ ГОТОВНОСТИ И ТЕСТОВАЯ МАТРИЦА

| Тестовый сценарий | Ожидаемый результат | Статус верификации |
| :--- | :--- | :---: |
| **1. Сборка и типизация (`tsc` + `vite build`)** | Отсутствие ошибок TypeScript и успешная production-сборка | ✅ Проверено |
| **2. Сохранение стандартного стиля Noir** | При `activeSkin = 'default'` все токены `:root` и фоллбэки `noirLobbyBg` точно воспроизводят эталонный стиль Noir | ✅ Проверено |
| **3. Совместимость существующих скинов** | Все 5 пакетов в `server/skins/` сохраняют свои правила `.cyber-*` и управляют экранами Групп 1, 2А, 2Б, 3А, 3Б и 3В через `--skin-*` | ✅ Проверено |
| **4. Изоляция админки** | `.admin-panel-exempt` и `[data-skin-exempt="true"]` блокируют каскад токенов и селекторов скинов | ✅ Проверено по коду и стилям |
| **5. Бесконфликтность `SkinContext` и `ThemeContext`** | Светлая тема `html.light:not([data-ui-skin])` не конфликтует с кастомными скинами и не затрагивает админку | ✅ Проверено по коду и стилям |
| **6. Адаптация главных экранов (Этап В, Группа 1)** | Перевод `Header`, `HomeView`, `LobbyView`, `InGameView`, `AuthModal`, `LoadingScreen` на `--skin-*` токены | ✅ Проверено |
| **7. Адаптация игровых компонентов матча (Этап В, Группа 2А)** | Перевод `PlayerVideoSlot`, `RoleRevealView`, `NightPhaseView`, `EventFeedOverlay`, `GameOverModal` на `--skin-*` токены | ✅ Проверено |
| **8. Адаптация навигации и вспомогательных окон (Этап В, Группа 2Б)** | Перевод `NavigationDrawer`, `LobbyChatDrawer`, `ChatPanel`, `DetectiveNotebook`, `CreateRoomModal`, `RoleSelectCardModal`, `RoleGuideModal`, `MorningReportModal`, `RulesModal`, `ReportPlayerModal` и приглашения комнаты в `App.tsx` на `--skin-*` токены | ✅ Проверено |
| **9. Адаптация личного профиля и инвентаря (Этап В, Группа 3А)** | Перевод `UserProfileModal`, `FriendsView`, `RoleMasteryView`, `GameHistoryView`, `DetailedStatsView`, `WebRtcSettingsPanel`, `DailyStreakWidget`, `LootboxOpenModal` на `--skin-*` токены | ✅ Проверено |
| **10. Адаптация магазина и ломбарда (Этап В, Группа 3Б)** | Перевод `ShopModal`, `PawnshopModal` на `--skin-*` токены | ✅ Проверено |
| **11. Адаптация окон кланов, событий, бонусов и настроек (Этап В, Группа 3В)** | Перевод `ClansModal`, `EventsModal`, `DailyBonusModal`, `PromoCodeModal`, `CampaignsModal`, `CampaignGiftNotificationModal`, `FeedbackModal`, `SettingsModal` на `--skin-*` токены | ✅ Выполнено |
