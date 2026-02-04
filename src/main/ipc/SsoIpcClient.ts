import { GetRoleCredentialsCommand, GetRoleCredentialsCommandOutput, SSOClient } from '@aws-sdk/client-sso';
import { CreateTokenCommand, RegisterClientCommand, SSOOIDCClient, StartDeviceAuthorizationCommand } from '@aws-sdk/client-sso-oidc';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { App, IpcMain, IpcMainInvokeEvent, shell } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as ini from 'ini';
import * as os from 'os';
import * as path from 'path';

type IniSections = Record<string, Record<string, string>>;
interface AwsProfileConfig {
  region?: string;
  sso_start_url?: string;
  ssoStartUrl?: string;
  sso_region?: string;
  ssoRegion?: string;
  sso_account_id?: string;
  ssoAccountId?: string;
  sso_role_name?: string;
  ssoRoleName?: string;
  sso_session?: string;
  ssoSession?: string;
}
interface SsoCacheEntry {
  clientId?: string;
  clientSecret?: string;
  clientSecretExpiresAt?: number;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  accessTokenCachedAt?: number;
}


export interface SsoProfile {
  name: string;
  region?: string;
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
}

export type SsoListProfilesResult =
  | { ok: true; profiles: SsoProfile[] }
  | { ok: false; error: string };

export interface SsoClearCacheParams { profile?: string }
export interface SsoClearCacheResult { ok: boolean; cleared?: string; error?: string }

export interface SsoConnectParams { profile: string; region?: string }
export type SsoConnectResult =
  | { ok: true; credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }; region: string; profile: string }
  | { ok: false; error: string };

export interface SsoDeviceAuthPayload {
  userCode?: string;
  verificationUri?: string;
  verificationUriComplete?: string;
  interval?: number;
}

export class SsoIpcClient {
  private readonly store: {
    get: (key: string) => SsoCacheEntry | undefined;
    set: (key: string, value: SsoCacheEntry) => void;
    has: (key: string) => boolean;
    delete: (key: string) => void;
    clear: () => void;
  };
  constructor(private readonly ipcMain: IpcMain, private readonly app: App) {
    this.store = new Store<{ [key: string]: SsoCacheEntry }>({ name: 'sso-cache' }) as unknown as {
      get: (key: string) => SsoCacheEntry | undefined;
      set: (key: string, value: SsoCacheEntry) => void;
      has: (key: string) => boolean;
      delete: (key: string) => void;
      clear: () => void;
    };
  }
  // Cache helpers using electron-store
  private cacheKey(startUrl: string, ssoRegion: string): string {
    return `${ssoRegion}|${startUrl}`;
  }
  private getCacheEntryFor(startUrl: string, ssoRegion: string): { key: string; entry: SsoCacheEntry | undefined } {
    const key = this.cacheKey(startUrl, ssoRegion);
    const entry = this.store.get(key) as SsoCacheEntry | undefined;
    return { key, entry };
  }
  private saveCacheEntry(key: string, entry: SsoCacheEntry): void {
    this.store.set(key, entry);
  }
  private loadAwsIniFiles(): { configFile: IniSections; credentialsFile: IniSections } {
    const home = os.homedir() || process.env.HOME || '';
    const safeParse = (p: string) => {
      try {
        if (!p || !fs.existsSync(p)) return {};
        const txt = fs.readFileSync(p, 'utf8');
        return ini.parse(txt) || {};
      } catch {
        return {};
      }
    };
    const cfgPath = home ? path.join(home, '.aws', 'config') : '';
    const credPath = home ? path.join(home, '.aws', 'credentials') : '';
    const configFile = safeParse(cfgPath) as IniSections;
    const credentialsFile = safeParse(credPath) as IniSections;
    return { configFile, credentialsFile };
  }
  private getAwsProfileSections(profile: string, configFile: IniSections, credentialsFile: IniSections): { p: AwsProfileConfig; c: AwsProfileConfig } {
    const pRaw: Record<string, string> = configFile[`profile ${profile}`] || configFile[profile] || {};
    const cRaw: Record<string, string> = credentialsFile[profile] || {};
    const p: AwsProfileConfig = pRaw as AwsProfileConfig;
    const c: AwsProfileConfig = cRaw as AwsProfileConfig;
    return { p, c };
  }
  private loadSsoSessionsFromConfig(): Record<string, Record<string, string>> {
    try {
      const home = os.homedir() || process.env.HOME || '';
      if (!home) return {};
      const awsCfgPath = path.join(home, '.aws', 'config');
      if (!fs.existsSync(awsCfgPath)) return {};
      const text = fs.readFileSync(awsCfgPath, 'utf8');
      const lines = text.split(/\r?\n/);
      const sessions: Record<string, Record<string, string>> = {};
      let currentSession: string | null = null;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) continue;
        const mSec = line.match(/^\[(.+?)\]$/);
        if (mSec) {
          const sec = mSec[1].trim();
          const m = sec.match(/^sso-session\s+(.+)$/);
          if (m) {
            currentSession = m[1].trim();
            if (!sessions[currentSession]) sessions[currentSession] = {};
          } else {
            currentSession = null;
          }
          continue;
        }
        if (currentSession) {
          const eq = line.indexOf('=');
          if (eq > -1) {
            const k = line.substring(0, eq).trim();
            const v = line.substring(eq + 1).trim();
            sessions[currentSession][k] = v;
          }
        }
      }
      return sessions;
    } catch {
      return {};
    }
  }
  private resolveSsoSettings(profile: string, configFile: IniSections, credentialsFile: IniSections, sessionsFromIni: Record<string, Record<string, string>>): {
    p: any;
    c: any;
    ssoStartUrl?: string;
    ssoRegion?: string;
    accountId?: string;
    roleName?: string;
    region?: string;
  } {
    const { p, c } = this.getAwsProfileSections(profile, configFile, credentialsFile);
    let ssoStartUrl = p.sso_start_url || p.ssoStartUrl;
    let ssoRegion = p.sso_region || p.ssoRegion;
    const sessionName = p.sso_session || p.ssoSession;
    if ((!ssoStartUrl || !ssoRegion) && sessionName) {
      const sess: AwsProfileConfig = (configFile[`sso-session ${sessionName}`]
        || configFile[sessionName]
        || sessionsFromIni[sessionName]
        || {}) as AwsProfileConfig;
      ssoStartUrl = ssoStartUrl || sess.sso_start_url || sess.ssoStartUrl;
      ssoRegion = ssoRegion || sess.sso_region || sess.ssoRegion;
    }
    return {
      p,
      c,
      ssoStartUrl,
      ssoRegion,
      accountId: p.sso_account_id || p.ssoAccountId,
      roleName: p.sso_role_name || p.ssoRoleName,
      region: p.region || c.region,
    };
  }
  private async trySilentRefresh(ssoRegion: string, ssoStartUrl: string): Promise<string | undefined> {
    try {
      const { key, entry } = this.getCacheEntryFor(ssoStartUrl, ssoRegion);
      if (entry && entry.clientId && entry.clientSecret && entry.refreshToken) {
        const now = Date.now();
        if (!entry.clientSecretExpiresAt || entry.clientSecretExpiresAt > now) {
          const oidcRefresh = new SSOOIDCClient({ region: ssoRegion });
          const tokenRes = await oidcRefresh.send(new CreateTokenCommand({
            clientId: entry.clientId,
            clientSecret: entry.clientSecret,
            grantType: 'refresh_token',
            refreshToken: entry.refreshToken,
          }));
          const accessToken = tokenRes.accessToken as string;
          entry.accessToken = accessToken;
          const ttl = (typeof tokenRes.expiresIn === 'number' && tokenRes.expiresIn > 0) ? tokenRes.expiresIn : undefined;
          entry.accessTokenExpiresAt = ttl ? (Date.now() + (ttl * 1000)) : undefined;
          entry.accessTokenCachedAt = Date.now();
          if (tokenRes.refreshToken) entry.refreshToken = tokenRes.refreshToken;
          this.saveCacheEntry(key, entry);
          return accessToken;
        }
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.log(`[electron] silent refresh error: ${err?.message || String(e)}`);
    }
    return undefined;
  }
  private async acquireByDeviceAuth(event: IpcMainInvokeEvent | undefined, ssoStartUrl: string, ssoRegion: string): Promise<string | undefined> {
    const oidc = new SSOOIDCClient({ region: ssoRegion });
    console.log('[electron] SSO interactive device flow starting');
    const reg = await oidc.send(new RegisterClientCommand({ clientName: 'DynamoDbGUI', clientType: 'public' }));
    const clientIdLocal = reg.clientId as string;
    const clientSecretLocal = reg.clientSecret as string;
    const start = await oidc.send(new StartDeviceAuthorizationCommand({ clientId: clientIdLocal, clientSecret: clientSecretLocal, startUrl: ssoStartUrl }));
    console.log(`[electron] SSO device authorization issued userCode=${start.userCode || '<none>'}`);
    try {
      const payload: SsoDeviceAuthPayload = {
        userCode: start.userCode,
        verificationUri: start.verificationUri,
        verificationUriComplete: start.verificationUriComplete,
        interval: start.interval || 5,
      };
      if (event && event.sender) event.sender.send('sso-device-auth', payload);
      console.log('[electron] Sent sso-device-auth event to renderer');
    } catch { }
    const verifyUrl = (start.verificationUriComplete || start.verificationUri) as string;
    if (verifyUrl) shell.openExternal(verifyUrl);
    const intervalMs = ((start.interval || 5) * 1000);
    while (true) {
      try {
        const tokenRes = await oidc.send(new CreateTokenCommand({
          clientId: clientIdLocal,
          clientSecret: clientSecretLocal,
          deviceCode: start.deviceCode as string,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        }));
        const newAccessToken = tokenRes.accessToken as string;
        try {
          const key = this.cacheKey(ssoStartUrl, ssoRegion);
          this.saveCacheEntry(key, {
            clientId: clientIdLocal,
            clientSecret: clientSecretLocal,
            clientSecretExpiresAt: reg.clientSecretExpiresAt ? (reg.clientSecretExpiresAt * 1000) : undefined,
            refreshToken: tokenRes.refreshToken,
            accessToken: newAccessToken,
            accessTokenExpiresAt: (typeof tokenRes.expiresIn === 'number' && tokenRes.expiresIn > 0)
              ? (Date.now() + (tokenRes.expiresIn * 1000))
              : undefined,
            accessTokenCachedAt: Date.now(),
          });
        } catch { }
        return newAccessToken;
      } catch (pollErr: unknown) {
        const name = (typeof pollErr === 'object' && pollErr && 'name' in pollErr && typeof (pollErr as { name?: string }).name === 'string')
          ? (pollErr as { name: string }).name
          : (typeof pollErr === 'object' && pollErr && 'code' in pollErr && typeof (pollErr as { code?: string }).code === 'string')
            ? (pollErr as { code: string }).code
            : undefined;
        if (name === 'AuthorizationPendingException' || name === 'SlowDownException') {
          // keep polling
        } else if (name === 'ExpiredTokenException' || name === 'ExpiredToken' || name === 'AccessDeniedException') {
          console.log(`[electron] device code flow ended: ${name}`);
          return undefined;
        } else {
          const msg = (typeof pollErr === 'object' && pollErr && 'message' in pollErr) ? String((pollErr as any).message) : String(pollErr);
          console.log(`[electron] create token error: ${msg}`);
          return undefined;
        }
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async handleListProfiles(): Promise<SsoListProfilesResult> {
    console.log('[electron] ipc sso-list-profiles invoked');
    try {
      const { configFile, credentialsFile } = this.loadAwsIniFiles();
      const sessionsFromIni = this.loadSsoSessionsFromConfig();
      const names = new Set<string>();
      Object.keys(configFile).forEach((k) => {
        if (k.startsWith('profile ')) {
          names.add(k.substring('profile '.length));
        } else if (!k.startsWith('sso-session ')) {
          names.add(k);
        }
      });
      Object.keys(credentialsFile).forEach((k) => names.add(k));
      const profiles: SsoProfile[] = Array.from(names).map((name) => {
        const r = this.resolveSsoSettings(name, configFile, credentialsFile, sessionsFromIni);
        return {
          name,
          region: r.region,
          ssoStartUrl: r.ssoStartUrl,
          ssoRegion: r.ssoRegion,
          ssoAccountId: r.accountId,
          ssoRoleName: r.roleName,
        };
      });
      return { ok: true, profiles };
    } catch (err: unknown) {
      const e = err as Error;
      console.log(`[electron] sso-list-profiles error: ${e?.message || String(err)}`);
      return { ok: false, error: e?.message || 'Unable to read AWS config files (~/.aws/config or ~/.aws/credentials)' };
    }
  };

  async handleClearCache(_event: IpcMainInvokeEvent, params: SsoClearCacheParams): Promise<SsoClearCacheResult> {
    try {
      const { profile } = params || {};
      if (!profile) {
        this.store.clear();
        return { ok: true, cleared: 'all' };
      }
      const { configFile: cfg, credentialsFile: cred } = this.loadAwsIniFiles();
      const sessionsFromIni = this.loadSsoSessionsFromConfig();
      const r = this.resolveSsoSettings(profile, cfg, cred, sessionsFromIni);
      let ssoStartUrl: string | undefined = r.ssoStartUrl;
      let ssoRegion: string | undefined = r.ssoRegion;
      if (!ssoStartUrl || !ssoRegion) {
        return { ok: false, error: 'Unable to resolve SSO startUrl/region for profile' };
      }
      const key = this.cacheKey(ssoStartUrl, ssoRegion);
      if (this.store.has(key)) {
        this.store.delete(key);
        return { ok: true, cleared: key };
      }
      return { ok: true, cleared: 'none' };
    } catch (err: unknown) {
      const e = err as Error;
      console.log(`[electron] sso-clear-cache error: ${e?.message || String(err)}`);
      return { ok: false, error: e?.message || 'Failed to clear SSO cache' };
    }
  };

  async handleConnectProfile(event: IpcMainInvokeEvent, params: SsoConnectParams): Promise<SsoConnectResult> {
    const profile = params.profile;
    console.log(`[electron] ipc sso-connect-profile invoked profile=${profile || '<empty>'}`);
    if (!profile) return { ok: false, error: 'Please enter SSO Profile name' };
    try {
      const { configFile: cfg, credentialsFile: cred } = this.loadAwsIniFiles();
      const sessionsFromIni = this.loadSsoSessionsFromConfig();
      const r = this.resolveSsoSettings(profile, cfg, cred, sessionsFromIni);
      const p = r.p;
      const ssoStartUrl: string = r.ssoStartUrl as string;
      const ssoRegion: string = r.ssoRegion as string;
      const accountId: string = r.accountId as string;
      const roleName: string = r.roleName as string;
      if (!ssoStartUrl || !ssoRegion || !accountId || !roleName) {
        console.log('[electron] sso-connect-profile missing SSO fields in profile');
        return { ok: false, error: 'Profile is missing SSO configuration (startUrl/region/accountId/roleName)' };
      }

      // device auth handled by helper

      // Try cached access token (no expiry check), then refresh; otherwise interactive
      let accessToken: string | undefined;
      let needInteractive = true;
      let usedCachedAccessToken = false;
      try {
        const { key, entry } = this.getCacheEntryFor(ssoStartUrl, ssoRegion);
        console.log(`[electron] SSO cache lookup key=${key}`);
        if (entry) {
          try { console.log(`[electron] Cache entry keys: ${Object.keys(entry).join(', ')}`); } catch { }
        }
        if (entry && entry.accessToken) {
          accessToken = entry.accessToken as string;
          needInteractive = false;
          usedCachedAccessToken = true;
          console.log('[electron] Using cached access token (no expiry check)');
        } else if (entry && entry.clientId && entry.clientSecret && entry.refreshToken) {
          const now = Date.now();
          if (!entry.clientSecretExpiresAt || entry.clientSecretExpiresAt > now) {
            console.log('[electron] Attempting silent refresh with cached client/refresh token');
            const oidcRefresh = new SSOOIDCClient({ region: ssoRegion });
            const tokenRes = await oidcRefresh.send(new CreateTokenCommand({
              clientId: entry.clientId,
              clientSecret: entry.clientSecret,
              grantType: 'refresh_token',
              refreshToken: entry.refreshToken,
            }));
            accessToken = tokenRes.accessToken as string;
            entry.accessToken = accessToken;
            const ttl = (typeof tokenRes.expiresIn === 'number' && tokenRes.expiresIn > 0) ? tokenRes.expiresIn : undefined;
            entry.accessTokenExpiresAt = ttl ? (Date.now() + (ttl * 1000)) : undefined;
            entry.accessTokenCachedAt = Date.now();
            if (tokenRes.refreshToken) entry.refreshToken = tokenRes.refreshToken;
            this.saveCacheEntry(key, entry);
            if (accessToken) needInteractive = false;
          }
        } else if (entry) {
          console.log('[electron] Cache entry present but missing fields (clientId/secret/refreshToken), falling back to device code');
        } else {
          console.log('[electron] No cache entry found; starting device code flow');
        }
      } catch (e: unknown) {
        const err = e as Error;
        console.log(`[electron] silent SSO refresh failed: ${err?.message || String(e)}`);
      }

      if (needInteractive) {
        const t = await this.acquireByDeviceAuth(event, ssoStartUrl, ssoRegion);
        if (!t) return { ok: false, error: 'SSO device authorization failed or timed out' };
        accessToken = t;
      }

      const sso = new SSOClient({ region: ssoRegion });
      let roleRes: GetRoleCredentialsCommandOutput;
      let didRetry = false;
      while (true) {
        try {
          roleRes = await sso.send(new GetRoleCredentialsCommand({ roleName, accountId, accessToken }));
          break;
        } catch (err: unknown) {
          const name = (typeof err === 'object' && err && 'name' in err && typeof (err as { name?: string }).name === 'string')
            ? (err as { name: string }).name
            : (typeof err === 'object' && err && 'code' in err && typeof (err as { code?: string }).code === 'string')
              ? (err as { code: string }).code
              : '';
          const msg = (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: string }).message === 'string')
            ? (err as { message: string }).message
            : '';
          const tokenLikelyInvalid = usedCachedAccessToken || /token/i.test(msg) || /Unauthorized/i.test(name) || /InvalidRequest/i.test(name);
          if (!didRetry && tokenLikelyInvalid) {
            console.log('[electron] Cached access token failed; clearing and retrying once');
            try {
              const { key, entry } = this.getCacheEntryFor(ssoStartUrl, ssoRegion);
              if (entry) {
                delete entry.accessToken;
                delete entry.accessTokenExpiresAt;
                delete entry.accessTokenCachedAt;
                this.saveCacheEntry(key, entry);
              }
            } catch { }
            try {
              const refreshed = await this.trySilentRefresh(ssoRegion, ssoStartUrl);
              if (refreshed) {
                console.log('[electron] Retrying via silent refresh after token failure');
                accessToken = refreshed;
              } else {
                console.log('[electron] Silent refresh not available; falling back to device flow');
                const t = await this.acquireByDeviceAuth(event, ssoStartUrl, ssoRegion);
                if (!t) return { ok: false, error: 'SSO device authorization failed or timed out' };
                accessToken = t;
              }
            } catch (e2: unknown) {
              const err2 = e2 as Error;
              console.log(`[electron] Retry acquire token failed: ${err2?.message || String(e2)}`);
              const t = await this.acquireByDeviceAuth(event, ssoStartUrl, ssoRegion);
              if (!t) return { ok: false, error: 'SSO device authorization failed or timed out' };
              accessToken = t;
            }
            didRetry = true;
            continue;
          }
          console.log(`[electron] GetRoleCredentials failed: ${msg || name}`);
          return { ok: false, error: msg || 'Failed to retrieve role credentials' };
        }
      }

      const roleCredentials = roleRes.roleCredentials || {};
      const credentials = {
        accessKeyId: roleCredentials.accessKeyId,
        secretAccessKey: roleCredentials.secretAccessKey,
        sessionToken: roleCredentials.sessionToken,
      } as { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
      if (!credentials.accessKeyId || !credentials.secretAccessKey) {
        return { ok: false, error: 'Failed to retrieve role credentials' };
      }
      let connRegion = params.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
      connRegion = connRegion || p.region || 'us-east-1';
      const db = new DynamoDB({ region: connRegion, credentials });
      await db.listTables().promise();
      console.log(`[electron] sso-connect-profile success region=${connRegion}`);
      return { ok: true, credentials, region: connRegion, profile };
    } catch (err: unknown) {
      const e = err as Error;
      console.log(`[electron] sso-connect-profile error: ${e?.message || String(err)}`);
      return { ok: false, error: e?.message || 'SSO Profile connection failed' };
    }
  };
}
