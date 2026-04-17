const express = require('express');
const path    = require('path');
const https   = require('https');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// CORS — allow byteburgers.shop and railway domain
app.use((req, res, next) => {
    const allowed = [
        'https://www.byteburgers.shop',
        'https://byteburgers.shop',
        'https://byte-production-4ab2.up.railway.app'
    ];
    const origin = req.headers.origin;
    if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Fiskaly SIGN DE config ───────────────────────────────────────────────────
// Using kassensichv.fiskaly.com (cloud API, no SMAERS binary required)
// Admin auth is token-scoped — persists across requests within the same token
const FISKALY_API_KEY    = process.env.FISKALY_API_KEY;
const FISKALY_API_SECRET = process.env.FISKALY_API_SECRET;
const FISKALY_BASE       = 'kassensichv.fiskaly.com';
const FISKALY_API_PATH   = '/api/v2';

// ── Fiskaly REST helper ──────────────────────────────────────────────────────
function fiskalyReq(method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: FISKALY_BASE,
            port: 443,
            path: FISKALY_API_PATH + urlPath,
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
                try { resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }); }
                catch { resolve({ status: res.statusCode, body: {} }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function getToken() {
    const r = await fiskalyReq('POST', '/auth', {
        api_key: FISKALY_API_KEY,
        api_secret: FISKALY_API_SECRET
    });
    if (!r.body.access_token) throw new Error('Fiskaly auth failed: ' + JSON.stringify(r.body));
    return r.body.access_token;
}

// ── API: Initialize TSS ───────────────────────────────────────────────────────
// Call once to move TSS from UNINITIALIZED → INITIALIZED
// Requires FISKALY_TSS_ID and FISKALY_ADMIN_PIN env vars
app.get('/api/init-tss', async (_req, res) => {
    const TSS_ID    = process.env.FISKALY_TSS_ID;
    const CLIENT_ID = process.env.FISKALY_CLIENT_ID;
    const ADMIN_PIN = process.env.FISKALY_ADMIN_PIN;

    if (!TSS_ID)    return res.json({ ok: false, reason: 'FISKALY_TSS_ID not set' });
    if (!ADMIN_PIN) return res.json({ ok: false, reason: 'FISKALY_ADMIN_PIN not set' });

    try {
        const token = await getToken();
        console.log('Init TSS: got token');

        // Step 1: Check current TSS state
        const tssInfo = await fiskalyReq('GET', `/tss/${TSS_ID}`, null, token);
        console.log('TSS current state:', tssInfo.body.state);

        // Step 2: Authenticate admin using PUK (ADMIN_PIN holds the PUK from setup)
        // This sets the PIN and authenticates admin in one call on SIGN DE cloud API
        const pukR = await fiskalyReq('PATCH', `/tss/${TSS_ID}/admin`, {
            admin_puk:     ADMIN_PIN,
            new_admin_pin: ADMIN_PIN
        }, token);
        console.log('PUK auth result:', JSON.stringify(pukR.body));

        if (pukR.body._type && pukR.body._type.includes('ERROR')) {
            // PUK already used — try PIN auth instead
            console.log('PUK failed, trying PIN auth...');
            const pinR = await fiskalyReq('PATCH', `/tss/${TSS_ID}/admin`,
                { admin_pin: ADMIN_PIN }, token);
            console.log('PIN auth result:', JSON.stringify(pinR.body));
        }

        // Step 3: Initialize TSS
        const initR = await fiskalyReq('PATCH', `/tss/${TSS_ID}`,
            { state: 'INITIALIZED' }, token);
        console.log('Init result:', JSON.stringify(initR.body));

        // Step 4: Create/confirm client
        let clientR = { body: {} };
        if (CLIENT_ID) {
            clientR = await fiskalyReq('PUT', `/tss/${TSS_ID}/client/${CLIENT_ID}`,
                { serial_number: 'byte-pos-001' }, token);
            console.log('Client result:', JSON.stringify(clientR.body));
        }

        return res.json({
            ok:           true,
            tss_state:    initR.body.state,
            client_state: clientR.body.state,
            tss_result:   initR.body,
            client_result: clientR.body
        });
    } catch (err) {
        console.error('Init TSS error:', err.message);
        return res.json({ ok: false, reason: err.message });
    }
});

// ── API: Create fresh TSS (if you want to start over) ────────────────────────
app.get('/api/create-tss', async (_req, res) => {
    try {
        const token    = await getToken();
        const tssId    = crypto.randomUUID();
        const clientId = crypto.randomUUID();

        // Create TSS
        const tssR = await fiskalyReq('PUT', `/tss/${tssId}`, { state: 'CREATED' }, token);
        const puk  = tssR.body.admin_puk;
        console.log('TSS created:', tssId, 'PUK:', puk);

        if (!puk) throw new Error('No PUK returned: ' + JSON.stringify(tssR.body));

        // Move to UNINITIALIZED (required before admin auth)
        await fiskalyReq('PATCH', `/tss/${tssId}`, { state: 'UNINITIALIZED' }, token);

        // Set PIN via PUK (also authenticates admin on SIGN DE)
        const pin = puk;
        await fiskalyReq('PATCH', `/tss/${tssId}/admin`, {
            admin_puk:     puk,
            new_admin_pin: pin
        }, token);

        // Initialize
        const initR = await fiskalyReq('PATCH', `/tss/${tssId}`,
            { state: 'INITIALIZED' }, token);

        // Create client
        await fiskalyReq('PUT', `/tss/${tssId}/client/${clientId}`,
            { serial_number: 'byte-pos-001' }, token);

        console.log('=== ADD THESE TO RAILWAY ENV VARS ===');
        console.log('FISKALY_TSS_ID=' + tssId);
        console.log('FISKALY_CLIENT_ID=' + clientId);
        console.log('FISKALY_ADMIN_PIN=' + pin);

        return res.json({
            ok:         true,
            tss_id:     tssId,
            client_id:  clientId,
            admin_pin:  pin,
            tss_state:  initR.body.state,
            message:    'Save these as Railway env vars: FISKALY_TSS_ID, FISKALY_CLIENT_ID, FISKALY_ADMIN_PIN'
        });
    } catch (err) {
        console.error('Create TSS error:', err.message);
        return res.json({ ok: false, reason: err.message });
    }
});

// ── API: Sign an order ────────────────────────────────────────────────────────
app.post('/api/sign-order', async (req, res) => {
    const { net_food, vat_7, net_bev, vat_19,
            delivery_gross, gross_total, payment_type } = req.body;

    if (!FISKALY_API_KEY) {
        return res.json({ signed: false, reason: 'Fiskaly not configured' });
    }

    const TSS_ID    = process.env.FISKALY_TSS_ID;
    const CLIENT_ID = process.env.FISKALY_CLIENT_ID;
    const ADMIN_PIN = process.env.FISKALY_ADMIN_PIN;

    if (!TSS_ID || !CLIENT_ID || !ADMIN_PIN) {
        return res.json({ signed: false, reason: 'TSS not initialized — run /api/init-tss first' });
    }

    try {
        const token = await getToken();

        // Admin auth (token-scoped on SIGN DE cloud — no SMAERS needed)
        const adminR = await fiskalyReq('PATCH', `/tss/${TSS_ID}/admin`,
            { admin_pin: ADMIN_PIN }, token);
        if (adminR.body._type && adminR.body._type.includes('ERROR')) {
            throw new Error('Admin auth failed: ' + JSON.stringify(adminR.body));
        }

        // Create transaction (ACTIVE)
        const txId = crypto.randomUUID();
        await fiskalyReq('PUT', `/tss/${TSS_ID}/tx/${txId}`, {
            state:     'ACTIVE',
            client_id: CLIENT_ID,
            type:      'RECEIPT'
        }, token);

        // Build VAT amounts
        const vatAmounts = [];
        if ((net_food || 0) > 0) vatAmounts.push({
            vat_rate: 'REDUCED_1',   // 7% food in Germany
            amount: ((net_food || 0) + (vat_7 || 0)).toFixed(2)
        });
        if ((net_bev || 0) > 0) vatAmounts.push({
            vat_rate: 'NORMAL',      // 19% beverages
            amount: ((net_bev || 0) + (vat_19 || 0)).toFixed(2)
        });
        if ((delivery_gross || 0) > 0) vatAmounts.push({
            vat_rate: 'NORMAL',
            amount: Number(delivery_gross).toFixed(2)
        });
        if (!vatAmounts.length) vatAmounts.push({
            vat_rate: 'NORMAL',
            amount: Number(gross_total).toFixed(2)
        });

        // Finish (sign) transaction
        const finishR = await fiskalyReq('PUT', `/tss/${TSS_ID}/tx/${txId}?tx_revision=2`, {
            state:     'FINISHED',
            client_id: CLIENT_ID,
            type:      'RECEIPT',
            data: {
                aeao: {
                    receipt: {
                        receipt_type: 'RECEIPT',
                        amounts_per_vat_rate:    vatAmounts,
                        amounts_per_payment_type: [{
                            payment_type: payment_type === 'card' ? 'NON_CASH' : 'CASH',
                            amount: Number(gross_total).toFixed(2)
                        }]
                    }
                }
            }
        }, token);

        if (finishR.status !== 200) {
            throw new Error('Sign failed: ' + JSON.stringify(finishR.body));
        }

        const sig = finishR.body.signature || {};
        return res.json({
            signed:         true,
            tx_id:          txId,
            tx_number:      finishR.body.number || 0,
            tss_serial:     finishR.body.tss_serial_number || '',
            signature:      sig.value || '',
            signature_algo: sig.algorithm || '',
            signature_ts:   sig.timestamp || '',
            qr_data: [
                'V0',
                finishR.body.tss_serial_number || '',
                finishR.body.number || 0,
                sig.timestamp || '',
                sig.timestamp || '',
                Number(gross_total).toFixed(2),
                sig.value || ''
            ].join(';')
        });

    } catch (err) {
        console.error('Sign error:', err.message);
        return res.json({ signed: false, reason: err.message });
    }
});

// ── API: Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status:  'ok',
        api:     'fiskaly-sign-de',
        fiskaly: !!FISKALY_API_KEY,
        tss:     !!process.env.FISKALY_TSS_ID,
        client:  !!process.env.FISKALY_CLIENT_ID
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Fiskaly API:', FISKALY_API_KEY ? 'configured' : 'NOT configured');
    console.log('TSS:', process.env.FISKALY_TSS_ID || 'not set');
});
