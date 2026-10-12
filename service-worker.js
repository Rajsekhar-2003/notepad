/* ============================================================
   Web Notepad – Service Worker
   Version: 1.0.0
   Purpose: Offline-first caching, PWA support, faster loads
   ============================================================ */

const CACHE_NAME = 'webnotepad-v1.0.0';
const RUNTIME_CACHE = 'webnotepad-runtime-v1';

// Core assets to pre-cache (app shell)
const PRECACHE_ASSETS = [
    '/',
    '/access',
    '/about',
    '/privacy-policy',
    '/static/image.png',
    '/static/web-notepad.png',
    '/og-notepad.jpg',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
    'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
    'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js'
];

// ============================================================
// INSTALL – Pre-cache app shell
// ============================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Web Notepad service worker v1.0.0...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching app shell');
                return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { credentials: 'omit' })));
            })
            .then(() => self.skipWaiting())
            .catch((err) => console.warn('[SW] Pre-cache warning:', err))
    );
});

// ============================================================
// ACTIVATE – Clean old caches
// ============================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================================
// FETCH – Cache-first for static, network-first for API
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip cross-origin non-CDN requests
    if (url.origin !== self.location.origin &&
        !url.hostname.includes('cdn.jsdelivr.net') &&
        !url.hostname.includes('cdnjs.cloudflare.com') &&
        !url.hostname.includes('fonts.googleapis.com') &&
        !url.hostname.includes('fonts.gstatic.com')) {
        return;
    }

    // Network-first for API and dynamic routes
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/share/') ||
        url.pathname.startsWith('/note/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Cache-first for static assets
    event.respondWith(cacheFirst(request));
});

// ============================================================
// STRATEGIES
// ============================================================

// Cache-first strategy (for static assets, CSS, JS, images)
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
            const runtime = await caches.open(RUNTIME_CACHE);
            runtime.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Offline fallback
        const fallback = await cache.match('/');
        if (fallback) return fallback;
        return new Response('Offline – Web Notepad', {
            status: 503,
            statusText: 'Offline',
            headers: new Headers({ 'Content-Type': 'text/plain' })
        });
    }
}

// Network-first strategy (for API, dynamic content)
async function networkFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
            status: 503,
            headers: new Headers({ 'Content-Type': 'application/json' })
        });
    }
}

// ============================================================
// MESSAGE – Allow main thread to trigger skipWaiting
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Web Notepad service worker loaded.');
