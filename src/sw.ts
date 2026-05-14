import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Take control immediately on install — no waiting for tabs to close
self.addEventListener('install', () => { self.skipWaiting() })

// Claim all open tabs as soon as the new SW activates
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
