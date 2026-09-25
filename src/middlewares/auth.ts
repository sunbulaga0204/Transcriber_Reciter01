import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '../types/index.js';

export interface AuthRequest extends Request {
    user?: User;
}

export function validateJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    // In mock mode or when using mock-token, allow simulated user
    if (process.env.MOCK_API === 'true' || authHeader === 'Bearer mock-token' || authHeader === 'Bearer mock-demo-token') {
        req.user = {
            id: 'mock_user_123',
            email: 'demo.tester@example.com',
            roles: ['admin']
        };
        return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const secret = process.env.JWT_SECRET || 'fallback-secret';
        const decoded = jwt.verify(token, secret) as any;
        
        req.user = {
            id: decoded.id || decoded.sub,
            email: decoded.email,
            roles: decoded.roles || decoded.app_metadata?.roles || []
        };
        next();
    } catch (err: any) {
        return res.status(401).json({ error: `Token validation failed: ${err.message}` });
    }
}
