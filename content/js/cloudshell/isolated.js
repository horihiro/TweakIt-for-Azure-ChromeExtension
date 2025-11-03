window.addEventListener('cloudShellInitialized', async () => {
  console.debug('cloudShellInitialized event received');
  window.dispatchEvent(new CustomEvent('startupFeatureStatus', { detail: await chrome.storage.local.get() }));
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  window.dispatchEvent(new CustomEvent('updateFeatureStatus', { detail: changes }));
});
