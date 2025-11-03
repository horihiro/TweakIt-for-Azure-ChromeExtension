class Watcher {

  constructor() {
  }

  startWatching() {
    throw new Error('You have to implement the method startWatching!');
  }
  stopWatching() {
    if (!this.observer) return;
    this.observer.disconnect();
  }
  async getAccessToken() {
    const { accessToken } = await chrome.storage.local.get('accessToken');
    return accessToken;
  }
}

// class VisibilityRestorer extends Watcher {
//   constructor() {
//     super();
//     this.observer = new MutationObserver(this.detectTargetElement.bind(this));
//     this.inputMap = {};
//     this.propName = 'resourceVisibility';
//     this.SELECTOR_TARGET_ELEMENT = 'section:last-of-type .ext-hubs-artbrowse-filter-showall .azc-validatableControl-none.azc-text-label';
//   }
//   async updateTargetElement(inputEvent) {
//     inputEvent.stopPropagation();
//     const view = document.location.hash.replace(/^[\S\s]*\/subscriptions/, '/subscriptions') || '';
//     if (!view) return;
//     const input = inputEvent.currentTarget.querySelector('input[type="checkbox"]');
//     if (!input) return;

//     if (input.checked) this.options[this.propName][view] = input.checked;
//     else delete this.options[this.propName][view];

//     await chrome.storage.local.set({
//       "visibilityRestorer": {
//         status: true,
//         options: this.options
//       }
//     });
//   }
//   detectTargetElement() {
//     const targetElements = [...document.querySelectorAll(this.SELECTOR_TARGET_ELEMENT)];
//     const view = document.location.hash.replace(/^[\S\s]*\/subscriptions/, '/subscriptions') || '';
//     if (targetElements.length === 0 || !view || this.inputMap[view] == targetElements[0]) return;
//     this.inputMap[view] = targetElements[0];
//     if (this.options[this.propName][view]) this.inputMap[view].click();
//     this.inputMap[view].addEventListener('click', this.updateTargetElement.bind(this));
//   }
//   startWatching(options) {
//     this.options = options || { [this.propName]: {} };
//     this.detectTargetElement();
//     this.observer.observe(document, { childList: true, subtree: true });
//   }

//   stopWatching() {
//     super.stopWatching();
//   }
// }

class FilterRestorer extends Watcher {
  constructor() {
    super();
    this.observer = new MutationObserver(this.detectFilterInput.bind(this));
    this.SELECTOR_BLADE_TITLE = 'section:last-of-type .fxs-blade-title-titleText';
    this.inputMap = {};
    this.propName = 'filterString';
    this.SELECTOR_TARGET_ELEMENT = 'section:last-of-type .ext-hubs-artbrowse-filter-container input[type="text"]';
  }
  async updateFileterString(inputEvent) {
    const view = document.location.hash.replace(/^[\S\s]*\/subscriptions/, '/subscriptions') || '';
    if (!view) return;

    if (inputEvent.target.value) this.options[this.propName][view] = inputEvent.target.value;
    else delete this.options[this.propName][view];

    await chrome.storage.local.set({
      "filterRestorer": {
        status: true,
        options: this.options
      }
    });
  }
  detectFilterInput() {
    const filterInputs = [...document.querySelectorAll(this.SELECTOR_TARGET_ELEMENT)];
    const view = document.location.hash.replace(/^[\S\s]*\/subscriptions/, '/subscriptions') || '';
    if (filterInputs.length === 0 || !view || this.inputMap[view] == filterInputs[0]) return;
    this.inputMap[view] = filterInputs[0];
    this.inputMap[view].value = this.options[this.propName][view] || '';
    if (this.inputMap[view].value) this.inputMap[view].dispatchEvent(new Event('input', { bubbles: true }));
    this.inputMap[view].addEventListener('input', this.updateFileterString.bind(this));
  }
  startWatching(options) {
    this.options = options || { filterString: {} };
    this.detectFilterInput();
    this.observer.observe(document, { childList: true, subtree: true });
  }

  stopWatching() {
    super.stopWatching();
  }
}

class AdvancedCopy extends Watcher {
  constructor() {
    super();
    this.messageQueue = [];
    this.re = /(\/subscriptions\/[0-9a-f]{8}(?:-[0-9a-f]{4}){4}[0-9a-f]{8}\/resourceGroups\/([^/]+)\/providers\/([^/]+)\/([^/]+)\/([^/]+))/i;
    this.cache = {};
    this.menus = [{
      title: 'Resource name',
      id: 'resource_copy_name',
      handler: (event) => {
        const resource = location.hash.match(this.re);
        resource && navigator.clipboard.writeText(resource[5]);
      }
    }, {
      title: 'Resource Id',
      id: 'resource_copy_id',
      handler: (event) => {
        const resource = location.hash.match(this.re);
        resource && navigator.clipboard.writeText(resource[1]);
      }
    }, {
      title: 'Resource name and group as Azure CLI option',
      id: 'resource_copy_azcli',
      handler: (event) => {
        const resource = location.hash.match(this.re);
        resource && navigator.clipboard.writeText(`--name ${resource[5]} --resource-group ${resource[2]}`);
      }
    }, {
      title: 'Resource name and group as Azure PowerShell option',
      id: 'resource_copy_azpwsh',
      handler: (event) => {
        const resource = location.hash.match(this.re);
        resource && navigator.clipboard.writeText(`-Name ${resource[5]} -ResourceGroupName ${resource[2]}`);
      }
    }, {
      title: 'ARM template (JSON)',
      id: 'resource_copy_arm_json',
      handler: async (event) => {
        const resource = location.hash.match(this.re);
        if (!resource) return;

        this.getResourceHandler = async (message) => {
          const { result, format, body } = message;
          if (result !== 'succeeded' || format !== 'json') {
            this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
            console.error(message.body);
          } else {
            try {
              await navigator.clipboard.writeText(JSON.stringify(body, null, 2));
              this.toastLayer.childNodes[0].innerHTML = this.icons.done;
            } catch (e) {
              this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
              console.error(message.body);
            }
          }
          this.getResourceHandler = null;
          this.toastLayer.classList.add('fadeOut');
        };
        document.body.appendChild(this.toastLayer);
        this.toastLayer.childNodes[0].innerHTML = this.icons.loading;
        this.send2serviceWorker({ resourceId: resource[1], format: 'json', accessToken: await this.getAccessToken() });
      }
    }, {
      title: 'ARM template (Bicep)',
      id: 'resource_copy_arm_bicep',
      handler: async (event) => {
        const resource = location.hash.match(this.re);
        if (!resource) return;
        this.getResourceHandler = async (message) => {
          const { result, format, body } = message;
          if (result !== 'succeeded' || format !== 'bicep') {
            this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
            console.error(message.body);
          } else {
            try {
              await navigator.clipboard.writeText(body);
              this.toastLayer.childNodes[0].innerHTML = this.icons.done;
            } catch (e) {
              this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
              console.error(message.body);
            }
          }
          this.getResourceHandler = null;
          this.toastLayer.classList.add('fadeOut');
        };
        document.body.appendChild(this.toastLayer);
        this.toastLayer.childNodes[0].innerHTML = this.icons.loading;
        this.send2serviceWorker({ resourceId: resource[1], format: 'bicep', accessToken: await this.getAccessToken() });
      }
    }, {
      title: 'Terraform (AzApi)',
      id: 'resource_copy_terraform_azapi',
      handler: async (event) => {
        const resource = location.hash.match(this.re);
        if (!resource) return;
        this.getResourceHandler = async (message) => {
          const { result, format, body } = message;
          if (result !== 'succeeded' || format !== 'azapi') {
            this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
            console.error(message.body);
          } else {
            try {
              await navigator.clipboard.writeText(body);
              this.toastLayer.childNodes[0].innerHTML = this.icons.done;
            } catch (e) {
              this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
              console.error(message.body);
            }
          }
          this.getResourceHandler = null;
          this.toastLayer.classList.add('fadeOut');
        };
        document.body.appendChild(this.toastLayer);
        this.toastLayer.childNodes[0].innerHTML = this.icons.loading;
        this.send2serviceWorker({ resourceId: resource[1], format: 'azapi', accessToken: await this.getAccessToken() });
      },
      isAvailable: async () => {
        try {
          const response = await fetch(
            `https://management.azure.com${location.hash.match(this.re)[1]?.split('/').slice(0, 3).join('/')}/providers/Microsoft.AzureTerraform?api-version=2021-04-01`,
            {
              headers: {
                Authorization: `Bearer ${await this.getAccessToken()}`
              }
            });
          if (response.status !== 200 || (await response.json()).registrationState != 'Registered') return {
            visible: true,
            available: false,
            message: 'Cannot use AzAPI provider because Microsoft.AzureTerraform might not be registered.'
          };
          return {
            visible: true,
            available: true,
            message: ''
          };
        } catch (e) {
          return {
            visible: true,
            available: false,
            message: 'Failed to check Microsoft.AzureTerraform registration.'
          };
        }
      }
    }, {
      title: 'Terraform (AzureRM)',
      id: 'resource_copy_terraform_azurerm',
      handler: async (event) => {
        const resource = location.hash.match(this.re);
        if (!resource) return;

        this.getResourceHandler = async (message) => {
          const { result, format, body } = message;
          if (result !== 'succeeded' || format !== 'azurerm') {
            this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
            console.error(message.body);
          } else {
            try {
              await navigator.clipboard.writeText(body);
              this.toastLayer.childNodes[0].innerHTML = this.icons.done;
            } catch (e) {
              this.toastLayer.childNodes[0].innerHTML = this.icons.failed;
              console.error(message.body);
            }
          }
          this.getResourceHandler = null;
          this.toastLayer.classList.add('fadeOut');
        };
        document.body.appendChild(this.toastLayer);
        this.toastLayer.childNodes[0].innerHTML = this.icons.loading;
        this.send2serviceWorker({ resourceId: resource[1], format: 'azurerm', accessToken: await this.getAccessToken() });
      },
      isAvailable: async () => {
        try {
          const response = await fetch(
            `https://management.azure.com${location.hash.match(this.re)[1]?.split('/').slice(0, 3).join('/')}/providers/Microsoft.AzureTerraform?api-version=2021-04-01`,
            {
              headers: {
                Authorization: `Bearer ${await this.getAccessToken()}`
              }
            });
          if (response.status !== 200 || (await response.json()).registrationState != 'Registered') return {
            visible: true,
            available: false,
            message: 'Cannot use AzureRM provider because Microsoft.AzureTerraform might not be registered.'
          };
          return {
            visible: true,
            available: true,
            message: ''
          };
        } catch (e) {
          return {
            visible: true,
            available: false,
            message: 'Failed to check Microsoft.AzureTerraform registration.'
          };
        }
      }
    }, {
      title: 'VM and Bastion Ids as `az network bastion` option',
      id: 'resource_copy_vm_bastion',
      handler: async (event) => {
        const resource = location.hash.match(this.re);
        if (!resource || resource[3].toLowerCase() !== 'microsoft.compute' || resource[4].toLowerCase() !== 'virtualmachines') return false;
        if (!this.cache[resource[1]]?.bastionId) return false;
        const bastionId = this.cache[resource[1]]?.bastionId;
        navigator.clipboard.writeText(`--ids ${bastionId} --target-resource-id ${resource[1]} `);
        return true;
      },
      isAvailable: async () => {
        const resource = location.hash.match(this.re);
        if (!resource || resource[3].toLowerCase() !== 'microsoft.compute' || resource[4].toLowerCase() !== 'virtualmachines') return {
          visible: false,
          available: false,
          message: 'Not a virtual machine resource.'
        };
        if (this.cache[resource[1]]?.bastionId) return {
          visible: true,
          available: false,
          message: ''
        };
        try {
          const response = await fetch(
            `https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${await this.getAccessToken()}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(
                {
                  options: { "$top": 1000, "$skip": 0, "$skipToken": "", "resultFormat": "objectArray" },
                  query: this.createBastionQuery(resource[1])
                }
              )
            });
          if (response.status !== 200) return {
            visible: true,
            available: false,
            message: 'Not found Bastion host.'
          };
          const json = await response.json();
          const bastionId = json.data[0].id;
          this.cache[resource[1]] = Object.assign(this.cache[resource[1]] || {}, { bastionId });
        } catch (e) {
          return {
            visible: true,
            available: false,
            message: 'Failed to query Bastion host.'
          };
        }
        return {
          visible: true,
          available: true,
          message: ''
        };
      }
    }];

    this.observer = new MutationObserver(this.addCopyMenu.bind(this));

    this.toastLayer = document.createElement('div');
    this.toastLayer.style.position = 'fixed';
    this.toastLayer.style.top = '0';
    this.toastLayer.style.left = '0';
    this.toastLayer.style.width = '100%';
    this.toastLayer.style.height = '100%';
    this.toastLayer.style.alignContent = 'center';
    this.toastLayer.style.pointerEvents = 'none';
    this.toastLayer.style.animationDuration = '2s';
    this.toastLayer.style.animationFillMode = 'both';
    this.toastLayer.addEventListener("animationend", () => {
      this.toastLayer.parentNode.removeChild(this.toastLayer);
      this.toastLayer.classList.remove('fadeOut');
    });

    this.toastLayer.appendChild(document.createElement('div'));
    this.toastLayer.childNodes[0].style.width = '100px';
    this.toastLayer.childNodes[0].style.height = '100px';
    this.toastLayer.childNodes[0].style.margin = '0 auto';
    this.toastLayer.childNodes[0].style.pointerEvents = 'all';
    this.icons = {
      loading: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect fill="#0078D4" stroke="#0078D4" stroke-width="8" width="30" height="30" x="25" y="85"><animate attributeName="opacity" calcMode="spline" dur="2" values="1;0;1;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="-.4"></animate></rect><rect fill="#0078D4" stroke="#0078D4" stroke-width="8" width="30" height="30" x="85" y="85"><animate attributeName="opacity" calcMode="spline" dur="2" values="1;0;1;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="-.2"></animate></rect><rect fill="#0078D4" stroke="#0078D4" stroke-width="8" width="30" height="30" x="145" y="85"><animate attributeName="opacity" calcMode="spline" dur="2" values="1;0;1;" keySplines=".5 0 .5 1;.5 0 .5 1" repeatCount="indefinite" begin="0"></animate></rect></svg>',
      done: '<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 512 512"><path fill="#32BEA6" d="M504.1,256C504.1,119,393,7.9,256,7.9C119,7.9,7.9,119,7.9,256C7.9,393,119,504.1,256,504.1C393,504.1,504.1,393,504.1,256z"></path><path fill="#FFF" d="M392.6,172.9c-5.8-15.1-17.7-12.7-30.6-10.1c-7.7,1.6-42,11.6-96.1,68.8c-22.5,23.7-37.3,42.6-47.1,57c-6-7.3-12.8-15.2-20-22.3C176.7,244.2,152,229,151,228.4c-10.3-6.3-23.8-3.1-30.2,7.3c-6.3,10.3-3.1,23.8,7.2,30.2c0.2,0.1,21.4,13.2,39.6,31.5c18.6,18.6,35.5,43.8,35.7,44.1c4.1,6.2,11,9.8,18.3,9.8c1.2,0,2.5-0.1,3.8-0.3c8.6-1.5,15.4-7.9,17.5-16.3c0.1-0.2,8.8-24.3,54.7-72.7c37-39.1,61.7-51.5,70.3-54.9c0.1,0,0.1,0,0.3,0c0,0,0.3-0.1,0.8-0.4c1.5-0.6,2.3-0.8,2.3-0.8c-0.4,0.1-0.6,0.1-0.6,0.1l0-0.1c4-1.7,11.4-4.9,11.5-5C393.3,196.1,397,184.1,392.6,172.9z"></path></svg>',
      failed: '<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 40 40"><path fill="#f78f8f" d="M20,38.5C9.799,38.5,1.5,30.201,1.5,20S9.799,1.5,20,1.5S38.5,9.799,38.5,20S30.201,38.5,20,38.5z"></path><path fill="#c74343" d="M20,2c9.925,0,18,8.075,18,18s-8.075,18-18,18S2,29.925,2,20S10.075,2,20,2 M20,1 C9.507,1,1,9.507,1,20s8.507,19,19,19s19-8.507,19-19S30.493,1,20,1L20,1z"></path><path fill="#fff" d="M18.5 10H21.5V30H18.5z" transform="rotate(-134.999 20 20)"></path><path fill="#fff" d="M18.5 10H21.5V30H18.5z" transform="rotate(-45.001 20 20)"></path></svg>'
    };
    this.toastLayer.appendChild(document.createElement('style'));
    this.toastLayer.childNodes[1].innerHTML = `
.fadeOut {
  animation-name: fadeOut;
}
@keyframes fadeOut {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
`;

  }
  createBastionQuery(vmId) {
    return `resources
| where type =~ 'Microsoft.Network/virtualNetworks'
| where array_length(properties.virtualNetworkPeerings) == 0
| project vnetid=tolower(id)
| union (resources
| where type =~ 'Microsoft.Network/virtualNetworks'
| mv-expand peering=properties.virtualNetworkPeerings limit 400
| project vnetid=tolower(id), remoteid=tolower(tostring(peering.properties.remoteVirtualNetwork.id))
)
| join kind= leftouter  (
  resources
  | where type =~ 'Microsoft.Network/networkInterfaces'
  | where properties.virtualMachine.id =~ tolower('${vmId}')
  | project vnetid=tolower(extract('(.*/virtualnetworks/[^/]+)/', 1, tolower(tostring(properties.ipConfigurations[0].properties.subnet.id)))), nicid1=id
  ) on $left.vnetid == $right.vnetid
| join kind= leftouter (
  resources
  | where type =~ 'Microsoft.Network/networkInterfaces'
  | where properties.virtualMachine.id =~ tolower('${vmId}')
  | project vnetid=tolower(extract('(.*/virtualnetworks/[^/]+)/', 1, tolower(tostring(properties.ipConfigurations[0].properties.subnet.id)))), nicid2=id
  ) on $left.remoteid == $right.vnetid
| where not(isempty(nicid1)) or not(isempty(nicid2))
| project vnetid
| join kind=inner (
  resources
  | where type =~ 'microsoft.network/bastionHosts'
  | where sku.name in~ ('standard', 'premium')
  | where properties.enableTunneling == true
  | extend vnetid=tolower(extract('(.*/virtualnetworks/[^/]+)/', 1, tolower(tostring(properties.ipConfigurations[0].properties.subnet.id))))
) on vnetid
| project id
`
  }

  addCopyMenu() {
    this.addCopyMenu1() || this.addCopyMenu2();
  }

  addCopyMenu1() {
    const overviewMenuItem = document.querySelector('section:last-of-type div[role="listitem"]:first-child li[role="listitem"]:first-of-type');
    if (!overviewMenuItem) return false;
    if (!this.re.test(overviewMenuItem.querySelector('a').href)) return false;
    const origDropdownMenu = overviewMenuItem.closest('section')?.querySelector('*:not(.fxs-blade-actiondropmenu)+.fxs-blade-actiondropmenu[id]');
    if (!origDropdownMenu) return false;

    const parent = origDropdownMenu.parentNode;
    if (parent.querySelectorAll('div+.fxs-blade-actiondropmenu').length != 0) return false;
    const copyDropdownMenu = document.createElement('div');
    copyDropdownMenu.classList.add('fxs-blade-actiondropmenu', 'appls-dropdown-menu');
    copyDropdownMenu.innerHTML = origDropdownMenu.innerHTML.replace(/id="[^"]+"/g, '');

    const rootButton = copyDropdownMenu.querySelector('button');
    const copyIcon = rootButton.querySelector('svg>use');
    if (!copyIcon) return false;
    parent.insertBefore(copyDropdownMenu, origDropdownMenu);
    copyIcon.href.baseVal = origDropdownMenu.querySelector('button.fxs-blade-copyname svg>use').href.baseVal;
    rootButton.setAttribute('aria-label', 'More copy actions');
    rootButton.setAttribute('title', 'More copy actions');
    rootButton.addEventListener('click', (event) => {
      event.preventDefault();
      const menu = event.currentTarget.parentNode.querySelector('.fxs-dropmenu-hidden, .fxs-dropmenu-is-open');
      if (menu.classList.contains('fxs-dropmenu-is-open')) {
        menu.classList.remove('fxs-dropmenu-is-open');
        menu.classList.add('fxs-dropmenu-hidden');
      } else {
        menu.classList.remove('fxs-dropmenu-hidden');
        menu.classList.add('fxs-dropmenu-is-open');
      }
    });

    const fxsDropmenuContent = copyDropdownMenu.querySelector('div.fxs-dropmenu-content');
    fxsDropmenuContent.removeChild(copyDropdownMenu.querySelector('div.fxs-blade-dropmenucontent'));
    const fxsBladeDropmenucontent = document.createElement('div');
    fxsBladeDropmenucontent.classList.add('fxs-blade-dropmenucontent');
    fxsBladeDropmenucontent.setAttribute('role', 'presentation');
    fxsBladeDropmenucontent.style.width = '350px';
    this.menus.reduce(async (promise, entry) => {
      await promise;

      if (entry.isAvailable && !await entry.isAvailable()) return;
      const button = document.createElement('button');
      button.setAttribute('role', 'menuitem');
      button.setAttribute('type', 'button');
      button.classList.add('fxs-blade-dropmenubutton');
      button.classList.add('fxs-portal-hover');
      const span = document.createElement('span');
      span.classList.add('fxs-blade-dropmenubuttontxt');
      span.classList.add('msportalfx-text-ellipsis');
      span.innerText = entry.title;
      span.style.paddingLeft = '10px';
      button.appendChild(span);
      button.addEventListener('click', entry.handler.bind(this));
      button.addEventListener('click', (event) => {
        const menu = event.target.closest('.fxs-dropmenu-is-open');
        if (menu) {
          menu.classList.remove('fxs-dropmenu-is-open');
          menu.classList.add('fxs-dropmenu-hidden');
        }
      });

      fxsBladeDropmenucontent.appendChild(button);
      return Promise.resolve(true);
    }, Promise.resolve(true));

    fxsDropmenuContent.appendChild(fxsBladeDropmenucontent);
    origDropdownMenu.querySelector('button.fxs-blade-copyname').style.display = 'none';
    return true;
  }
  addCopyMenu2() {
    const overviewMenuItem = document.querySelector('section:last-of-type div[role="listitem"]:first-child li[role="listitem"]:first-of-type');
    if (!overviewMenuItem) return false;
    if (!this.re.test(overviewMenuItem.querySelector('a').href)) return false;
    const origDropdownMenu = overviewMenuItem.closest('section')?.querySelector('*:not(.fxs-blade-actiondropmenu)+.fxs-blade-actiondropmenu');
    if (!origDropdownMenu) return false;

    const parent = origDropdownMenu.parentNode;
    if (parent.querySelectorAll('div+.fxs-blade-actiondropmenu').length != 0) return false;
    const copyDropdownMenu = document.createElement('div');
    copyDropdownMenu.classList.add('fxs-blade-actiondropmenu');
    copyDropdownMenu.classList.add('appls-dropdown-menu');
    copyDropdownMenu.innerHTML = origDropdownMenu.innerHTML.replace(/id="[^"]+"/g, '');

    const rootButton = copyDropdownMenu.querySelector('button');
    const copyIcon = rootButton.querySelector('svg');
    if (!copyIcon) return;
    parent.insertBefore(copyDropdownMenu, origDropdownMenu);
    copyIcon.innerHTML = '<g><path d="M14 6.3V16H4v-3H0V0h6.7l3 3h1zM4 3h4.3l-2-2H1v11h3zm9 4h-3V4H5v11h8zm-2-1h1.3L11 4.7z"></path></g>';
    copyIcon.setAttribute('viewBox', '0 0 16 16');
    rootButton.setAttribute('aria-label', 'More copy actions');
    rootButton.setAttribute('title', 'More copy actions');

    const menuContainer = document.querySelector('#__appls_advcp') || document.createElement('div');
    menuContainer.id = '__appls_advcp';
    const hidden = (event) => {
      if (event.target == copyDropdownMenu) {
        event.stopPropagation();
        return;
      }
      const menuContainer = document.querySelector('#__appls_advcp');
      if (menuContainer) {
        menuContainer.parentNode.removeChild(menuContainer);
        rootButton.removeAttribute('aria-expanded');
        document.body.removeEventListener('click', hidden);
      }
    }
    const styleClassName = [...document.querySelectorAll('style[id^="fui-FluentProviderr"')].reverse()[0].id;
    menuContainer.classList.add(styleClassName);
    copyDropdownMenu.addEventListener('click', (event) => {
      event.preventDefault();
      if (menuContainer.parentNode) {
        menuContainer.parentNode.removeChild(menuContainer);
        rootButton.removeAttribute('aria-expanded');
        document.body.removeEventListener('click', hidden);
        return;
      }
      rootButton.setAttribute('aria-expanded', 'true');
      document.body.appendChild(menuContainer);
      setTimeout(() => document.body.addEventListener('click', hidden));

      if (menuContainer.childNodes.length > 0) {
        menuContainer.childNodes[0].style.transform = `translate(${copyDropdownMenu.getBoundingClientRect().left}px, ${copyDropdownMenu.getBoundingClientRect().bottom}px)`;
        return;
      };
    });

    const menuSubContainer = document.createElement('div');
    menuSubContainer.setAttribute('role', 'presentation');
    menuSubContainer.setAttribute('data-popper-placement', "bottom-start");
    menuSubContainer.style.overflowY = 'hidden';
    menuSubContainer.style.position = 'absolute';
    menuSubContainer.style.left = '0px';
    menuSubContainer.style.top = '0px';
    menuSubContainer.style.margin = '0px';
    menuSubContainer.style.transform = `translate(${copyDropdownMenu.getBoundingClientRect().left}px, ${copyDropdownMenu.getBoundingClientRect().bottom}px)`;
    menuSubContainer.style.borderRadius = 'var(--borderRadiusMedium)';
    menuSubContainer.style.padding = '4px';
    menuSubContainer.style.border = '1px solid var(--colorControlBorderSecondary)';
    menuSubContainer.style.color = 'var(--colorTextPrimary)';
    menuSubContainer.style.backgroundColor = 'var(--colorContainerBackgroundPrimary)';
    menuContainer.appendChild(menuSubContainer);

    const menuRoot = document.createElement('div');
    menuRoot.setAttribute('role', 'menu');
    menuRoot.setAttribute('aria-labelledby', 'menur1');
    menuRoot.style.gap = '2px';
    menuRoot.style.width = '330px';
    menuRoot.classList.add('fui-MenuList', 'fxs-blade-dropmenucontent');

    menuSubContainer.appendChild(menuRoot);

    const theme = document.head.className.replace(/.*(fxs-mode-(?:dark|light)+).*/, '$1');
    this.menus.reduce(async (promise, entry) => {
      await promise;
      const menuItem = document.createElement('div');
      menuItem.setAttribute('role', 'menuitem');
      menuItem.setAttribute('tabindex', '0');
      menuItem.style.fontSize = '13px';
      menuItem.style.borderRadius = 'var(--borderRadiusMedium)';
      menuItem.style.backgroundColor = 'var(--colorNeutralBackground1)';
      menuItem.style.padding = 'var(--spacingVerticalSNudge) var(--spacingVerticalSNudge)';
      menuItem.style.boxSizing = 'border-box';
      menuItem.style.minHeight = '32px';
      menuItem.style.cursor = 'pointer';

      const menuItemLabel = document.createElement('span');
      menuItemLabel.classList.add('fui-MenuItem__content');
      menuItemLabel.innerText = entry.title;

      const availability = entry.isAvailable ? await entry.isAvailable() : { visible: true, available: true, message: '' };
      menuItem.style.display = (this.options.exclusions || []).includes(entry.id) || !availability.visible ? 'none' : 'flex';
      if (!availability.available) {
        menuItem.style.color = 'var(--colorNeutralForegroundDisabled)';
        menuItem.setAttribute('title', availability.message || 'This action is not available.');
      } else {
        menuItem.addEventListener('click', entry.handler.bind(this));
        menuItem.style.color = 'var(--colorNeutralForeground2)';
        menuItem.setAttribute('onmouseover',
          `const styles=getComputedStyle(document.querySelector('.${styleClassName}'));` +
          `this.style.background=styles.getPropertyValue('--colorControlBackgroundHover');` +
          `this.style.color=styles.getPropertyValue('--colorNeutralForeground2Hover');`
        );
        menuItem.setAttribute('onmouseout',
          `const styles=getComputedStyle(document.querySelector('.${styleClassName}'));` +
          `this.style.background=styles.getPropertyValue('--colorNeutralBackground1');` +
          `this.style.color=styles.getPropertyValue('--colorNeutralForeground2');`
        );
      }
      menuItem.appendChild(menuItemLabel);

      menuRoot.appendChild(menuItem);
      return Promise.resolve(true);
    }, Promise.resolve(true));

    const observer = new MutationObserver(() => {
      const titleCopy = document.querySelector('div.fxs-blade-copyname')
      if (titleCopy) titleCopy.style.display = 'none';
    });
    observer.observe(document.body, { childList: true });
    return true;
  }

  startWatching(options) {
    this.options = options;
    this.addCopyMenu();
    this.observer.observe(document, { childList: true, subtree: true });
  }

  stopWatching() {
    super.stopWatching();
    document.querySelectorAll('.appls-dropdown-menu').forEach((menu) => {
      menu.parentNode.removeChild(menu);
    });
    document.querySelectorAll('section button.fxs-blade-copyname').forEach(b => {
      b.style.display = '';
    });

  }

  async send2serviceWorker(message) {
    const msg = this.messageQueue.shift() || Object.assign({ type: 'get-resource-template' }, message);
    try {
      await this.port.postMessage(msg);
    } catch {
      this.messageQueue.push(msg);
      this.port = chrome.runtime.connect({ name: 'get-resource-template' });
      this.port.onMessage.addListener(this.onMessage.bind(this));
    }
  }

  async onMessage(message/* , sender, sendResponse */) {
    switch (message.type) {
      case 'connected':
        this.tab = message.tab;
        if (this.messageQueue.length > 0) await this.send2serviceWorker();
        break;
      case 'resource-template':
        this.getResourceHandler && this.getResourceHandler(message);
        break;
      case 'pong':
        console.debug(message.type);
        break;
    }
  }
}

class FaviconUpdater extends Watcher {
  constructor() {
    super();

    this.exceptionTables = [{
      hash: '#view/HubsExtension/BrowseResource/resourceType/Microsoft.Web%2Fsites',
      type: 72
    }, {
      hash: '#browse/Microsoft.Web%2Fsites',
      type: 72
    }];
    this.faviconOrig = document.querySelectorAll('link[rel="icon"][type="image/x-icon"]')[0];

    if (!this.faviconOrig) {
      this.faviconOrig = document.createElement('link');
      this.faviconOrig.setAttribute('rel', 'icon');
      this.faviconOrig.setAttribute('type', 'image/x-icon');
      this.faviconOrig.setAttribute('href', '/Content/favicon.ico');
    }
    this.faviconAzureResource = document.createElement('link');
    this.head = document.head;
    this.faviconAzureResource.setAttribute('rel', 'icon');
    this.faviconAzureResource.setAttribute('type', 'image/svg+xml');
    [...this.head.querySelectorAll('link[rel*="shortcut"][rel*="icon"]')].forEach((icon/* , i, array */) => {
      this.head.removeChild(icon);
    });

    this.observer = new MutationObserver(async (mutations) => {
      if (mutations.filter((mutation) => (mutation.type === 'attributes')
        ? mutation.target.nodeName.toLowerCase() === 'div' && mutation.attributeName === 'class' && mutation.target.classList.contains('fxs-sidebar')
        : [...mutation.addedNodes].filter((addedNode) => {
          return addedNode.nodeName.toLowerCase() !== 'link' || addedNode.getAttribute('rel') !== 'icon';
        }).length > 0
      ).length === 0) return;
      this.updateFavicon();
    })
  }
  updateFavicon() {
    const mainIconContainers = [
      ...document.querySelectorAll('section:last-of-type div[role="group"]:first-child li[role="listitem"]:first-of-type'),
      ...document.querySelectorAll('section:last-of-type div[role="listitem"]:first-child li[role="listitem"]:first-of-type'),
      ...(
        document.querySelectorAll('.fxs-sidebar-menu-activated .fxs-sidebar-menu-container').length > 0 &&
          getComputedStyle(document.querySelectorAll('div.fxs-sidebar-menu-container')[0]).display !== 'none'
          ? document.querySelectorAll('div.fxs-sidebar-menu-container div[role="listitem"]:first-child li[role="listitem"]:first-of-type')
          : []
      ),
    ];
    const listIconSvgs = [...document.querySelectorAll('section:last-of-type .ext-hubs-artbrowse-grid div.fxc-gc-row-content>div:nth-child(2) svg')];
    const listResTypes = [...document.querySelectorAll('section:last-of-type .ext-hubs-artbrowse-grid div.fxc-gc-row-content>div:nth-child(2) a')].map((a) => {
      return a.href.replace(/^.*\/providers\//, '').split('/').filter((_, i/* , array */) => i == 0 || i % 2 == 1).join('/');
    });
    const isRG = /resourceGroups\/[^/]+\/[^/]*$/.test(location.hash);
    const oneTypeInList = listResTypes.length > 0 ? listResTypes.every((type/* , i, array */) => listResTypes[0] === type) : true;
    const oneSvgInList = listIconSvgs.length > 0 ? listIconSvgs.every((svg/* , i, array */) => listIconSvgs[0].outerHTML === svg.outerHTML) : true
    const oneIcon = !isRG && oneTypeInList && oneSvgInList;
    const noResIconSvgs = isRG ? [] : document.querySelectorAll('section:last-of-type div.ext-hubs-artbrowse-empty div.msportalfx-svg-disabled svg');
    if (mainIconContainers.length === 0 && (noResIconSvgs.length === 0)) {
      if (listIconSvgs.length === 0 || isRG || !oneTypeInList) {
        this.updateFaviconCore();
        return;
      }
      if (!oneSvgInList) {
        const type = this.exceptionTables.filter((ex/* , i, array */) => ex.hash === location.hash)[0].type;

        this.faviconAzureResource.href = `data:image/svg+xml,${encodeURIComponent(this.getSvgDataByType(type))}`;
        this.updateFaviconCore(this.faviconAzureResource);
        return;
      }
    }
    const mainIcon = mainIconContainers.length > 0 ? mainIconContainers[0].querySelectorAll('svg,img')[0] : null;
    if ((!mainIcon && (!listIconSvgs[0] || !oneIcon) && !noResIconSvgs[0])) {
      !mainIcon && this.updateFaviconCore();
      return;
    }
    const lastFavicon = noResIconSvgs[0] || (oneIcon ? (listIconSvgs[0] || mainIcon) : (mainIcon || listIconSvgs[0]));

    this.faviconAzureResource.href = lastFavicon.src || `data:image/svg+xml,${encodeURIComponent(this.getSvgData(lastFavicon))}`;
    this.updateFaviconCore(this.faviconAzureResource);
  }

  startWatching(options) {
    this.options = options;
    this.updateFavicon();
    this.observer.observe(document, { childList: true, subtree: true, attributes: true });
  }

  stopWatching() {
    super.stopWatching();
    this.updateFaviconCore(this.faviconOrig);
  }

  updateFaviconCore(faviconLink) {
    const _faviconLink = faviconLink || this.faviconOrig;
    const links = this.head.querySelectorAll('link[rel="icon"]');
    if (links[0] === _faviconLink) return;
    [...links].forEach((link/* , i, array */) => {
      this.head.removeChild(link);
    });
    this.head.appendChild(_faviconLink);
  }

  classNames2style(classNames) {
    const styleObj = classNames.reduce((prev, curr/* , i, array */) => {
      if (curr.trim() === "") return prev;
      [...document.styleSheets].forEach((styleSheet/* , i, array */) => {
        [...styleSheet.cssRules].forEach((rule/* , i, array */) => {
          if (rule.selectorText !== `.${curr}`) return;
          prev[rule.style[0]] = rule.style[rule.style[0]];
        });
      });
      return prev;
    }, {});
    return `style="${Object.keys(styleObj).reduce((prev, curr/* , i, array */) => {
      return `${prev}${curr}: ${styleObj[curr]}; `
    }, '').trim()}"`;
  }

  getSvgData(svg) {
    const use = svg.querySelector('use');
    if (!use) return svg.outerHTML;
    const symbolElm = document.querySelector(use.getAttribute('href'));
    const symbolContent = symbolElm.firstChild.outerHTML;
    const styledSymbolContent = [...symbolContent.matchAll(/ class="([^"]+)"/g)].reduce((prev, curr/* , i, array */) => {
      const styleText = this.classNames2style(curr[1].split(/ /));
      return prev.replaceAll(` class="${curr[1]}"`, ` ${styleText}`);
    }, symbolContent);
    return `<svg xmlns="http://www.w3.org/2000/svg" height="100%" width="100%" viewBox="${symbolElm.getAttribute('viewBox')}" aria-hidden="true" role="presentation" focusable="false">${[...styledSymbolContent.matchAll(/url\(#([^\)]*)\)/g)].reduce((prev, curr/* , i, array */) => {
      return `${document.getElementById(curr[1]).outerHTML}${prev}`;
    }, styledSymbolContent)}</svg>`;
  }
  getSvgDataByType(type) {
    const symbolElm = document.querySelector(`[data-type="${type}"]`);
    if (!symbolElm) return null;
    const symbolContent = symbolElm.firstChild.outerHTML;
    const styledSymbolContent = [...symbolContent.matchAll(/ class="([^"]+)"/g)].reduce((prev, curr/* , i, array */) => {
      const styleText = this.classNames2style(curr[1].split(/ /));
      return prev.replaceAll(` class="${curr[1]}"`, ` ${styleText}`);
    }, symbolContent);
    return `<svg xmlns="http://www.w3.org/2000/svg" height="100%" width="100%" viewBox="${symbolElm.getAttribute('viewBox')}" aria-hidden="true" role="presentation" focusable="false">${[...styledSymbolContent.matchAll(/url\(#([^\)]*)\)/g)].reduce((prev, curr/* , i, array */) => {
      return `${document.getElementById(curr[1]).outerHTML}${prev}`;
    }, styledSymbolContent)}</svg>`;
  }
}

class FaviconBlinker extends Watcher {
  constructor() {
    super();
    this.TARGET_CLASS = 'fxs-display-none'

    const notificationsPaneSelector = '.fxs-notificationspane-progressbar';
    this.faviconOrig = document.querySelectorAll('link[rel="icon"][type="image/x-icon"]')[0];

    if (!this.faviconOrig) {
      this.faviconOrig = document.createElement('link');
      this.faviconOrig.setAttribute('rel', 'icon');
      this.faviconOrig.setAttribute('type', 'image/x-icon');
      this.faviconOrig.setAttribute('href', '/Content/favicon.ico');
    }
    this.faviconBlank = document.createElement('link');
    this.head = document.head;
    this.faviconBlank.href = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAhElEQVR4Xu3VAREAMAwCseLfdIV85qAcGbv4W/z+E4AGxBNAIF4AnyACCMQTQCBeACuAAALxBBCIF8AKIIBAPAEE4gWwAgggEE8AgXgBrAACCMQTQCBeACuAAALxBBCIF8AKIIBAPAEE4gWwAgggEE8AgXgBrAACCMQTQCBeACuAQJ3AA2jYAEGs/2CBAAAAAElFTkSuQmCC';
    this.faviconBlank.setAttribute('rel', 'icon');
    this.faviconBlank.setAttribute('type', 'image/png');
    [...this.head.querySelectorAll('link[rel*="shortcut"][rel*="icon"]')].forEach((icon/* , i, array */) => {
      this.head.removeChild(icon);
    });

    this.onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "Are you sure you want to leave?";
      return event.returnValue;
    };

    const observer = new MutationObserver((/* mutations */) => {
      this.notificationsPane = document.querySelector(notificationsPaneSelector);
      if (!this.notificationsPane) return;

      observer.disconnect();

      let currentClasses = this.notificationsPane.className;
      this.observer = new MutationObserver((mutatons) => {
        mutatons.forEach((mutation/* , i, array */) => {
          if (mutation.attributeName !== 'class') return;
          if (currentClasses.indexOf(this.TARGET_CLASS) >= 0 && this.notificationsPane.className.indexOf(this.TARGET_CLASS) < 0) {
            this.faviconOrig = document.querySelectorAll('link[rel="icon"]')[0];
            this.startBlinking();
          } else if (currentClasses.indexOf(this.TARGET_CLASS) < 0 && this.notificationsPane.className.indexOf(this.TARGET_CLASS) >= 0) {
            this.stopBlinking();
          }
          currentClasses = this.notificationsPane.className;
        });
      });
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true });
  }
  blinkFavicon(params) {
    this.timeout = setTimeout(() => {
      const current = document.querySelectorAll('link[rel="icon"]')[0];
      this.head.removeChild(current);
      if (current === this.faviconBlank) this.head.appendChild(this.faviconOrig);
      else {
        this.faviconOrig = current;
        this.head.appendChild(this.faviconBlank);
      }
      this.blinkFavicon(params);
    }, params.interval);
  }
  startBlinking() {
    this.blinkFavicon({
      interval: 500
    });
    (window.parent === window) && window.addEventListener('beforeunload', this.onBeforeUnload);
  }
  stopBlinking() {
    clearTimeout(this.timeout);
    this.timeout = null;
    this.head.removeChild(document.querySelectorAll('link[rel="icon"]')[0]);
    this.head.appendChild(this.faviconOrig);
    (window.parent === window) && window.removeEventListener('beforeunload', this.onBeforeUnload);
  }
  startWatching(options) {
    this.options = options;
    const observeStart = () => {
      setTimeout(() => {
        if (this.notificationsPane) this.observer.observe(this.notificationsPane, { attributes: true });
        else observeStart();
      }, 100)
    };
    observeStart();
  }

  stopWatching() {
    super.stopWatching();
    this.timeout && this.stopBlinking();
  }
}

class ToastWatcher extends Watcher {
  constructor() {
    super();
    this.TARGET_CLASS_TOAST = '.fxs-toast';
    this.messageQueue = [];

    this.observer = new MutationObserver(this.mainObserverCallback.bind(this));
  }

  mainObserverCallback(mutations) {
    mutations.forEach((mutation/* , i, array */) => {
      Array.prototype.forEach.call(mutation.addedNodes, (addedNode/* , i, array */) => {
        if (!addedNode.innerHTML || !/<use [^>]+><\/use>/.test(addedNode.innerHTML) || addedNode.parentNode.className !== 'fxs-toast-icon') return;
        this.send2serviceWorker();
      });
    });
  }
  send2serviceWorker() {
    throw new Error('You have to implement the method send2serviceWorker!');
  }


  startWatching(options) {
    this.options = options;
    const toastContainer = document.querySelector(this.TARGET_CLASS_TOAST);
    if (toastContainer) {
      this.observer.observe(document.querySelector(this.TARGET_CLASS_TOAST), { childList: true, subtree: true });
      return
    }
    const toastContainerObserver = new MutationObserver((/* mutations */) => {
      const toastContainer = document.querySelector(this.TARGET_CLASS_TOAST);
      if (!toastContainer) return;
      toastContainerObserver.disconnect();
      this.observer.observe(document.querySelector(this.TARGET_CLASS_TOAST), { childList: true, subtree: true });
    });
    toastContainerObserver.observe(document, { childList: true, subtree: true });
  }

  async onMessage(message/* , sender, sendResponse */) {
    switch (message.type) {
      case 'connected':
        this.tab = message.tab;
        if (this.messageQueue.length > 0) await this.send2serviceWorker();
        break;
      case 'pong':
        console.debug(message.type);
        break;
    }
  }
}

class TabActivator extends ToastWatcher {
  constructor() {
    super();
  }

  async send2serviceWorker() {
    const msg = this.messageQueue.shift() || {
      type: 'tab-activation',
      tab: this.tab
    };
    try {
      await this.port.postMessage(msg);
    } catch {
      this.messageQueue.push(msg);
      this.port = chrome.runtime.connect({ name: 'tab-activation' });
      this.port.onMessage.addListener(this.onMessage.bind(this));
    }
  }

}

class DesktopNotifier extends ToastWatcher {
  constructor() {
    super();
    this.faviconOrig = document.querySelectorAll('link[rel="icon"][type="image/x-icon"]')[0];
  }

  async send2serviceWorker() {
    const title = document.querySelectorAll('.fxs-toast-title')[0].innerText;
    const message = document.querySelectorAll('.fxs-toast-description')[0].innerText;
    const msg = this.messageQueue.shift() || {
      type: 'notification',
      notificationOptions: {
        iconUrl: this.faviconOrig.href,
        contextMessage: 'contextMessage',
        isClickable: true,
        message,
        priority: 0,
        requireInteraction: true,
        silent: false,
        title,
        type: 'basic'
      },
      tab: this.tab
    };
    try {
      await this.port.postMessage(msg);
    } catch {
      this.messageQueue.push(msg);
      this.port = chrome.runtime.connect({ name: 'desktop-notification' });
      this.port.onMessage.addListener(this.onMessage.bind(this));
    }
  }
}

class ContextMenuUpdater extends Watcher {
  constructor() {
    super();
    this.messageQueue = [];
  }
  async send2serviceWorker() {
    const msg = this.messageQueue.shift() || {
      type: 'tab-loaded',
      url: location.href
    };
    try {
      await this.port.postMessage(msg);
    } catch {
      this.messageQueue.push(msg);
      this.port = chrome.runtime.connect({ name: 'tab-loaded' });
      this.port.onMessage.addListener(this.onMessage.bind(this));
    }
  }

  startWatching(options) {
    document.addEventListener('readystatechange', async () => {
      if (document.readyState !== 'complete') return;
      console.log('loaded');
      this.send2serviceWorker();
    });
  }

  async onMessage(message/* , sender, sendResponse */) {
    switch (message.type) {
      case 'connected':
        this.tab = message.tab;
        if (this.messageQueue.length > 0) await this.send2serviceWorker();
        break;
      case 'pong':
        console.debug(message.type);
        break;
    }
  }
}

const storeAccessToken = async () => {
  const CLIENT_ID = 'c44b4083-3bb0-49c1-b47d-974e53cbdf3c';
  const SCOPES = ['https://management.core.windows.net//user_impersonation', 'https://management.core.windows.net//.default'];
  const tenantId = localStorage.getItem('SavedDefaultDirectory') || document.querySelectorAll('button.fxs-menu-account')[0].getAttribute('title').split(/\n/)[2].replace(/.*\(([\da-f]{8}(?:-[\da-f]{4}){4}[\da-f]{8})\)/, '$1');
  const key = [
    ...JSON.parse(sessionStorage.getItem(`msal.1.token.keys.${CLIENT_ID}`) || '{}').accessToken || [],
    ...JSON.parse(sessionStorage.getItem(`msal.token.keys.${CLIENT_ID}`) || '{}').accessToken || []
  ].find(entry => SCOPES.some((scope) => entry.includes(scope) && entry.includes(tenantId)));
  const accessToken = key ? JSON.parse(sessionStorage.getItem(key)).secret : null;

  await chrome.storage.local.set({ accessToken });
  return accessToken;
};

(async () => {
  try {
    const _watchers = {};
    _watchers['replaceFavicon'] = new FaviconUpdater();
    _watchers['blinkFavicon'] = new FaviconBlinker();
    _watchers['desktopNotification'] = new DesktopNotifier();
    _watchers['activateTab'] = new TabActivator();
    _watchers['advancedCopy'] = new AdvancedCopy();
    _watchers['filterRestorer'] = new FilterRestorer();
    _watchers['contextMenuUpdater'] = new ContextMenuUpdater();
    // _watchers['visibilityRestorer'] = new VisibilityRestorer();

    const init = async (changes) => {
      const watcherStatus = await (async (changes, watchers) => {
        if (!changes) return await chrome.storage.local.get(Object.keys(watchers));
        return Object.fromEntries(Object.entries(changes).map(c => [c[0], c[1].newValue]))
      })(changes, _watchers);

      watcherStatus['contextMenuUpdater'] = { status: true };
      Object.keys(watcherStatus).forEach(w => {
        if (!watcherStatus[w] || !_watchers[w]) return;
        if (watcherStatus[w].status) _watchers[w].startWatching(watcherStatus[w].options);
        else _watchers[w].stopWatching();
      });
    }
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local' || (Object.keys(changes).length === 1 && changes['accessToken'])) return;
      init(changes);
    });
    init();
    setInterval(async () => {
      await storeAccessToken();
    }, 10000);
  } catch (e) {
    console.error(e)
  }
})();