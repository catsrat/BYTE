(function () {
    'use strict';

    // ── PRIZES ────────────────────────────────────────────────────────────────
    const PRIZES = [
        { label: '50% Rabatt',       type: 'discount',     value: 50,        color: '#c44d00' },
        { label: 'Gratis Pommes',    type: 'freeItem',     value: 'Pommes',  color: '#1a1a1a' },
        { label: '10% Rabatt',       type: 'discount',     value: 10,        color: '#ff6b00' },
        { label: 'Gratis Tenders',   type: 'freeItem',     value: 'Tenders', color: '#2a2a2a' },
        { label: '15% Rabatt',       type: 'discount',     value: 15,        color: '#e05500' },
        { label: 'Gratis Drink',     type: 'freeItem',     value: 'Drink',   color: '#222'    },
        { label: 'Gratis Lieferung', type: 'freeDelivery', value: null,      color: '#b84000' },
        { label: 'Kein Glück',       type: 'none',         value: null,      color: '#333'    },
    ];
    // weights must sum to 100
    const WEIGHTS = [2, 18, 15, 12, 10, 15, 13, 15];

    // ── STATE ─────────────────────────────────────────────────────────────────
    let currentRotationDeg = 0;
    let isSpinning         = false;
    let spinPhone          = null;   // formatted phone used during wheel flow
    let spinConfirmResult  = null;   // Firebase confirmationResult
    let spinRcVerifier     = null;
    let spinUID            = null;

    // ── UTILS ─────────────────────────────────────────────────────────────────
    function weightedRandom(weights) {
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r <= 0) return i;
        }
        return weights.length - 1;
    }

    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = 'SPIN';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function getDb() {
        return window._menuDb || (window.firebase && firebase.apps.length ? firebase.database() : null);
    }

    // ── CANVAS WHEEL ──────────────────────────────────────────────────────────
    function drawWheel(canvas, rotDeg) {
        const ctx   = canvas.getContext('2d');
        const size  = canvas.width;
        const cx    = size / 2, cy = size / 2;
        const r     = cx - 5;
        const n     = PRIZES.length;
        const seg   = (2 * Math.PI) / n;
        const rot   = (rotDeg - 90) * Math.PI / 180; // pointer at top

        ctx.clearRect(0, 0, size, size);

        PRIZES.forEach((prize, i) => {
            const start = rot + i * seg;
            const end   = start + seg;

            // Segment fill
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, start, end);
            ctx.closePath();
            ctx.fillStyle = prize.color;
            ctx.fill();

            // Segment border
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Label
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(start + seg / 2);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${size < 260 ? 9 : 11}px "Segoe UI", Arial, sans-serif`;
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur  = 4;
            ctx.fillText(prize.label, r - 10, 5);
            ctx.restore();
        });

        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ff6b00';
        ctx.lineWidth   = 5;
        ctx.stroke();

        // Center hub
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff6b00';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.stroke();

        ctx.fillStyle  = '#fff';
        ctx.font       = 'bold 9px Arial';
        ctx.textAlign  = 'center';
        ctx.shadowBlur = 0;
        ctx.fillText('BYTE', cx, cy + 3);
    }

    function animateSpin(canvas, prizeIndex, onDone) {
        if (isSpinning) return;
        isSpinning = true;

        const n         = PRIZES.length;
        const segDeg    = 360 / n;
        // align prizeIndex center to pointer (top = 0°, going clockwise)
        const target    = (360 - (prizeIndex * segDeg + segDeg / 2)) % 360;
        const spins     = (5 + Math.floor(Math.random() * 3)) * 360;
        const totalDeg  = spins + ((target - currentRotationDeg % 360) + 360) % 360;
        const startDeg  = currentRotationDeg;
        const duration  = 5200;
        const startTime = performance.now();

        function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

        function frame(now) {
            const t   = Math.min((now - startTime) / duration, 1);
            const deg = startDeg + totalDeg * easeOut(t);
            currentRotationDeg = deg;
            drawWheel(canvas, deg);
            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                isSpinning = false;
                onDone();
            }
        }
        requestAnimationFrame(frame);
    }

    // ── FIREBASE ──────────────────────────────────────────────────────────────
    async function saveCode(uid, phone, prize, code) {
        const db = getDb();
        if (!db) return code;

        const phoneKey = phone.replace(/[^0-9]/g, '');

        // Idempotent: check by UID or phone
        if (uid) {
            const existing = await db.ref('spinWinUsers/' + uid).once('value');
            if (existing.val()) return existing.val();
        }
        const phoneExisting = await db.ref('spinWinPhones/' + phoneKey).once('value');
        if (phoneExisting.val()) return phoneExisting.val();

        await db.ref('spinWinCodes/' + code).set({
            phone,
            uid:        uid || null,
            prize:      prize.label,
            prizeType:  prize.type,
            prizeValue: prize.value,
            used:       false,
            createdAt:  Date.now()
        });
        if (uid) await db.ref('spinWinUsers/' + uid).set(code);
        await db.ref('spinWinPhones/' + phoneKey).set(code);
        return code;
    }

    async function getExistingCode(uid) {
        const db = getDb();
        if (!db || !uid) return null;
        const snap = await db.ref('spinWinUsers/' + uid).once('value');
        return snap.val();
    }

    // ── reCAPTCHA ─────────────────────────────────────────────────────────────
    function initSpinRecaptcha() {
        if (!window.firebase || !firebase.auth) return;
        if (spinRcVerifier) { try { spinRcVerifier.clear(); } catch (e) {} spinRcVerifier = null; }
        const container = document.getElementById('spin-recaptcha');
        if (!container) return;
        container.innerHTML = '';
        setTimeout(() => {
            try {
                spinRcVerifier = new firebase.auth.RecaptchaVerifier('spin-recaptcha', {
                    size: 'normal',
                    callback: () => {
                        const btn = document.getElementById('spin-send-otp-btn');
                        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
                    },
                    'expired-callback': () => {
                        const btn = document.getElementById('spin-send-otp-btn');
                        if (btn) { btn.disabled = true; btn.style.opacity = '0.45'; }
                    }
                });
                spinRcVerifier.render().catch(e => console.error('spin reCAPTCHA render:', e));
            } catch (e) { console.error('spin reCAPTCHA init:', e); }
        }, 200);
    }

    // ── POPUP HTML ────────────────────────────────────────────────────────────
    function buildPopupHTML() {
        return `
<style>
#sw-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,0.8);backdrop-filter:blur(6px);animation:swIn .35s ease}
@keyframes swIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
#sw-box{background:#111;border-radius:22px;padding:28px 22px 22px;max-width:420px;width:93vw;
  display:flex;flex-direction:column;align-items:center;gap:14px;position:relative;
  border:1px solid rgba(255,107,0,0.2);box-shadow:0 0 70px rgba(255,107,0,0.12)}
#sw-close{position:absolute;top:13px;right:16px;background:none;border:none;color:#666;
  font-size:21px;cursor:pointer;line-height:1}
#sw-close:hover{color:#fff}
.sw-title{font-size:1.45rem;font-weight:800;color:#fff;text-align:center;margin:0;letter-spacing:-.5px}
.sw-sub{font-size:.84rem;color:#999;text-align:center;margin:0}
#sw-canvas-wrap{position:relative;display:flex;align-items:center;justify-content:center}
#sw-pointer{position:absolute;top:-8px;left:50%;transform:translateX(-50%);
  width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;
  border-top:20px solid #ff6b00;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));z-index:2}
.sw-section{width:100%;display:flex;flex-direction:column;gap:10px}
.sw-input{background:#1c1c1c;border:1px solid #2e2e2e;color:#fff;border-radius:10px;
  padding:12px 14px;font-size:1rem;width:100%;box-sizing:border-box;outline:none}
.sw-input:focus{border-color:#ff6b00}
#sw-otp-input{letter-spacing:8px;text-align:center;font-size:1.15rem}
.sw-btn{width:100%;padding:13px;background:linear-gradient(135deg,#ff6b00,#c44d00);
  color:#fff;font-size:1rem;font-weight:700;border:none;border-radius:12px;cursor:pointer;transition:opacity .2s}
.sw-btn:disabled{opacity:.4;cursor:not-allowed}
.sw-btn:not(:disabled):hover{opacity:.82}
.sw-err{color:#f44336;font-size:.82rem;min-height:1em;text-align:center}
.sw-hint{color:#777;font-size:.78rem;text-align:center}
#sw-result{display:none;flex-direction:column;align-items:center;gap:12px;width:100%}
.sw-badge{background:linear-gradient(135deg,#ff6b00,#c44d00);color:#fff;font-size:1.3rem;
  font-weight:800;padding:14px 22px;border-radius:14px;text-align:center;width:100%;box-sizing:border-box}
.sw-codebox{background:#1a1a1a;border:1px dashed #ff6b00;border-radius:10px;padding:12px 18px;
  font-size:1.25rem;font-weight:700;letter-spacing:4px;color:#ff6b00;
  display:flex;align-items:center;gap:12px;justify-content:center}
.sw-copy{background:none;border:none;cursor:pointer;color:#888;font-size:1rem;padding:0}
.sw-copy:hover{color:#ff6b00}
.sw-note{color:#888;font-size:.8rem;text-align:center}
#sw-recaptcha-row{display:flex;justify-content:center}
</style>

<div id="sw-box">
  <button id="sw-close" onclick="document.getElementById('sw-overlay').remove()">✕</button>
  <p class="sw-title">🎡 Dreh & Gewinn!</p>
  <p class="sw-sub">Nummer verifizieren &amp; Rabatt sichern — einmalig pro Nummer.</p>

  <div id="sw-canvas-wrap">
    <div id="sw-pointer"></div>
    <canvas id="sw-canvas" width="270" height="270"></canvas>
  </div>

  <!-- Step 1 – phone + reCAPTCHA -->
  <div id="sw-step1" class="sw-section">
    <input id="sw-phone" class="sw-input" type="tel" placeholder="Handynummer z.B. 0176 12345678" />
    <div id="sw-recaptcha" id="sw-recaptcha-row"></div>
    <p class="sw-hint">✅ Bitte zuerst das Häkchen setzen, dann Code anfordern.</p>
    <div id="sw-err1" class="sw-err"></div>
    <button id="spin-send-otp-btn" class="sw-btn" disabled style="opacity:.45" onclick="window._swSendOTP()">Code senden</button>
  </div>

  <!-- Step 2 – OTP -->
  <div id="sw-step2" class="sw-section" style="display:none">
    <p id="sw-otp-label" class="sw-hint" style="font-size:.84rem;color:#aaa"></p>
    <input id="sw-otp-input" class="sw-input" type="number" placeholder="_ _ _ _ _ _" />
    <div id="sw-err2" class="sw-err"></div>
    <button class="sw-btn" onclick="window._swVerifyOTP()">Verifizieren &amp; Drehen! 🎡</button>
  </div>

  <!-- Step 3 – spin ready (already verified) -->
  <div id="sw-step3" class="sw-section" style="display:none">
    <button class="sw-btn" onclick="window._swSpin()">🎡 Jetzt drehen!</button>
  </div>

  <!-- Result -->
  <div id="sw-result">
    <div class="sw-badge" id="sw-badge">🎉</div>
    <div id="sw-codewrap" style="display:none;flex-direction:column;align-items:center;gap:6px;width:100%">
      <p class="sw-note" style="margin:0">Dein persönlicher Code:</p>
      <div class="sw-codebox">
        <span id="sw-code"></span>
        <button class="sw-copy" onclick="navigator.clipboard.writeText(document.getElementById('sw-code').textContent).then(()=>{this.textContent='✓'})">📋</button>
      </div>
    </div>
    <p class="sw-note" id="sw-remark"></p>
    <button class="sw-btn" onclick="document.getElementById('sw-overlay').remove()">Los geht's!</button>
  </div>
</div>`;
    }

    // ── SHOW / HIDE STEPS ─────────────────────────────────────────────────────
    function showStep(n) {
        [1, 2, 3].forEach(i => {
            const el = document.getElementById('sw-step' + i);
            if (el) el.style.display = i === n ? 'flex' : 'none';
        });
    }

    function showResult(prizeLabel, prizeType, code) {
        showStep(0);
        const res = document.getElementById('sw-result');
        res.style.display = 'flex';

        const badge = document.getElementById('sw-badge');
        if (prizeType === 'none') {
            badge.textContent   = '😕 Kein Glück — nächstes Mal!';
            badge.style.background = '#2a2a2a';
            document.getElementById('sw-remark').textContent = 'Versuch es bei deiner nächsten Bestellung!';
        } else {
            badge.textContent = '🎉 ' + prizeLabel + '!';
            if (code) {
                const codeWrap = document.getElementById('sw-codewrap');
                codeWrap.style.display = 'flex';
                document.getElementById('sw-code').textContent = code;
                const remark = document.getElementById('sw-remark');
                if (prizeType === 'discount') {
                    remark.textContent = 'Code im Warenkorb eingeben oder im Laden vorzeigen.';
                } else if (prizeType === 'freeDelivery') {
                    remark.textContent = 'Kostenlose Lieferung! Code im Warenkorb eingeben.';
                } else {
                    remark.textContent = 'Code bei der Bestellung angeben oder im Laden vorzeigen.';
                }
            }
        }
    }

    // ── OTP SEND ──────────────────────────────────────────────────────────────
    window._swSendOTP = async function () {
        const raw = document.getElementById('sw-phone').value.trim().replace(/\s/g, '');
        const err = document.getElementById('sw-err1');
        const btn = document.getElementById('spin-send-otp-btn');
        if (!raw) { err.textContent = 'Bitte Nummer eingeben.'; return; }

        let phone = raw;
        if (phone.startsWith('0')) phone = '+49' + phone.slice(1);
        if (!phone.startsWith('+')) phone = '+49' + phone;
        spinPhone = phone;

        btn.disabled   = true;
        btn.textContent = 'Wird gesendet…';
        err.textContent = '';

        try {
            spinConfirmResult = await firebase.auth().signInWithPhoneNumber(phone, spinRcVerifier);
            showStep(2);
            document.getElementById('sw-otp-label').textContent = 'Code gesendet an ' + phone;
        } catch (e) {
            err.textContent = '❌ ' + (e.message || e.code);
            btn.disabled    = false;
            btn.textContent = 'Code senden';
            if (spinRcVerifier) { try { spinRcVerifier.clear(); } catch (e2) {} spinRcVerifier = null; }
            initSpinRecaptcha();
        }
    };

    // ── OTP VERIFY ────────────────────────────────────────────────────────────
    window._swVerifyOTP = async function () {
        const otp  = document.getElementById('sw-otp-input').value.trim();
        const err  = document.getElementById('sw-err2');
        const btn  = document.querySelector('#sw-step2 .sw-btn');
        if (!otp || otp.length < 6) { err.textContent = 'Bitte 6-stelligen Code eingeben.'; return; }

        btn.disabled    = true;
        btn.textContent = 'Wird geprüft…';
        err.textContent = '';

        try {
            const result = await spinConfirmResult.confirm(otp);
            spinUID = result.user.uid;
            sessionStorage.setItem('byteVerifiedPhone', spinPhone);

            // Check if this UID already spun
            const existing = await getExistingCode(spinUID);
            if (existing) {
                await showExistingResult(existing);
                return;
            }

            showStep(3); // show spin button
        } catch (e) {
            err.textContent  = '❌ Falscher Code. Nochmal versuchen.';
            btn.disabled     = false;
            btn.textContent  = 'Verifizieren & Drehen! 🎡';
        }
    };

    // ── SPIN ──────────────────────────────────────────────────────────────────
    window._swSpin = function () {
        const canvas = document.getElementById('sw-canvas');
        const btn    = document.querySelector('#sw-step3 .sw-btn');
        if (btn) btn.disabled = true;

        const prizeIndex = weightedRandom(WEIGHTS);
        animateSpin(canvas, prizeIndex, async () => {
            const prize = PRIZES[prizeIndex];
            let code    = null;

            if (prize.type !== 'none') {
                code = generateCode();
                const uid = spinUID || (firebase.auth().currentUser && firebase.auth().currentUser.uid);
                if (uid) await saveCode(uid, spinPhone, prize, code);
                // Store for cart use
                sessionStorage.setItem('byteSpinCode',  code);
                sessionStorage.setItem('byteSpinPrize', JSON.stringify(prize));
            }

            showResult(prize.label, prize.type, code);
        });
    };

    // ── SHOW EXISTING RESULT ──────────────────────────────────────────────────
    async function showExistingResult(code) {
        const db   = getDb();
        if (!db) return;
        const snap = await db.ref('spinWinCodes/' + code).once('value');
        const data = snap.val();
        if (data) {
            showResult(data.prize, data.prizeType, data.used ? null : code);
            if (!data.used) {
                sessionStorage.setItem('byteSpinCode',  code);
                sessionStorage.setItem('byteSpinPrize', JSON.stringify({ type: data.prizeType, value: data.prizeValue, label: data.prize }));
            }
        }
    }

    // ── ENTRY POINT ───────────────────────────────────────────────────────────
    function showPopup() {
        if (sessionStorage.getItem('swShown')) return;
        if (document.getElementById('sw-overlay')) return;
        sessionStorage.setItem('swShown', '1');

        const overlay  = document.createElement('div');
        overlay.id     = 'sw-overlay';
        overlay.innerHTML = buildPopupHTML();
        document.body.appendChild(overlay);

        const canvas = document.getElementById('sw-canvas');
        drawWheel(canvas, 0);

        const verified = sessionStorage.getItem('byteVerifiedPhone');
        if (verified) {
            spinPhone = verified;
            // Phone already verified this session — skip OTP, go straight to spin
            // Check Firebase auth state to see if they already spun (best-effort)
            const authCheck = new Promise(resolve => {
                const unsub = firebase.auth().onAuthStateChanged(user => {
                    unsub();
                    resolve(user);
                });
            });
            const user = await Promise.race([
                authCheck,
                new Promise(r => setTimeout(() => r(null), 1500)) // 1.5s timeout
            ]);
            if (user) {
                spinUID = user.uid;
                const existing = await getExistingCode(user.uid);
                if (existing) { await showExistingResult(existing); return; }
            }
            // Also check by phone in spinWinPhones (works even when auth session expired)
            const phoneKey = verified.replace(/[^0-9]/g, '');
            const db = getDb();
            if (db) {
                const phoneSnap = await db.ref('spinWinPhones/' + phoneKey).once('value');
                if (phoneSnap.val()) { await showExistingResult(phoneSnap.val()); return; }
            }
            showStep(3);
        } else {
            showStep(1);
            initSpinRecaptcha();
        }
    }

    window.addEventListener('load', () => setTimeout(showPopup, 3000));
})();
