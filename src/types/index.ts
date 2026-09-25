export interface User {
    id: string;
    email: string;
    roles: string[];
}

export interface UserPoints {
    points: number;
    tier: string;
    email?: string;
}

export interface RateLimitRecord {
    lastRequest: number;
}

export interface STTSegment {
    startSec: number;
    endSec: number;
    timeRange: string;
    speaker: string;
    text: string;
}

export interface STTResponse {
    transcript: string;
    rawTranscript: string;
    summary: string;
    pointsRemaining: number;
    segments?: STTSegment[];
}
