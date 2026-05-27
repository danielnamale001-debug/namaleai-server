// ===== NamaleAI Backend — M-Pesa STK Push Server =====
const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
const app      = express();

app.use(cors());
app.use(express.json());

const CONSUMER_KEY    = 'KHOnPlA6ChibfnE6tv8HZAqz3q2FOlQtdps5HqvVOZ2PooSE';
const CONSUMER_SECRET = 'ifRFemd1o1tLt9GeyHasaaUE5MAtG8j1eem6DAMuwNKr3GFGz1wZIIHLturNtw3u';
const PASSKEY         = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const TILL_NUMBER     = '9218400';
const SHORTCODE       = '9218400'; // Your actual till number as shortcode
const BASE_URL        = 'https://api.safaricom.co.ke'; // Production URL

async function getAccessToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res  = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  return res.data.access_token;
}

function getTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

app.post('/api/stkpush', async (req, res) => {
  const { phone, amount, planName } = req.body;
  if (!phone || !amount) return res.status(400).json({ error: 'Phone and amount are required.' });

  let formattedPhone = phone.replace(/\s+/g, '');
  if (formattedPhone.startsWith('0'))  formattedPhone = '254' + formattedPhone.slice(1);
  else if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

  try {
    const token     = await getAccessToken();
    const timestamp = getTimestamp();
    const password  = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerBuyGoodsOnline',
        Amount:            amount,
        PartyA:            formattedPhone,
        PartyB:            TILL_NUMBER,
        PhoneNumber:       formattedPhone,
        CallBackURL:       'https://namaleai.netlify.app/callback',
        AccountReference:  'NamaleAI',
        TransactionDesc:   `NamaleAI ${planName || 'Pro'} Plan`
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.json(response.data);
  } catch (err) {
    const errData = err.response?.data;
    // If response is HTML (Safaricom error page), return a clean message
    const isHtml = typeof errData === 'string' && errData.trim().startsWith('<');
    const message = isHtml
      ? 'Payment failed. Please check your phone number and try again.'
      : (errData?.errorMessage || errData?.error?.message || err.message || 'Payment failed.');
    console.error('STK Push error:', errData || err.message);
    res.status(500).json({ error: message });
  }
});

app.get('/', (req, res) => res.json({ status: 'NamaleAI server is running' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
