const axios = require('axios');
require('dotenv').config();

async function test() {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  console.log("API KEY:", apiKey);
  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
    console.log("URL:", url);
    const response = await axios.get(url);
    console.log("Success:", !!response.data.conversion_rates);
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
