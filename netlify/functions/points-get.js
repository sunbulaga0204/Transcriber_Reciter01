const { validateJWT } = require('./utils/auth');
const { getPoints } = require('./utils/points');

exports.handler = async (event, context) => {
  const auth = validateJWT(event.headers['authorization']);
  if (!auth.valid) {
    return { statusCode: 401, body: JSON.stringify({ error: auth.error }) };
  }

  try {
    const data = await getPoints(auth.userId);
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
