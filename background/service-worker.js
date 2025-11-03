console.debug('Start service-worker.js');

const notificationQueue = [];
const apiVersionMap = new Map();
const contextMenuProps = [
  {
    id: 'open-in-preview-portal',
    title: 'Open in `preview.portal.azure.com`',
  },
  {
    id: 'open-in-ga-portal',
    title: 'Open in `portal.azure.com`'
  }
];

const notificationCore = async (options) => {
  console.debug(JSON.stringify(options, null, 2));
  const notificationId = await chrome.notifications.create(options.notificationOptions);
  const timeout = setTimeout(() => {
    chrome.notifications.clear(notificationId);
    chrome.notifications.onClosed.dispatch();
  }, 10000)
  chrome.notifications.onClosed.addListener(async (/* notificationId, byUser */) => {
    notificationQueue.shift();
    if (notificationQueue.length == 0) return;
    await notificationCore(notificationQueue[0]);
  });
  const { id, windowId } = options?.tab || {};
  if (!id || !windowId) return;
  chrome.notifications.onClicked.addListener(async (/* notificationId */) => {
    await chrome.tabs.update(id, { active: true, highlighted: true })
    await chrome.windows.update(windowId, { focused: true });
    clearTimeout(timeout);
    notificationQueue.shift();
    if (notificationQueue.length == 0) return;
    await notificationCore(notificationQueue[0]);
  });
}

const notify2desktop = async (options) => {
  if (notificationQueue.length == 0) {
    await notificationCore(options);
  }
  notificationQueue.push(options);
}

const getAccessToken = async () => {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  return accessToken;
}

chrome.runtime.onConnect.addListener((port) => {
  console.debug(`onConnect: port ${JSON.stringify(port)}`);
  if (!['desktop-notification', 'tab-activation', 'get-resource-template', 'tab-loaded', 'set-access-token'].includes(port.name)) return;

  port.onMessage.addListener(async (message, sender, sendResponse) => {
    switch (message.type) {
      case 'ping':
        port.postMessage({ type: 'pong' });
        break;
      case 'tab-activation':
        if (!message.tab?.id || !message.tab?.windowId) break;

        await chrome.tabs.update(message.tab.id, { active: true, highlighted: true });
        await chrome.windows.update(message.tab.windowId, { focused: true });
        break;
      case 'tab-loaded':
        chrome.contextMenus.update(contextMenuProps[0].id, {
          visible: message.url.includes('://portal.azure.com')
        });
        chrome.contextMenus.update(contextMenuProps[1].id, {
          visible: message.url.includes('://preview.portal.azure.com')
        });
        break;
      case 'get-resource-template':
        try {
          const body = await (async (message) => {
            const { resourceId, format } = message;
            const splitResourceId = resourceId.split('/').map((item) => item.toLowerCase());
            if (splitResourceId.length < 9
              || splitResourceId[0] !== ''
              || splitResourceId[1] !== 'subscriptions'
              || splitResourceId[3] !== 'resourcegroups'
              || splitResourceId[5] !== 'providers') {
              port.postMessage({ type: 'resource-template', errorMessage: `Invalid resourceId: ${resourceId}` });
              return;
            }
            switch (format) {
              case 'bicep':
                const requestParamBicep = {
                  url: `https://management.azure.com${splitResourceId.slice(0, 5).join('/')}/exportTemplate?api-version=2024-03-01`,
                  method: 'POST',
                  body: JSON.stringify({
                    "resources": [
                      resourceId
                    ],
                    "options": "IncludeParameterDefaultValue",
                    "outputFormat": "Bicep"
                  })
                };
                do {
                  const response = await fetch(
                    requestParamBicep.url,
                    {
                      headers: { 'Authorization': `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
                      redirect: 'follow',
                      method: requestParamBicep.method,
                      body: requestParamBicep.body
                    }
                  );
                  if (response.status === 202 && response.headers.get('location')) {
                    requestParamBicep.url = response.headers.get('location');
                    requestParamBicep.method = 'GET';
                    requestParamBicep.body = void 0;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                  } else if (response.status === 200) {
                    return (await response.json()).output;
                  }
                  throw new Error(`Invalid response: ${response.status}`);
                } while (true);
                return '';
                break;
              case 'azapi':
              case 'azurerm':
                const response = await fetch(
                  `https://management.azure.com${splitResourceId.slice(0, 3).join('/')}/providers/Microsoft.AzureTerraform?api-version=2021-04-01`,
                {
                  headers: {
                    Authorization: `Bearer ${await getAccessToken()}`
                  }
                });
                if (response.status !== 200 || (await response.json()).registrationState != 'Registered') {
                  throw new Error(`Microsoft.AzureTerraform provider might not be registered.`);
                }
                const requestParamTerraform = {
                  url: `https://management.azure.com${splitResourceId.slice(0, 3).join('/')}/providers/Microsoft.AzureTerraform/exportTerraform?api-version=2023-07-01-preview`,
                  method: 'POST',
                  body: JSON.stringify({
                    "resourceIds": [
                      resourceId
                    ],
                    "targetProvider": format,
                    "type": "ExportResource"
                  })
                };
                do {
                  const response = await fetch(
                    requestParamTerraform.url,
                    {
                      headers: {
                        'Authorization': `Bearer ${await getAccessToken()}`,
                        'Content-Type': 'application/json',
                        "commandName": "HubsExtension.TemplateViewer.generateTerraformTemplate",
                      },
                      redirect: 'follow',
                      method: requestParamTerraform.method,
                      body: requestParamTerraform.body
                    }
                  );
                  if (response.status === 202 && response.headers.get('location')) {
                    requestParamTerraform.url = response.headers.get('location');
                    requestParamTerraform.method = 'GET';
                    requestParamTerraform.body = void 0;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                  } else if (response.status === 200) {
                    return (await response.json()).properties.configuration;
                  }
                  throw new Error(`Invalid response: ${response.status}`);
                } while (true);
                return '';
                break;
              default:
                const provider = splitResourceId[6];
                const resourceType = splitResourceId[7];
                const apiVersion = apiVersionMap.get(`${provider}/${resourceType}`) || await (async (params) => {
                  const providerInfoResponse = await fetch(
                    `https://management.azure.com/providers/${params.provider}?api-version=2019-08-01`,
                    { headers: { 'Authorization': `Bearer ${await getAccessToken()}` } }
                  );
                  const providerInfo = await providerInfoResponse.json();
                  apiVersionMap.set(`${params.provider}/${params.resourceType}`, providerInfo.resourceTypes.find((type) => type.resourceType.toLowerCase() === params.resourceType.toLowerCase()).apiVersions[0]);
                  return apiVersionMap.get(`${params.provider}/${params.resourceType}`);
                })({ provider, resourceType });
                if (!apiVersion) {
                  port.postMessage({ type: 'resource-template', errorMessage: `API version not found: ${resourceId}` });
                  return;
                }
                const responseArmJson = await fetch(
                  `https://management.azure.com${resourceId}?api-version=${apiVersion}`,
                  { headers: { 'Authorization': `Bearer ${await getAccessToken()}` } }
                );
                return await responseArmJson.json();
            }
          })(message);
          port.postMessage({ type: 'resource-template', result: 'succeeded', format: message.format || 'json', body });
        } catch (error) {
          port.postMessage({ type: 'resource-template', result: 'failed', body: error.message});
        }
        break;
      case 'notification':
        await notify2desktop(message);
        break;
    }
  });
  port.onDisconnect.addListener((port) => {
    console.debug(JSON.stringify(port));
  });
  port.postMessage({ 'type': 'connected', tab: port.sender.tab });
});

chrome.storage.onChanged.addListener(async (_, area) => {
  if (area !== 'local') return;
  const { /* replaceFavicon, blinkFavicon, advancedCopy, */desktopNotification } = (await chrome.storage.local.get([/*'replaceFavicon', 'blinkFavicon', 'advancedCopy', */'desktopNotification']));

  if (desktopNotification) {
    if (await chrome.notifications.getPermissionLevel() !== 'granted') {
      await chrome.storage.local.set({
        'desktopNotification': false
      });
    }
  } else {

  }

  // if (blinkFavicon) {
  // } else {
  // }

  // if (replaceFavicon) {
  // } else {
  // }

  // if (advancedCopy) {
  // } else {
  // }
});

chrome.runtime.onInstalled.addListener(async () => {
  console.debug('onInstalled');
  for await (const menu of contextMenuProps) {
    await chrome.contextMenus.create(menu);
  };
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  chrome.contextMenus.update(contextMenuProps[0].id, {
    visible: tab.url?.includes('://portal.azure.com')
  });
  chrome.contextMenus.update(contextMenuProps[1].id, {
    visible: tab.url?.includes('://preview.portal.azure.com')
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.debug('onClicked', info, tab);
  if (info.menuItemId === contextMenuProps[0].id && tab.url) {
    console.debug(`clicked in ${tab.url}`);
    await chrome.tabs.create({
      url: tab.url.replace(/:\/\/[^\/]+\//, '://preview.portal.azure.com/'),
      active: true
    });
  } else if (info.menuItemId === contextMenuProps[1].id && tab.url) {
    console.debug(`clicked in ${tab.url}`);
    await chrome.tabs.create({
      url: tab.url.replace(/:\/\/[^\/]+\//, '://portal.azure.com/'),
      active: true
    });
  }

});

// Open options page when user clicks the extension action (icon).
// This listener will only fire when `action.default_popup` is not set in manifest.
chrome.action.onClicked.addListener(async () => {
  try {
    if (chrome.runtime.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options/main.html') });
    }
  } catch (e) {
    console.debug('Failed to open options page', e);
  }
});