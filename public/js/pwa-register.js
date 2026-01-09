// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New content available, refresh to update.');
            }
          });
        });
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}

// Detect if running as installed PWA
if (window.matchMedia('(display-mode: standalone)').matches) {
  document.body.classList.add('pwa-standalone');
}

// Handle iOS standalone mode
if (window.navigator.standalone === true) {
  document.body.classList.add('ios-standalone');
}
