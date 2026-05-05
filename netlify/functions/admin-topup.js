const { validateJWT } = require('./utils/auth');
const { topUpPoints } = require('./utils/points');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Only admins can call this
  const auth = validateJWT(event.headers['authorization']);
  if (!auth.valid) {
    return { statusCode: 401, body: JSON.stringify({ error: auth.error }) };
  }
  if (!auth.roles.includes('admin')) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Admin role required' }) };
  }

  const { email, amount } = JSON.parse(event.body);
  if (!email || !amount || amount <= 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid email and positive amount required' }) };
  }

  try {
    // Use email as the userId key (consistent with how Netlify Identity sets sub)
    const newBalance = await topUpPoints(email, amount);
    console.log(`[Admin] ${auth.email} topped up ${email} by ${amount} points. New balance: ${newBalance}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, newBalance })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
