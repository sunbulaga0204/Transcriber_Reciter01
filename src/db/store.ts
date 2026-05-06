import fs from 'fs';
import path from 'path';
import type { UserPoints, RateLimitRecord } from '../types/index.js';

const DB_PATH = path.join(process.cwd(), 'database.json');

interface Database {
    points: Record<string, UserPoints>;
    rateLimits: Record<string, RateLimitRecord>;
}

// Ensure DB exists
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ points: {}, rateLimits: {} }));
}

function getDb(): Database {
    try {
        if (!fs.existsSync(DB_PATH)) {
            fs.writeFileSync(DB_PATH, JSON.stringify({ points: {}, rateLimits: {} }));
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Failed to read database:", e);
        return { points: {}, rateLimits: {} };
    }
}

function saveDb(db: Database) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export const dbStore = {
    getPoints(userId: string): UserPoints | null {
        const db = getDb();
        return db.points[userId] || null;
    },
    setPoints(userId: string, data: UserPoints) {
        const db = getDb();
        db.points[userId] = data;
        saveDb(db);
    },
    getRateLimit(key: string): RateLimitRecord | null {
        const db = getDb();
        return db.rateLimits[key] || null;
    },
    setRateLimit(key: string, data: RateLimitRecord) {
        const db = getDb();
        db.rateLimits[key] = data;
        saveDb(db);
    },
    getAllPoints(): Record<string, UserPoints> {
        const db = getDb();
        return db.points;
    }
};
