/*! coi-serviceworker v0.1.7 - patched to use credentialless mode | MIT License */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    (() => {
        if (window.crossOriginIsolated) return;
        if (window.navigator.serviceWorker) {
            window.navigator.serviceWorker.register(window.document.currentScript.src).then((registration) => {
                if (registration.active && !window.navigator.serviceWorker.controller) {
                    window.location.reload();
                }
            });
            window.navigator.serviceWorker.addEventListener("controllerchange", () => {
                window.location.reload();
            });
        }
    })();
}
