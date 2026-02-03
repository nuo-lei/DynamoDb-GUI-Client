import { app, protocol, BrowserWindow, shell, Menu, ipcMain } from 'electron';
import defaultMenu from 'electron-default-menu';
import {
  createProtocol,
  installVueDevtools,
} from 'vue-cli-plugin-electron-builder/lib';
const isDevelopment = process.env.NODE_ENV !== 'production';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: any;

// Standard scheme must be registered before the app is ready
protocol.registerStandardSchemes(['app'], { secure: true });
function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    center: true,
    show: false,
  });
  win.once('ready-to-show', () => {
    win.show();
  });
  if (isDevelopment) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
    if (!process.env.IS_TEST) {
      win.webContents.openDevTools();
    }
  } else {
    createProtocol('app');
    // Load the index.html when not in development
    win.loadFile('index.html');
  }

  win.on('closed', () => {
    win = null;
  });
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  const menu = defaultMenu(app, shell);
  delete menu[2];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    await installVueDevtools();
  }
  createWindow();
  // IPC: Handle SSO credential fetch and connectivity check in main process
  ipcMain.handle('sso-connect', async (_event, params: {
    ssoStartUrl: string;
    ssoRegion: string;
    ssoAccountId: string;
    ssoRoleName: string;
    region?: string;
  }) => {
    try {
      // Use CommonJS build to avoid ESM parsing issues
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { fromSSO } = require('@aws-sdk/credential-provider-sso/dist-cjs/index.js');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const DynamoDB = require('aws-sdk/clients/dynamodb');
      const provider = fromSSO({
        ssoStartUrl: params.ssoStartUrl,
        ssoRegion: params.ssoRegion,
        ssoAccountId: params.ssoAccountId,
        ssoRoleName: params.ssoRoleName,
      });
      const credentials = await provider();
      const connRegion = params.region || params.ssoRegion;
      const db = new DynamoDB({ region: connRegion, credentials });
      await db.listTables().promise();
      return { ok: true, credentials, region: connRegion };
    } catch (err) {
      const message = (err && err.message) ? err.message : 'SSO 连接失败';
      return { ok: false, error: message };
    }
  });
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit();
      }
    });
  } else {
    process.on('SIGTERM', () => {
      app.quit();
    });
  }
}
