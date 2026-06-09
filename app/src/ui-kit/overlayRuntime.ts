import { isBrowserEnvironment } from './utils';

let bodyScrollLockCount = 0;
let originalOverflow = '';

export function acquireBodyScrollLock(): () => void {
    if (!isBrowserEnvironment()) {
        return () => undefined;
    }

    if (bodyScrollLockCount === 0) {
        originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }

    bodyScrollLockCount += 1;

    return () => {
        bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);

        if (bodyScrollLockCount === 0) {
            document.body.style.overflow = originalOverflow;
        }
    };
}
