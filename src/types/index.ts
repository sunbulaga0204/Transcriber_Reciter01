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

export interface TTSRequest {
    text: string;
    prompt?: string;
    voice?: string;
    speed?: string;
}

export interface STTResponse {
    transcript: string;
    summary: string;
    pointsRemaining: number;
}

export interface TTSResponse {
    audioBase64: string;
    mimeType: string;
    pointsRemaining: number;
}
