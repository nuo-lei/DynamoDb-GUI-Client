import { BrowserWindow, Menu, app, ipcMain, protocol, shell } from 'electron';
import defaultMenu from 'electron-default-menu';
import serve from 'electron-serve';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SsoIpcClient } from './main/ipc/SsoIpcClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let loadURL: (win: BrowserWindow) => Promise<void>;

const isDevelopment = process.env.NODE_ENV !== 'production';


let win: BrowserWindow | null = null;

// Register custom scheme before the app is ready (required by Electron)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } },
]);

// Initialize electron-serve before 'ready' to avoid late scheme registration
// Determine correct directory to serve in production (handles both root and bundled layouts)
const appPath = app.getAppPath();
const candidates = [
  appPath,
  join(appPath, 'bundled'),
  __dirname,
  join(__dirname, 'bundled'),
];
const chosen = candidates.find((p) => existsSync(join(p, 'index.html')));
loadURL = serve({ directory: chosen || __dirname, scheme: 'app' });

async function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    center: true,
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL as string);
    if (!process.env.IS_TEST) {
      win.webContents.openDevTools();
    }
  } else {
    await loadURL(win);
  }

  win.on('closed', () => {
    win = null;
  });
}

app.on('ready', async () => {
  const menu = defaultMenu(app, shell);
  delete (menu as any)[2];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
  await createWindow();
  // Register only the IPC handlers from SsoIpcClient.register()
  const ssoClient = new SsoIpcClient(ipcMain, app);
  ipcMain.handle('sso-list-profiles', ssoClient.handleListProfiles.bind(ssoClient));
  ipcMain.handle('sso-clear-cache', ssoClient.handleClearCache.bind(ssoClient));
  ipcMain.handle('sso-connect-profile', ssoClient.handleConnectProfile.bind(ssoClient));
});

app.on('activate', () => {
  if (win === null) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') app.quit();
    });
  } else {
    process.on('SIGTERM', () => app.quit());
  }
}
