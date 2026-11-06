# ПОЛНЫЙ ТЕХНИЧЕСКИЙ И ФУНКЦИОНАЛЬНЫЙ АУДИТ БУРГЕР-МЕНЮ MAFIA CLUB

> **Статус выполнения:** только аудит исходного кода. Ни один файл, компонент, обработчик, порядок кнопок или стиль не изменялись.

---

## 1. Общая архитектура бургер-меню

В текущей кодовой базе Mafia Club **нет разделения на внеигровое и игровое бургер-меню**. Во всех экранах приложения используется **один общий выдвижной компонент** — `NavigationDrawer` (`src/components/NavigationDrawer.tsx`), который монтируется независимо в трёх основных экранных представлениях (`HomeView`, `LobbyView`, `InGameView`), а также имеет четвёртую (неиспользуемую / «мёртвую») заготовку в корневом `App.tsx` и `Header.tsx`.

### Текстовая схема архитектуры

```text
src/App.tsx (Корневой контроллер состояния, WebSocket, Auth, RoomState)
 │
 ├─► [МЁРТВЫЙ КОД В App.tsx]
 │    ├─ Импорт Header (строка 3) и NavigationDrawer (строка 17) — НЕ РЕНДЕРЯТСЯ В JSX
 │    ├─ Стейт isInGameNavOpen (строка 146) и handleInGameNavTab (строки 157–211) — НИГДЕ НЕ ВЫЗЫВАЮТСЯ
 │    └─ Глобальные модалки в App.tsx (строки 1175–1348):
 │        ├─ Задействованы: RulesModal, DetectiveNotebookModal, ProfileModal, AuthModal, AdminPanelModal, WebRtcSettingsModal (standalone)
 │        └─ Дублируют локальные модалки экранов (открываются только через handleInGameNavTab или window-события):
 │           DailyBonusModal, PromoCodeModal, ClansModal, EventsModal, FeedbackModal, SettingsModal
 │
 ├─► 1. ВНЕИГРОВОЙ КОНТЕКСТ: Главный экран (!roomState)
 │    └─ src/components/HomeView.tsx (строки 1094–1135 в App.tsx)
 │        ├─ Кнопка открытия: <button onClick={() => setIsNavDrawerOpen(true)}> <Menu /> (строки 367–376)
 │        ├─ Стейт: isNavDrawerOpen (строка 125)
 │        ├─ Обработчик: handleSelectNavTab (строки 224–282)
 │        ├─ Экземпляр №1: <NavigationDrawer /> (строки 715–722)
 │        │   └─ Пропсы: isOpen, onClose, activeTab="lobby", onSelectTab, isLoggedIn, user
 │        │      (onLeaveRoom = undefined, onStopMatch = undefined, isHost = undefined)
 │        └─ Локальные модалки HomeView (строки 725–842):
 │            ShopModal, PawnshopModal, DailyBonusModal, PromoCodeModal, CampaignsModal,
 │            SettingsModal (x2 — продублирован на строках 771 и 827!), ClansModal, EventsModal, FeedbackModal
 │
 ├─► 2. ПОГРАНИЧНЫЙ КОНТЕКСТ: Ожидание в комнате / Лобби стола (roomState.phase === 'LOBBY')
 │    └─ src/components/LobbyView.tsx (строки 1048–1092 в App.tsx)
 │        ├─ Кнопка открытия: <button onClick={() => setIsNavDrawerOpen(true)}> <Menu /> (строки 364–373)
 │        ├─ Стейт: isNavDrawerOpen (строка 134)
 │        ├─ Обработчик: handleSelectNavTab (строки 170–218)
 │        ├─ Экземпляр №2: <NavigationDrawer /> (строки 1394–1403)
 │        │   └─ Пропсы: isOpen, onClose, activeTab="lobby", onSelectTab, isLoggedIn, user,
 │        │      onLeaveRoom={onLeaveRoom}, isHost={isHost} (onStopMatch = undefined)
 │        └─ Локальные модалки LobbyView (строки 1406–1514):
 │            ShopModal, PawnshopModal, DailyBonusModal, PromoCodeModal, CampaignsModal,
 │            SettingsModal, ClansModal, EventsModal, FeedbackModal, ReportPlayerModal
 │
 └─► 3. ИГРОВОЙ КОНТЕКСТ: Активная партия (roomState.phase !== 'LOBBY')
      └─ src/components/InGameView.tsx (строки 1051–1073 в App.tsx)
          ├─ Кнопка открытия: <button onClick={() => setIsNavDrawerOpen(true)}> <Menu /> (строки 568–577)
          ├─ Стейт: isNavDrawerOpen (строка 149)
          ├─ Обработчик: handleSelectNavTab (строки 265–309) — ⚠️ ОТСУТСТВУЕТ case 'feedback'!
          ├─ Экземпляр №3: <NavigationDrawer /> (строки 2212–2223)
          │   └─ Пропсы: isOpen, onClose, activeTab="lobby", onSelectTab, isLoggedIn, user,
          │      roomSettings={roomState.settings}, isHost={isHost && !roomState.closingAfterMatch},
          │      onLeaveRoom={onLeaveRoom}, onStopMatch={() => setIsStopConfirmOpen(true)}
          └─ Локальные модалки InGameView (строки 2226–2361):
              ShopModal, PawnshopModal, DailyBonusModal, PromoCodeModal, CampaignsModal,
              SettingsModal, isStopConfirmOpen (inline modal), ReportPlayerModal, ClansModal, EventsModal
              (⚠️ FeedbackModal НЕ импортирован и НЕ смонтирован в InGameView!)
```

---

## 2. Карта файлов и компонентов

| Путь к файлу | Компонент / Функция | Строки | Назначение в архитектуре бургер-меню |
| :--- | :--- | :--- | :--- |
| `src/components/NavigationDrawer.tsx` | `NavigationDrawer`, тип `NavDrawerTab` | `1–343` | Единственный UI-компонент выдвижного бургер-меню (шторка справа `max-w-xs`, 15 пунктов первого уровня + футер со сменой темы и ссылкой на `/privacy`). |
| `src/components/HomeView.tsx` | `HomeView`, `handleSelectNavTab` | `125`, `224–282`, `367–376`, `715–842` | Внеигровой хаб (список комнат, топ игроков, создание стола). Содержит кнопку бургер-меню в шапке, стейт `isNavDrawerOpen`, экземпляр `<NavigationDrawer />` и 10 локальных модальных окон. |
| `src/components/LobbyView.tsx` | `LobbyView`, `handleSelectNavTab` | `134`, `170–218`, `364–373`, `1394–1514` | Экран ожидания в комнате (`phase === 'LOBBY'`). Содержит кнопку бургер-меню в шапке, стейт `isNavDrawerOpen`, экземпляр `<NavigationDrawer />` (с `onLeaveRoom` и `isHost`) и локальные модальные окна. |
| `src/components/InGameView.tsx` | `InGameView`, `handleSelectNavTab` | `149`, `265–309`, `568–577`, `2212–2361` | Экран активной партии (`phase !== 'LOBBY'`). Содержит кнопку бургер-меню в шапке, стейт `isNavDrawerOpen`, экземпляр `<NavigationDrawer />` (с `onLeaveRoom`, `onStopMatch`, `isHost`) и локальные модальные окна. |
| `src/App.tsx` | `App`, `handleInGameNavTab`, `handleLeaveRoom`, `handleRestartGame`, `handleLogout` | `146`, `157–211`, `677–706`, `952–967`, `1175–1348` | Корневой компонент. Содержит реальные функции `handleLeaveRoom`, `handleRestartGame` (`onStopGame`), `handleLogout`, глобальные модалки (`ProfileModal`, `AuthModal`, `AdminPanelModal`, `RulesModal`, `DetectiveNotebookModal`), а также неиспользуемый стейт `isInGameNavOpen` и `handleInGameNavTab`. |
| `src/components/Header.tsx` | `Header` | `1–260` | Неиспользуемый компонент верхней панели (импортирован в `App.tsx:3`, но нигде не рендерится). Содержит кнопку `<Menu />` на строках `247–256` с вызовом `onOpenNavDrawer`. |
| `src/components/SettingsModal.tsx` | `SettingsModal` | `1–596` | Модальное окно «Настройки», открываемое из пункта `settings` бургер-меню. Имеет 2 вкладки: `general` («Основные настройки») и `webrtc` («Видео и аудио WebRTC»). |
| `src/components/WebRtcSettingsPanel.tsx` | `WebRtcSettingsPanel` | `1–519` | Вложенная панель настроек P2P WebRTC внутри вкладки `webrtc` в `SettingsModal` (также используется в отдельной `WebRtcSettingsModal`). |
| `src/components/ProfileModal.tsx` | `ProfileModal` | `1–1600+` | Модальное окно «Личный кабинет» (вкладки: Профиль, Инвентарь, Достижения, Промокоды, История, Друзья, P2P). Открывается из пункта `profile` через `App.tsx` (`isProfileOpen`). |
| `src/components/AuthModal.tsx` | `AuthModal` | `1–600+` | Модальное окно входа/регистрации/сброса пароля. Открывается из пунктов `profile`, `promocode`, `logout` (для гостя). |
| `src/components/AdminPanelModal.tsx` | `AdminPanelModal` | `1–1500+` | Панель суперадминистратора. Открывается из пункта `admin` через `App.tsx` (`isAdminOpen`). |
| `src/components/PromoCodeModal.tsx` | `PromoCodeModal` | `1–250+` | Модальное окно активации промокода или кода партнёра (пункт `promocode`). |
| `src/components/CampaignsModal.tsx` | `CampaignsModal` | `1–350+` | Модальное окно «Акции и Подарки» (пункт `campaigns`). |
| `src/components/EventsModal.tsx` | `EventsModal` | `1–600+` | Модальное окно «Ивенты и Задачи» с 4 вкладками: `global`, `onboarding`, `personal`, `clan` (пункт `tasks`). |
| `src/components/ClansModal.tsx` | `ClansModal` | `1–700+` | Модальное окно «Синдикаты и Кланы» (пункт `clans`). |
| `src/components/ShopModal.tsx` | `ShopModal` | `1–600+` | Модальное окно «Черный Рынок» (пункт `shop`). |
| `src/components/PawnshopModal.tsx` | `PawnshopModal` | `1–350+` | Модальное окно «Ломбард Дона» (пункт `pawnshop`). |
| `src/components/DailyBonusModal.tsx` | `DailyBonusModal` | `1–300+` | Модальное окно «Ежедневный бонус» (пункт `bonus`). |
| `src/components/FeedbackModal.tsx` | `FeedbackModal` | `1–400+` | Модальное окно «Обратная связь» (пункт `feedback`). |
| `src/context/ThemeContext.tsx` | `useTheme`, `ThemeProvider` | `1–100+` | Контекст светлой/тёмной темы (`resolvedTheme`, `setTheme`), управляемый кнопкой в футере `NavigationDrawer.tsx` (`строки 313–326`). |
| `src/context/SkinContext.tsx` | `useSkin`, `SkinProvider` | `1–250+` | Контекст визуальных скинов оформления (`activeSkin`, `equipSkin`), управляемый внутри `SettingsModal.tsx` (`строки 353–556`). |
| `src/context/LanguageContext.tsx` | `useLanguage`, `LanguageProvider` | `1–150+` | Контекст локализации (`ru`, `en`, `es`), используемый в `NavigationDrawer` и переключаемый в `SettingsModal` (`строки 205–238`). |

---

## 3. Все места отображения и граница между «вне игры» и «в игре»

### 3.1. Как код определяет границу между состояниями (`src/App.tsx`, строки 1047–1173)

В `src/App.tsx` переключение экранов определяется двумя условиями:
1. **`!roomState`** (`строки 1094–1135`) — пользователь находится вне комнаты, на главном экране (`<HomeView />`).
2. **`roomState.phase === 'LOBBY'`** (`строки 1048–1092`) — пользователь подключён к комнате (как игрок или зритель), но партия ещё не запущена или была сброшена обратно в лобби (`<LobbyView />`).
3. **`roomState.phase !== 'LOBBY'`** (`строки 1050–1074`) — активный игровой цикл (`<InGameView />`).

### 3.2. Таблица всех контекстов и фаз отображения бургер-меню

| Категория | Экран / Фаза (`roomState.phase`) | Где рендерится кнопка `Menu` | Доступно ли бургер-меню? | Особенности контекста |
| :--- | :--- | :--- | :--- | :--- |
| **Внеигровой контекст** | Главный экран / Список комнат (`!roomState`) | `HomeView.tsx:367–376` (правый верхний угол шапки консоли) | **Да** | Нет `onLeaveRoom` и `onStopMatch`. При открытии модалок регистрации/профиля/магазина они рендерятся поверх `HomeView`. |
| **Пограничный контекст (Лобби комнаты)** | Ожидание игроков перед стартом (`LOBBY`) | `LobbyView.tsx:364–373` (правый верхний угол шапки консоли) | **Да** | Передаётся `onLeaveRoom` и `isHost`, но **не** передаётся `onStopMatch`. Доступно и игрокам за столом, и зрителям (`isSpectator`), и хосту. |
| **Игровой контекст (Активная партия)** | `ROLE_REVEAL` (Раздача ролей) | `InGameView.tsx:568–577` | **Да** | Шапка `InGameView` остаётся видимой над `RoleRevealView` (`строки 583–595`). |
| **Игровой контекст** | `MAFIA_MEETING` (Знакомство мафии / Договорка) | `InGameView.tsx:568–577` | **Да** | Шапка `InGameView` видима над экраном договорки (`строки 596–645`). |
| **Игровой контекст** | `DAY_DISCUSSION` (Общее дневное обсуждение) | `InGameView.tsx:568–577` | **Да** | Доступно живым, убитым, зрителям и ведущему. |
| **Игровой контекст** | `INDIVIDUAL_SPEECHES` (Индивидуальные речи) | `InGameView.tsx:568–577` | **Да** | Доступно во время чужой и собственной речи. |
| **Игровой контекст** | `VOTING` (Городской суд / Голосование) | `InGameView.tsx:568–577` | **Да** | Доступно во время голосования. |
| **Игровой контекст** | `DEFENSE_SPEECH` (Оправдательные речи при ничьей) | `InGameView.tsx:568–577` | **Да** | Доступно. |
| **Игровой контекст** | `REVOTE` (Переголосование) | `InGameView.tsx:568–577` | **Да** | Доступно. |
| **Игровой контекст** | `LAST_WORDS_ARREST` (Последнее слово казнённого) | `InGameView.tsx:568–577` | **Да** | Доступно. |
| **Игровой контекст** | `NIGHT` (Ночная фаза) | `InGameView.tsx:568–577` | **Да** | Шапка `InGameView` видима над `NightPhaseView` (`строки 646–660`). |
| **Игровой контекст (С перекрытием)** | `MORNING_REPORT` (Утренние вести) | `InGameView.tsx:568–577` (под оверлеем) | **Перекрыто модалкой** (если было закрыто) | В `App.tsx:1144–1154` поверх `InGameView` рендерится `MorningReportModal` (`fixed inset-0 z-50`). Если бургер-меню уже было открыто до наступления утра, оно остаётся на том же `z-50` (но ниже в DOM, поэтому перекрывается `MorningReportModal`). |
| **Игровой контекст** | `LAST_WORDS_KILLED` (Завещание убитого ночью) | `InGameView.tsx:568–577` | **Да** | Доступно. |
| **Игровой контекст (Финал партии)** | `GAME_OVER` (Финал партии) | `InGameView.tsx:568–577` (под оверлеем) | **Перекрыто модалкой** (до нажатия «Закрыть сводку») | В `App.tsx:1157–1173` поверх `InGameView` рендерится `GameOverModal` (`fixed inset-0 z-50`), пока `isGameOverDismissed === false`. Если игрок нажимает «Закрыть сводку» внутри `GameOverModal`, открывается обзор стола `InGameView`, где бургер-меню снова полностью доступно. |

---

## 4. Точная структура внеигрового меню (`HomeView` и `LobbyView`)

Ниже приведена **точная фактическая иерархия сверху вниз** согласно массиву `menuItems` в `src/components/NavigationDrawer.tsx` (`строки 78–219`) и разметке компонента (`строки 229–340`).

### 4.1. Шапка бургер-меню (`NavigationDrawer.tsx`, строки 239–266)
- Иконка `GangsterIcon` (`size={26}`) + заголовок **«Меню клуба»** (`t('nav.club_menu')`) + подзаголовок **«Навигация по разделам»** (`t('nav.sections_nav')`).
- Кнопка закрытия `[X]` (`onClick={onClose}`, `строки 256–265`).

### 4.2. Список пунктов первого уровня во внеигровом меню (`HomeView.tsx`)

| Порядок сверху вниз | ID (`NavDrawerTab`) | Заголовок (RU) | Подзаголовок (RU) | Бейдж | Отображается для Гостя (`!isLoggedIn`) | Отображается для Авторизованного (`isLoggedIn`) | Отображается для Админа (`isSuperAdmin`) |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **1** | `lobby` | **Лобби** *(активен)* | Активные столы и создание комнаты | — | ✅ Да | ✅ Да | ✅ Да |
| **2** | `admin` | **Панель Администратора** | Управление сервером, игроками и экономикой | — | ❌ Нет | ❌ Нет | ✅ **Да** |
| **3** | `profile` | **Личный кабинет** | Статистика, аватар и инвентарь | — | ✅ Да *(открывает AuthModal)* | ✅ Да *(открывает ProfileModal)* | ✅ Да |
| **4** | `promocode` | **Активировать промокод** | Ввод промокода или кода партнёра и получение наград | `БОНУС` | ❌ Нет | ✅ Да | ✅ Да |
| **5** | `campaigns` | **Акции** | Подарки к открытию клуба и праздничные события | `ПОДАРКИ` | ❌ Нет | ✅ Да | ✅ Да |
| **6** | `tasks` | **Ивенты и Задачи** | 4 типа квестов, награды и этапы синдиката | `КВЕСТЫ` | ✅ Да | ✅ Да | ✅ Да |
| **7** | `clans` | **Синдикаты и Кланы** | Вступить в клан или создать свою семью *(или `Клан: [TAG] • Казна и состав`)* | `[TAG]` *(если в клане)* | ✅ Да | ✅ Да | ✅ Да |
| **8** | `shop` | **Черный Рынок** | Сундуки, монеты и сертификаты | — | ✅ Да | ✅ Да | ✅ Да |
| **9** | `pawnshop` | **Ломбард Дона** | Скупка предметов за монеты | — | ✅ Да | ✅ Да | ✅ Да |
| **10** | `bonus` | **Ежедневный бонус** | Заберите бесплатную награду сегодня! *(или `Серия: X дн. • Бонус получен`)* | `ДОСТУПНО!` / `ПОЛУЧЕНО` / `7 ДНЕЙ` | ✅ Да | ✅ Да | ✅ Да |
| **11** | `feedback` | **Обратная связь** | Сообщить о баге или предложить идею | `БАГИ / ИДЕИ` | ✅ Да | ✅ Да | ✅ Да |
| *(12)* | `stop_match` | *(Скрыт в HomeView и LobbyView)* | — | — | ❌ Нет | ❌ Нет | ❌ Нет |
| **13** | `leave_room` | **Выйти из комнаты** *(только в `LobbyView`!)* | Покинуть текущий стол и вернуться в общее лобби | — | ❌ В `HomeView` / ✅ В `LobbyView` | ❌ В `HomeView` / ✅ В `LobbyView` | ❌ В `HomeView` / ✅ В `LobbyView` |
| **14** | `settings` | **Настройки** | Язык, звук, правила и параметры видеосвязи | — | ✅ Да | ✅ Да | ✅ Да |
| **15** | `logout` | **Войти в аккаунт** *(Гость)* / **Выйти из аккаунта** *(Авториз.)* | Авторизация и профиль / Сменить персонажа или выйти из системы | — | ✅ Да *(«Войти в аккаунт»)* | ✅ Да *(«Выйти из аккаунта»)* | ✅ Да *(«Выйти из аккаунта»)* |

### 4.3. Футер бургер-меню (`NavigationDrawer.tsx`, строки 310–336)
1. **Переключатель темы:** кнопка `Светлая` (иконка `Sun`) / `Тёмная` (иконка `Moon`) — переключает `setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')` без закрытия шторки меню.
2. **Ссылка конфиденциальности:** `<a href="/privacy" target="_blank" rel="noopener noreferrer">Конфиденциальность</a>` + текст `Mafia Club`.

---

## 5. Точная структура игрового меню (`InGameView`)

В `InGameView.tsx` (`строки 2212–2223`) рендерится **тот же самый компонент `NavigationDrawer`**, с теми же 15 пунктами, но за счёт передачи пропсов `onLeaveRoom={onLeaveRoom}`, `isHost={isHost && !roomState.closingAfterMatch}` и `onStopMatch={() => setIsStopConfirmOpen(true)}` в нём активируются опасные (красные) игровые пункты `stop_match` и `leave_room`.

### 5.1. Список пунктов первого уровня в игровом меню (`InGameView.tsx`)

| Порядок сверху вниз | ID (`NavDrawerTab`) | Заголовок (RU) | Отображается для Игрока (живого / убитого) | Отображается для Зрителя (`isSpectator`) | Отображается для Ведущего (`isHost && !closingAfterMatch`) | Фактическое поведение в `InGameView` |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **1** | `lobby` | **Лобби** *(подсвечен как активный!)* | ✅ Да | ✅ Да | ✅ Да | ⚠️ **Немедленно вызывает `onLeaveRoom()` без подтверждения!** Дублирует кнопку «Выйти из комнаты». |
| **2** | `admin` | **Панель Администратора** | Только `isSuperAdmin` | Только `isSuperAdmin` | Только `isSuperAdmin` | Открывает `AdminPanelModal` поверх партии. |
| **3** | `profile` | **Личный кабинет** | ✅ Да | ✅ Да | ✅ Да | Открывает `ProfileModal` (или `AuthModal` для гостя) поверх партии. |
| **4** | `promocode` | **Активировать промокод** | Только `isAuthenticated` | Только `isAuthenticated` | Только `isAuthenticated` | Открывает `PromoCodeModal` поверх партии. |
| **5** | `campaigns` | **Акции** | Только `isAuthenticated` | Только `isAuthenticated` | Только `isAuthenticated` | Открывает `CampaignsModal` поверх партии. |
| **6** | `tasks` | **Ивенты и Задачи** | ✅ Да | ✅ Да | ✅ Да | Открывает `EventsModal` поверх партии. |
| **7** | `clans` | **Синдикаты и Кланы** | ✅ Да | ✅ Да | ✅ Да | Открывает `ClansModal` поверх партии. |
| **8** | `shop` | **Черный Рынок** | ✅ Да | ✅ Да | ✅ Да | Открывает `ShopModal` поверх партии. |
| **9** | `pawnshop` | **Ломбард Дона** | ✅ Да | ✅ Да | ✅ Да | Открывает `PawnshopModal` поверх партии. |
| **10** | `bonus` | **Ежедневный бонус** | ✅ Да | ✅ Да | ✅ Да | Открывает `DailyBonusModal` поверх партии. |
| **11** | `feedback` | **Обратная связь** | ✅ Да (кнопка видна) | ✅ Да (кнопка видна) | ✅ Да (кнопка видна) | ❌ **БАГ:** Кнопка видна в меню, но в `InGameView.tsx:265–309` нет `case 'feedback'`, а `FeedbackModal` не смонтирован. При нажатии меню просто закрывается, ничего не происходит! |
| **12** | `stop_match` | **Остановить партию** *(красная, бейдж `ВЕДУЩИЙ`)* | ❌ Нет | ❌ Нет (`isHost` всегда `false` у зрителя) | ✅ **Да** (если `!roomState.closingAfterMatch`) | Закрывает шторку и открывает модалку подтверждения `isStopConfirmOpen` (`InGameView.tsx:2282–2321`), которая при подтверждении отправляет `RESTART_GAME`. |
| **13** | `leave_room` | **Выйти из комнаты** *(красная)* | ✅ Да | ✅ Да | ✅ Да | Закрывает шторку и немедленно вызывает `onLeaveRoom()` (`LEAVE_ROOM` по WebSocket). |
| **14** | `settings` | **Настройки** | ✅ Да | ✅ Да | ✅ Да | Открывает `SettingsModal` поверх партии. |
| **15** | `logout` | **Выйти из аккаунта** / **Войти в аккаунт** | ✅ Да | ✅ Да | ✅ Да | Для авторизованного вызывает `onLogout()` (удаляет токен, закрывает WS, выбрасывает из партии на главный экран); для гостя открывает `AuthModal`. |

---

## 6. Полная таблица кнопок первого уровня и всех вложенных действий

### 6.1. Кнопки первого уровня (`src/components/NavigationDrawer.tsx`)

| № | ID / Ключ | Текст и подзаголовок (RU) | Иконка / Стили / Бейдж | Контекст показа | Условие видимости (`NavigationDrawer.tsx`) | Обработчик клика (`NavigationDrawer.tsx:274–285`) | Целевые обработчики в `HomeView` / `LobbyView` / `InGameView` | Сетевые запросы / WebSocket / Side Effects |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | `close_btn` | `title="Закрыть меню"` | `X` (`w-5 h-5`), `p-2 rounded-xl` | Всегда в шапке шторки (`256–265`) | Всегда | `sounds.playTick(); onClose();` | `setIsNavDrawerOpen(false)` | Только локальный UI-стейт. |
| **1** | `lobby` | **Лобби** — *Активные столы и создание комнаты* | `Gamepad2` (`w-5 h-5`), `activeTab === 'lobby'` (всегда подсвечен янтарной рамкой!) | Все 3 экрана (`79–85`) | Всегда | `sounds.playTick(); onSelectTab('lobby');` | • `HomeView:227`: ничего не делает (закрывает меню)<br>• `LobbyView:172`: **`onLeaveRoom()`**<br>• `InGameView:268`: **`onLeaveRoom()`** | В `LobbyView` и `InGameView` отправляет WS `LEAVE_ROOM`, сбрасывает `roomState` в `null`, очищает `?room=` в URL. |
| **2** | `admin` | **Панель Администратора** — *Управление сервером, игроками и экономикой* | `Crown` (`w-5 h-5 text-amber-400`) | Все 3 экрана (`87–95`) | `isSuperAdmin`: `Boolean(user && (user.isAdmin === true \|\| user.role === 'admin' \|\| user.email?.toLowerCase() === 'vledahovic@gmail.com'))` | `sounds.playTick(); onSelectTab('admin');` | `onOpenAdmin()` -> в `App.tsx`: `setIsAdminOpen(true)` | Открывает `AdminPanelModal`, который делает `GET /api/admin/*`. |
| **3** | `profile` | **Личный кабинет** — *Статистика, аватар и инвентарь* | `User` (`w-5 h-5`) | Все 3 экрана (`96–102`) | Всегда | `sounds.playTick(); onSelectTab('profile');` | `if (isLoggedIn) onOpenProfile(); else onOpenAuth();` | Открывает `ProfileModal` (`App.tsx:1203`) или `AuthModal` (`App.tsx:1257`). |
| **4** | `promocode` | **Активировать промокод** — *Ввод промокода или кода партнёра и получение наград* | `Ticket` (`w-5 h-5`), бейдж `БОНУС` (янтарный) | Все 3 экрана (`104–113`) | `isAuthenticated`: `Boolean(isLoggedIn \|\| user)` | `sounds.playTick(); onSelectTab('promocode');` | `setIsPromoModalOpen(true)` (или `onOpenAuth()` если `!isLoggedIn`) | Открывает локальный `PromoCodeModal` (`POST /api/promocodes/redeem`, `POST /api/creator-code/bind`). |
| **5** | `campaigns` | **Акции** — *Подарки к открытию клуба и праздничные события* | `Flame` (`w-5 h-5`), бейдж `ПОДАРКИ` (янтарный) | Все 3 экрана (`114–123`) | `isAuthenticated`: `Boolean(isLoggedIn \|\| user)` | `sounds.playTick(); onSelectTab('campaigns');` | `setIsCampaignsOpen(true)` | Открывает локальный `CampaignsModal` (`GET /api/campaigns/active`, `POST /api/campaigns/:id/claim`). |
| **6** | `tasks` | **Ивенты и Задачи** — *4 типа квестов, награды и этапы синдиката* | `Sparkles` (`w-5 h-5`), бейдж `КВЕСТЫ` | Все 3 экрана (`124–131`) | Всегда | `sounds.playTick(); onSelectTab('tasks');` | `setTasksDefaultTab('global'); setIsTasksOpen(true);` | Открывает локальный `EventsModal` (`GET /api/events/overview`, `POST /api/tasks/claim`). |
| **7** | `clans` | **Синдикаты и Кланы** — *Вступить в клан или создать свою семью* (или `Клан: [TAG] • Казна и состав`) | `Shield` (`w-5 h-5`), бейдж `[user.clanTag]` (если в клане) | Все 3 экрана (`133–142`) | Всегда | `sounds.playTick(); onSelectTab('clans');` | `setIsClansOpen(true)` | Открывает локальный `ClansModal` (`GET /api/clans`, `GET /api/clans/:id`, и др.). |
| **8** | `shop` | **Черный Рынок** — *Сундуки, монеты и сертификаты* | `ShoppingCart` (`w-5 h-5`) | Все 3 экрана (`144–150`) | Всегда | `sounds.playTick(); onSelectTab('shop');` | `setIsShopOpen(true)` | Открывает локальный `ShopModal` (`GET /api/shop/catalog`, `POST /api/shop/buy`, `POST /api/crates/open`). |
| **9** | `pawnshop` | **Ломбард Дона** — *Скупка предметов за монеты* | `Scale` (`w-5 h-5`) | Все 3 экрана (`152–158`) | Всегда | `sounds.playTick(); onSelectTab('pawnshop');` | `setIsPawnshopOpen(true)` | Открывает локальный `PawnshopModal` (`GET /api/pawnshop/overview`, `POST /api/pawnshop/sell`). |
| **10** | `bonus` | **Ежедневный бонус** — динамический подзаголовок по серии `dailyBonusStreak` | `Gift` (`w-5 h-5`), бейдж `ДОСТУПНО!` / `ПОЛУЧЕНО` / `7 ДНЕЙ` | Все 3 экрана (`160–172`) | Всегда | `sounds.playTick(); onSelectTab('bonus');` | `setIsBonusOpen(true)` | Открывает локальный `DailyBonusModal` (`POST /api/daily-bonus/claim`). |
| **11** | `feedback` | **Обратная связь** — *Сообщить о баге или предложить идею* | `MessageSquareHeart` (`w-5 h-5`), бейдж `БАГИ / ИДЕИ` | Все 3 экрана (`174–181`) | Всегда | `sounds.playTick(); onSelectTab('feedback');` | • `HomeView:263`: `setIsFeedbackOpen(true)`<br>• `LobbyView:208`: `setIsFeedbackOpen(true)`<br>• `InGameView`: **нет обработчика!** | Открывает `FeedbackModal` (`POST /api/feedback`, `GET /api/feedback/my`). В `InGameView` сломано. |
| **12** | `stop_match` | **Остановить партию** — *Досрочно завершить игру и сбросить стол в лобби* | `Square` (`w-5 h-5 text-rose-400`), `isDanger: true` (красный), бейдж `ВЕДУЩИЙ` | Только `InGameView` (`183–193`) | `Boolean(isHost && onStopMatch)` (в `InGameView`: `isHost && !roomState.closingAfterMatch`) | `sounds.playTick(); onClose(); onStopMatch();` | В `InGameView:2222`: `setIsStopConfirmOpen(true)` -> при подтверждении `onStopGame()` (`App.tsx:handleRestartGame`) | Отправляет WS `RESTART_GAME` (`{ type: 'RESTART_GAME' }`). Сервер сбрасывает партию в `LOBBY`. |
| **13** | `leave_room` | **Выйти из комнаты** — *Покинуть текущий стол и вернуться в общее лобби* | `LogOut` (`w-5 h-5 text-rose-400`), `isDanger: true` (красный) | `LobbyView` и `InGameView` (`194–203`) | `Boolean(onLeaveRoom)` | `sounds.playTick(); onClose(); onLeaveRoom();` | `App.tsx:handleLeaveRoom` (`строки 677–685`) | Отправляет WS `LEAVE_ROOM`, вызывает `setRoomState(null)`, очищает `chatMessages` и `?room=` в URL. |
| **14** | `settings` | **Настройки** — *Язык, звук, правила и параметры видеосвязи* | `Settings` (`w-5 h-5`) | Все 3 экрана (`205–211`) | Всегда | `sounds.playTick(); onSelectTab('settings');` | `setIsSettingsOpen(true)` | Открывает локальный `SettingsModal`. |
| **15** | `logout` | **Выйти из аккаунта** (или **Войти в аккаунт** для гостя) | `LogOut` (`w-5 h-5`) | Все 3 экрана (`212–218`) | Всегда | `sounds.playTick(); onSelectTab('logout');` | `if (isLoggedIn) onLogout(); else onOpenAuth();` | Для авторизованного: `App.tsx:handleLogout` (`952–967`) — удаляет токен из `localStorage` и cookie, сбрасывает `user`, закрывает WS, сбрасывает `roomState(null)`. |
| **16** | `footer_theme` | **Светлая** / **Тёмная** (кнопка в футере меню) | `Sun` (`text-amber-400`) / `Moon` (`text-indigo-400`) | Всегда в футере шторки (`313–326`) | Всегда | `sounds.playTick(); setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');` | `ThemeContext.tsx` | Меняет CSS-класс темы и сохраняет в `localStorage` (`mafia_theme`). Шторку не закрывает. |
| **17** | `footer_privacy` | **Конфиденциальность** (ссылка в футере меню) | `<a href="/privacy" target="_blank">` | Всегда в футере шторки (`328–335`) | Всегда | Нативный переход по ссылке в новой вкладке | Открывает `/privacy` (`PrivacyPolicyView` в `App.tsx:1032`) | Не разрывает текущую сессию, так как открывается в `target="_blank"`. |

---

### 6.2. Вложенные экраны, вкладки и действия (2-й и 3-й уровень вложенности)

Все пункты первого уровня (кроме `lobby`, `leave_room`, `stop_match`, `logout` и футера) открывают модальные окна со своими внутренними вкладками и действиями:

#### А. Внутри `SettingsModal` (`src/components/SettingsModal.tsx`, открывается из пункта `14. settings`)
1. **Переключатель вкладок шапки (`строки 166–198`):**
   - Вкладка **«Основные настройки»** (`activeTab = 'general'`)
   - Вкладка **«Видео и аудио WebRTC»** (`activeTab = 'webrtc'`)
2. **Вкладка «Основные настройки» (`general`, строки 203–583):**
   - **Язык интерфейса (`строки 205–238`):** 3 кнопки (`RU Русский`, `EN English`, `ES Español`) -> `setLanguage(lang.id)` (`localStorage: mafia_language`).
   - **Звуковые эффекты (`строки 241–285`):** тумблер Вкл/Выкл (`onToggleSound()`) -> переключает `soundEnabled` в `App.tsx` и `sounds.enabled`. Также при открытой `SettingsModal` работает горячая клавиша `M` / `Ь` (`строки 87–95`).
   - **Кодекс и правила игры (`строки 288–315`):** кнопка **«Открыть»** -> вызывает `onClose(); onOpenRules();`, открывая глобальный `RulesModal` (`App.tsx:1176`).
   - **Установка приложения PWA (`строки 318–350`):** отображается только если `canInstall && !isInstalled` (хук `usePwaInstall`). Кнопка **«Установить»** -> вызывает `triggerInstall()`.
   - **Тема интерфейса (Светлая / Тёмная) (`строки 353–394`):** 2 кнопки (`Тёмная тема`, `Светлая тема`) -> `setTheme('dark' | 'light')`.
   - **Визуальный стиль оформления / Скины (`строки 396–555`):**
     - Карточка **«Классический Нуар (По умолчанию)»** -> кнопка **«Сбросить»** (`equipSkin('default', user)`).
     - Список кастомных скинов из `availableSkins` -> для разблокированных кнопка **«Активировать»** (`equipSkin(skin.id, user)` -> `POST /api/skins/equip`), для закрытых — кнопка **«Рынок →»** (`onClose(); onOpenShop();` — *примечание: в `LobbyView` и `InGameView` проп `onOpenShop` в `SettingsModal` НЕ передан, поэтому кнопка «Рынок» там не рендерится*).
   - **Политика конфиденциальности (`строки 559–582`):** ссылка **«Открыть»** (`href="/privacy" target="_blank"`).
3. **Вкладка «Видео и аудио WebRTC» (`WebRtcSettingsPanel.tsx`, строки 173–518):**
   - **Тест веб-камеры и микрофона (`строки 195–302`):**
     - Кнопка **«Демо-поток»** (`startVirtualPreview()`) — запускает синтетический Canvas-видеопоток.
     - Кнопка **«Включить тест камеры» / «Остановить тест»** (`togglePreview()`) — запрашивает `safeGetUserMedia`.
   - **Разрешение видео (`строки 305–348`):** 4 кнопки (`160x120`, `200x150`, `240x180`, `320x240`) -> `onUpdateSettings({ resolution })`.
   - **Частота кадров FPS (`строки 351–407`):** ползунок `range` (`10–30 FPS`) + 5 пресетов (`10`, `15`, `20`, `25`, `30 FPS`) -> `onUpdateSettings({ frameRate })`.
   - **Оптимизация для слабого интернета (`строки 410–514`):** 4 тумблера:
     1. «Блокировать приём чужих видео» (`blockIncomingVideo`)
     2. «Блокировать приём чужого звука» (`blockIncomingAudio`)
     3. «Входить с выключенным микрофоном» (`startWithMicMuted`)
     4. «Входить с выключенной камерой» (`startWithCameraOff`)
     *(Все изменения сохраняются через `saveWebRtcSettings` в `localStorage` и рассылаются через `window.dispatchEvent(new CustomEvent('mafia_webrtc_settings_changed'))`, на который подписан `App.tsx:221`).*

#### Б. Внутри `StopMatchConfirmModal` (`InGameView.tsx`, строки 2282–2321, открывается из пункта `12. stop_match`)
- Кнопка **«Отмена»** (`setIsStopConfirmOpen(false)`).
- Кнопка **«Остановить»** (`sounds.playGavel(); setIsStopConfirmOpen(false); onStopGame();` -> отправляет WebSocket `RESTART_GAME`).

#### В. Внутри остальных модальных окон, открываемых из бургер-меню
- **`ProfileModal`** (из `3. profile`): 6 вкладок (`Профиль`, `Инвентарь`, `Достижения`, `Промокоды`, `История партий`, `Друзья и P2P`), смена никнейма/аватара/пароля, экипировка рамок/рубашек/скинов, привязка Google.
- **`PromoCodeModal`** (из `4. promocode`): поле ввода кода, кнопка «Активировать» (`POST /api/promocodes/redeem`), привязка кода партнёра (`POST /api/creator-code/bind`), переход во вкладку промокодов профиля (`onOpenProfilePromocodes`).
- **`CampaignsModal`** (из `5. campaigns`): список активных праздничных акций и наград к открытию клуба, кнопка получения подарка (`POST /api/campaigns/:id/claim`).
- **`EventsModal`** (из `6. tasks`): 4 вкладки (`Глобальный ивент`, `Курс новичка`, `Личные контракты`, `Клановые задачи`), кнопки клейма наград и кнопка перехода в `ClansModal`.
- **`ClansModal`** (из `7. clans`): список кланов, создание клана, вступление, казна, участники, переход в клановые задачи (`EventsModal` с вкладкой `clan`).
- **`ShopModal`** (из `8. shop`): вкладки «Сундуки», «Предметы и скины», «Валюта и сертификаты», покупка и открытие кейсов, переход в инвентарь (`onOpenInventory`).
- **`PawnshopModal`** (из `9. pawnshop`): продажа дубликатов и предметов инвентаря Дону за монеты, переход в магазин (`onOpenShop`).
- **`DailyBonusModal`** (из `10. bonus`): 7-дневная шкала наград, кнопка «Забрать награду» (`POST /api/daily-bonus/claim`).
- **`FeedbackModal`** (из `11. feedback`): отправка баг-репортов и идей со скриншотами (`POST /api/feedback`), просмотр своих обращений и ответов администрации.

---

## 7. Условия доступности каждой функции (Матрица ролей и состояний)

| Пункт меню | Гость (`!isLoggedIn`) | Авторизованный игрок (`isLoggedIn`) | Суперадмин (`isSuperAdmin`) | Вне комнаты (`HomeView`) | В лобби комнаты (`LobbyView`) | В активной партии (`InGameView`) | Игрок (живой) | Игрок (убитый / выбывший) | Зритель (`isSpectator`) | Ведущий стола (`isHost`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `1. lobby` («Лобби») | ✅ | ✅ | ✅ | ✅ (no-op) | ✅ (выход!) | ✅ (выход!) | ✅ | ✅ | ✅ | ✅ |
| `2. admin` («Панель Администратора») | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | Только админ | Только админ | Только админ | Только админ |
| `3. profile` («Личный кабинет») | ✅ (-> Auth) | ✅ (-> Profile) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `4. promocode` («Активировать промокод») | ❌ Скрыт | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (если авториз.) | ✅ (если авториз.) | ✅ (если авториз.) | ✅ (если авториз.) |
| `5. campaigns` («Акции») | ❌ Скрыт | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (если авториз.) | ✅ (если авториз.) | ✅ (если авториз.) | ✅ (если авториз.) |
| `6. tasks` («Ивенты и Задачи») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `7. clans` («Синдикаты и Кланы») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `8. shop` («Черный Рынок») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `9. pawnshop` («Ломбард Дона») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `10. bonus` («Ежедневный бонус») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `11. feedback` («Обратная связь») | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Видна, но не работает | ⚠️ Видна, но не работает | ⚠️ Видна, но не работает | ⚠️ Видна, но не работает | ⚠️ Видна, но не работает |
| `12. stop_match` («Остановить партию») | ✅ (если хост) | ✅ (если хост) | ✅ (если хост) | ❌ Скрыт | ❌ Скрыт | ✅ Только хост (`!closingAfterMatch`) | ❌ (если не хост) | ❌ (если не хост) | ❌ (`isHost=false`) | ✅ **Да** |
| `13. leave_room` («Выйти из комнаты») | ✅ | ✅ | ✅ | ❌ Скрыт | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `14. settings` («Настройки») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `15. logout` («Войти» / «Выйти») | ✅ («Войти») | ✅ («Выйти») | ✅ («Выйти») | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 8. Дублирующиеся элементы

В ходе аудита выявлены **три уровня дублирования**: внутри самого бургер-меню, между бургер-меню и вложенными модалками, а также между бургер-меню и шапками экранов (`HomeView`, `LobbyView`, `InGameView`).

### 8.1. Дублирование внутри бургер-меню и его модалок
1. **«Лобби» (`lobby`) vs «Выйти из комнаты» (`leave_room`) в `LobbyView` и `InGameView`:**
   - В `LobbyView.tsx` (`строка 172`) и `InGameView.tsx` (`строка 268`) нажатие на самый верхний пункт **«Лобби»** (`activeTab="lobby"`) вызывает `onLeaveRoom()`, то есть выполняет **абсолютно то же самое разрушительное действие**, что и нижняя красная кнопка **«Выйти из комнаты»** (`leave_room`), причём без красной окраски и предупреждения.
2. **Переключатель темы «Светлая / Тёмная»:**
   - Присутствует в футере `NavigationDrawer.tsx` (`строки 313–326`) и повторно присутствует внутри `SettingsModal.tsx` (`строки 353–394`).
3. **Ссылка «Конфиденциальность» (`/privacy`):**
   - Присутствует в футере `NavigationDrawer.tsx` (`строки 328–335`) и повторно присутствует внутри `SettingsModal.tsx` (`строки 559–582`).

### 8.2. Дублирование кнопок бургер-меню в шапках и панелях экранов (вне бургер-меню)

| Функция бургер-меню | Дубликат в `HomeView.tsx` (Главный экран) | Дубликат в `LobbyView.tsx` (Лобби комнаты) | Дубликат в `InGameView.tsx` (Активная партия) |
| :--- | :--- | :--- | :--- |
| **Личный кабинет / Вход (`profile`)** | Бейдж игрока в шапке (`344–364`) + мобильная карточка (`392–425`) | Бейдж игрока в шапке (`328–361`) | Бейдж игрока в шапке (`520–552`) + бейдж `+XP` (`555–565`) |
| **Панель Администратора (`admin`)** | — (только в бургер-меню) | Кнопка «Админка» в шапке (`302–313`) | Кнопка «Админ-панель» в шапке (`426–438`) |
| **Ивенты и Задачи (`tasks`)** | Баннер квестов на главном экране (`450–490`) | Кнопка «Квесты» в шапке (`289–300`) | Кнопка «Квесты» в шапке (`400–411`) |
| **Акции (`campaigns`)** | Кнопка «Акции» в шапке (`316–329`) | — (только в бургер-меню) | — (только в бургер-меню) |
| **Ежедневный бонус (`bonus`)** | Карточка быстрого доступа на главном экране | — (только в бургер-меню) | — (только в бургер-меню) |
| **Звук Вкл/Выкл (внутри `settings`)** | Кнопка `Volume2/VolumeX` в шапке (`332–341`) | Кнопка `Volume2/VolumeX` в шапке (`316–325`) | Кнопка `Volume2/VolumeX` в шапке (`508–517`) |
| **Выйти из комнаты (`leave_room`)** | — | Кнопка «Покинуть комнату» в левой колонке лобби (`604–612`) | — (в `InGameView` выход из комнаты есть **только** в бургер-меню и в `GameOverModal`!) |
| **Остановить партию (`stop_match`)** | — | — | Кнопка «Остановить» (`Square`) прямо в шапке `InGameView` (`493–505`) — вызывает тот же `setIsStopConfirmOpen(true)`! |

---

## 9. Зависимости от игровых механик и критические обработчики

При разделении меню на внеигровое и игровое необходимо учитывать прямые связи пунктов меню с жизненным циклом комнаты и партии:

1. **Выход из комнаты / партии (`leave_room` -> `handleLeaveRoom` в `src/App.tsx:677–685`):**
   - Отправляет по WebSocket `{ type: 'LEAVE_ROOM' }`.
   - На сервере (`server.ts`):
     - Если комната в `LOBBY` и выходит хост: если в комнате нет других реальных игроков — комната удаляется; если есть — права хоста передаются следующему игроку.
     - Если идёт активная партия (`phase !== 'LOBBY'`) и выходит хост: сервер включает режим `closingAfterMatch = true` (партия доигрывается до конца, после чего комната закрывается, если хост не переподключился и не передал права).
     - Если выходит обычный игрок во время партии: игрок помечается `connected = false` (при явном `LEAVE_ROOM` удаляется/помечается покинувшим), проверяется условие победы (`checkWinCondition`).
   - На клиенте: немедленно сбрасывает `setRoomState(null)`, `setChatMessages([])` и удаляет `?room=` из адресной строки.
2. **Досрочная остановка партии ведущим (`stop_match` -> `setIsStopConfirmOpen(true)` -> `onStopGame` -> `handleRestartGame` в `src/App.tsx:704–706`):**
   - Отправляет по WebSocket `{ type: 'RESTART_GAME' }`.
   - Доступно только если `isHost && !roomState.closingAfterMatch`.
   - Сервер немедленно останавливает таймеры фаз, сбрасывает роли, голоса и ночные действия всех участников и переводит комнату в фазу `LOBBY`.
3. **Передача прав ведущего (`onTransferHost` -> `handleTransferHost` в `src/App.tsx:699–701`):**
   - Сейчас находится **в шапке `InGameView.tsx` (`строки 441–490`)**, а не в бургер-меню. Отправляет `{ type: 'TRANSFER_HOST', targetPlayerId }`.
4. **Выход из аккаунта во время нахождения в комнате или партии (`logout` -> `handleLogout` в `src/App.tsx:952–967`):**
   - Удаляет `mafia_auth_token` из `localStorage` и `document.cookie`, сбрасывает `user` в `null`, генерирует новый гостевой `myId`, **принудительно закрывает WebSocket (`wsRef.current.close()`)** и сбрасывает `setRoomState(null)`. Если игрок нажал «Выйти из аккаунта» внутри активной партии через бургер-меню, он немедленно выбрасывается из партии.
5. **Настройки WebRTC (`settings` -> вкладка `webrtc`) во время активной партии:**
   - Переключение разрешений (`160x120`–`320x240`), FPS (`10–30`) и флагов экономии трафика (`blockIncomingVideo`, `blockIncomingAudio`) диспатчит событие `mafia_webrtc_settings_changed`, которое на лету обновляет `webrtcSettings` в `App.tsx` и применяется хуком `useWebRtc` без выхода из комнаты.
6. **Блокнот детектива (`onOpenNotebook`) и Тайная карта роли (`isSecretCardModalOpen`):**
   - Сейчас расположены в шапке `InGameView.tsx` (`строки 371–397`), а не в бургер-меню.

---

## 10. Мобильная адаптация и оформление (`NavigationDrawer.tsx`)

1. **Позиционирование и размеры (`строки 229–237`):**
   - Корневой контейнер: `fixed inset-0 z-50 flex justify-end`.
   - Панель меню: выезжает **справа** (`w-full max-w-xs bg-[var(--skin-bg-card)] border-l border-[var(--skin-border-base)] h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200`).
   - На экранах шириной `< 320px` занимает 100% ширины (`w-full`), на всех остальных смартфонах, планшетах и ПК фиксирована шириной `max-w-xs` (`320px`).
2. **Прокрутка при переполнении (`строка 269`):**
   - Список кнопок обёрнут в `<div className="flex-1 overflow-y-auto p-3 space-y-1.5">` — при большом количестве пунктов (до 14 одновременно видимых элементов) список вертикально скроллится внутри шторки, тогда как шапка и футер шторки зафиксированы (`shrink-0`).
3. **Закрытие кликом вне меню (`строки 231–234`):**
   - Подложка `<div className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" onClick={onClose} />` закрывает меню при клике/тапе в любую область вне шторки.
4. **Обработка клавиши `Escape` и блокировка прокрутки body:**
   - ⚠️ **Не реализовано:** в `NavigationDrawer.tsx` нет слушателя `keydown` для клавиши `Escape` и нет блокировки `document.body.style.overflow = 'hidden'`.
5. **Слои (`z-index`):**
   - `NavigationDrawer` имеет `z-50`.
   - Все вызываемые из него модальные окна (`ShopModal`, `SettingsModal`, `ProfileModal` и т.д.) также имеют `z-50`, но поскольку при выборе любого пункта меню сначала вызывается `setIsNavDrawerOpen(false)`, конфликта слоёв между шторкой и открываемой модалкой не возникает.
6. **Поддержка тем и скинов:**
   - Все цвета шторки используют CSS-переменные скинов (`--skin-bg-card`, `--skin-bg-header`, `--skin-border-base`, `--skin-text-primary`, `--skin-text-muted`) и классы `.cyber-drawer`, `.cyber-menu-item`, поэтому меню автоматически адаптируется под светлую/тёмную тему (`ThemeContext`) и экипированный скин (`SkinContext`).

---

## 11. Связь с авторизацией

В `NavigationDrawer.tsx` (`строки 65–69`) вычисляются два флага авторизации:
1. `const isAuthenticated = Boolean(isLoggedIn || user);`
2. `const isSuperAdmin = Boolean(user && (user.isAdmin === true || user.role === 'admin' || (typeof user.email === 'string' && user.email.toLowerCase() === 'vledahovic@gmail.com')));`

### Фактические различия меню по статусу авторизации:
- **Гость (`!isLoggedIn && !user`):**
  - **Скрыты** пункты: `admin` («Панель Администратора»), `promocode` («Активировать промокод»), `campaigns` («Акции»).
  - Пункт `profile` («Личный кабинет») отображается, но при нажатии открывает `AuthModal` вместо `ProfileModal`.
  - Пункты `tasks`, `clans`, `shop`, `pawnshop`, `bonus`, `feedback` открывают соответствующие модальные окна в режиме ознакомления (при попытке купить предмет, забрать бонус или вступить в клан внутри модалки вызывается `onOpenAuth()`).
  - Нижний пункт `logout` меняет текст на **«Войти в аккаунт»** (*«Авторизация и профиль»*) и при клике открывает `AuthModal`.
- **Авторизованный пользователь (`isLoggedIn || user`):**
  - Появляются пункты `promocode` и `campaigns`.
  - В пункте `clans` динамически подставляется тег клана `[user.clanTag]`, если игрок состоит в клане (`строки 138–141`).
  - В пункте `bonus` динамически рассчитывается статус серии `user.dailyBonusStreak` и `user.lastDailyBonusClaim` (`ДОСТУПНО!` или `ПОЛУЧЕНО`, `строки 72–76, 165–171`).
  - Нижний пункт `logout` отображает **«Выйти из аккаунта»** (*«Сменить персонажа или выйти из системы»*) и вызывает `onLogout()`.
- **Суперадминистратор (`isSuperAdmin`):**
  - Дополнительно получает пункт №2 **«Панель Администратора»** с иконкой короны (`Crown`).

---

## 12. Технические особенности будущего разделения на Внеигровое (Меню А) и Игровое (Меню Б)

### 12.1. Где проходит архитектурная граница
- **Меню А (Внеигровое бургер-меню):** должно обслуживать `HomeView.tsx` (`!roomState`). Вопрос о том, какое меню (А, Б или комбинированное) должно отображаться в `LobbyView.tsx` (`roomState.phase === 'LOBBY'`), вынесен в раздел 14 для согласования с владельцем проекта.
- **Меню Б (Игровое бургер-меню):** должно обслуживать `InGameView.tsx` (`roomState.phase !== 'LOBBY'`).

### 12.2. Что сейчас раздувает код и должно быть учтено при разделении
1. **Четырёхкратное дублирование модальных окон в DOM:**
   - Сейчас `ShopModal`, `PawnshopModal`, `DailyBonusModal`, `PromoCodeModal`, `CampaignsModal`, `SettingsModal`, `ClansModal`, `EventsModal`, `FeedbackModal` монтируются отдельно в `App.tsx`, отдельно в `HomeView.tsx`, отдельно в `LobbyView.tsx` и отдельно в `InGameView.tsx`.
   - Если в будущем **Игровое бургер-меню (Меню Б)** будет очищено от внеигровых коммерческих/социальных разделов (Магазин, Ломбард, Кланы, Акции, Промокоды, Ежедневный бонус), из `InGameView.tsx` можно будет безопасно удалить ненужные локальные стейты и импорты этих модалок, облегчив рендер игрового стола.
2. **Общие зависимости, которые понадобятся обоим меню:**
   - `SettingsModal` (и `WebRtcSettingsPanel`) — нужен и вне игры, и во время матча (особенно вкладка WebRTC, звук, язык и правила).
   - `ThemeContext`, `SkinContext`, `LanguageContext`, `sounds.playTick()`.
   - Обработчики `onLeaveRoom` и `onStopMatch` (для игрового меню).

---

## 13. Подтверждённые технические проблемы, баги и ограничения текущей реализации

В ходе аудита исходного кода обнаружены **6 подтверждённых технических дефектов**:

1. **КРИТИЧЕСКИЙ UX-ДЕФЕКТ: Пункт «Лобби» (`lobby`) во время игры и в комнате ожидания немедленно выбрасывает игрока из комнаты без предупреждения:**
   - В `NavigationDrawer.tsx:79` пункт `lobby` всегда стоит первым в списке и всегда подсвечен как текущий (`activeTab="lobby"`).
   - Однако в `LobbyView.tsx:172–174` и `InGameView.tsx:268–270` в `switch (tab)` написано:
     ```ts
     case 'lobby':
       onLeaveRoom();
       break;
     ```
   - В результате игрок, открывший бургер-меню во время партии и случайно нажавший на верхний активный пункт «Лобби», немедленно покидает партию без какого-либо подтверждения.
2. **БАГ В ИГРОВОМ МЕНЮ: Неработающая кнопка «Обратная связь» (`feedback`) в `InGameView.tsx`:**
   - В `NavigationDrawer.tsx:174–181` кнопка `feedback` отображается всегда.
   - Но в `InGameView.tsx:265–309` внутри `handleSelectNavTab` **пропущен `case 'feedback':`**, а компонент `FeedbackModal` даже не импортирован в `InGameView.tsx`. При клике на «Обратная связь» во время игры меню просто закрывается, и ничего не происходит.
3. **БАГ В `App.tsx`: Пропущен `case 'campaigns'` в `handleInGameNavTab` (`src/App.tsx:157–211`):**
   - В обработчике `handleInGameNavTab` в `App.tsx` отсутствует обработка вкладки `'campaigns'`, хотя она есть в `NavDrawerTab`.
4. **МЁРТВЫЙ КОД В `App.tsx` и `Header.tsx`:**
   - Компонент `src/components/Header.tsx` (`260 строк`) и стейт `isInGameNavOpen` / `handleInGameNavTab` в `src/App.tsx` (`строки 3, 17, 146, 157–211`) нигде не рендерятся и не вызываются, но при этом `App.tsx` держит в памяти и рендерит в JSX дублирующий набор закрытых модалок (`строки 1270–1348`).
5. **ДВОЙНОЙ МОНТАЖ `SettingsModal` В `HomeView.tsx`:**
   - В `src/components/HomeView.tsx` компонент `<SettingsModal isOpen={isSettingsOpen} ... />` смонтирован **дважды подряд** с одним и тем же стейтом `isSettingsOpen`:
     - Первый экземпляр: `HomeView.tsx`, строки `771–778` (с пропом `onOpenShop`).
     - Второй экземпляр: `HomeView.tsx`, строки `827–833` (без пропа `onOpenShop`, перекрывает первый!).
     - Из-за того, что второй экземпляр рендерится позже в DOM и не получает `onOpenShop` и `onUpdateUser`, кнопка перехода «Рынок →» у заблокированных скинов в настройках на главном экране пропадает!
6. **ОТСУТСТВИЕ ПОДТВЕРЖДЕНИЯ ПРИ ВЫХОДЕ ИЗ АКТИВНОЙ ПАРТИИ (`leave_room` и `logout` в `InGameView`):**
   - У кнопки «Остановить партию» (`stop_match`) есть защитная модалка подтверждения `isStopConfirmOpen` (`InGameView.tsx:2282`), но у кнопок «Выйти из комнаты» (`leave_room`), «Лобби» (`lobby`) и «Выйти из аккаунта» (`logout`) во время активной партии нет модалки подтверждения — одно случайное нажатие мгновенно выбрасывает игрока из живого матча.

---

## 14. Перечень решений, которые необходимо согласовать с владельцем проекта перед реализацией

Перед тем как приступить к разделению бургер-меню на **Внеигровое (Меню А)** и **Игровое (Меню Б)** на следующем этапе, необходимо утвердить следующие продуктовые и архитектурные решения:

1. **Статус экрана ожидания в комнате (`LobbyView`, `roomState.phase === 'LOBBY'`):**
   - Должен ли экран ожидания в комнате до старта партии (`LobbyView`) использовать **Внеигровое меню (Меню А)** с добавленной кнопкой «Выйти из комнаты», или он должен использовать **Игровое меню (Меню Б)**?
2. **Точный состав Внеигрового бургер-меню (Меню А — Главный экран):**
   - Какие из текущих 13 внеигровых пунктов оставить в Меню А (`Личный кабинет`, `Панель Администратора`, `Активировать промокод`, `Акции`, `Ивенты и Задачи`, `Синдикаты и Кланы`, `Черный Рынок`, `Ломбард Дона`, `Ежедневный бонус`, `Обратная связь`, `Настройки`, `Войти / Выйти из аккаунта`)?
   - Нужно ли убрать из Меню А бесполезный пункт «Лобби» (так как пользователь на главном экране уже находится в главном лобби)?
3. **Точный состав Игрового бургер-меню (Меню Б — Активная партия `InGameView`):**
   - Должно ли Игровое меню быть компактным и содержать **только игровые и оперативные функции** (например: `Настройки (Звук / WebRTC / Правила)`, `Тайная карта роли`, `Блокнот детектива`, `Передать права ведущего` (для хоста), `Остановить партию` (для хоста), `Обратная связь / Репорт бага`, `Выйти из комнаты`), **полностью исключив** во время активной партии коммерческие/внеигровые модалки (`Черный Рынок`, `Ломбард`, `Кланы`, `Акции`, `Промокоды`, `Ежедневный бонус`, `Выйти из аккаунта`)?
   - Или часть социальных разделов (`Личный кабинет`, `Ивенты и Задачи`) должна остаться доступной прямо во время партии (например, для убитых игроков или зрителей)?
4. **Перенос кнопок из верхней шапки `InGameView` в Игровое бургер-меню (разгрузка мобильной шапки):**
   - Сейчас в шапке `InGameView` теснятся: `Моя роль`, `Заметки (Блокнот)`, `Квесты`, `Зрители`, `Админ-панель`, `Передать стол`, `Остановить`, `Звук`, `Профиль`, `+XP` и `Бургер-меню`. Какие из этих кнопок следует перенести внутрь нового Игрового бургер-меню (Меню Б), а какие оставить на виду в шапке стола?
5. **Защита от случайного выхода из активной партии:**
   - Следует ли добавить модальное окно подтверждения («Вы уверены, что хотите покинуть активную партию?») при нажатии на «Выйти из комнаты» во время идущей игры (`phase !== 'LOBBY' && phase !== 'GAME_OVER'`)?
