import { execFile } from 'child_process';
import { BrowserWindow, Menu, app, ipcMain, protocol, shell } from 'electron';
import defaultMenu from 'electron-default-menu';
import * as fs from 'fs';
import * as path from 'path';
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib';
const isDevelopment = process.env.NODE_ENV !== 'production';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win: any;
let logFilePath: string | null = null;
function getAwsEnv(): NodeJS.ProcessEnv {
  const base = { ...process.env } as NodeJS.ProcessEnv;
  const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin'];
  const cur = base.PATH || '';
  const paths = new Set<string>(cur.split(':').filter(Boolean));
  extraPaths.forEach((p) => paths.add(p));
  base.PATH = Array.from(paths).join(':');
  return base;
}

function log(message: string) {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${message}\n`;
    if (!logFilePath) return;
    fs.appendFileSync(logFilePath, line);
  } catch {}
}

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
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: isDevelopment
        ? path.join(process.cwd(), 'src/preload.js')
        : path.join(__dirname, 'preload.js'),
    },
  });
  // Fallback: ensure window becomes visible after load
  win.webContents.once('did-finish-load', () => {
    if (!win.isVisible()) win.show();
  });
  if (isDevelopment) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
    if (!process.env.IS_TEST) {
      win.webContents.openDevTools();
    }
  } else {
    createProtocol('app');
    // Load the index.html when not in development via custom scheme
    // This ensures correct resolution inside the packaged ASAR
    win.loadURL('app://./index.html');
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
  try {
    logFilePath = (app.getPath('userData') || '.') + '/app.log';
  } catch {
    logFilePath = './app.log';
  }
  try {
    const dir = path.dirname(logFilePath);
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  log('app ready');
  const menu = defaultMenu(app, shell);
  delete menu[2];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  createWindow();
  log('window created');
    // SSO: Profile-based login and connect
    ipcMain.handle('sso-list-profiles', async () => {
      log('ipc sso-list-profiles invoked');
      try {
        const names = new Set<string>();
        // Fast path: use AWS CLI to list profiles (often faster than parsing files)
        try {
          await new Promise<void>((resolve, reject) => {
            const child = execFile('aws', ['configure', 'list-profiles'], { env: getAwsEnv(), timeout: 2000 }, (error: any, stdout: string) => {
              if (error) return reject(error);
              const lines = (stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
              lines.forEach((n) => names.add(n));
              resolve();
            });
            child.on('error', reject);
          });
          log(`aws configure list-profiles returned count=${names.size}`);
        } catch (cliErr) {
          const e: any = cliErr;
          log(`aws configure list-profiles failed: ${(e && e.message) ? e.message : String(e)}`);
        }
        // Fallback: parse shared ini files
        try {
          const { loadSharedConfigFiles } = (eval('require')('@aws-sdk/shared-ini-file-loader') as any);
          const shared = await loadSharedConfigFiles();
          const configFile = shared.configFile || {};
          const credentialsFile = shared.credentialsFile || {};
          Object.keys(configFile).forEach((n) => names.add(n));
          Object.keys(credentialsFile).forEach((n) => names.add(n));
          log(`shared-ini loader added, total names count=${names.size}`);
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
        } catch (parseErr) {
          const e: any = parseErr;
          log(`shared-ini loader error: ${(e && e.message) ? e.message : String(e)}`);
          // If we have names from CLI, still return minimal profiles
          if (names.size > 0) {
            const profiles = Array.from(names).map((name) => ({ name }));
            return { ok: true, profiles };
          }
          throw parseErr;
        }
      } catch (err) {
        const e: any = err;
        log(`sso-list-profiles error: ${e && e.message ? e.message : String(e)}`);
        return { ok: false, error: (e && e.message) ? e.message : 'Unable to read AWS config files (~/.aws/config or ~/.aws/credentials)' };
      }
    });
    ipcMain.handle('sso-connect-profile', async (_event: any, params: { profile: string; region?: string }) => {
      const profile = params.profile;
      log(`ipc sso-connect-profile invoked profile=${profile || '<empty>'}`);
      if (!profile) return { ok: false, error: 'Please enter SSO Profile name' };
      try {
        await new Promise<void>((resolve, reject) => {
          const child = execFile('aws', ['sso', 'login', '--profile', profile], { env: getAwsEnv() }, (error: any) => {
            if (error) return reject(error);
            resolve();
          });
          // Optional: surface errors
          child.on('error', reject);
        });
        log('aws sso login finished');
      } catch (loginErr) {
        const e: any = loginErr;
        const msg = (e && e.message) ? e.message : 'aws sso login execution failed';
        log(`aws sso login error: ${msg}`);
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
        log(`sso-connect-profile success region=${connRegion}`);
        return { ok: true, credentials, region: connRegion, profile };
      } catch (err) {
        const e: any = err;
        log(`sso-connect-profile error: ${e && e.message ? e.message : String(e)}`);
        return { ok: false, error: (e && e.message) ? e.message : 'SSO Profile connection failed' };
      }
    });

    // Renderer-side logging support
    ipcMain.on('write-log', (_event, payload: any) => {
      try {
        const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
        log(`[renderer] ${msg}`);
      } catch {}
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
