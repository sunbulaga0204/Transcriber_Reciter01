import fs from 'fs';
import path from 'path';
import type { UserPoints, RateLimitRecord } from '../types/index.js';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'database.json');

// Ensure directory and DB exist
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ points: {}, rateLimits: {} }));
}

interface Database {
    points: Record<string, UserPoints>;
    rateLimits: Record<string, RateLimitRecord>;
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
    setPoints(userId: string, data: Partial<UserPoints>) {
        const db = getDb();
        db.points[userId] = { ...db.points[userId], ...data } as UserPoints;
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
