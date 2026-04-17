// Vercel Serverless Function — Fiskaly KassenSichV TSE signing
// Called by order.html after each order is placed

const https = require('https');

const BASE = 'kassensichv-middleware.fiskaly.com';
const API_KEY    = process.env.FISKALY_API_KEY;
const API_SECRET = process.env.FISKALY_API_SECRET;
const TSS_ID     = process.env.FISKALY_TSS_ID;
const CLIENT_ID  = process.env.FISKALY_CLIENT_ID;
const ADMIN_PIN  = process.env.FISKALY_ADMIN_PIN;

function fiskalyReq(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: BASE,
            port: 443,
            path: '/api/v2' + path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
                ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };
        const req = https.request(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: {} }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function getToken() {
    const r = await fiskalyReq('POST', '/auth', { api_key: API_KEY, api_secret: API_SECRET });
    if (!r.body.access_token) throw new Error('Auth failed: ' + JSON.stringify(r.body));
    return r.body.access_token;
}

async function signTransaction(orderData) {
    const token = await getToken();

    // Admin auth (required before signing)
    await fiskalyReq('PATCH', `/tss/${TSS_ID}/admin`, { admin_pin: ADMIN_PIN }, token);

    // Create transaction
    const txId = crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomUUID();
    await fiskalyReq('PUT', `/tss/${TSS_ID}/tx/${txId}`, {
        state: 'ACTIVE',
        client_id: CLIENT_ID,
        type: 'RECEIPT'
    }, token);

    // Build VAT amounts for the receipt
    const amounts_per_vat_rate = [];
    if (orderData.net_food > 0) {
        amounts_per_vat_rate.push({
            vat_rate: 'NORMAL',           // 7% food (reduced rate in Germany)
            amount: orderData.items_gross.toFixed(2)
        });
    }
    if (orderData.net_bev > 0) {
        amounts_per_vat_rate.push({
            vat_rate: 'NORMAL_19',
            amount: (orderData.net_bev + orderData.vat_19).toFixed(2)
        });
    }
    if (orderData.delivery_gross > 0) {
        amounts_per_vat_rate.push({
            vat_rate: 'NORMAL_19',
            amount: orderData.delivery_gross.toFixed(2)
        });
    }

    // Finish (sign) transaction
    const finish = await fiskalyReq('PUT', `/tss/${TSS_ID}/tx/${txId}?tx_revision=2`, {
        state: 'FINISHED',
        client_id: CLIENT_ID,
        type: 'RECEIPT',
        data: {
            aeao: {
                receipt: {
                    receipt_type: 'RECEIPT',
                    amounts_per_vat_rate: amounts_per_vat_rate.length ? amounts_per_vat_rate : [
                        { vat_rate: 'NORMAL', amount: orderData.gross_total.toFixed(2) }
                    ],
                    amounts_per_payment_type: [{
                        payment_type: 'CASH',
                        amount: orderData.gross_total.toFixed(2)
                    }]
                }
            }
        }
    }, token);

    if (finish.status !== 200) throw new Error('Sign failed: ' + JSON.stringify(finish.body));

    const sig = finish.body.signature || {};
    return {
        tx_id:            txId,
        tss_serial:       finish.body.tss_serial_number || '',
        signature:        sig.value || '',
        signature_algo:   sig.algorithm || '',
        signature_ts:     sig.timestamp || '',
        tx_number:        finish.body.number || 0,
        qr_code_data:     [
            'V0',
            finish.body.tss_serial_number || '',
            finish.body.number || 0,
            sig.timestamp || '',
            sig.timestamp || '',
            '0000-00-00T00:00:00',
            orderData.gross_total.toFixed(2),
            sig.value || ''
        ].join(';')
    };
}

module.exports = async function handler(req, res) {
    // CORS headers for byteburgers.shop
    res.setHeader('Access-Control-Allow-Origin', 'https://www.byteburgers.shop');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!API_KEY || !API_SECRET || !TSS_ID || !CLIENT_ID || !ADMIN_PIN) {
        return res.status(500).json({ error: 'Fiskaly env vars not configured' });
    }

    try {
        const orderData = req.body;
        const result = await signTransaction(orderData);
        return res.status(200).json(result);
    } catch (err) {
        console.error('Fiskaly error:', err.message);
        return res.status(500).json({ error: err.message });
    }
};
