const { MongoClient } = require('mongodb');
const MikroNode = require('mikronode');

const uri = process.env.MONGODB_URI || 'mongodb+srv://markyokuhaire18:vmYZlKOmdjefQBqR@pixeltrial0.6cdgc.mongodb.net/?retryWrites=true&w=majority&appName=pixeltrial0';
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// MikroTik credentials
const MIKROTIK_IP = process.env.MIKROTIK_IP || 'YOUR_MIKROTIK_IP';
const MIKROTIK_USERNAME = process.env.MIKROTIK_USERNAME || 'admin';
const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD || 'fc25';
const MIKROTIK_PORT = process.env.MIKROTIK_PORT || 8728;

async function connectToMongo() {
    if (!client.isConnected) await client.connect();
    return client.db('pixelnet').collection('trials');
}

async function createMikrotikTrialUser() {
    const username = `trial_${Date.now()}`;
    const password = Math.random().toString(36).slice(-8);
    const profile = 'trial-20min'; // Profile with 20-minute limit

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
        throw new Error('Failed to create MikroTik trial user');
    }
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, email, phone, macAddress } = req.body;
    if (!name || !email || !phone || !macAddress) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const collection = await connectToMongo();

        // Check if MAC address has used trial in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const existingTrial = await collection.findOne({
            macAddress,
            timestamp: { $gte: thirtyDaysAgo },
        });

        if (existingTrial) {
            return res.status(403).json({ error: 'This device has already used a trial this month' });
        }

        // Create trial user in MikroTik
        const { username, password } = await createMikrotikTrialUser();

        // Store trial data in MongoDB
        const trialData = {
            name,
            email,
            phone,
            macAddress,
            username,
            timestamp: new Date(),
        };
        await collection.insertOne(trialData);

        // Return credentials for login
        return res.status(200).json({ username, password, message: 'Trial registered successfully' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};