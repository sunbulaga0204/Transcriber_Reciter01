const { validateJWT } = require('./utils/auth');
const { getPoints } = require('./utils/points');

exports.handler = async (event, context) => {
  const auth = validateJWT(event.headers['authorization']);
  if (!auth.valid) {
    return { statusCode: 401, body: JSON.stringify({ error: auth.error }) };
  }
  if (!auth.roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Admin role required' }) };
  }

  // Stub: in a full implementation, you'd list all users from Netlify Identity API
  // For now, return the admin's own data as a starting point
  try {
    const adminData = await getPoints(auth.userId);
    return {
      statusCode: 200,
      body: JSON.stringify({
        userCount: 1, // Expand via Netlify Identity Management API
        totalPoints: adminData.points,
        users: [{ email: auth.email, roles: auth.roles, ...adminData }]
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
