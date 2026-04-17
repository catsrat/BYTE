const express = require('express');
const path    = require('path');
const { spawn } = require('child_process');
const https   = require('https');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));   // serve the website files

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

// ── Fiskaly config ───────────────────────────────────────────────────────────
const FISKALY_API_KEY    = process.env.FISKALY_API_KEY;
const FISKALY_API_SECRET = process.env.FISKALY_API_SECRET;
const FISKALY_BASE_URL   = process.env.FISKALY_BASE_URL || 'https://kassensichv-middleware.fiskaly.com/api/v2';
const SMAERS_PORT        = 10001;

let smaersProcess = null;
let smaersReady   = false;

// ── Start Fiskaly SMAERS ─────────────────────────────────────────────────────
function startSMAERS() {
    const smaersPath = path.join(__dirname, 'fiskaly-service');
    try {
        // Check if binary exists
        require('fs').accessSync(smaersPath);
    } catch {
        console.log('SMAERS binary not found — Fiskaly signing disabled');
        return;
    }

    smaersProcess = spawn(smaersPath, ['--port', SMAERS_PORT], {
        env: { ...process.env }
    });

    smaersProcess.stdout.on('data', d => {
        const msg = d.toString();
        console.log('[SMAERS]', msg.trim());
        if (msg.includes('listening') || msg.includes('started') || msg.includes('ready')) {
            smaersReady = true;
            console.log('SMAERS is ready on port', SMAERS_PORT);
        }
    });
    smaersProcess.stderr.on('data', d => console.error('[SMAERS ERR]', d.toString().trim()));
    smaersProcess.on('exit', code => {
        console.log('SMAERS exited with code', code);
        smaersReady = false;
        // Restart after 5s
        setTimeout(startSMAERS, 5000);
    });
}

// ── Fiskaly REST helper (direct to middleware) ───────────────────────────────
function fiskalyReq(method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const url  = new URL(FISKALY_BASE_URL + urlPath);
        const opts = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token  ? { 'Authorization': 'Bearer ' + token } : {}),
                ...(data   ? { 'Content-Length': Buffer.byteLength(data) } : {})
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


// ── Setup TSS (runs once on startup if env vars present) ────────────────────
async function setupFiskaly() {
    if (!FISKALY_API_KEY || !FISKALY_API_SECRET) {
        console.log('Fiskaly env vars not set — skipping setup');
        return;
    }

    try {
        // Auth
        const authR = await fiskalyReq('POST', '/auth', {
            api_key: FISKALY_API_KEY, api_secret: FISKALY_API_SECRET
        });
        const token = authR.body.access_token;
        if (!token) throw new Error('Auth failed');
        console.log('Fiskaly auth OK');

        // Check if TSS_ID is already configured
        if (process.env.FISKALY_TSS_ID) {
            console.log('TSS already configured:', process.env.FISKALY_TSS_ID);
            return;
        }

        // Create new TSS
        const tssId    = crypto.randomUUID();
        const clientId = crypto.randomUUID();

        const tssR = await fiskalyReq('PUT', `/tss/${tssId}`, { state: 'CREATED' }, token);
        const puk  = tssR.body.admin_puk;
        console.log('TSS created:', tssId, 'PUK:', puk);

        // Transition to UNINITIALIZED
        await fiskalyReq('PATCH', `/tss/${tssId}`, { state: 'UNINITIALIZED' }, token);

        // Set admin PIN
        const pin = puk; // use PUK as PIN for simplicity
        await fiskalyReq('PATCH', `/tss/${tssId}/admin`, {
            admin_puk: puk, new_admin_pin: pin
        }, token);

        // Auth with new PIN then initialize
        await fiskalyReq('PATCH', `/tss/${tssId}/admin`, { admin_pin: pin }, token);
        await fiskalyReq('PATCH', `/tss/${tssId}`, { state: 'INITIALIZED' }, token);

        // Create client
        await fiskalyReq('PUT', `/tss/${tssId}/client/${clientId}`,
            { serial_number: 'byte-pos-001' }, token);

        console.log('=== ADD THESE TO RAILWAY ENV VARS ===');
        console.log('FISKALY_TSS_ID=' + tssId);
        console.log('FISKALY_CLIENT_ID=' + clientId);
        console.log('FISKALY_ADMIN_PIN=' + pin);

    } catch (err) {
        console.error('Fiskaly setup error:', err.message);
    }
}

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
        return res.json({ signed: false, reason: 'TSS not initialized yet' });
    }

    try {
        // Get fresh token
        const authR = await fiskalyReq('POST', '/auth', {
            api_key: FISKALY_API_KEY, api_secret: FISKALY_API_SECRET
        });
        const token = authR.body.access_token;

        // Admin auth
        await fiskalyReq('PATCH', `/tss/${TSS_ID}/admin`, { admin_pin: ADMIN_PIN }, token);

        // Create transaction
        const txId = crypto.randomUUID();
        await fiskalyReq('PUT', `/tss/${TSS_ID}/tx/${txId}`, {
            state: 'ACTIVE',
            client_id: CLIENT_ID,
            type: 'RECEIPT'
        }, token);

        // Build VAT amounts
        const vatAmounts = [];
        if (net_food > 0) vatAmounts.push({
            vat_rate: 'REDUCED_1',
            amount: ((net_food || 0) + (vat_7 || 0)).toFixed(2)
        });
        if (net_bev > 0) vatAmounts.push({
            vat_rate: 'NORMAL',
            amount: ((net_bev || 0) + (vat_19 || 0)).toFixed(2)
        });
        if (delivery_gross > 0) vatAmounts.push({
            vat_rate: 'NORMAL',
            amount: Number(delivery_gross).toFixed(2)
        });
        if (!vatAmounts.length) vatAmounts.push({
            vat_rate: 'NORMAL',
            amount: Number(gross_total).toFixed(2)
        });

        // Finish (sign) transaction
        const finishR = await fiskalyReq('PUT', `/tss/${TSS_ID}/tx/${txId}?tx_revision=2`, {
            state: 'FINISHED',
            client_id: CLIENT_ID,
            type: 'RECEIPT',
            data: {
                aeao: {
                    receipt: {
                        receipt_type: 'RECEIPT',
                        amounts_per_vat_rate: vatAmounts,
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
            signed: true,
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
        status: 'ok',
        fiskaly: !!FISKALY_API_KEY,
        tss: !!process.env.FISKALY_TSS_ID,
        smaers: smaersReady
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    startSMAERS();
    await setupFiskaly();
});
