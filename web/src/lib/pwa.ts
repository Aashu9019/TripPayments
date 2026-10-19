import { registerSW } from 'virtual:pwa-register';

/**
 * Installed apps (especially on iPhone) resume instead of reloading, so they
 * never notice a new deploy. Check for one on launch, whenever the app comes
 * back to the foreground, and every 30 minutes; reload as soon as it's ready.
 */
export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, 30 * 60 * 1000);
    },
  });

  // A new service worker taking over means new code: reload once to run it.
  // Skip the very first install, when there was no old version to replace.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });
}
