const toggle = document.getElementById('toggle');
const state = document.getElementById('state');

function render(enabled) {
  toggle.checked = enabled;
  state.textContent = enabled ? 'Active on YouTube' : 'Paused — Shorts allowed';
}

chrome.storage.local.get({ enabled: true }, ({ enabled }) => render(enabled));

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  render(enabled);
  chrome.storage.local.set({ enabled });
});
