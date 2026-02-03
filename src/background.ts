import { execFile } from 'child_process';
import { BrowserWindow, Menu, app, ipcMain, protocol, shell } from 'electron';
import defaultMenu from 'electron-default-menu';
import * as path from 'path';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
const isDevelopment = process.env.NODE_ENV !== 'production';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: any;

// Register custom scheme for production loading
// Electron >=5 uses registerSchemesAsPrivileged
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { secure: true, standard: true },
  },
]);
function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: isDevelopment
        ? path.join(process.cwd(), 'src/preload.js')
        : path.join(__dirname, 'preload.js'),
    },
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
  createWindow();
    // SSO: Profile-based login and connect
    ipcMain.handle('sso-list-profiles', async () => {
      try {
        const { loadSharedConfigFiles } = (eval('require')('@aws-sdk/shared-ini-file-loader') as any);
        const shared = await loadSharedConfigFiles();
        const configFile = shared.configFile || {};
        const credentialsFile = shared.credentialsFile || {};
        const names = new Set<string>([...Object.keys(configFile), ...Object.keys(credentialsFile)]);
        const profiles = Array.from(names).map((name) => {
          const p = (configFile as any)[name] || {};
          const c = (credentialsFile as any)[name] || {};
          return {
            name,
            region: p.region || c.region,
            ssoStartUrl: p.sso_start_url || p.ssoStartUrl,
            ssoRegion: p.sso_region || p.ssoRegion,
            ssoAccountId: p.sso_account_id || p.ssoAccountId,
            ssoRoleName: p.sso_role_name || p.ssoRoleName,
          };
        });
        return { ok: true, profiles };
      } catch (err) {
        const e: any = err;
        return { ok: false, error: (e && e.message) ? e.message : '无法读取 AWS 配置文件（~/.aws/config 或 ~/.aws/credentials）' };
      }
    });
    ipcMain.handle('sso-connect-profile', async (_event: any, params: { profile: string; region?: string }) => {
      const profile = params.profile;
      if (!profile) return { ok: false, error: '请填写 SSO Profile 名称' };
      try {
        await new Promise<void>((resolve, reject) => {
          const child = execFile('aws', ['sso', 'login', '--profile', profile], { env: process.env }, (error: any) => {
            if (error) return reject(error);
            resolve();
          });
          // Optional: surface errors
          child.on('error', reject);
        });
      } catch (loginErr) {
        const e: any = loginErr;
        const msg = (e && e.message) ? e.message : 'aws sso login 执行失败';
        return { ok: false, error: msg };
      }
      try {
        const { fromIni } = (eval('require')('@aws-sdk/credential-providers') as any);
        const { loadSharedConfigFiles } = (eval('require')('@aws-sdk/shared-ini-file-loader') as any);
        const iniProvider = fromIni({ profile });
        const credentials = await iniProvider();
        // infer region from profile config if available
        let connRegion = params.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
        try {
          const shared = await loadSharedConfigFiles();
          const cfg = (shared.configFile as any) || {};
          const p = cfg[profile] || {};
          connRegion = connRegion || p.region || p.sso_region || p.ssoRegion || 'us-east-1';
        } catch {}
        const DynamoDB = eval('require')('aws-sdk/clients/dynamodb');
        const db = new DynamoDB({ region: connRegion, credentials });
        await db.listTables().promise();
        return { ok: true, credentials, region: connRegion, profile };
      } catch (err) {
        const e: any = err;
        return { ok: false, error: (e && e.message) ? e.message : 'SSO Profile 连接失败' };
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
