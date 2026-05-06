import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { User } from '../types/index.js';

export interface AuthRequest extends Request {
    user?: User;
}

export function validateJWT(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const secret = process.env.JWT_SECRET || process.env.NETLIFY_JWT_SECRET;
        
        if (!secret) {
            // Local fallback logic (WARNING: do not use unverified in prod)
            const decoded = jwt.decode(token) as any;
            if (!decoded || !decoded.sub) {
                return res.status(401).json({ error: 'Invalid token structure' });
            }
            req.user = {
                id: decoded.sub,
                email: decoded.email,
                roles: decoded.app_metadata?.roles || []
            };
            return next();
        }

        const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as any;
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            roles: decoded.app_metadata?.roles || []
        };
        next();
    } catch (err: any) {
        return res.status(401).json({ error: `Token validation failed: ${err.message}` });
    }
}
