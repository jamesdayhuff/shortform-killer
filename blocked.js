/* Extension pages run under a strict CSP — no inline handlers, so the
 * button is wired up here. */
document.getElementById('back').addEventListener('click', () => {
  /* Straight to the home feed, where Shorts are already hidden. */
  location.replace('https://www.youtube.com/');
});
