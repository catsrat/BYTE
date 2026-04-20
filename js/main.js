document.addEventListener("DOMContentLoaded", function() {
    
    // Register ScrollTrigger
    gsap.registerPlugin(ScrollTrigger);

    // Fade up animations
    const revealElements = document.querySelectorAll(".gs_reveal");
    revealElements.forEach(function(elem) {
        gsap.fromTo(elem, 
            { autoAlpha: 0, y: 50 }, 
            { 
                duration: 1, 
                autoAlpha: 1, 
                y: 0, 
                ease: "power3.out",
                scrollTrigger: {
                    trigger: elem,
                    start: "top 85%",
                    toggleActions: "play none none reverse"
                }
            }
        );
    });

    // Staggered Up elements
    const staggerUpElements = document.querySelectorAll(".gs_reveal_up");
    gsap.fromTo(staggerUpElements,
        { autoAlpha: 0, y: 50 },
        {
            duration: 0.8,
            autoAlpha: 1,
            y: 0,
            stagger: 0.2,
            ease: "power3.out",
            scrollTrigger: {
                trigger: staggerUpElements[0],
                start: "top 85%",
                toggleActions: "play none none reverse"
            }
        }
    );

    // Hero Text animation
    const heroText = document.querySelectorAll(".gs_reveal_text");
    gsap.fromTo(heroText,
        { autoAlpha: 0, scale: 0.8, rotationX: -45 },
        { 
            duration: 1.5, 
            autoAlpha: 1, 
            scale: 1, 
            rotationX: 0, 
            ease: "elastic.out(1, 0.5)",
            delay: 0.2
        }
    );

    // Image Entrance
    const heroImg = document.querySelectorAll(".gs_reveal_img");
    gsap.fromTo(heroImg,
        { autoAlpha: 0, x: 100 },
        {
            duration: 1.5,
            autoAlpha: 1,
            x: 0,
            ease: "power3.out",
            delay: 0.4
        }
    );

    // Initialize VanillaTilt for elements that might be loaded dynamically
    VanillaTilt.init(document.querySelectorAll(".tilt-card"), {
        max: 15,
        speed: 400,
        glare: true,
        "max-glare": 0.2,
        perspective: 1000
    });

    // 1. Dynamic Ambient Glow (Cursor Tracker)
    document.addEventListener('mousemove', (e) => {
        document.body.style.setProperty('--cursor-x', `${e.clientX}px`);
        document.body.style.setProperty('--cursor-y', `${e.clientY}px`);
    });

    // 2. Magnetic Buttons
    const magnets = document.querySelectorAll('.btn');
    magnets.forEach((magnet) => {
        magnet.addEventListener('mousemove', function(e) {
            const position = magnet.getBoundingClientRect();
            const x = e.clientX - position.left - position.width / 2;
            const y = e.clientY - position.top - position.height / 2;
            
            gsap.to(magnet, {
                x: x * 0.3,
                y: y * 0.3,
                duration: 0.5,
                ease: "power2.out"
            });
        });

        magnet.addEventListener('mouseleave', function() {
            gsap.to(magnet, {
                x: 0,
                y: 0,
                duration: 0.5,
                ease: "elastic.out(1, 0.3)"
            });
        });
    });
});

// Shopping Basket Logic
// Force wipe carts with old drink prices (pre-v36 fix)
if (!localStorage.getItem('byteCartV36_migrated')) {
    localStorage.removeItem('byteCart');
    localStorage.removeItem('byteCartV34_migrated');
    localStorage.removeItem('byteCartV35_migrated');
    localStorage.setItem('byteCartV36_migrated', 'true');
}

let cart = JSON.parse(localStorage.getItem('byteCart')) || [];
let activeDiscount = null;       // { code, percent, phone } once verified
let pendingDiscountData = null;  // { code, percent } waiting for OTP
let recaptchaVerifier = null;
let confirmationResult = null;

function saveCart() {
    localStorage.setItem('byteCart', JSON.stringify(cart));
    updateBasketUI();
}

// Menu Data for Combos
const menuData = {
    burgers: [
        { name: 'Goat Byte Original', price: 7.48, isGoat: true },
        { name: 'Spicy Goat Byte', price: 8.01, isGoat: true },
        { name: 'Truffle Goat Byte', price: 8.55, isGoat: true },
        { name: 'Byte Classic', price: 6.41, isGoat: false },
        { name: 'Double Byte', price: 8.01, isGoat: false },
        { name: 'Smoky BBQ Byte', price: 7.48, isGoat: false },
        { name: 'Crispy Chicken Byte', price: 5.87, isGoat: false },
        { name: 'Spicy Chicken Byte', price: 6.41, isGoat: false },
        { name: 'Green Byte (Vegan)', price: 5.87, isGoat: false },
        { name: 'Falafel Byte', price: 6.41, isGoat: false }
    ],
    sides: {
        regular: ['Classic Fries', 'Peri Peri Fries', 'Sweet Potato Fries', 'Crispy Onion Rings', 'Mozzarella Sticks', 'Jalapeño Poppers', 'Chicken Tenders'],
        loaded: ['Cheese Melt Fries', 'GOAT Loaded Fries', 'BBQ Beef Loaded Fries']
    },
    drinks: ['Coca-Cola', 'Fanta', 'Sprite', 'Mineral Water'],
    milkshakes: ['Schokoladen-Milchshake', 'Vanille-Milchshake', 'Erdbeer-Milchshake']
};

// Combo Selection Logic
const referencePrices = {
    // Drinks
    'Coca-Cola': 2.68, 'Fanta': 2.68, 'Sprite': 2.68, 'Sodas': 2.68, 'Mineral Water': 2.68,
    // Sides
    'Classic Fries': 2.66, 'Peri Peri Fries': 3.20, 'Sweet Potato Fries': 3.20,
    'Cheese Melt Fries': 4.27, 'BBQ Beef Loaded Fries': 5.34, 'GOAT Loaded Fries': 5.87,
    'Crispy Onion Rings': 3.73, 'Mozzarella Sticks': 4.27, 'Jalapeño Poppers': 4.27, 'Chicken Tenders': 4.80
};

let currentCombo = null;

// ── DISCOUNT CODE + PHONE VERIFICATION ───────────────────────────────────────

async function applyDiscountCode() {
    const input  = document.getElementById('discount-code-input');
    const status = document.getElementById('discount-status');
    if (!input || !status) return;

    if (activeDiscount) { removeDiscount(); return; }

    const code = input.value.trim().toUpperCase();
    if (!code) return;

    status.textContent = 'Wird geprüft…';
    status.style.color = 'var(--text-muted)';

    try {
        const db = firebase.database();
        const snap = await db.ref('discountCodes/' + code).once('value');
        const data = snap.val();
        if (!data || !data.active) {
            status.textContent = '❌ Ungültiger Rabattcode';
            status.style.color = '#f44336';
            return;
        }
        pendingDiscountData = { code, percent: data.discount };
        status.textContent = '';
        // Pre-init reCAPTCHA before modal opens so it renders instantly
        if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e) {} recaptchaVerifier = null; }
        openPhoneVerifyModal();
    } catch(e) {
        status.textContent = '❌ Fehler beim Prüfen';
        status.style.color = '#f44336';
    }
}

function removeDiscount() {
    activeDiscount = null;
    const input  = document.getElementById('discount-code-input');
    const status = document.getElementById('discount-status');
    const btn    = document.getElementById('discount-apply-btn');
    if (input)  input.value = '';
    if (status) { status.textContent = ''; }
    if (btn)    btn.textContent = 'Anwenden';
    updateBasketUI();
}

function openPhoneVerifyModal() {
    const modal = document.getElementById('phone-verify-modal');
    if (!modal) return;
    document.getElementById('phone-step-1').style.display = '';
    document.getElementById('phone-step-2').style.display = 'none';
    document.getElementById('verify-phone-input').value = '';
    document.getElementById('phone-verify-error').textContent = '';
    document.getElementById('otp-verify-error').textContent  = '';
    modal.classList.add('active');

    // Reset and render reCAPTCHA after modal is fully visible
    if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e) {} recaptchaVerifier = null; }
    document.getElementById('recaptcha-container').innerHTML = '';
    setTimeout(() => {
        try {
            recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', { size: 'normal' });
            recaptchaVerifier.render().catch(e => console.error('reCAPTCHA render error:', e));
        } catch(e) {
            console.error('reCAPTCHA init error:', e);
        }
    }, 100);
}

function closePhoneVerifyModal() {
    const modal = document.getElementById('phone-verify-modal');
    if (modal) modal.classList.remove('active');
    pendingDiscountData = null;
}

async function sendOTP() {
    const phoneInput = document.getElementById('verify-phone-input');
    const errorEl   = document.getElementById('phone-verify-error');
    const sendBtn   = document.getElementById('send-otp-btn');

    let phone = phoneInput.value.trim().replace(/\s/g, '');
    if (!phone) { errorEl.textContent = 'Bitte Nummer eingeben.'; return; }
    if (phone.startsWith('0')) phone = '+49' + phone.slice(1);
    if (!phone.startsWith('+')) phone = '+49' + phone;

    sendBtn.textContent = 'Wird gesendet…';
    sendBtn.disabled = true;
    errorEl.textContent = '';

    try {
        confirmationResult = await firebase.auth().signInWithPhoneNumber(phone, recaptchaVerifier);
        document.getElementById('otp-sent-to').textContent = 'Code gesendet an ' + phone;
        document.getElementById('phone-step-1').style.display = 'none';
        document.getElementById('phone-step-2').style.display = '';
        document.getElementById('verify-otp-input').value = '';
    } catch(e) {
        console.error('sendOTP error:', e.code, e.message);
        if (e.code === 'auth/invalid-phone-number') {
            errorEl.textContent = '❌ Ungültige Nummer — mit Ländercode eingeben, z.B. +49176...';
        } else if (e.code === 'auth/missing-client-identifier' || e.code === 'auth/captcha-check-failed') {
            errorEl.textContent = '❌ Bitte zuerst das reCAPTCHA-Häkchen setzen.';
        } else if (e.code === 'auth/too-many-requests') {
            errorEl.textContent = '❌ Zu viele Versuche. Bitte später erneut versuchen.';
        } else {
            errorEl.textContent = '❌ Fehler: ' + (e.message || e.code);
        }
        if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch(e2) {} recaptchaVerifier = null; }
    } finally {
        sendBtn.textContent = 'Code senden';
        sendBtn.disabled = false;
    }
}

async function verifyOTPAndApplyDiscount() {
    const otpInput = document.getElementById('verify-otp-input');
    const errorEl  = document.getElementById('otp-verify-error');
    const btn      = document.getElementById('verify-otp-btn');

    const otp = otpInput.value.trim();
    if (!otp || otp.length < 6) { errorEl.textContent = 'Bitte 6-stelligen Code eingeben.'; return; }

    btn.textContent = 'Wird geprüft…';
    btn.disabled = true;
    errorEl.textContent = '';

    try {
        const result = await confirmationResult.confirm(otp);
        const uid    = result.user.uid;
        const phone  = result.user.phoneNumber;
        const code   = pendingDiscountData.code;

        const db      = firebase.database();
        const usedRef = db.ref('discountCodes/' + code + '/usedBy/' + uid);
        const used    = await usedRef.once('value');

        if (used.val()) {
            errorEl.textContent = '❌ Diese Nummer hat den Code bereits verwendet.';
            btn.disabled = false; btn.textContent = 'Bestätigen';
            return;
        }
        await usedRef.set(true);

        activeDiscount = { code, percent: pendingDiscountData.percent, phone };

        const discountInput  = document.getElementById('discount-code-input');
        const discountStatus = document.getElementById('discount-status');
        const applyBtn       = document.getElementById('discount-apply-btn');
        if (discountInput)  discountInput.value = code;
        if (discountStatus) { discountStatus.textContent = '✅ ' + activeDiscount.percent + '% Rabatt aktiviert!'; discountStatus.style.color = '#4caf50'; }
        if (applyBtn)       applyBtn.textContent = 'Entfernen';

        updateBasketUI();
        closePhoneVerifyModal();
    } catch(e) {
        errorEl.textContent = '❌ Falscher Code. Bitte erneut versuchen.';
    } finally {
        btn.textContent = 'Bestätigen';
        btn.disabled = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

function openTripleComboModal() {
    const modal = document.getElementById('triple-combo-modal');
    if (!modal) return;
    // Populate all 3 burger selects
    [1,2,3].forEach(i => {
        const sel = modal.querySelector(`#triple-burger-${i}`);
        if (sel) sel.innerHTML = menuData.burgers.map(b =>
            `<option value="${b.name}">${b.name} (€${b.price.toFixed(2)})</option>`
        ).join('');
    });
    modal.classList.add('active');
}

function closeTripleComboModal() {
    document.getElementById('triple-combo-modal').classList.remove('active');
}

function updateShakeSelection(personIndex) {
    const modal = document.getElementById('triple-combo-modal');
    const selected = modal.querySelector(`input[name="shake-${personIndex}"]:checked`);
    modal.querySelectorAll(`.shake-btn-${personIndex}`).forEach(el => {
        const isActive = el.dataset.val === selected.value;
        el.style.background = isActive ? 'rgba(255,127,0,0.25)' : 'transparent';
        el.style.borderColor = isActive ? 'var(--primary)' : 'rgba(255,255,255,0.15)';
    });
}

function confirmTripleCombo() {
    const modal = document.getElementById('triple-combo-modal');
    const persons = [1,2,3].map(i => ({
        burger: modal.querySelector(`#triple-burger-${i}`).value,
        shake:  (modal.querySelector(`input[name="shake-${i}"]:checked`) || {}).value || 'Schokoladen-Milchshake',
    }));

    const totalPrice = 25.00;
    const name = 'Triple Byte Kombo: ' + persons.map((p,i) =>
        `(${i+1}) ${p.burger} + ${p.shake}`
    ).join(' | ') + ' + 3× Classic Fries';

    // VAT split — burgers+fries = food (7%), milkshakes = beverage (19%)
    const burgerRefTotal = persons.reduce((s, p) => {
        const b = menuData.burgers.find(b => b.name === p.burger);
        return s + (b ? b.price : 7.00);
    }, 0);
    const friesRef  = 3 * 2.66;
    const shakeRef  = 3 * 3.50;
    const totalRef  = burgerRefTotal + friesRef + shakeRef;
    const foodGross = Math.round((totalPrice * (burgerRefTotal + friesRef) / totalRef) * 100) / 100;
    const bevGross  = Math.round((totalPrice - foodGross) * 100) / 100;

    cart.push({ name, price: totalPrice, foodGross, beverageGross: bevGross });
    saveCart();
    if (cart.length === 1) toggleBasket(true);
    closeTripleComboModal();

    const btn = modal.querySelector('#confirm-triple-btn');
    const orig = btn.innerText;
    btn.innerText = 'Hinzugefügt! ✅';
    btn.style.background = 'var(--primary)';
    setTimeout(() => { btn.innerText = orig; btn.style.background = ''; }, 1500);
}

function openComboSelection(type, feeLabel) {
    const fee = parseFloat(feeLabel.replace('€', '').replace('+', ''));
    currentCombo = { type: type, fee: fee };
    
    const burgerSelect = document.getElementById('combo-burger');
    const sideSelect = document.getElementById('combo-side');
    const drinkSelect = document.getElementById('combo-drink');
    const title = document.getElementById('combo-title');

    // Filter Burgers
    burgerSelect.innerHTML = '';
    const filteredBurgers = type === 'goat' 
        ? menuData.burgers.filter(b => b.isGoat)
        : menuData.burgers;
    
    filteredBurgers.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.innerText = `${b.name} (€${b.price.toFixed(2)})`;
        burgerSelect.appendChild(opt);
    });

    // Filter Sides
    sideSelect.innerHTML = '';
    const availableSides = type === 'loaded' ? menuData.sides.loaded : [...menuData.sides.regular, ...menuData.sides.loaded];
    availableSides.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.innerText = s;
        sideSelect.appendChild(opt);
    });

    // Drinks
    drinkSelect.innerHTML = '';
    menuData.drinks.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.innerText = d;
        drinkSelect.appendChild(opt);
    });

    title.innerText = type.toUpperCase().replace('_', ' ') + ' KONFIGURATOR';
    document.getElementById('combo-modal').classList.add('active');
}

function closeComboModal() {
    document.getElementById('combo-modal').classList.remove('active');
}

function confirmCombo() {
    const burgerName = document.getElementById('combo-burger').value;
    const side = document.getElementById('combo-side').value;
    const drink = document.getElementById('combo-drink').value;
    
    const burger = menuData.burgers.find(b => b.name === burgerName);
    const totalPrice = burger.price + currentCombo.fee;
    
    const fullName = `${currentCombo.type.toUpperCase()}: ${burgerName} + ${side} + ${drink}`;
    
    // Proportional Reference Split
    const ref_burger = burger.price;
    const ref_side = referencePrices[side] || 3.49;
    const ref_drink = referencePrices[drink] || 2.50;
    const total_reference = ref_burger + ref_side + ref_drink;
    
    const food_ratio = (ref_burger + ref_side) / total_reference;
    const beverage_ratio = ref_drink / total_reference;
    
    const foodTotal = totalPrice * food_ratio;
    const bevTotal = totalPrice * beverage_ratio;
    
    addToCart(fullName, totalPrice, foodTotal, bevTotal);
    closeComboModal();
}

// Extras modal for burger add-ons
let pendingBurger = null;

function addBurgerToCart(name, price) {
    pendingBurger = { name, price: parseFloat(price.replace('€', '')) };
    // Reset checkboxes
    document.querySelectorAll('.extra-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('burger-extras-modal').classList.add('active');
}

function closeBurgerExtrasModal() {
    document.getElementById('burger-extras-modal').classList.remove('active');
    pendingBurger = null;
}

function skipExtras() {
    if (!pendingBurger) return;
    cart.push({ name: pendingBurger.name, price: pendingBurger.price, foodGross: pendingBurger.price, beverageGross: 0 });
    saveCart();
    if (cart.length === 1) toggleBasket(true);
    closeBurgerExtrasModal();
}

function confirmBurgerWithExtras() {
    if (!pendingBurger) return;
    const checkedExtras = [...document.querySelectorAll('.extra-checkbox:checked')];
    
    if (checkedExtras.length === 0) {
        // No extras selected — just add the plain burger
        cart.push({ name: pendingBurger.name, price: pendingBurger.price, foodGross: pendingBurger.price, beverageGross: 0 });
    } else {
        // Bundle burger + extras into one labelled item
        const extraNames = checkedExtras.map(cb => cb.dataset.name).join(', ');
        const extraTotal = checkedExtras.reduce((sum, cb) => sum + parseFloat(cb.dataset.price), 0);
        const bundleName = `${pendingBurger.name} (+ ${extraNames})`;
        const bundlePrice = pendingBurger.price + extraTotal;
        cart.push({ name: bundleName, price: bundlePrice, foodGross: bundlePrice, beverageGross: 0 });
    }

    saveCart();
    if (cart.length === 1) toggleBasket(true);
    closeBurgerExtrasModal();
    // Show brief confirmation
    const btn = document.getElementById('confirm-extras-btn');
    const orig = btn.innerText;
    btn.innerText = 'Hinzugefügt! ✅';
    btn.style.background = 'var(--primary)';
    setTimeout(() => { btn.innerText = orig; btn.style.background = ''; }, 1500);
}

// Fries Selection Modal logic
let pendingFries = null;

function openFriesSelection(baseName, basePrice) {
    pendingFries = { name: baseName, price: parseFloat(basePrice.replace('€', '')) };
    document.getElementById('fries-normal-radio').checked = true;
    document.getElementById('fries-selection-modal').classList.add('active');
}

function closeFriesSelectionModal() {
    document.getElementById('fries-selection-modal').classList.remove('active');
    pendingFries = null;
}

// Soda Selection Modal
let pendingSodaPrice = 0;

function openSodaSelection(price) {
    pendingSodaPrice = parseFloat(price.replace('€', ''));
    const modal = document.getElementById('soda-selection-modal');
    if (modal) {
        modal.querySelectorAll('input[name="soda-type"]')[0].checked = true;
        modal.classList.add('active');
    }
}

function closeSodaModal() {
    document.getElementById('soda-selection-modal').classList.remove('active');
}

function confirmSodaSelection() {
    const selected = document.querySelector('input[name="soda-type"]:checked');
    if (!selected) return;
    const name = selected.value;
    cart.push({ name, price: pendingSodaPrice, foodGross: 0, beverageGross: pendingSodaPrice });
    saveCart();
    if (cart.length === 1) toggleBasket(true);
    closeSodaModal();
    updateBasketUI();
    const btn = document.getElementById('confirm-soda-btn');
    const orig = btn.innerText;
    btn.innerText = 'Hinzugefügt! ✅';
    setTimeout(() => { btn.innerText = orig; }, 1500);
}

function confirmFriesSelection() {
    if (!pendingFries) return;
    
    const isSweetPotato = document.getElementById('fries-sweet-radio').checked;
    
    if (isSweetPotato) {
        cart.push({ name: 'Sweet Potato Fries', price: 3.20, foodGross: 3.20, beverageGross: 0 });
    } else {
        cart.push({ name: pendingFries.name, price: pendingFries.price, foodGross: pendingFries.price, beverageGross: 0 });
    }

    saveCart();
    if (cart.length === 1) toggleBasket(true);
    closeFriesSelectionModal();
    
    // Feedback on confirm button
    const btn = document.getElementById('confirm-fries-btn');
    const orig = btn.innerText;
    btn.innerText = 'Hinzugefügt! ✅';
    btn.style.background = 'var(--primary)';
    setTimeout(() => { btn.innerText = orig; btn.style.background = ''; }, 1500);
}

function isBeverage(name) {
    let n = name.toLowerCase();
    return menuData.drinks.includes(name) || n.includes("shake") || n.includes("soda") || n.includes("cola") || n.includes("drink") || n.includes("milkshake") || n.includes("juice") || n.includes("water");
}

function addToCart(itemName, price, overrideFood, overrideBev) {
    // Standardize price parsing
    let numericPrice = typeof price === 'string' 
        ? parseFloat(price.replace('€', '').replace('+', '')) 
        : price;
        
    let bevCheck = isBeverage(itemName);
    let foodG = overrideFood !== undefined ? overrideFood : (bevCheck ? 0 : numericPrice);
    let bevG = overrideBev !== undefined ? overrideBev : (bevCheck ? numericPrice : 0);
        
    cart.push({ 
        name: itemName, 
        price: numericPrice,
        foodGross: foodG,
        beverageGross: bevG
    });
    saveCart();
    
    // Show feedback
    const btn = event.currentTarget;
    const originalText = btn.innerText;
    btn.innerText = "Hinzugefügt! ✅";
    btn.style.background = "var(--primary)";
    btn.style.color = "#fff";
    
    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = "";
        btn.style.color = "";
    }, 1500);

    // Open basket automatically on first item
    if (cart.length === 1) toggleBasket(true);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCart();
}

function updateItemNote(index, note) {
    if (cart[index]) {
        cart[index].note = note;
        saveCart();
    }
}

function toggleBasket(show) {
    const drawer = document.getElementById('basket-drawer');
    if (show === true) drawer.classList.add('active');
    else if (show === false) drawer.classList.remove('active');
    else drawer.classList.toggle('active');
}

function updateBasketUI() {
    const itemsContainer = document.getElementById('basket-items');
    const badge = document.getElementById('basket-badge');
    const totalElement = document.getElementById('basket-total-amount');
    
    if (!itemsContainer) return;

    // Update Badge
    badge.innerText = cart.length;
    badge.style.display = cart.length > 0 ? 'flex' : 'none';

    // Update Items List
    itemsContainer.innerHTML = '';
    let total = 0;

    cart.forEach((item, index) => {
        total += item.price;
        const itemEl = document.createElement('div');
        itemEl.className = 'basket-item';
        itemEl.innerHTML = `
            <div class="basket-item-info">
                <h4>${item.name}</h4>
                <p>€${item.price.toFixed(2)}</p>
                <input type="text" placeholder="Note (e.g. no onions)" value="${item.note||''}"
                    oninput="updateItemNote(${index}, this.value)"
                    style="margin-top:.35rem;width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
                    border-radius:8px;padding:.3rem .6rem;color:#fff;font-size:.78rem;font-family:inherit;outline:none"/>
            </div>
            <button class="remove-item" onclick="removeFromCart(${index})">Entfernen</button>
        `;
        itemsContainer.appendChild(itemEl);
    });

    // Discount
    const subtotalRow    = document.getElementById('basket-subtotal-row');
    const discountRow    = document.getElementById('basket-discount-row');
    const subtotalAmount = document.getElementById('basket-subtotal-amount');
    const discountAmount = document.getElementById('basket-discount-amount');
    const discountLabel  = document.getElementById('basket-discount-label');

    if (activeDiscount && total > 0) {
        const saving      = Math.round(total * activeDiscount.percent / 100 * 100) / 100;
        const finalTotal  = total - saving;
        if (subtotalRow)    subtotalRow.style.display    = 'flex';
        if (discountRow)    discountRow.style.display    = 'flex';
        if (subtotalAmount) subtotalAmount.innerText     = `€${total.toFixed(2)}`;
        if (discountLabel)  discountLabel.innerText      = `Rabatt (${activeDiscount.percent}%)`;
        if (discountAmount) discountAmount.innerText     = `-€${saving.toFixed(2)}`;
        totalElement.innerText = `€${finalTotal.toFixed(2)}`;
    } else {
        if (subtotalRow) subtotalRow.style.display = 'none';
        if (discountRow) discountRow.style.display = 'none';
        totalElement.innerText = `€${total.toFixed(2)}`;
    }
}

function isStoreOpen(settings) {
    if (settings.holiday) return false;
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const now = new Date();
    const day = DAYS[now.getDay()];
    const h = (settings.hours || {})[day];
    // No hours configured for this day → don't block
    if (!h) return true;
    if (h.closed) return false;
    const [openH, openM]  = (h.open  || '00:00').split(':').map(Number);
    const [closeH, closeM] = (h.close || '00:00').split(':').map(Number);
    const open  = openH  * 60 + openM;
    const close = closeH * 60 + closeM;
    // Both 00:00 means not configured → don't block
    if (open === 0 && close === 0) return true;
    const cur = now.getHours() * 60 + now.getMinutes();
    // Handle overnight (e.g. 18:00 – 02:00)
    if (close < open) return cur >= open || cur < close;
    return cur >= open && cur < close;
}

function checkout() {
    if (cart.length === 0) {
        alert("Ihr Warenkorb ist leer!");
        return;
    }

    const db = window._menuDb;
    if (db) {
        db.ref('settings').once('value', snap => {
            const settings = snap.val() || {};
            if (!isStoreOpen(settings)) {
                const h = (settings.hours || {});
                const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const day = DAYS[new Date().getDay()];
                const todayHours = h[day];
                let msg = 'Wir haben gerade geschlossen.';
                if (settings.holiday) {
                    msg = 'Wir sind heute im Urlaub. Bitte morgen wieder bestellen!';
                } else if (todayHours && !todayHours.closed) {
                    msg = `Wir haben heute von ${todayHours.open} – ${todayHours.close} Uhr geöffnet.`;
                } else {
                    msg = 'Wir sind heute geschlossen.';
                }
                alert('🔒 ' + msg);
                return;
            }
            doCheckout();
        });
        return;
    }
    doCheckout();
}

function doCheckout() {
    if (cart.length === 0) return;

    // STEP 1: Snapshot all items — lock cart before any calculation
    const orderItems = [...cart];

    // STEP 2: Build items list (with per-item notes)
    const itemsSummary = orderItems.map(item => {
        let line = `- ${item.name} (€${item.price.toFixed(2)})`;
        if (item.note && item.note.trim()) line += ` [${item.note.trim()}]`;
        return line;
    }).join('\n');

    // STEP 3: Items total (before delivery)
    const round2 = v => Math.round(v * 100) / 100;
    const items_gross = round2(orderItems.reduce((s, i) => s + i.price, 0));

    // STEP 4: VAT calculation on all items — Germany compliant, per-item rounding
    let total_net_food = 0, total_vat_7 = 0;
    let total_net_bev  = 0, total_vat_19 = 0;

    orderItems.forEach(item => {
        const fg = item.foodGross     !== undefined ? item.foodGross     : (isBeverage(item.name) ? 0 : item.price);
        const bg = item.beverageGross !== undefined ? item.beverageGross : (isBeverage(item.name) ? item.price : 0);

        if (fg > 0) {
            const net = round2(fg / 1.07);
            const vat = round2(fg - net);
            total_net_food += net;
            total_vat_7    += vat;
        }
        if (bg > 0) {
            const net = round2(bg / 1.19);
            const vat = round2(bg - net);
            total_net_bev  += net;
            total_vat_19   += vat;
        }
    });

    total_net_food = round2(total_net_food);
    total_vat_7    = round2(total_vat_7);
    total_net_bev  = round2(total_net_bev);
    total_vat_19   = round2(total_vat_19);

    // Edge-case safety: adjust largest VAT line if ±0.01 drift
    const vat_sum_check = round2(total_net_food + total_vat_7 + total_net_bev + total_vat_19);
    const drift = round2(vat_sum_check - items_gross);
    if (drift !== 0) {
        if (total_vat_7 >= total_vat_19) total_vat_7 = round2(total_vat_7 - drift);
        else                             total_vat_19 = round2(total_vat_19 - drift);
    }

    // STEP 5: Store full cart snapshot for order.html (single source of truth)
    localStorage.setItem('byteOrderCart', JSON.stringify(orderItems));

    // STEP 6: Apply discount if active
    let discountLine = '';
    let discountedGross = items_gross;
    if (activeDiscount) {
        const saving = round2(items_gross * activeDiscount.percent / 100);
        discountedGross = round2(items_gross - saving);
        discountLine = `\nRabattcode ${activeDiscount.code} (${activeDiscount.percent}%): -€${saving.toFixed(2)}`;
        // Scale VAT amounts proportionally
        const factor = discountedGross / items_gross;
        total_net_food = round2(total_net_food * factor);
        total_vat_7    = round2(total_vat_7    * factor);
        total_net_bev  = round2(total_net_bev  * factor);
        total_vat_19   = round2(total_vat_19   * factor);
    }

    // STEP 7: Build base order string — items only, no VAT yet (order.html adds that)
    const finalOrder = `${itemsSummary}${discountLine}\n\nItems Total: €${discountedGross.toFixed(2)}`;

    window.location.href = `order.html?items=${encodeURIComponent(finalOrder)}`;
}

// Initialize UI on load
document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const hamburger = document.getElementById('mobile-menu');
    const navLinks = document.querySelector('.nav-links');

    if (hamburger) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    // Add Submit Animation to all forms (only when actually submitting, not intercepted)
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => {
            // Delay check so any e.preventDefault() from other listeners fires first
            setTimeout(() => {
                if (!e.defaultPrevented) {
                    const submitBtn = form.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        submitBtn.classList.add('btn-submitting');
                    }
                }
            }, 0);
        });
    });

    // Add Basket HTML to body if not present
    if (!document.getElementById('basket-drawer')) {
        const basketHTML = `
            <button class="basket-float" onclick="toggleBasket()">
                🛒 <span class="basket-badge" id="basket-badge">0</span>
            </button>
            <div class="basket-drawer" id="basket-drawer">
                <div class="basket-header">
                    <h3>Ihr Warenkorb</h3>
                    <button class="close-basket" onclick="toggleBasket(false)">✕</button>
                </div>
                <div class="basket-items" id="basket-items"></div>
                <div class="basket-footer">
                    <div style="margin-bottom:0.75rem;">
                        <div style="display:flex;gap:0.5rem;">
                            <input id="discount-code-input" placeholder="Rabattcode" style="flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:0.45rem 0.75rem;color:#fff;font-size:0.85rem;font-family:inherit;outline:none;text-transform:uppercase;" />
                            <button id="discount-apply-btn" onclick="applyDiscountCode()" style="background:rgba(255,127,0,0.15);border:1px solid var(--primary);color:var(--primary);border-radius:8px;padding:0.45rem 0.9rem;font-size:0.82rem;font-weight:700;cursor:pointer;white-space:nowrap;">Anwenden</button>
                        </div>
                        <div id="discount-status" style="font-size:0.8rem;margin-top:0.35rem;min-height:1.1em;"></div>
                    </div>
                    <div id="basket-subtotal-row" style="display:none;justify-content:space-between;margin-bottom:0.25rem;color:var(--text-muted);font-size:0.88rem;">
                        <span>Zwischensumme</span><span id="basket-subtotal-amount">€0.00</span>
                    </div>
                    <div id="basket-discount-row" style="display:none;justify-content:space-between;margin-bottom:0.5rem;color:#4caf50;font-size:0.88rem;font-weight:700;">
                        <span id="basket-discount-label">Rabatt</span><span id="basket-discount-amount">-€0.00</span>
                    </div>
                    <div class="basket-total">
                        <span>Gesamt</span>
                        <span id="basket-total-amount">€0.00</span>
                    </div>
                    <button class="btn checkout-btn" onclick="checkout()">Zur Kasse</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', basketHTML);
    }
    // Add Combo Modal HTML
    if (!document.getElementById('combo-modal')) {
        const modalHTML = `
            <div class="combo-modal" id="combo-modal">
                <div class="modal-content">
                    <h2 id="combo-title" class="modal-title">Combo konfigurieren</h2>
                    <div class="select-group">
                        <label class="select-label">Burger wählen</label>
                        <select id="combo-burger" class="select-input">
                            <option>Goat Byte Original</option>
                            <option>Spicy Goat Byte</option>
                            <option>Truffle Goat Byte</option>
                            <option>Byte Classic</option>
                            <option>Double Byte</option>
                        </select>
                    </div>
                    <div class="select-group">
                        <label class="select-label">Beilage wählen</label>
                        <select id="combo-side" class="select-input">
                            <option>Classic Fries</option>
                            <option>Peri Peri Fries</option>
                            <option>Sweet Potato Fries</option>
                            <option>Crispy Onion Rings</option>
                            <option>Mozzarella Sticks</option>
                            <option>Jalapeño Poppers</option>
                            <option>Chicken Tenders</option>
                        </select>
                    </div>
                    <div class="select-group">
                        <label class="select-label">Getränk wählen</label>
                        <select id="combo-drink" class="select-input">
                            <option>Coca-Cola</option>
                            <option>Fanta</option>
                            <option>Sprite</option>
                            <option>Mineral Water</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn btn-outline" style="flex: 1" onclick="closeComboModal()">Abbrechen</button>
                        <button class="btn" style="flex: 1" onclick="confirmCombo()">Zum Warenkorb hinzufügen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    // Burger Extras Modal
    if (!document.getElementById('burger-extras-modal')) {
        const extrasHTML = `
            <div class="combo-modal" id="burger-extras-modal" style="z-index: 10001;">
                <div class="modal-content">
                    <h2 class="modal-title">🍔 Passen Sie Ihren Burger an</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 1.02rem;">Möchten Sie ihn noch besser machen? Fügen Sie Extras hinzu:</p>
                    <div class="extras-list">
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🧀 Extra Käse</span>
                                <span class="extra-price">+€1.07</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Extra Cheese" data-price="1.07">
                        </label>
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🥩 Extra Patty</span>
                                <span class="extra-price">+€2.68</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Extra Patty" data-price="2.68">
                        </label>
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🫙 Extra Soße</span>
                                <span class="extra-price">+€0.54</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Extra Sauce" data-price="0.54">
                        </label>
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🌶️ Machen Sie es scharf 🌶️</span>
                                <span class="extra-price">+€0.54</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Make it Spicy" data-price="0.54">
                        </label>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn btn-outline" style="flex: 1" onclick="skipExtras()">Extras überspringen</button>
                        <button class="btn" id="confirm-extras-btn" style="flex: 1" onclick="confirmBurgerWithExtras()">Zum Warenkorb hinzufügen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', extrasHTML);
    }
    // Fries Selection Modal
    if (!document.getElementById('fries-selection-modal')) {
        const friesModalHTML = `
            <div class="combo-modal" id="fries-selection-modal" style="z-index: 10001;">
                <div class="modal-content">
                    <h2 class="modal-title">🍟 Wählen Sie Ihre Pommes</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 1.02rem;">Möchten Sie unsere klassischen Hauspommes oder Süßkartoffelpommes?</p>
                    <div class="extras-list">
                        <label class="extra-item" style="cursor: pointer;">
                            <div class="extra-info">
                                <span class="extra-name">Klassische Pommes</span>
                                <span class="extra-price">€2.66</span>
                            </div>
                            <input type="radio" name="fries-type" id="fries-normal-radio" value="normal" checked>
                        </label>
                        <label class="extra-item" style="cursor: pointer;">
                            <div class="extra-info">
                                <span class="extra-name">Süßkartoffelpommes</span>
                                <span class="extra-price">€3.20</span>
                            </div>
                            <input type="radio" name="fries-type" id="fries-sweet-radio" value="sweet">
                        </label>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn btn-outline" style="flex: 1" onclick="closeFriesSelectionModal()">Abbrechen</button>
                        <button class="btn" id="confirm-fries-btn" style="flex: 1" onclick="confirmFriesSelection()">Zum Warenkorb hinzufügen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', friesModalHTML);
    }

    // Phone Verification Modal
    if (!document.getElementById('phone-verify-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="combo-modal" id="phone-verify-modal" style="z-index:10002;">
                <div class="modal-content" style="max-width:420px;">
                    <div id="phone-step-1">
                        <h2 class="modal-title">📱 Nummer verifizieren</h2>
                        <p style="color:var(--text-muted);margin-bottom:1.25rem;font-size:0.95rem;">Einmalige Verifizierung — so stellen wir sicher, dass der Rabatt fair bleibt.</p>
                        <div class="select-group">
                            <label class="select-label">Ihre Handynummer</label>
                            <input id="verify-phone-input" type="tel" placeholder="z.B. 0176 12345678" class="select-input" style="letter-spacing:1px;" />
                        </div>
                        <div id="recaptcha-container" style="margin:0.75rem 0;display:flex;justify-content:center;"></div>
                        <div id="phone-verify-error" style="color:#f44336;font-size:0.83rem;min-height:1.2em;margin:0.4rem 0;"></div>
                        <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                            <button class="btn btn-outline" style="flex:1" onclick="closePhoneVerifyModal()">Abbrechen</button>
                            <button class="btn" id="send-otp-btn" style="flex:1" onclick="sendOTP()">Code senden</button>
                        </div>
                    </div>
                    <div id="phone-step-2" style="display:none;">
                        <h2 class="modal-title">💬 SMS-Code eingeben</h2>
                        <p id="otp-sent-to" style="color:var(--text-muted);margin-bottom:1.25rem;font-size:0.9rem;"></p>
                        <div class="select-group">
                            <label class="select-label">6-stelliger Code</label>
                            <input id="verify-otp-input" type="number" placeholder="123456" class="select-input" style="letter-spacing:6px;font-size:1.3rem;text-align:center;" />
                        </div>
                        <div id="otp-verify-error" style="color:#f44336;font-size:0.83rem;min-height:1.2em;margin:0.4rem 0;"></div>
                        <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                            <button class="btn btn-outline" style="flex:1" onclick="document.getElementById('phone-step-1').style.display='';document.getElementById('phone-step-2').style.display='none';">Zurück</button>
                            <button class="btn" id="verify-otp-btn" style="flex:1" onclick="verifyOTPAndApplyDiscount()">Bestätigen</button>
                        </div>
                    </div>
                </div>
            </div>`);
    }

    // Triple Byte Kombo Modal
    if (!document.getElementById('triple-combo-modal')) {
        const shakes = [
            { value: 'Schokoladen-Milchshake', icon: '🍫', label: 'Schoko' },
            { value: 'Vanille-Milchshake',     icon: '🍦', label: 'Vanille' },
            { value: 'Erdbeer-Milchshake',     icon: '🍓', label: 'Erdbeer' },
        ];
        const tripleHTML = `
            <div class="combo-modal" id="triple-combo-modal" style="z-index:10001;">
                <div class="modal-content" style="max-width:680px;padding:2rem;">
                    <div style="text-align:center;margin-bottom:1.5rem;">
                        <h2 style="font-size:1.6rem;font-weight:900;color:#fff;margin:0 0 0.25rem;">Triple Byte Kombo</h2>
                        <p style="color:var(--text-muted);font-size:0.9rem;margin:0;">3 Smash-Patties · 3 Milchshakes · 3× Classic Fries</p>
                        <div style="display:inline-block;background:var(--primary);color:#000;font-weight:900;font-size:1.3rem;padding:0.3rem 1.2rem;border-radius:50px;margin-top:0.75rem;">€25.00</div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem;">
                    ${[1,2,3].map(i => `
                        <div style="border:1px solid rgba(255,127,0,0.3);border-radius:16px;padding:1.25rem 1rem;background:rgba(255,127,0,0.05);display:flex;flex-direction:column;gap:1rem;">
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                                <span style="width:26px;height:26px;background:var(--primary);color:#000;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.85rem;flex-shrink:0;">${i}</span>
                                <span style="color:#fff;font-weight:700;font-size:0.95rem;">Person ${i}</span>
                            </div>
                            <div>
                                <label style="display:block;color:rgba(255,255,255,0.5);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">Burger wählen</label>
                                <select id="triple-burger-${i}" class="select-input" style="font-size:0.85rem;padding:0.5rem 0.75rem;"></select>
                            </div>
                            <div>
                                <label style="display:block;color:rgba(255,255,255,0.5);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">Milchshake</label>
                                <div style="display:flex;gap:0.4rem;">
                                    ${shakes.map(s => `
                                    <label style="flex:1;cursor:pointer;">
                                        <input type="radio" name="shake-${i}" value="${s.value}" ${s.label==='Schoko'?'checked':''} style="display:none;" onchange="updateShakeSelection(${i})">
                                        <div class="shake-btn-${i} shake-opt" data-val="${s.value}" style="text-align:center;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:0.5rem 0.25rem;font-size:1.1rem;transition:all 0.2s;cursor:pointer;background:${s.label==='Schoko'?'rgba(255,127,0,0.25)':'transparent'};border-color:${s.label==='Schoko'?'var(--primary)':'rgba(255,255,255,0.15)'};">
                                            <div>${s.icon}</div>
                                            <div style="font-size:0.62rem;color:rgba(255,255,255,0.7);margin-top:2px;">${s.label}</div>
                                        </div>
                                    </label>`).join('')}
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:0.5rem;background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.3);border-radius:10px;padding:0.5rem 0.75rem;">
                                <span>🍟</span>
                                <span style="color:rgba(255,255,255,0.7);font-size:0.82rem;">Classic Fries</span>
                                <span style="margin-left:auto;color:#4caf50;font-weight:700;font-size:0.8rem;">✓ Gratis</span>
                            </div>
                        </div>`).join('')}
                    </div>
                    <div style="display:flex;gap:1rem;">
                        <button class="btn btn-outline" style="flex:1" onclick="closeTripleComboModal()">Abbrechen</button>
                        <button class="btn" id="confirm-triple-btn" style="flex:2" onclick="confirmTripleCombo()">Zum Warenkorb — €25.00</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', tripleHTML);
    }

    // Soda Selection Modal
    if (!document.getElementById('soda-selection-modal')) {
        const sodaModal = `
            <div class="combo-modal" id="soda-selection-modal" style="z-index: 10001;">
                <div class="modal-content">
                    <h2 class="modal-title">🥤 Wählen Sie Ihr Getränk</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 1.02rem;">Welches Softdrink möchten Sie?</p>
                    <div class="extras-list">
                        ${['Coca-Cola','Fanta','Sprite','Pepsi'].map((s,i) => `
                        <label class="extra-item" style="cursor:pointer;">
                            <div class="extra-info">
                                <span class="extra-name">${s}</span>
                            </div>
                            <input type="radio" name="soda-type" value="${s}" ${i===0?'checked':''}>
                        </label>`).join('')}
                    </div>
                    <div style="display:flex; gap:1rem; margin-top:2rem;">
                        <button class="btn btn-outline" style="flex:1" onclick="closeSodaModal()">Abbrechen</button>
                        <button class="btn" id="confirm-soda-btn" style="flex:1" onclick="confirmSodaSelection()">Zum Warenkorb hinzufügen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', sodaModal);
    }

    updateBasketUI();
});

// Old Logic (Keeping openOrderPage for simple links if any)
function openOrderPage(itemName) {
    gsap.to("body", { opacity: 0, duration: 0.3, onComplete: () => {
        window.location.href = `order.html?item=${encodeURIComponent(itemName)}`;
    }});
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }).catch((error) => {
            console.log('ServiceWorker registration failed: ', error);
        });
    });
}

