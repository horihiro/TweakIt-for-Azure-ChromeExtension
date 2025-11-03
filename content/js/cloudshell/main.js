const ASCII = {
  ESC: '',
  DEL: '',
  ETX: '',
}

class KeepCloudShellSession {
  constructor() {
    this.timeout = 0;
    this.pingTimeout = 600000; // 10 minutes
    this.pingString = ` ${ASCII.DEL}`; // space + backspace
  }
  onMessageHandler() {
    this.timeout && clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.socket.send(this.pingString);
    }, this.pingTimeout);
  }
  start(socket) {
    this.socket = socket;
    this.socket.addEventListener('message', this.onMessageHandler.bind(this));
    this.socket.send(this.pingString);
  }
  stop() {
    this.timeout && clearTimeout(this.timeout);
    this.timeout = 0;
    this.socket && this.socket.removeEventListener('message', this.onMessageHandler.bind(this));
  }
}

class CommandExecutor {
  execute(command, termination, options = { background: true, history: true }) {
    if (!command || !termination) return Promise.reject(new Error('Invalid command or termination string.'));

    return new Promise((resolve, reject) => {
      const socket = sockets.find(s => !s.url.endsWith('/control'));
      const terminal = window.term;
      const { background, history } = options;

      const originalTerminalWrite = terminal.write.bind(terminal);
      if (socket?.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket is not open.');
        reject(new Error('WebSocket is not open.'));
        return;
      }
      const commandWithNewline = `${history ? '' : ' '}${(command.trim().endsWith('&') ? `${command.trim()} disown` : command.trim()) + (globalSettings.shellType === 'bash' ? '\n' : '\r')}`;
      let response = '';
      let timeout = null;
      terminal.write = (data) => {
        timeout && clearTimeout(timeout);
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        response += str;
        const finishCommand = () => {
          timeout = null;
          response = (
            response.endsWith(termination)
              ? response.slice(0, response.lastIndexOf(termination))
              : response
          )
            .replaceAll(/\[\??[\d;]*[a-zA-Z]/g, '')
            .replaceAll(/[\r\n]+/g, '\n');
          resolve(response.startsWith(commandWithNewline) ? response.slice(commandWithNewline.length) : response);
        };
        if (!background) {
          terminal.write = originalTerminalWrite;
          terminal.write(str);
          timeout = setTimeout(finishCommand, 100);
          return;
        }
        if (!response.endsWith(termination)) return;
        terminal.write = originalTerminalWrite;
        timeout = setTimeout(finishCommand, 100);
      };
      socket.send(commandWithNewline);
    });
  }
}

const keepCloudShellSession = new KeepCloudShellSession();
const commandExecutor = new CommandExecutor();

const sockets = [];
const defaultStartupCommands = [
  // Default startup commands
  { command: { bash: 'export TWEAKIT_INJECTED=1', pwsh: '$Env:TWEAKIT_INJECTED=1' }, background: true, history: false },
  // { command: 'alias ll="ls -la"', background: true, history: false },
  // { command: `function tree() { cd $1 && pwd;find . | sort | sed '1d;s/^\\.//;s/\\/\\([^/]*\\)$/|--\\1/;s/\\/[^/|]*/|  /g' && cd - > /dev/null; }`, background: true, history: false },
];

const originalWebSocket = window.WebSocket;
window.WebSocket = function (...args) {
  const socket = new originalWebSocket(...args);
  socket.addEventListener('open', socketOpenHandler);
  socket.addEventListener('close', socketCloseHandler);
  sockets.push(socket);
  return socket;
};
window.WebSocket.CONNECTING = 0;
window.WebSocket.OPEN = 1;
window.WebSocket.CLOSING = 2;
window.WebSocket.CLOSED = 3;


const PROMPT_LEADING_PATTERN = {
  bash: `${ASCII.ESC}\\[\\?2004h`,
  pwsh: `PS [\\s\\S]*> `,
};

const globalSettings = {
  shellPrompt: '',
  user: '',
  endpoint: {
    host: '',
    path: '',
  },
  tweakitOptions: {}
};

const init = () => {
  if (!window.term || !globalSettings.shellPrompt || sockets.length < 2 || !sockets.every(s => s.readyState === WebSocket.OPEN)) return;
  dispatchEvent(new CustomEvent('cloudShellInitialized'));
};

const terminalReadyObserver = new MutationObserver((_, observer) => {
  if (!window.term) return;
  console.debug('Terminal is installed.');
  observer.disconnect();
  init();
});
window.addEventListener('DOMContentLoaded', () => {
  terminalReadyObserver.observe(document.body, { childList: true, subtree: true });
});

const socketCloseHandler = (e) => {
  const socket = e.target;
  socket.removeEventListener('close', socketCloseHandler);
  sockets.findIndex(s => s === socket) >= 0 && sockets.splice(sockets.findIndex(s => s === socket), 1);
  if (sockets.length === 0) {
    globalSettings.shellPrompt = '';
  }
  keepCloudShellSession.stop();
};
const socketOpenHandler = (e) => {
  const socket = e.target;
  socket.removeEventListener('open', socketOpenHandler);
  if (socket.url.endsWith('/control')) {
    init();
    return;
  }

  socket.addEventListener('message', socketMessageHandler);
  const [_, host, path] = socket.url.match(/wss:\/\/([^\/]+)\/\$hc\/([^\/]+)\/.*/);
  globalSettings.endpoint = { host, path };

  defaultStartupCommands.push(
    { command: { bash: `export SOCKET_HOST=${globalSettings.endpoint.host}`, pwsh: `$Env:SOCKET_HOST=${globalSettings.endpoint.host}` }, background: true, history: false },
    { command: { bash: `export SOCKET_PATH=${globalSettings.endpoint.path}`, pwsh: `$Env:SOCKET_PATH=${globalSettings.endpoint.path}` }, background: true, history: false }
  );

  init();
};

const socketMessageHandler = (e) => {
  const socket = e.target;
  if (new TextDecoder().decode(e.data).startsWith('Welcome')) return;

  socket.removeEventListener('message', socketMessageHandler);
  const originalTerminalWrite = window.term.write.bind(window.term);
  let promptDetecting = false;
  let currentPrompt = '';
  let promptTimeout = null;

  globalSettings.shellType = document.querySelector('i[data-icon-name="Swap"]~span')?.innerText.includes('PowerShell') ? 'bash' : 'pwsh';
  console.debug('Shell type: ', globalSettings.shellType);

  // if (globalSettings.shellType !== 'bash') return;
  window.term.write = (data) => {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    originalTerminalWrite(data);

    if (!['bash', 'pwsh'].includes(globalSettings.shellType)) return;
    const notifyPromptUpdated = () => {
      return setTimeout(() => {
        promptTimeout = null;
        promptDetecting = false;
        if (globalSettings.shellPrompt === currentPrompt) return;
        globalSettings.shellPrompt = currentPrompt;
        window.dispatchEvent(new CustomEvent('shellPromptUpdated', { detail: { shellPrompt: globalSettings.shellPrompt } }));
      }, 10);
    };
    if (str.match(new RegExp(PROMPT_LEADING_PATTERN[globalSettings.shellType]))) {
      currentPrompt = str.replace(
        new RegExp(`[\\s\\S]*(${PROMPT_LEADING_PATTERN[globalSettings.shellType]}[^\\n\\r]*)[\\s\\S]*$`),
        '$1'
      );
      promptDetecting = globalSettings.shellType === 'bash';
      promptTimeout = notifyPromptUpdated();
      return;
    }
    if (promptDetecting) {
      currentPrompt += str.split(/\r|\n/).reverse().find(line => line.trim() !== '');
      if (promptTimeout) clearTimeout(promptTimeout);
      promptTimeout = notifyPromptUpdated();
    }
  };
};

window.addEventListener('shellPromptUpdated', async (e) => {
  console.debug('shellPromptUpdated event received:', e.detail);
  init();
});

window.addEventListener('startupFeatureStatus', async (e) => {
  console.debug('startupFeatureStatus event received:', e.detail);
  window.dispatchEvent(new CustomEvent('updateFeatureStatus', { detail: e.detail }));
  globalSettings.tweakitOptions = { ...e.detail };
  const startupCommands = defaultStartupCommands.map(options => {
    return {
      command: options.command[globalSettings.shellType],
      background: options.background,
      history: options.history,
    };
  });

  if (globalSettings.shellType !== 'bash') return;

  try {
    globalSettings.shellType === 'bash' && e.detail.replaceCodeCommand?.status &&
      startupCommands.push({
        command: `function code () {
  dirname="$(cd -- "$(dirname -- "$1")" && pwd)" || exit $?
  abspath="\${dirname%/}/$(basename -- "$1")"
  vscode tunnel --random-name --server-data-dir \${HOME}/code | sed -r "s|(https:\/\/insiders.vscode.dev\/[^ ]+)|\\1\${abspath}|"
}`,
        background: true,
        history: false,
      });
    globalSettings.shellType === 'bash' && e.detail.executeStartupScript?.status &&
      e.detail.executeStartupScript.options?.script &&
      startupCommands.push({
        command: e.detail.executeStartupScript.options.script[globalSettings.shellType],
        background: e.detail.executeStartupScript.options.disabledOptions?.includes('cloudshell_enable_startup_visible'),
        history: !e.detail.executeStartupScript.options.disabledOptions?.includes('cloudshell_enable_startup_history'),
      });

    globalSettings.shellType === 'bash' && e.detail.executeDockerDaemon?.status &&
      startupCommands.push({
        command: 'startupDocker() { test ${DOCKER_HOST} || : && { ps aux | grep "[r]ootlesskit" > /dev/null && : || { BIN_DIR=${HOME}/.local/bin;TARGET_FILE=${BIN_DIR}/start-rootless-docker.sh;BACKUP_FILE=${TARGET_FILE}-$(date "+%Y-%m-%b-%d-%H-%M-%S");cp ${TARGET_FILE} ${BACKUP_FILE};sed -E \'s/^(CONDITIONAL_FLAGS="--iptables=false)[^"]+"/\\1"/\' ${BACKUP_FILE} > ${TARGET_FILE};chmod +x ${TARGET_FILE};curl -s "https://$SOCKET_HOST/$SOCKET_PATH/tunnel" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $(az account get-access-token --query "accessToken" --output tsv)" -d "{\\"token\\": \\"$(az account get-access-token --query "accessToken" --output tsv --scope 46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2/all)\\", \\"folderPath\\": \\"\\", \\"tunnelName\\": \\"tweakit\\", \\"extensions\\": []}">/dev/null;VSCODE_PID=$(ps aux | grep "[v]scode tunnel" | tail -n 1 | awk \'{print $2}\'); test ${VSCODE_PID};kill ${VSCODE_PID};vscode tunnel prune > /dev/null;sleep 5;DOCKER_ENGINE_VERSION=$(docker version | grep "Server" -A 2 | grep "Version" | awk \'{print $2}\');test ${DOCKER_ENGINE_VERSION} || : && { curl -sL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_ENGINE_VERSION}.tgz" -o ${BIN_DIR}/docker-${DOCKER_ENGINE_VERSION}.tgz;tar -xzvf ${BIN_DIR}/docker-${DOCKER_ENGINE_VERSION}.tgz -O docker/docker-proxy > ${BIN_DIR}/docker-proxy 2>/dev/null;chmod +x ${BIN_DIR}/docker-proxy; rm ${BIN_DIR}/docker-${DOCKER_ENGINE_VERSION}.tgz; }; }; }; };',
        background: true,
        history: false,
      }, {
        command: 'startupDocker 2>&1 > /dev/null &',
        background: true,
        history: false,
      }, {
        command: 'unset -f startupDocker',
        background: true,
        history: false,
      });

    // Execute all startup commands
    await startupCommands.reduce(async (p, options) => {
      await p;
      return commandExecutor.execute(
        options.command,
        globalSettings.shellPrompt,
        {
          background: options.background,
          history: options.history
        }
      );
    }, Promise.resolve());
    globalSettings.user = (await commandExecutor.execute('whoami', globalSettings.shellPrompt, { background: true, history: false })).trim();
  }
  catch (err) {
    console.error('Error executing startup commands:', err);
  }
});

window.addEventListener('updateFeatureStatus', async (e) => {
  console.debug('updateFeatureStatus event received:', e.detail);
  Object.keys(e.detail).forEach(k => {
    if (!e.detail[k]?.newValue) return
    globalSettings.tweakitOptions[k] = e.detail[k].newValue;
  });

  if (globalSettings.tweakitOptions.accessToken) {
    const response = await fetch('https://management.azure.com/providers/Microsoft.Portal/userSettings/cloudconsole?api-version=2023-02-01-preview', {
      headers: {
        Authorization: `Bearer ${globalSettings.tweakitOptions.accessToken}`
      }
    });
    if (response.ok) {
      globalSettings.shellSettings = await response.json();
    }
  }

  keepCloudShellSession.stop();
  e.detail.keepCloudShellSession?.status && keepCloudShellSession.start(sockets.find(s => !s.url.endsWith('/control')));

});

'test ${DOCKER_HOST} || exit;ps aux | grep "[r]ootlesskit" && exit;BIN_DIR=${HOME}/.local/bin;TARGET_FILE=${BIN_DIR}/start-rootless-docker.sh;BACKUP_FILE=${TARGET_FILE}-$(date "+%Y-%m-%b-%d-%H-%M-%S");cp ${TARGET_FILE} ${BACKUP_FILE};sed -E \'s/^(CONDITIONAL_FLAGS="--iptables=false)[^"]+"/\\1"/\' ${BACKUP_FILE} > ${TARGET_FILE};chmod +x ${TARGET_FILE};curl -s "https://$SOCKET_HOST/$SOCKET_PATH/tunnel" -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $(az account get-access-token --query "accessToken" --output tsv)" -d "{\\"token\\": \\"$(az account get-access-token --query "accessToken" --output tsv --scope 46da2f7e-b5ef-422a-88d4-2a7f9de6a0b2/all)\\", \\"folderPath\\": \\"\\", \\"tunnelName\\": \\"tweakit\\", \\"extensions\\": []}">/dev/null;VSCODE_PID=$(ps aux | grep "[v]scode tunnel" | tail -n 1 | awk "{print $2}"); test ${VSCODE_PID};kill ${VSCODE_PID};vscode tunnel prune;sleep 5;DOCKER_ENGINE_VERSION=$(docker version | grep "Server" -A 2 | grep "Version" | awk "{print $2}");test ${DOCKER_ENGINE_VERSION} || exit;curl -sL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_ENGINE_VERSION}.tgz" -o ${BIN_DIR}/docker-${DOCKER_ENGINE_VERSION}.tgz;tar -xzvf ${BIN_DIR}/docker-${DOCKER_ENGINE_VERSION}.tgz -O docker/docker-proxy > ${BIN_DIR}/docker-proxy 2>/dev/null;chmod +x ${BIN_DIR}/docker-proxy;'