const DYNAMIC_CACHE_NAME = "dynamic-new-station-v1";

self.addEventListener("install", (e) => {
    // Ne pas mettre en cache lors de l'installation
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cache) => {
                        // Supprime TOUS les caches existants
                        return caches.delete(cache);
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (e) => {
    // Stratégie "Network Only" (pas de cache)
    e.respondWith(fetch(e.request));
});

// Dans service_worker.js
self.addEventListener("fetch", (e) => {
    if (e.request.url.includes("data.economie.gouv.fr")) {
        // Pas de cache pour l'API
        e.respondWith(fetch(e.request));
    } else {
        // Cache rapide pour les assets
        e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
    }
});
