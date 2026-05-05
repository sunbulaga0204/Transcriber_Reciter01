const axios = require('axios');

exports.handler = async (event, context) => {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  
  if (!apiKey || apiKey === 'your_exchangerate_api_key_here') {
    // Fallback to mock rates if key is missing
    return {
      statusCode: 200,
      body: JSON.stringify({
        rates: { IDR: 15500, MYR: 4.7, SAR: 3.75 },
        source: 'mock'
      })
    };
  }

  try {
    const response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rates: {
          IDR: response.data.conversion_rates.IDR,
          MYR: response.data.conversion_rates.MYR,
          SAR: response.data.conversion_rates.SAR
        },
        source: 'real-time'
      })
    };
  } catch (error) {
    console.error('[Pricing] ExchangeRate API Error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch exchange rates' })
    };
  }
};
