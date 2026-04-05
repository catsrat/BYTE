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
// Force wipe corrupt legacy carts from v32 
if (!localStorage.getItem('byteCartV34_migrated')) {
    localStorage.removeItem('byteCart');
    localStorage.setItem('byteCartV34_migrated', 'true');
}

let cart = JSON.parse(localStorage.getItem('byteCart')) || [];

function saveCart() {
    localStorage.setItem('byteCart', JSON.stringify(cart));
    updateBasketUI();
}

// Menu Data for Combos
const menuData = {
    burgers: [
        { name: 'Goat Byte Original', price: 6.99, isGoat: true },
        { name: 'Spicy Goat Byte', price: 7.49, isGoat: true },
        { name: 'Truffle Goat Byte', price: 7.99, isGoat: true },
        { name: 'Byte Classic', price: 5.99, isGoat: false },
        { name: 'Double Byte', price: 7.49, isGoat: false },
        { name: 'Smoky BBQ Byte', price: 6.99, isGoat: false },
        { name: 'Crispy Chicken Byte', price: 5.49, isGoat: false },
        { name: 'Spicy Chicken Byte', price: 5.99, isGoat: false },
        { name: 'Green Byte (Vegan)', price: 5.49, isGoat: false },
        { name: 'Falafel Byte', price: 5.99, isGoat: false }
    ],
    sides: {
        regular: ['Classic Fries', 'Peri Peri Fries', 'Sweet Potato Fries', 'Crispy Onion Rings', 'Mozzarella Sticks', 'Jalapeño Poppers', 'Chicken Tenders'],
        loaded: ['Cheese Melt Fries', 'GOAT Loaded Fries', 'BBQ Beef Loaded Fries']
    },
    drinks: ['Coca-Cola', 'Fanta', 'Sprite', 'Mineral Water']
};

// Combo Selection Logic
const referencePrices = {
    // Drinks
    'Coca-Cola': 2.50, 'Fanta': 2.50, 'Sprite': 2.50, 'Mineral Water': 3.50,
    // Sides
    'Classic Fries': 2.49, 'Peri Peri Fries': 2.99, 'Sweet Potato Fries': 2.99,
    'Cheese Melt Fries': 3.99, 'BBQ Beef Loaded Fries': 4.99, 'GOAT Loaded Fries': 5.49,
    'Crispy Onion Rings': 3.49, 'Mozzarella Sticks': 3.99, 'Jalapeño Poppers': 3.99, 'Chicken Tenders': 4.49
};

let currentCombo = null;

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

    title.innerText = type.toUpperCase().replace('_', ' ') + ' CONFIGURATOR';
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
    btn.innerText = 'Added! ✅';
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

function confirmFriesSelection() {
    if (!pendingFries) return;
    
    const isSweetPotato = document.getElementById('fries-sweet-radio').checked;
    
    if (isSweetPotato) {
        cart.push({ name: 'Sweet Potato Fries', price: 2.99, foodGross: 2.99, beverageGross: 0 });
    } else {
        cart.push({ name: pendingFries.name, price: pendingFries.price, foodGross: pendingFries.price, beverageGross: 0 });
    }

    saveCart();
    if (cart.length === 1) toggleBasket(true);
    closeFriesSelectionModal();
    
    // Feedback on confirm button
    const btn = document.getElementById('confirm-fries-btn');
    const orig = btn.innerText;
    btn.innerText = 'Added! ✅';
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
    btn.innerText = "Added! ✅";
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
            </div>
            <button class="remove-item" onclick="removeFromCart(${index})">Remove</button>
        `;
        itemsContainer.appendChild(itemEl);
    });

    totalElement.innerText = `€${total.toFixed(2)}`;
}

function checkout() {
    if (cart.length === 0) {
        alert("Your basket is empty!");
        return;
    }

    const itemsSummary = cart.map(item => `- ${item.name} (€${item.price.toFixed(2)})`).join('\n');
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    let finalOrder = `${itemsSummary}\n\nItems Total: €${total.toFixed(2)}`;
    
    // Internal VAT Calculation (German Rules)

    const totalFoodGross = cart.reduce((sum, item) => {
        let fg = item.foodGross !== undefined ? item.foodGross : (isBeverage(item.name) ? 0 : item.price);
        return sum + fg;
    }, 0);
    
    const totalBevGross = cart.reduce((sum, item) => {
        let bg = item.beverageGross !== undefined ? item.beverageGross : (isBeverage(item.name) ? item.price : 0);
        return sum + bg;
    }, 0);
    
    const totalNetFood = totalFoodGross / 1.07;
    const totalNetBev = totalBevGross / 1.19;
    
    const vatFood = totalFoodGross - totalNetFood;
    const vatBev = totalBevGross - totalNetBev;
    
    const internalVatBreakdown = {
        food_gross_total: totalFoodGross,
        beverage_gross_total: totalBevGross,
        net_food_total: totalNetFood,
        net_beverage_total: totalNetBev,
        vat_7_total: vatFood,
        vat_19_total: vatBev,
        total_vat: vatFood + vatBev,
        total_net: totalNetFood + totalNetBev,
        gross_total: total
    };
    localStorage.setItem('byteOrderVATDetails', JSON.stringify(internalVatBreakdown));
    
    // Redirect to order page with full summary
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

    // Add Submit Animation to all forms
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.classList.add('btn-submitting');
            }
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
                    <h3>Your Basket</h3>
                    <button class="close-basket" onclick="toggleBasket(false)">✕</button>
                </div>
                <div class="basket-items" id="basket-items">
                    <!-- Items injected here -->
                </div>
                <div class="basket-footer">
                    <div class="basket-total">
                        <span>Total</span>
                        <span id="basket-total-amount">€0.00</span>
                    </div>
                    <button class="btn checkout-btn" onclick="checkout()">Check Out</button>
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
                    <h2 id="combo-title" class="modal-title">Configure Combo</h2>
                    <div class="select-group">
                        <label class="select-label">Choose Burger</label>
                        <select id="combo-burger" class="select-input">
                            <option>Goat Byte Original</option>
                            <option>Spicy Goat Byte</option>
                            <option>Truffle Goat Byte</option>
                            <option>Byte Classic</option>
                            <option>Double Byte</option>
                        </select>
                    </div>
                    <div class="select-group">
                        <label class="select-label">Choose Side</label>
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
                        <label class="select-label">Choose Drink</label>
                        <select id="combo-drink" class="select-input">
                            <option>Coca-Cola</option>
                            <option>Fanta</option>
                            <option>Sprite</option>
                            <option>Mineral Water</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn btn-outline" style="flex: 1" onclick="closeComboModal()">Cancel</button>
                        <button class="btn" style="flex: 1" onclick="confirmCombo()">Add to Basket</button>
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
                    <h2 class="modal-title">🍔 Customise Your Burger</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.95rem;">Want to make it even better? Add extras to your order:</p>
                    <div class="extras-list">
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🧀 Extra Cheese</span>
                                <span class="extra-price">+€1.00</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Extra Cheese" data-price="1.00">
                        </label>
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🥩 Extra Patty</span>
                                <span class="extra-price">+€2.50</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Extra Patty" data-price="2.50">
                        </label>
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🫙 Extra Sauce</span>
                                <span class="extra-price">+€0.50</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Extra Sauce" data-price="0.50">
                        </label>
                        <label class="extra-item">
                            <div class="extra-info">
                                <span class="extra-name">🌶️ Make it Spicy</span>
                                <span class="extra-price">+€0.50</span>
                            </div>
                            <input type="checkbox" class="extra-checkbox" data-name="Make it Spicy" data-price="0.50">
                        </label>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn btn-outline" style="flex: 1" onclick="skipExtras()">Skip Extras</button>
                        <button class="btn" id="confirm-extras-btn" style="flex: 1" onclick="confirmBurgerWithExtras()">Add to Basket</button>
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
                    <h2 class="modal-title">🍟 Choose Your Fries</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.95rem;">Would you like our classic house fries or sweet potato fries?</p>
                    <div class="extras-list">
                        <label class="extra-item" style="cursor: pointer;">
                            <div class="extra-info">
                                <span class="extra-name">Classic Fries</span>
                                <span class="extra-price">€2.49</span>
                            </div>
                            <input type="radio" name="fries-type" id="fries-normal-radio" value="normal" checked>
                        </label>
                        <label class="extra-item" style="cursor: pointer;">
                            <div class="extra-info">
                                <span class="extra-name">Sweet Potato Fries</span>
                                <span class="extra-price">€2.99</span>
                            </div>
                            <input type="radio" name="fries-type" id="fries-sweet-radio" value="sweet">
                        </label>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button class="btn btn-outline" style="flex: 1" onclick="closeFriesSelectionModal()">Cancel</button>
                        <button class="btn" id="confirm-fries-btn" style="flex: 1" onclick="confirmFriesSelection()">Add to Basket</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', friesModalHTML);
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
