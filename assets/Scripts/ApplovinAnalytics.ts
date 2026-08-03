type ApplovinEvent =
    | 'LOADED'
    | 'DISPLAYED'
    | 'CHALLENGE_STARTED'
    | 'CHALLENGE_PASS_25'
    | 'CHALLENGE_PASS_50'
    | 'CHALLENGE_PASS_75'
    | 'CHALLENGE_SOLVED'
    | 'COMPLETED'
    | 'CTA_CLICKED';

const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.evrika.miner.camp';
const APP_STORE_URL = 'https://apps.apple.com/app/id6447562895';

interface SuperHtmlApi {
    google_play_url?: string;
    appstore_url?: string;
}

declare global {
    interface Window {
        ToStore?: () => void;
        ALPlayableAnalytics?: {
            trackEvent: (eventName: ApplovinEvent) => void;
        };
        super_html?: SuperHtmlApi;
        super_html_channel?: string;
    }
}

function isAppleDevice(): boolean {
    if (typeof navigator === 'undefined') {
        return false;
    }

    return /iPad|iPhone|iPod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function openStore(): void {
    if (typeof window === 'undefined') {
        return;
    }

    const appleDevice = isAppleDevice();
    const storeUrl = appleDevice ? APP_STORE_URL : GOOGLE_PLAY_URL;

    // super-html adapters use these fields when no ad-network SDK is available.
    if (window.super_html) {
        window.super_html.google_play_url = appleDevice ? '' : GOOGLE_PLAY_URL;
        window.super_html.appstore_url = appleDevice ? APP_STORE_URL : '';
    }

    if (typeof window.ToStore === 'function') {
        window.ToStore();
        return;
    }

    window.open(storeUrl, '_blank');
}

export class ApplovinAnalytics {
    private static readonly trackedEvents = new Set<ApplovinEvent>();
    private static upgradeProgress = 0;
    private static readonly upgradeProgressEvents: ApplovinEvent[] = [
        'CHALLENGE_PASS_25',
        'CHALLENGE_PASS_50',
        'CHALLENGE_PASS_75',
        'CHALLENGE_SOLVED',
    ];

    public static track(eventName: ApplovinEvent): void {
        if (this.trackedEvents.has(eventName)) {
            return;
        }

        this.trackedEvents.add(eventName);

        if (typeof window !== 'undefined' && typeof window.ALPlayableAnalytics !== 'undefined') {
            window.ALPlayableAnalytics.trackEvent(eventName);
        }
    }

    public static trackChallengeStarted(): void {
        this.track('CHALLENGE_STARTED');
    }

    public static trackUpgradePurchasedProgress(): void {
        if (this.upgradeProgress >= this.upgradeProgressEvents.length) {
            return;
        }

        const eventName = this.upgradeProgressEvents[this.upgradeProgress];
        this.upgradeProgress++;
        this.track(eventName);
    }
}

export {};
