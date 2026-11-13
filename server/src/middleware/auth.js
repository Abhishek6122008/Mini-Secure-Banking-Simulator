import jwt from 'jsonwebtoken';

const ISSUER = 'msbs';
const AUDIENCE = 'msbs-api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function issueToken(userId, config) {
  return jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: config.jwtLifetimeSeconds,
  });
}

// Every private route goes through this. The user is whoever the verified token's subject says, never an ID the
// browser sends: the signature, algorithm, issuer, audience and expiry are all checked.
export function requireAuth(config) {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
      if (typeof claims.sub !== 'string' || !UUID.test(claims.sub)) throw new Error('bad subject');
      req.userId = claims.sub;
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired session' });
    }
  };
}
