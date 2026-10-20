// Offline support. App files and OCR assets are cached the first time they
// load, so after one visit Levelle works with no network at all.
// Bump the version to drop old caches after a deploy.
const CACHE = 'levelle-v1'

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(['./', './manifest.webmanifest', './icon.svg']))
            .then(() => self.skipWaiting()),
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    )
})

self.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

    // Pages: network first so updates show up, falling back to the cached shell
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone()
                    caches.open(CACHE).then((cache) => cache.put('./', copy))
                    return response
                })
                .catch(() => caches.match('./')),
        )
        return
    }

    // Everything else (hashed bundles, OCR files) never changes: cache first
    event.respondWith(
        caches.match(request).then(
            (cached) =>
                cached ??
                fetch(request).then((response) => {
                    if (response.ok) {
                        const copy = response.clone()
                        caches.open(CACHE).then((cache) => cache.put(request, copy))
                    }
                    return response
                }),
        ),
    )
})
