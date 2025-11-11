# Release History
## [1.1.2](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/1.1.2)
### New feature(s)
  - Cloud Shell: support opening Cloud Shell in a new tab

## [1.1.1](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/1.1.1)
### Improve feature(s)
  - Options / UI: add default css for resource group list decoration

### Bug Fix(es)
  - Cloud Shell: Improve logic for custom startup scripts

## [1.1.0](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/1.1.0)  (Unreleased on Chrome Web Store)
### New feature(s)
  - Cloud Shell: support executing custom startup scripts (bash only) with options to show executed commands and record to command history.
  - Cloud Shell: add `code` command helper to open files in `insiders.vscode.dev` (bash only).
  - Options / UI: add new Cloud Shell settings to the options page and popup to control the above features.

### Bug Fix(es)
  - Cloud Shell: Improve logic for keep Cloud Shell session alive

### Remove feature(s)
  - No features removed in this release.

## [1.0.2](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/1.0.2)
### Bug Fix(es)
  - Fix handling access token.

## [1.0.1](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/1.0.1)
### Bug Fix(es)
  - Fix restoring filter string feature
  - Fix decorating resouce group feature

## [1.0.0](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/1.0.0)
### Rename this extension

## 0.0.11 (Unreleased)
### New feature(s)
  - Add a feature to keep Azure Cloud Shell session more then 20 minutes
### Bug Fix(es)
  - Fix handling access token
### Remove feature(s)
  - Remove a feature to restore the flag for hidden resources on each list view.

## [0.0.10](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.10)

### New feature(s)
  - Add a feature to restore the flag for hidden resources on each list view.
  - Add a feature to decorate resource group list depending on the number of included resource in the group  ([#33](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/issues/33)).
### Improve feature(s)
  - Improve access token management
### Bug Fix(es)
  - Fix object handling in notification process ([#34](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/issues/34))  

And a trademark footnote for `Azure` on the popup window.

## [0.0.9](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.9)

### Improve feature(s)
  - Add copying resource IDs of Bastion and VM for `az network bastion` command to advanced copy feature
### Bug Fix(es)
  - Advanced Copy cannot copy ARM Template(JSON)

## [0.0.8](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.8)

### New feature(s)
  - Add a feature to open a resource in the preview portal.
### Improve feature(s)
  - Add Bicep and Terraform format to advanced copy feature
### Bug Fix(es)
  - Advanced Copy doesn't show for specific accounts ([#26](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/issues/26))  

## [0.0.7](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.7)

### New feature(s)
  - Add a feature to restore fitler string on each list view.

## [0.0.6](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.6)

### Bug fix(es)
  - Cannot keep a resource icon as the favicon when hiding the sidebar ([#15](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/issues/15))  
### Improve feature(s)
  - Copy ARM template(JSON)

## [0.0.5](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.5)

### New feature(s)
  - Add a feature to copy resource infomation in various formats.

## [0.0.4](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.4)

### Improve feature(s)
  - Add beforeunload event listener to prevent accidental page leave during blinking favicon ([#8](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/pull/8))
### New feature(s)
  - Activate the tab opening Azure portal (i.e. bring it to the top) automatically when finishing a process taking long time ([#9](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/pull/9))

## [0.0.3](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.3)

### Bug fix(es)
  - Refactor main.js to update favicon containers ([#6](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/pull/6))

## [0.0.2](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.2)

### New feature(s)
  - Add the following origins ([#1](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/issues/1))
      - `ms.portal.azure.com`
      - `preview.portal.azure.com`

## [0.0.1](https://github.com/horihiro/TweakIt-for-Azure-ChromeExtension/releases/tag/0.0.1)
The First release

### Basic feature(s)
  - Replace favicon to one of the resource displayed
  - Blink favicon during configuration
  - Notify when finishing configuration 
