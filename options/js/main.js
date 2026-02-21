document.addEventListener('DOMContentLoaded', async () => {
  async function getAccessToken() {
    const { accessToken } = await chrome.storage.local.get('accessToken');
    return accessToken;
  }
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  const storageKey = 'optionsActiveTab';

  const tabIdToPanelId = (tabId) => tabId.replace(/^tab-/, 'panel-');

  async function setActiveTab(tabId) {
    tabs.forEach(t => t.setAttribute('aria-selected', t.id === tabId ? 'true' : 'false'));
    panels.forEach(p => {
      if (p.id === tabIdToPanelId(tabId)) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    const tab = document.getElementById(tabId);
    try { chrome.storage.local.set({ [storageKey]: tabId }); } catch (e) { /* ignore when not available */ }
    tab.focus();
    tab.blur();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => setActiveTab(tab.id));
    tab.addEventListener('keydown', (e) => {
      const idx = tabs.indexOf(tab);
      if (e.key === 'ArrowRight') { tabs[(idx + 1) % tabs.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { tabs[(idx - 1 + tabs.length) % tabs.length].focus(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { setActiveTab(tab.id); e.preventDefault(); }
    });
  });

  // restore last active tab
  if (window.chrome && chrome.storage && chrome.storage.local) {
    const items = await chrome.storage.local.get(storageKey);
    const tabId = items && items[storageKey] ? items[storageKey] : 'tab-visual';
    setActiveTab(tabId);
  } else {
    setActiveTab('tab-visual');
  }

  // Example: simple option save/restore
  // Options inputs mapping
  const inputs = {
    replaceFavicon: document.getElementById('visual_favicon'),
    blinkFavicon: document.getElementById('visual_blink'),
    resourceGroupDecorator: document.getElementById('visual_rg_decoration'),

    desktopNotification: document.getElementById('notify_desktop'),
    activateTab: document.getElementById('notify_activate_tab'),

    advancedCopy: document.getElementById('resource_copy'),
    filterRestorer: document.getElementById('resource_save_filter'),

    keepCloudShellSession: document.getElementById('cloudshell_extend_session'),
    cloudShellOpener: document.getElementById('cloudshell_new_tab'),
    executeStartupScript: document.getElementById('cloudshell_enable_startup'),
    executeDockerDaemon: document.getElementById('cloudshell_enable_docker'),
    replaceCodeCommand: document.getElementById('cloudshell_replace_code'),
  };

  const desktopNotificationOptions = [
    document.getElementById('notify_filter')
  ];
  const notificationFilterRegExp = document.getElementById('notify_filter_regex');

  const copyOptions = [
    document.getElementById('resource_copy_name'),
    document.getElementById('resource_copy_id'),
    document.getElementById('resource_copy_azcli'),
    document.getElementById('resource_copy_azpwsh'),
    document.getElementById('resource_copy_arm_json'),
    document.getElementById('resource_copy_arm_bicep'),
    document.getElementById('resource_copy_terraform_azapi'),
    document.getElementById('resource_copy_terraform_azurerm'),
    document.getElementById('resource_copy_vm_bastion')
  ];

  const scriptOptions = [
    document.getElementById('cloudshell_enable_startup_visible'),
    document.getElementById('cloudshell_enable_startup_history')
  ];
  const scriptTextArea = document.getElementById('cloudshell_startup_script');

  const userSettingsOptions = {
    profileName: document.getElementById('profile_name'),
    shellType: document.getElementById('shell_type'),
    storageAccount: document.getElementById('storage_account'),
    fileShare: document.getElementById('file_share'),
    vnetLocation: document.getElementById('vnet_location'),
    networkProfile: document.getElementById('network_profile'),
    azureRelay: document.getElementById('azure_relay'),
  }
  const userSettingsProfileSelect = document.getElementById('cloudshell_settings_profile_select');
  const userSettingsApplyButton = document.getElementById('cloudshell_apply_settings');
  // userSettingsApplyButton.style.display = 'none'; // hide apply button for now as we don't have multiple settings to choose from yet
  const userSettingsSaveButton = document.getElementById('cloudshell_save_settings');
  const userSettingsRemoveButton = document.getElementById('cloudshell_remove_settings');
  userSettingsApplyButton.disabled = true;
  userSettingsSaveButton.disabled = true;
  userSettingsRemoveButton.disabled = true;
  const keys = Object.keys(inputs);
  try {
    const items = await chrome.storage.local.get(keys);
    keys.forEach(k => {
      const el = inputs[k];
      if (!el) return;
      if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.checked = !!items[k]?.status || false;
        if (k === 'advancedCopy') {
          copyOptions.forEach(checkbox => {
            const img = document.getElementById(`img_${checkbox.id}`);
            checkbox.disabled = !el.checked;
            if (items[k]?.options?.exclusions?.includes(checkbox.id)) {
              checkbox.checked = false;
              if (img) img.style.display = 'none';
            } else {
              checkbox.checked = true;
              if (img) img.style.display = 'inline';
            }
          });
        } else if (k === 'executeStartupScript') {
          scriptOptions.forEach(checkbox => {
            checkbox.disabled = !el.checked;
            checkbox.checked = !items[k]?.options?.disabledOptions?.includes(checkbox.id);
          });
          scriptTextArea.disabled = !el.checked;
          scriptTextArea.value = items[k]?.options?.script?.bash || '';
        } else if (k === 'desktopNotification') {
          desktopNotificationOptions.forEach(checkbox => {
            checkbox.disabled = !el.checked;
            checkbox.checked = items[k]?.options?.enabledOptions?.includes(checkbox.id);
            if (checkbox.id === 'notify_filter') {
              notificationFilterRegExp.disabled = !checkbox.checked || !el.checked;
            }
          });
          notificationFilterRegExp.value = items[k]?.options?.filterRegExp || '';
        }
      }
      else if (el.tagName === 'TEXTAREA') {
        el.value = items[k]?.value || '';
      }
    });

    // add listeners
    keys.forEach(k => {
      const el = inputs[k];
      if (!el) return;
      if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.addEventListener('change', async () => {
          const items = await chrome.storage.local.get([k]);
          // some options may depend on others; handle them here if needed
          const obj = {}
          obj[k] = { ...items[k], status: el.checked, options: { ...items[k]?.options || {} } };
          await chrome.storage.local.set(obj);
          if (k === 'advancedCopy') {
            copyOptions.forEach(checkbox => {
              checkbox.disabled = !el.checked;
            });
          } else if (k === 'executeStartupScript') {
            scriptOptions.forEach(checkbox => {
              checkbox.disabled = !el.checked;
            });
            scriptTextArea.disabled = !el.checked;
          } else if (k === 'desktopNotification') {
            notificationFilterRegExp.disabled = !el.checked;
            desktopNotificationOptions.forEach(checkbox => {
              checkbox.disabled = !el.checked;
              if (checkbox.id === 'notify_filter') {
                notificationFilterRegExp.disabled = !checkbox.checked || !el.checked;
              }
            });
          }
        });
      } else if (el.tagName === 'TEXTAREA') {
      }
    });

    desktopNotificationOptions.forEach(checkbox => {
      const k = 'desktopNotification';
      checkbox.addEventListener('change', async () => {
        const items = await chrome.storage.local.get([k]);
        const enabledOptionMap = (items[k]?.options?.enabledOptions || []).reduce((acc, cur) => {
          acc[cur] = true;
          return acc;
        }, {});
        enabledOptionMap[checkbox.id] = checkbox.checked;
        const obj = {
          [k]: {
            ...items[k], options: {
              ...items[k].options, enabledOptions: Object.keys(enabledOptionMap).reduce((acc, cur) => {
                if (enabledOptionMap[cur]) acc.push(cur);
                return acc;
              }, [])
            }
          }
        };
        await chrome.storage.local.set(obj);
      });
      if (checkbox.id === 'notify_filter') {
        notificationFilterRegExp.disabled = !checkbox.checked;
      }
    });
    notificationFilterRegExp.addEventListener('change', async () => {
      const el = notificationFilterRegExp;
      const validityOutput = document.getElementById('notify_filter_valid');
      const filterRegexText = el.value.trim();
      if (filterRegexText.length > 0) {
        try {
          new RegExp(filterRegexText);
          validityOutput.textContent = "Regular expression is valid.";
          validityOutput.style.display = 'block';
        }
        catch (err) {
          validityOutput.textContent = "Invalid RegExp: \"" + err.toString() + "\".";
          validityOutput.style.display = 'block';
          return;
        }
      }
      else {
        validityOutput.textContent = '';
        validityOutput.style.display = 'none';
      }

      const k = 'desktopNotification';
      const items = await chrome.storage.local.get([k]);
      const obj = {}
      obj[k] = { ...items[k], options: { ...items[k]?.options || {} } };
      obj[k].options.filterRegExp = filterRegexText;
      await chrome.storage.local.set(obj);
    });

    copyOptions.forEach(checkbox => {
      const k = 'advancedCopy';
      checkbox.addEventListener('change', async () => {
        const items = await chrome.storage.local.get([k]);
        const exclusionMap = (items[k]?.options?.exclusions || []).reduce((acc, cur) => {
          acc[cur] = true;
          return acc;
        }, {});
        exclusionMap[checkbox.id] = !checkbox.checked;
        const obj = {
          [k]: {
            ...items[k], options: {
              ...items[k].options, exclusions: Object.keys(exclusionMap).reduce((acc, cur) => {
                if (exclusionMap[cur]) acc.push(cur);
                return acc;
              }, [])
            }
          }
        };
        await chrome.storage.local.set(obj);
        const img = document.getElementById(`img_${checkbox.id}`);
        if (img) img.style.display = exclusionMap[checkbox.id] ? 'none' : 'inline';
      });
    });
    scriptOptions.forEach(checkbox => {
      const k = 'executeStartupScript';
      checkbox.addEventListener('change', async () => {
        const items = await chrome.storage.local.get([k]);
        const disabledOptionMap = (items[k]?.options?.disabledOptions || []).reduce((acc, cur) => {
          acc[cur] = true;
          return acc;
        }, {});
        disabledOptionMap[checkbox.id] = !checkbox.checked;
        const obj = {
          [k]: {
            ...items[k], options: {
              ...items[k].options, disabledOptions: Object.keys(disabledOptionMap).reduce((acc, cur) => {
                if (disabledOptionMap[cur]) acc.push(cur);
                return acc;
              }, [])
            }
          }
        };
        await chrome.storage.local.set(obj);
      });
    });
    scriptTextArea.addEventListener('blur', async () => {
      const k = 'executeStartupScript';
      const items = await chrome.storage.local.get([k]);
      const obj = {
        [k]: { ...items[k], options: { ...items[k].options, script: { ...items[k].options.script, bash: scriptTextArea.value } } }
      };
      await chrome.storage.local.set(obj);
    });
  } catch (e) {
    // storage might be unavailable in some contexts; fail silently
  }
  const getCurrentSetting = async (accessToken) => {
    try {
      const userSettingResponse = await fetch(
        'https://management.azure.com/providers/Microsoft.Portal/userSettings/cloudconsole?api-version=2023-02-01-preview',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
      const userSettingsData = userSettingResponse.status === 200 ? await userSettingResponse.json() : {
        properties: {
          networkType: 'Default',
          preferredLocation: '',
          preferredOsType: '',
          preferredShellType: '',
          sessionType: 'Ephemeral',
          userSubscription: '',
        }
      };
      console.log('Cloud Console User Settings:', userSettingsData);

      return userSettingsData.properties;
    } catch (e) {
      console.error('Error fetching user settings:', e);
    }
  };

  const getPropertiesFromUIControls = () => {
    return {
      networkType: userSettingsOptions.networkProfile.value && userSettingsOptions.azureRelay.value ? 'Isolated' : 'Default',
      preferredLocation: currentSetting?.preferredLocation || '',
      preferredOsType: currentSetting?.preferredOsType || '',
      preferredShellType: userSettingsOptions.shellType.value,
      sessionType: userSettingsOptions.storageAccount.value && userSettingsOptions.fileShare.value ? 'Mounted' : 'Ephemeral',
      storageProfile: userSettingsOptions.storageAccount.value && userSettingsOptions.fileShare.value ? {
        diskSizeInGB: currentSetting?.storageProfile?.diskSizeInGB || 5,
        fileShareName: userSettingsOptions.fileShare.value,
        storageAccountResourceId: userSettingsOptions.storageAccount.value,
      } : undefined,
      userSubscription: currentSetting?.userSubscription || '',
      vnetSettings: userSettingsOptions.networkProfile.value && userSettingsOptions.azureRelay.value ? {
        isolatedStorageProfile: userSettingsOptions.storageAccount.value && userSettingsOptions.fileShare.value ? {
          diskSizeInGB: currentSetting?.storageProfile?.diskSizeInGB || 5,
          fileShareName: userSettingsOptions.fileShare.value,
          storageAccountResourceId: userSettingsOptions.storageAccount.value,
        } : undefined,
        location: userSettingsOptions.vnetLocation.value,
        networkProfileResourceId: userSettingsOptions.networkProfile.value,
        relayNamespaceResourceId: userSettingsOptions.azureRelay.value,
      } : undefined
    };
  }

  const setUIControlsFromProperties = (properties) => {
    if (!properties) return;
    userSettingsOptions.shellType.value = properties.preferredShellType || '';
    if (properties.storageProfile) {
      userSettingsOptions.storageAccount.value = properties.storageProfile.storageAccountResourceId || '';
      userSettingsOptions.fileShare.value = properties.storageProfile.fileShareName || '';
    } else {
      userSettingsOptions.storageAccount.value = '';
      userSettingsOptions.fileShare.value = '';
    }
    if (properties.vnetSettings) {
      userSettingsOptions.vnetLocation.value = properties.vnetSettings.location?.replace(/ /g, '').toLowerCase() || '';
      userSettingsOptions.networkProfile.value = properties.vnetSettings.networkProfileResourceId || '';
      userSettingsOptions.azureRelay.value = properties.vnetSettings.relayNamespaceResourceId || '';
    } else {
      userSettingsOptions.vnetLocation.value = '';
      userSettingsOptions.networkProfile.value = '';
      userSettingsOptions.azureRelay.value = '';
    }
  }

  const setUIControlsFromProfileName = async (profileName) => {
    const properties = (await chrome.storage.local.get('cloudShellSettingProfiles'))?.cloudShellSettingProfiles?.[profileName]?.properties;
    setUIControlsFromProperties(properties);
    userSettingsOptions.profileName.value = profileName;
  }

  userSettingsSaveButton.addEventListener('click', async () => {
    const storedSettingProfiles = (await chrome.storage.local.get('cloudShellSettingProfiles')).cloudShellSettingProfiles || {};

    const obj = {
      properties: getPropertiesFromUIControls()
    };
    storedSettingProfiles[userSettingsOptions.profileName.value] = obj;
    await chrome.storage.local.set({ cloudShellSettingProfiles: storedSettingProfiles });

    ![...userSettingsProfileSelect.options].map(op => op.value).includes(userSettingsOptions.profileName.value)
      && userSettingsProfileSelect.add(new Option(userSettingsOptions.profileName.value, userSettingsOptions.profileName.value));
    userSettingsProfileSelect.value = userSettingsOptions.profileName.value;
    userSettingsSaveButton.disabled =
      userSettingsRemoveButton.disabled =
      userSettingsApplyButton.disabled = false;
  });

  userSettingsRemoveButton.addEventListener('click', async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.error('No access token found. User settings options will not be populated.');
      return;
    }
    const storedSettingProfiles = (await chrome.storage.local.get('cloudShellSettingProfiles')).cloudShellSettingProfiles || {};
    delete storedSettingProfiles[userSettingsOptions.profileName.value];
    await chrome.storage.local.set({ cloudShellSettingProfiles: storedSettingProfiles });

    const optionArray = [...userSettingsProfileSelect.options];
    userSettingsProfileSelect.remove(optionArray.indexOf(optionArray.find(op => op.value === userSettingsOptions.profileName.value)));
    userSettingsProfileSelect.value = 'current';

    currentSetting = await getCurrentSetting(accessToken);
    setUIControlsFromProperties(currentSetting);

    userSettingsOptions.profileName.placeholder = `(Current Cloud Shell setting)`;
    userSettingsOptions.profileName.value = '';

    userSettingsSaveButton.disabled =
      userSettingsRemoveButton.disabled =
      userSettingsApplyButton.disabled = true;
  });

  userSettingsApplyButton.addEventListener('click', async () => {
    userSettingsProfileSelect.disabled = true;
    Object.values(userSettingsOptions).forEach(option => {
      option.disabled = true;
    });
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error('No access token found. User settings options will not be populated.');
        return;
      }
      // apply settings to Cloud Shell by calling the API; this will update the current setting which is being observed by the content script and applied in real time
      await fetch(
        'https://management.azure.com/providers/Microsoft.Portal/userSettings/cloudconsole?api-version=2023-02-01-preview',
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ properties: getPropertiesFromUIControls() })
        }
      );

      currentSetting = await getCurrentSetting(accessToken);
      setUIControlsFromProperties(currentSetting);
      userSettingsOptions.profileName.placeholder = `(Current Cloud Shell setting)`;
      userSettingsOptions.profileName.value = '';
      userSettingsProfileSelect.value = 'current';

      userSettingsSaveButton.disabled =
        userSettingsApplyButton.disabled =
        userSettingsRemoveButton.disabled = true;
    } catch (e) {
      console.error('Error applying settings:', e);
    }
    userSettingsProfileSelect.disabled = false;
    Object.values(userSettingsOptions).forEach(option => {
      option.disabled = false;
    });
  });

  userSettingsOptions.profileName.addEventListener('change', async () => {
    userSettingsSaveButton.disabled = !userSettingsOptions.profileName.value;
    const storedSettingProfiles = (await chrome.storage.local.get('cloudShellSettingProfiles')).cloudShellSettingProfiles || {};
    userSettingsRemoveButton.disabled = !storedSettingProfiles[userSettingsOptions.profileName.value];
  });

  Object.values(userSettingsOptions).forEach(option => {
    option.addEventListener('change', async () => {
      const storedSettingProfiles = (await chrome.storage.local.get('cloudShellSettingProfiles')).cloudShellSettingProfiles || {};
      const editingProperties = getPropertiesFromUIControls();
      const isSameAsCurrent = JSON.stringify(editingProperties) === JSON.stringify(currentSetting);
      userSettingsApplyButton.disabled = isSameAsCurrent;
      userSettingsSaveButton.disabled = !userSettingsOptions.profileName.value || (storedSettingProfiles[userSettingsOptions.profileName.value] && JSON.stringify(storedSettingProfiles[userSettingsOptions.profileName.value].properties) === JSON.stringify(editingProperties));
      userSettingsRemoveButton.disabled = !userSettingsOptions.profileName.value || !storedSettingProfiles[userSettingsOptions.profileName.value] || JSON.stringify(storedSettingProfiles[userSettingsOptions.profileName.value].properties) !== JSON.stringify(editingProperties);
    });
  });

  userSettingsProfileSelect.addEventListener('change', async () => {
    if (userSettingsProfileSelect.selectedIndex > 0) {
      userSettingsSaveButton.disabled = true;
      userSettingsRemoveButton.disabled =
        userSettingsApplyButton.disabled = false;
      setUIControlsFromProfileName(userSettingsProfileSelect.value);
      return;
    }
    userSettingsRemoveButton.disabled =
      userSettingsSaveButton.disabled =
      userSettingsApplyButton.disabled = true;
    setUIControlsFromProperties(currentSetting);
    userSettingsOptions.profileName.value = '';
    userSettingsOptions.profileName.placeholder = '(Current Cloud Shell setting)';
  });

  let currentSetting = null;
  try {
    const profileSelectOptions = Object.keys((await chrome.storage.local.get('cloudShellSettingProfiles'))?.cloudShellSettingProfiles || {});
    profileSelectOptions.forEach(profileName => {
      userSettingsProfileSelect.add(new Option(profileName, profileName));
    });

    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.error('No access token found. User settings options will not be populated.');
      return;
    }
    const oid = JSON.parse(atob(accessToken.split('.')[1])).oid;
    console.debug('User OID:', oid);
    currentSetting = await getCurrentSetting(accessToken);
    try {
      const networkResponse = await fetch(
        `https://management.azure.com/subscriptions/${currentSetting.userSubscription}/providers/Microsoft.Network?api-version=2025-03-01`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
      const networkData = await networkResponse.json();
      console.log('Network Data:', networkData);
      const vnetLocations = networkData.resourceTypes.find(rt => rt.resourceType === 'virtualNetworks')?.locations.map(location => ({ text: location, value: location.replace(/ /g, '').toLowerCase() })) || [];
      userSettingsOptions.vnetLocation.add(new Option('(None)', ''));
      userSettingsOptions.vnetLocation.value = '';
      vnetLocations.forEach(loc => {
        userSettingsOptions.vnetLocation.add(new Option(loc.text, loc.value));
      });
    } catch (e) {
      console.error('Error fetching network data:', e);
      userSettingsOptions.vnetLocation.add(new Option(currentSetting.vnetSettings.location?.replace(/ /g, '').toLowerCase() || ''));
    }
    userSettingsOptions.profileName.value = '';

  } catch (e) {
    console.error('Error fetching user settings or network data:', e);
  }
  userSettingsOptions.shellType.add(new Option('Bash', 'bash'));
  userSettingsOptions.shellType.add(new Option('PowerShell', 'pwsh'));
  userSettingsOptions.shellType.value = currentSetting.preferredShellType;

  setUIControlsFromProperties(currentSetting);
  userSettingsProfileSelect.disabled = false;
  Object.values(userSettingsOptions).forEach(option => {
    option.disabled = false;
  });
});
