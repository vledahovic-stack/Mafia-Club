# Мафия Онлайн (Mafia Online)

Многопользовательская психологическая игра в нуарной стилистике, оптимизированная под PWA и Android TWA (Trusted Web Activity).

## 🔒 Важное правило проекта: Digital Asset Links (assetlinks.json)

**Актуальный отпечаток ключа (SHA-256 fingerprint):**
```
CF:AB:51:63:0A:0B:85:FA:7C:68:63:98:DC:40:1D:B0:77:AD:FF:18:13:E2:08:B5:77:B0:83:0D:94:D4:0F:59
```

**Пакет Android:** `app.mafiaonline.twa`

> ⚠️ **КРИТИЧЕСКОЕ ПРАВИЛО:**
> При любых будущих пересборках проекта, изменениях структуры сайта, обновлениях или деплоях на GitHub/Render этот отпечаток в файлах `.well-known/assetlinks.json` и `public/.well-known/assetlinks.json` должен оставаться **строго неизменным**.
> Это гарантирует прохождение верификации Trusted Web Activity (TWA) в Android и предотвращает появление адресной строки браузера.

---

## Расположение файлов конфигурации Digital Asset Links

1. `public/.well-known/assetlinks.json` — исходный файл для Vite и сервера.
2. `/.well-known/assetlinks.json` — копия в корне репозитория для статических хостингов.
3. Раздача сервером Express: маршрут `/.well-known/assetlinks.json` возвращает заголовок `Content-Type: application/json; charset=utf-8`.
