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

declare global {
    interface Window {
        ALPlayableAnalytics?: {
            trackEvent: (eventName: ApplovinEvent) => void;
        };
        super_html_channel?: string;
    }
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
