import { dbStore } from '../db/store.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;

export async function checkRateLimit(userId: string, action: string): Promise<{ allowed: boolean, retryAfterSeconds: number }> {
    const key = `${userId}:${action}`;
    const now = Date.now();
    
    const record = dbStore.getRateLimit(key);
    
    if (record && (now - record.lastRequest) < RATE_WINDOW_MS) {
        const retryAfterSeconds = Math.ceil((RATE_WINDOW_MS - (now - record.lastRequest)) / 1000);
        return { allowed: false, retryAfterSeconds };
    }
    
    dbStore.setRateLimit(key, { lastRequest: now });
    return { allowed: true, retryAfterSeconds: 0 };
}
