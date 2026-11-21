/**
 * Registers the offline service worker. Kept out of ui.js so the game logic and
 * the hosting concern stay separate - delete this file and the <script> tag in
 * index.html to turn offline support off.
 *
 * Service workers only run over https or on localhost, so opening index.html
 * straight from disk simply skips this.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('Offline mode unavailable:', error.message);
    });
  });
}
