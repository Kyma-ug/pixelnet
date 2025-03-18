const fetch = require('node-fetch');
const MikroNode = require('mikronode');

// Pesapal credentials
const PESAPAL_CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY || 'YOUR_CONSUMER_KEY';
const PESAPAL_CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET || 'YOUR_CONSUMER_SECRET';
const PESAPAL_API_URL = 'https://pay.pesapal.com/v3'; // Live URL
// const PESAPAL_API_URL = 'https://cybqa.pesapal.com/pesapalv3'; // Sandbox URL

// MikroTik credentials
const MIKROTIK_IP = process.env.MIKROTIK_IP || 'YOUR_MIKROTIK_IP';
const MIKROTIK_USERNAME = process.env.MIKROTIK_USERNAME || 'admin';
const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD || 'YOUR_PASSWORD';
const MIKROTIK_PORT = process.env.MIKROTIK_PORT || 8728;

async function getAccessToken() {
    const response = await fetch(`${PESAPAL_API_URL}/api/Auth/RequestToken`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            consumer_key: PESAPAL_CONSUMER_KEY,
            consumer_secret: PESAPAL_CONSUMER_SECRET,
        }),
    });
    const data = await response.json();
    if (!data.token) throw new Error('Pesapal token fetch failed');
    return data.token;
}

async function submitOrder(token, phone, amount, package, paymentMethod) {
    const pesapalMethod = paymentMethod === 'airtel' ? 'AirtelMoney' : 'MTNMobileMoney';
    console.log(`Mapping ${paymentMethod} to Pesapal method: ${pesapalMethod}`);

    const response = await fetch(`${PESAPAL_API_URL}/api/Transactions/SubmitOrderRequest`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            id: Date.now().toString(),
            currency: 'UGX',
            amount: parseInt(amount),
            description: `Payment for ${package} package`,
            callback_url: 'https://your-vercel-app.vercel.app/hotspot/success.html', // Update after deployment
            notification_id: process.env.PESAPAL_IPN_ID || 'YOUR_IPN_ID',
            billing_address: {
                phone_number: phone.startsWith('0') ? `256${phone.slice(1)}` : phone,
                country_code: 'UG',
            },
            payment_method: pesapalMethod,
        }),
    });
    const data = await response.json();
    if (!data.order_tracking_id) throw new Error('Order submission failed');
    return data.order_tracking_id;
}

async function checkPaymentStatus(token, orderTrackingId) {
    const response = await fetch(`${PESAPAL_API_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    });
    const data = await response.json();
    return data.payment_status;
}

async function createMikrotikVoucher(package) {
    const username = `user_${Date.now()}`;
    const password = Math.random().toString(36).slice(-8);
    const profile = package === '12hr' ? '12hr-profile' :
                    package === '24hr' ? '24hr-profile' :
                    package === 'week' ? 'week-profile' : 'month-profile';

    const device = new MikroNode(MIKROTIK_IP, MIKROTIK_PORT);
    try {
        const [login] = await device.connect();
        const conn = await login(MIKROTIK_USERNAME, MIKROTIK_PASSWORD);
        const chan = conn.openChannel('add-user');
        await chan.write('/ip/hotspot/user/add', {
            'name': username,
            'password': password,
            'profile': profile,
        });
        chan.close();
        conn.close();
        return { username, password };
    } catch (error) {
        console.error('MikroNode Error:', error);
        throw new Error('Failed to create MikroTik user');
    }
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        if (req.method === 'POST' && !req.query.ipn) { // Payment initiation
            const { phone, amount, package, payment_method } = req.body;
            if (!phone || !amount || !package || !['airtel', 'momo'].includes(payment_method)) {
                return res.status(400).json({ error: 'Invalid request data' });
            }

            const token = await getAccessToken();
            const orderTrackingId = await submitOrder(token, phone, amount, package, payment_method);
            return res.status(200).json({ order_tracking_id: orderTrackingId, payment_method });
        } else if (req.method === 'GET' && req.query.check_status) { // Status check
            const { check_status: orderTrackingId, package } = req.query;
            const token = await getAccessToken();
            const status = await checkPaymentStatus(token, orderTrackingId);

            if (status === 'COMPLETED') {
                const voucher = await createMikrotikVoucher(package);
                return res.status(200).json({
                    status: 'COMPLETED',
                    username: voucher.username,
                    password: voucher.password,
                });
            }
            return res.status(200).json({ status });
        } else if (req.method === 'POST' && req.query.ipn) { // IPN handling
            const { order_tracking_id, status } = req.body;
            console.log(`IPN received: ${order_tracking_id} - ${status}`);
            // Here you could add MongoDB to store/update payment status if needed
            return res.status(200).json({ message: 'IPN processed' });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};