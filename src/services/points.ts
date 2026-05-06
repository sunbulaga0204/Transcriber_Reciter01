import { dbStore } from '../db/store.js';
import type { UserPoints } from '../types/index.js';

export const FREE_POINTS = 3;

export async function getPoints(userId: string, isAdmin: boolean = false, email?: string): Promise<UserPoints> {
    let data = dbStore.getPoints(userId);
    
    if (!data) {
        data = isAdmin 
            ? { points: 1000, tier: 'pro', email } 
            : { points: FREE_POINTS, tier: 'free', email };
        dbStore.setPoints(userId, data);
    } else {
        let changed = false;
        if (isAdmin && data.tier !== 'pro') {
            data = { ...data, tier: 'pro', points: Math.max(data.points, 1000) };
            changed = true;
        }
        if (email && data.email !== email) {
            data = { ...data, email };
            changed = true;
        }
        if (changed) dbStore.setPoints(userId, data);
    }
    
    return data;
}

export async function deductPoint(userId: string, cost: number = 1): Promise<{ success: boolean, remaining: number }> {
    const data = await getPoints(userId);
    if (data.points < cost) {
        return { success: false, remaining: data.points };
    }
    
    const newBalance = data.points - cost;
    dbStore.setPoints(userId, { ...data, points: newBalance });
    return { success: true, remaining: newBalance };
}

export async function refundPoint(userId: string, amount: number = 1): Promise<number> {
    const data = await getPoints(userId);
    const newBalance = data.points + amount;
    dbStore.setPoints(userId, { ...data, points: newBalance });
    console.log(`[Points] Refunded ${amount} point(s) to user ${userId}. New balance: ${newBalance}`);
    return newBalance;
}

export async function topUpPoints(userId: string, amount: number): Promise<number> {
    const data = await getPoints(userId);
    const newBalance = data.points + amount;
    const tier = amount >= 300 ? 'pro' : amount >= 60 ? 'basic' : data.tier;
    dbStore.setPoints(userId, { points: newBalance, tier });
    return newBalance;
}
