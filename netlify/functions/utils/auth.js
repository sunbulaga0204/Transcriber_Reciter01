const jwt = require('jsonwebtoken');

/**
 * Validates the Netlify Identity JWT from the Authorization header.
 * Returns { valid: bool, userId, email, roles, error }
 */
function validateJWT(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or malformed Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Netlify Identity JWTs are signed with a secret available via NETLIFY_JWT_SECRET
    // In local dev via `netlify dev`, this is automatically injected.
    const secret = process.env.JWT_SECRET || process.env.NETLIFY_JWT_SECRET;
    
    if (!secret) {
      // Fallback: decode without verification in local dev (DO NOT use in production)
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.sub) {
        return { valid: false, error: 'Invalid token structure' };
      }
      console.warn('[Auth] WARNING: JWT_SECRET not set. Token not cryptographically verified. Set this in production!');
      return {
        valid: true,
        userId: decoded.sub,
        email: decoded.email,
        roles: decoded.app_metadata?.roles || []
      };
    }

    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return {
      valid: true,
      userId: decoded.sub,
      email: decoded.email,
      roles: decoded.app_metadata?.roles || []
    };

  } catch (err) {
    return { valid: false, error: `Token validation failed: ${err.message}` };
  }
}

module.exports = { validateJWT };
