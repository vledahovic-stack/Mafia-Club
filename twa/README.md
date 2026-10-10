# Решение ошибки компиляции Bubblewrap TWA в DelegationService.java

## Причина ошибки
При сборке TWA через Bubblewrap (`bubblewrap build`) утилита генерирует файл `DelegationService.java`, пытаясь импортировать:
- `com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler`
- `com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler`

Если соответствующие модули не включены в `app/build.gradle`, компилятор `javac` падает с ошибками:
- `error: package com.google.androidbrowserhelper.locationdelegation does not exist`
- `error: package com.google.androidbrowserhelper.playbilling.digitalgoods does not exist`
- `error: cannot find symbol class LocationDelegationExtraCommandHandler`
- `error: cannot find symbol class DigitalGoodsRequestHandler`

---

## Решение 1 (Быстрое исправление файла DelegationService.java)

Откройте в сгенерированном проекте Android файл:
`app/src/main/java/<пакет_приложения>/DelegationService.java`

Замените его содержимое на:

```java
package <ВАШ_ПАКЕТ>; // например: app.mafiaonline.twa

import com.google.androidbrowserhelper.trusted.DelegationService;

public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        // Обработчики геолокации и платежей отключены.
        // Базовый класс super.onCreate() обеспечивает работу всех стандартных
        // функций TWA (уведомления, полноэкранный режим и т.д.).
    }
}
```

После этого повторите команду:
```bash
bubblewrap build
```

---

## Решение 2 (Предотвращение повторной генерации через twa-manifest.json)

Если вы запускаете `bubblewrap update`, Bubblewrap может перезаписать `DelegationService.java`.
Чтобы этого не произошло, откройте `twa-manifest.json` в корне вашего Android-проекта и установите:

```json
"features": {
  "locationDelegation": {
    "enabled": false
  },
  "playBilling": {
    "enabled": false
  }
}
```

---

## Решение 3 (Если вам нужны геолокация или покупки в будущем)

Если геолокация или платежи Google Play понадобятся, добавьте недостающие зависимости в `app/build.gradle` в секцию `dependencies`:

```groovy
dependencies {
    implementation 'com.google.androidbrowserhelper:androidbrowserhelper:2.5.0'
    
    // Для геолокации:
    implementation 'com.google.androidbrowserhelper:locationdelegation:2.5.0'
    
    // Для платежей (Digital Goods API):
    implementation 'com.google.androidbrowserhelper:billing:1.0.0-alpha11'
}
```
