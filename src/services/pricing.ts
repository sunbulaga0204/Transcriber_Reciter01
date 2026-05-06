import axios from 'axios';

export async function fetchExchangeRates() {
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    const fallbackRates = { IDR: 15500, MYR: 4.7, SAR: 3.75 };
    
    if (!apiKey || apiKey === 'your_exchangerate_api_key_here') {
        return { rates: fallbackRates, source: 'mock' };
    }

    try {
        const response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`);
        return {
            rates: {
                IDR: response.data.conversion_rates.IDR,
                MYR: response.data.conversion_rates.MYR,
                SAR: response.data.conversion_rates.SAR
            },
            source: 'real-time'
        };
    } catch (error: any) {
        console.warn('[Pricing] API failed, using fallback:', error.message);
        return { rates: fallbackRates, source: 'fallback-mock' };
    }
}
