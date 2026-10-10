package app.mafiaonline.twa;

import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * Сервис делегирования для Trusted Web Activity (TWA).
 * 
 * Обработчики LocationDelegationExtraCommandHandler и DigitalGoodsRequestHandler
 * удалены / закомментированы, чтобы исключить ошибки компиляции Gradle:
 * "package com.google.androidbrowserhelper.locationdelegation does not exist"
 * "cannot find symbol class LocationDelegationExtraCommandHandler"
 * "cannot find symbol class DigitalGoodsRequestHandler"
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {

    @Override
    public void onCreate() {
        super.onCreate();
        
        // ВНИМАНИЕ: Обработчики геолокации и платежей Google Play Billing отключены,
        // так как соответствующие опциональные библиотеки не подключены в app/build.gradle.
        // Базовый класс super.onCreate() обеспечивает стандартную работу TWA (уведомления и т.д.).
        
        // Если в будущем потребуется геолокация:
        // 1. Добавить в app/build.gradle: implementation 'com.google.androidbrowserhelper:locationdelegation:2.5.0'
        // 2. Раскомментировать: registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());

        // Если в будущем потребуются внутриигровые покупки Google Play:
        // 1. Добавить в app/build.gradle: implementation 'com.google.androidbrowserhelper:billing:1.0.0-alpha11'
        // 2. Раскомментировать: registerExtraCommandHandler(new DigitalGoodsRequestHandler(this));
    }
}
