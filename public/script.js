function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if (typeof updateThemeIcon === 'function') {
        updateThemeIcon(savedTheme);
    }
}

applySavedTheme();
window.addEventListener('pageshow', applySavedTheme);
window.addEventListener('storage', applySavedTheme);

function forceAutoLogout() {
    localStorage.removeItem('user');
    localStorage.removeItem('session_id');
    localStorage.removeItem('is_admin');

    document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login?expired=1';
    }
}

const originalFetch = window.fetch;
window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

    if (response.status === 401 && url.includes('/api/') && !url.includes('/api/auth')) {
        if (localStorage.getItem('user') || localStorage.getItem('session_id')) {
            forceAutoLogout();
        }
    }
    return response;
};

async function checkSessionValidity() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    let user;
    try {
        user = JSON.parse(userStr);
    } catch (e) {
        forceAutoLogout();
        return;
    }

    const sessionId = user.session_id || localStorage.getItem('session_id');
    if (!sessionId) {
        forceAutoLogout();
        return;
    }

    try {
        const res = await fetch('/api/verify-session', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${sessionId}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.status === 401) {
            forceAutoLogout();
        }
    } catch (err) {
        console.warn("Session-Check vorübergehend nicht möglich:", err);
    }
}

window.ignoreStockSystem = false;

const stockSettingsPromise = fetch(`/api/stock?t=${Date.now()}`)
    .then(res => res.ok ? res.json() : { ignoreStock: false })
    .then(data => {
        window.ignoreStockSystem = Boolean(data.ignoreStock);
        return window.ignoreStockSystem;
    })
    .catch(() => false);

const stockPromise = fetch(`/api/get-all-stocks?t=${Date.now()}`)
    .then(res => res.ok ? res.json() : [])
    .catch(err => {
        console.error("Fehler beim Abrufen der Bestände:", err);
        return [];
    });

document.addEventListener('DOMContentLoaded', () => {
    checkSessionValidity();
    fetchAllStocks();
});

document.addEventListener('click', (event) => {
    const btn = event.target.closest('.variant-btn');
    if (!btn) return;

    const gewaehlteId = btn.getAttribute('data-id');
    const produktKarte = btn.closest('.product-card, .product-details, .product-card-detail-view');
    
    if (!produktKarte) return;
    const hauptButton = produktKarte.querySelector('.btn-buy');
    if (hauptButton) {
        hauptButton.setAttribute('data-id', gewaehlteId);
    }

    produktKarte.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updatePrice(btn);
    
    const imgElement = produktKarte.querySelector('.product-img');
    const variantImages = btn.getAttribute('data-variant-images');

    if (variantImages && imgElement) {
        imgElement.setAttribute('data-images', variantImages);
        imgElement.setAttribute('data-index', '0');
        imgElement.classList.add('fade-out');
        
        setTimeout(() => {
            imgElement.src = variantImages.split(',')[0].trim();
            imgElement.classList.remove('fade-out');
        }, 150);
    }
    updateMainButtonStock(produktKarte);
});

function updatePrice(button) {
    const card = button.closest('.product-card, .product-card-detail-view');
    const rawPrice = button.getAttribute('data-price');
    if (!card || !rawPrice) return;
    
    const numericPrice = parseFloat(rawPrice);
    const formattedPrice = isNaN(numericPrice) ? rawPrice : numericPrice.toFixed(2).replace('.', ',');

    const priceElement = card.querySelector('.price');
    if (priceElement) {
        priceElement.textContent = formattedPrice;
    }

    const buyButton = card.querySelector('.btn-buy');
    if (buyButton) {
        const currentOnclick = buyButton.getAttribute('onclick');
        if (currentOnclick && currentOnclick.includes('addToCart')) {
            const updatedOnclick = currentOnclick.replace(/([\d\.]+)\s*\)/, numericPrice + ')');
            buyButton.setAttribute('onclick', updatedOnclick);
        }
    }
}

async function fetchAllStocks() {
    const stocks = await stockPromise;

    const stockMap = {};
    const ignoreStockMap = {};
    if (Array.isArray(stocks)) {
        stocks.forEach(item => {
            stockMap[item.id] = parseInt(item.stock) || 0;
            ignoreStockMap[item.id] = item.ignore_stock === 1;
        });
    }

    document.querySelectorAll('.variant-btn').forEach(btn => {
        const productId = btn.getAttribute('data-id');
        const isIgnored = ignoreStockMap[productId];

        btn.setAttribute('data-ignore-stock', isIgnored ? '1' : '0');

        if (isIgnored) {
            btn.style.opacity = '1';
            btn.style.textDecoration = 'none';
        } else if (productId in stockMap) {
            const stock = stockMap[productId];
            btn.setAttribute('data-stock', stock);

            if (stock <= 0) {
                btn.style.opacity = '0.4';
                btn.style.textDecoration = 'line-through';
            } else {
                btn.style.opacity = '1';
                btn.style.textDecoration = 'none';
            }
        }
    });

    document.querySelectorAll('.product-card, .product-details, .product-card-detail-view').forEach(container => {
        updateMainButtonStock(container);
    });
}

function updateMainButtonStock(produktKarte) {
    const activeVariantBtn = produktKarte.querySelector('.variant-btn.active');
    const cartButton = produktKarte.querySelector('.btn-buy');
    const alertBox = document.getElementById('stock-alert-box');

    if (!activeVariantBtn || !cartButton) return;

    const isIgnored = activeVariantBtn.getAttribute('data-ignore-stock') === '1';

    if (isIgnored) {
        cartButton.disabled = false;
        cartButton.innerText = "In den Warenkorb";
        cartButton.setAttribute('data-max-stock', '9999');
        if (alertBox) alertBox.style.display = 'none';
        return;
    }

    const stockAttr = activeVariantBtn.getAttribute('data-stock') || "0";
    const aktuellerBestand = parseInt(stockAttr);

    if (aktuellerBestand <= 0) {
        cartButton.disabled = true;
        cartButton.innerText = "Ausverkauft";
        cartButton.removeAttribute('data-max-stock');
        if (alertBox) alertBox.style.display = 'block';
    } else {
        cartButton.disabled = false;
        cartButton.innerText = "In den Warenkorb";
        cartButton.setAttribute('data-max-stock', aktuellerBestand);
        if (alertBox) alertBox.style.display = 'none';
    }
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        const lightValue = Math.floor((value + 255) / 2); 
        color += ('00' + lightValue.toString(16)).slice(-2);
    }
    return color;
}

function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
}

function logoutUser() {
    localStorage.removeItem('user');
    localStorage.removeItem('is_admin');
    localStorage.removeItem('session_id');
    document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/';
}

function renderUserMenu() {
    const root = document.getElementById('user-menu-root');
    if (!root) return;

    const userStr = localStorage.getItem('user');
    if (userStr) {
        const user = JSON.parse(userStr);
        const textColor = stringToColor(user.email);
        const hasCustomImage = Boolean(user.profile_picture);
        const defaultSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
                <rect width="200" height="200" fill="#ffffff" />
                <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="${textColor}" font-family="'Inter', sans-serif" font-weight="900" font-size="95" letter-spacing="-2">3D</text>
            </svg>
        `;

        const avatarContent = hasCustomImage 
            ? `<img src="${user.profile_picture}" alt="Profilbild">`
            : defaultSvg;

        const isAdmin = Boolean(user.is_admin);
        const adminLinkHtml = isAdmin 
            ? `<a href="admin" style="font-weight: 600;">Admin Dashboard</a>` 
            : '';

        root.innerHTML = `
            <div class="avatar" style="background-color: #ffffff;" onclick="toggleProfileMenu()">
                ${avatarContent}
            </div>
            <div class="profile-dropdown" id="profileDropdown">
                <a href="settings">Kontoeinstellungen</a>
                <a href="orders">Meine Bestellungen</a>
                ${adminLinkHtml}
                <a href="#" onclick="logoutUser()">Abmelden</a>
            </div>
        `;
    } else {
        root.innerHTML = `
            <a href="login" class="btn btn-primary nav-login-btn">Anmelden</a>
        `;
    }
}

function initCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    const acceptBtn = document.getElementById('accept-cookies-btn');

    if (!banner || !acceptBtn) return;

    if (localStorage.getItem('cookie_consent') === 'granted') {
        banner.classList.add('hidden');
    } else {
        banner.classList.remove('hidden');
    }

    acceptBtn.onclick = () => {
        localStorage.setItem('cookie_consent', 'granted');
        banner.classList.add('hidden');
    };
}

async function loadWebsiteVersion() {
    try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();

        if (data && data.formattedText) {
            const footer = document.querySelector('footer');
            if (footer) {
                let versionEl = document.getElementById('footer-version-tag');
                if (!versionEl) {
                    versionEl = document.createElement('p');
                    versionEl.id = 'footer-version-tag';
                    versionEl.style.fontSize = '16px';
                    versionEl.style.color = 'var(--text-muted)';
                    versionEl.style.marginTop = '4px';
                    versionEl.style.opacity = '0.85';
                    footer.appendChild(versionEl);
                }
                versionEl.innerText = data.formattedText;
            }
        }
    } catch (err) {
        console.error("Fehler beim Laden der Version:", err);
    }
}

document.addEventListener('click', function(event) {
    const root = document.getElementById('user-menu-root');
    const dropdown = document.getElementById('profileDropdown');
    if (root && dropdown && !root.contains(event.target)) {
        dropdown.classList.remove('active');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    renderUserMenu();
    initCookieBanner();
    loadWebsiteVersion();
});

document.addEventListener('DOMContentLoaded', () => {
    const acceptBtn = document.getElementById('accept-cookies-btn');
    const banner = document.getElementById('cookie-banner');

    if (acceptBtn && banner) {
        if (localStorage.getItem('cookies_accepted') === 'true') {
            banner.classList.add('hidden');
        } else {
            banner.classList.remove('hidden');
        }

        acceptBtn.addEventListener('click', () => {
            localStorage.setItem('cookies_accepted', 'true');
            banner.classList.add('hidden');
        });
    }
});

window.addEventListener('pageshow', () => {
    fetchAllStocks();
    checkSessionValidity();
});