// ─────────────────────────────────────────────────────────────────────────────
//  BYTE Burgers — White-Label Configuration
//  To set up a new restaurant, only edit this file.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {

  // ── Restaurant identity ───────────────────────────────────────────────────
  name:        'BYTE Burgers',
  tagline:     'BYTE. Anders gebaut.',
  description: 'Beste Halal Smash Burger in NRW',
  copyright:   '© 2026 BYTE Burgers. Alle Rechte vorbehalten.',

  // ── Contact ───────────────────────────────────────────────────────────────
  phone:        '0212315737',
  phoneIntl:    '+49212315737',
  address:      'Weyerstraße 284A, 42719 Solingen',
  city:         'Solingen',
  country:      'Germany',
  social:       '@byteburgers',
  website:      'https://byteburgers.shop',

  // ── Location (for maps & delivery distance) ───────────────────────────────
  coords: { lat: 51.178389, lng: 7.031451 },

  // ── Branding ──────────────────────────────────────────────────────────────
  // Change these two lines to restyle the entire website for a new client
  primaryColor: '#ff7f00',   // main accent color (buttons, highlights)
  themeColor:   '#ff751f',   // browser theme bar color on mobile

  // ── External links ────────────────────────────────────────────────────────
  googleReviewLink: 'https://maps.app.goo.gl/sFAPyQW8HifLWtUH6',
  formsubmitEmail:  'pvsheram001@Gmail.com',

  // ── API (Railway backend) ─────────────────────────────────────────────────
  apiBase: 'https://byte-production-4ab2.up.railway.app',

  // ── Auth (Firebase Authentication email accounts) ─────────────────────────
  // These emails are used as usernames for admin and driver login.
  // Create these accounts in Firebase Console → Authentication → Add user.
  // The password for each account is the 4-digit PIN.
  adminEmail:  'admin@byteburgers.shop',
  driverEmail: 'driver@byteburgers.shop',

  // ── Firebase ──────────────────────────────────────────────────────────────
  firebase: {
    apiKey:            'AIzaSyCfAfJkP9EsxPR1Zp7J8jctgSoxIfM_gbE',
    authDomain:        'byte-34c84.firebaseapp.com',
    databaseURL:       'https://byte-34c84-default-rtdb.europe-west1.firebasedatabase.app',
    projectId:         'byte-34c84',
    storageBucket:     'byte-34c84.firebasestorage.app',
    messagingSenderId: '700610883011',
    appId:             '1:700610883011:web:b7e6f16233b67d7976e176'
  }
};

// ── Apply branding colors to CSS variables immediately ────────────────────
(function() {
  // Convert hex to rgb components for rgba() usage in CSS
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return r + ',' + g + ',' + b;
  }
  const p = CONFIG.primaryColor;
  const rgb = hexToRgb(p);
  const root = document.documentElement;
  root.style.setProperty('--primary',       p);
  root.style.setProperty('--primary-rgb',   rgb);
  root.style.setProperty('--primary-glow',  'rgba(' + rgb + ',0.35)');
  // Update theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = CONFIG.themeColor;
})();
