package app.mafiaonline.twa;

import com.google.androidbrowserhelper.trusted.DelegationService;

/**
 * Clean DelegationService for Trusted Web Activity (TWA).
 *
 * All unused imports and handlers (LocationDelegationExtraCommandHandler and
 * DigitalGoodsRequestHandler) have been completely removed.
 * super.onCreate() handles standard TWA features (notifications, web app display)
 * without requiring locationdelegation or playbilling dependencies.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {

    @Override
    public void onCreate() {
        super.onCreate();
    }
}
