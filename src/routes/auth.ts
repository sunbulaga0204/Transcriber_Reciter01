import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { getPoints } from '../services/points.js';

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/mock', async (req, res) => {
    const user = {
        id: 'mock_demo_user',
        name: 'Demo Tester',
        email: 'demo.tester@example.com',
        roles: ['admin']
    };
    const appToken = 'mock-demo-token';
    res.json({ token: appToken, user });
});

router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'Missing Google credential' });
        }

        // Verify the Google JWT
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            return res.status(400).json({ error: 'Invalid Google payload' });
        }

        const email = payload.email;
        const name = payload.name || 'User';
        const googleId = payload.sub;

        // Check if user is an admin based on an environment variable
        const adminEmail = process.env.ADMIN_EMAIL || '';
        const isAdmin = adminEmail.toLowerCase() === email.toLowerCase();
        const roles = isAdmin ? ['admin'] : [];

        // Ensure user exists in our points database
        await getPoints(googleId, isAdmin, email);

        // Issue our own application JWT
        const appToken = jwt.sign(
            {
                id: googleId,
                email: email,
                name: name,
                roles: roles
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '7d' }
        );

        res.json({ token: appToken, user: { id: googleId, name, email, roles } });
    } catch (error: any) {
        console.error('[Auth Error]', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
});

export default router;
