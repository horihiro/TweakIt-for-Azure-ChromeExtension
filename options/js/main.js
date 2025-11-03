document.addEventListener('DOMContentLoaded', () => {
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
    chrome.storage.local.get(storageKey, (items) => {
      const tabId = items && items[storageKey] ? items[storageKey] : 'tab-basic';
      setActiveTab(tabId);
    });
  } else {
    setActiveTab('tab-basic');
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
    executeStartupScript: document.getElementById('cloudshell_enable_startup'),
    executeDockerDaemon: document.getElementById('cloudshell_enable_docker'),
    replaceCodeCommand: document.getElementById('cloudshell_replace_code'),
  };

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

  const keys = Object.keys(inputs);
  try {
    chrome.storage.local.get(keys, (items) => {
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
          }
        }
      });
    });

    // add listeners
    keys.forEach(k => {
      const el = inputs[k];
      if (!el) return;
      if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.addEventListener('change', () => {
          chrome.storage.local.get([k], (items) => {
            // some options may depend on others; handle them here if needed
            const obj = {}
            obj[k] = { ...items[k], status: el.checked };
            chrome.storage.local.set(obj);
            if (k === 'advancedCopy') {
              copyOptions.forEach(checkbox => {
                checkbox.disabled = !el.checked;
                // checkbox.parentElement.style.cursor = el.checked ? 'pointer' : 'not-allowed';
              });
            } else if (k === 'executeStartupScript') {
              scriptOptions.forEach(checkbox => {
                checkbox.disabled = !el.checked;
                // checkbox.parentElement.style.cursor = el.checked ? 'pointer' : 'not-allowed';
              });
              scriptTextArea.disabled = !el.checked;
              // scriptTextArea.style.cursor = el.checked ? 'text' : 'not-allowed';
            }
          });
        });
      }
    });
    copyOptions.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        chrome.storage.local.get(["advancedCopy"], (items) => {
          const exclusionMap = (  items["advancedCopy"]?.options?.exclusions || []).reduce((acc, cur) => {
            acc[cur] = true;
            return acc;
          }, {});
          exclusionMap[checkbox.id] = !checkbox.checked;
          const obj = {
            advancedCopy: { ...items["advancedCopy"], options: { ...items["advancedCopy"].options, exclusions: Object.keys(exclusionMap).reduce((acc, cur) => {
              if (exclusionMap[cur]) acc.push(cur);
              return acc;
            }, []) } }
          };
          chrome.storage.local.set(obj, () => {
            const img = document.getElementById(`img_${checkbox.id}`);
            if (img) img.style.display = exclusionMap[checkbox.id] ? 'none' : 'inline';
          });
        });
      });
    });
    scriptOptions.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        chrome.storage.local.get(["executeStartupScript"], (items) => {
          const disabledOptionMap = (items["executeStartupScript"]?.options?.disabledOptions || []).reduce((acc, cur) => {
            acc[cur] = true;
            return acc;
          }, {});
          disabledOptionMap[checkbox.id] = !checkbox.checked;
          const obj = {
            executeStartupScript: { ...items["executeStartupScript"], options: { ...items["executeStartupScript"].options, disabledOptions: Object.keys(disabledOptionMap).reduce((acc, cur) => {
              if (disabledOptionMap[cur]) acc.push(cur);
              return acc;
            }, []) } }
          };
          chrome.storage.local.set(obj);
        });
      });
    });
    scriptTextArea.addEventListener('blur', () => {
      chrome.storage.local.get(["executeStartupScript"], (items) => {
        const obj = {
          executeStartupScript: { ...items["executeStartupScript"], options: { ...items["executeStartupScript"].options, script: { ...items["executeStartupScript"].options.script, bash: scriptTextArea.value } } }
        };
        chrome.storage.local.set(obj);
      });
    });
  } catch (e) {
    // storage might be unavailable in some contexts; fail silently
  }
});
