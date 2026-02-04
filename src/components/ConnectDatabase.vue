<template lang="pug">
  el-col(:span="24")
    el-tabs(type="border-card" @tab-click="setToDefault")
      el-tab-pane(label="Remote")
        el-tabs(type="card" v-model="remoteTab" @tab-click="onRemoteTabClick")
          el-tab-pane(label="Access Keys" name="keys")
            el-form(:model="configs")
              el-form-item(label="Database Name (Optional)")
                el-input(placeholder="Database display name" v-model="submitForm.name")
                  template(slot="append")
                    el-color-picker(v-model="submitForm.color" size="mini")
              el-form-item(label="AWS region" required)
                el-select(v-model="configs.region" placeholder="AWS Region")
                  el-option(v-for="(region, index) in regionList" :key="index" :label="region" :value="region")
              el-form-item(label="Access Key Id" required)
                el-input(v-model="configs.accessKeyId" placeholder="AWS access key id")
              el-form-item(label="Secret Access Key"  @keyup.enter.native="submitRemoteKeys" required)
                el-input(v-model="configs.secretAccessKey" :type="inputType" placeholder="AWS secret access key")
                  template(slot="append")
                    el-button(icon="el-icon-view" @click="showSecretKey")
              el-form-item(label="Session Token (Optional)")
                el-input(v-model="configs.sessionToken" placeholder="AWS session token")
            ActionButtons(
              :cancelHandler="setToDefault"
              :confirmHandler="submitRemoteKeys"
              :confirmLoading="isConnecting"
              :confirmDisabled="isConnecting"
              :confirmText="'Connect'"
              :cancelText="'Clear'"
            )
          el-tab-pane(label="SSO" name="sso")
            el-form(:model="configs")
              el-form-item(label="Database Name (Optional)")
                el-input(placeholder="Database display name" v-model="submitForm.name")
                  template(slot="append")
                    el-color-picker(v-model="submitForm.color" size="mini")
              el-form-item(label="SSO Profile" required)
                el-select(
                  v-model="submitForm.configs.ssoProfile"
                  placeholder="Select SSO Profile"
                  :loading="ssoProfilesLoading"
                  loading-text="Loading..."
                  filterable
                  :disabled="ssoProfilesLoading && !ssoProfiles.length"
                )
                  el-option(v-for="(p, index) in ssoProfiles" :key="index" :label="profileLabel(p)" :value="p.name")
              el-form-item(label="Profile Details" v-if="selectedProfile")
                div
                  p Name: {{ selectedProfile.name }}
                  p Region: {{ selectedProfile.region || selectedProfile.ssoRegion || '-' }}
                  p Start URL: {{ selectedProfile.ssoStartUrl || '-' }}
                  p Account: {{ selectedProfile.ssoAccountId || '-' }}
                  p Permission Set: {{ selectedProfile.ssoRoleName || '-' }}
              el-form-item(label="Actions" v-if="selectedProfile")
                el-button(type="text" size="mini" @click="forceDeviceLogin") Force device login (show code)
                el-button(type="text" size="mini" @click="clearSsoCacheForProfile") Clear SSO cache (profile)
              el-form-item(label="Verification Code" v-if="deviceAuth && deviceAuth.userCode")
                div
                  p(style="font-size:18px;font-weight:600") {{ deviceAuth.userCode }}
                  p
                    | If the browser didn't open, 
                    a(:href="deviceAuth.verificationUriComplete || deviceAuth.verificationUri" target="_blank") open verification page
            ActionButtons(
              :cancelHandler="setToDefault"
              :confirmHandler="submitRemoteSso"
              :confirmLoading="isConnecting"
              :confirmDisabled="isConnecting"
              :confirmText="'Connect'"
              :cancelText="'Clear'"
            )
      el-tab-pane(label="Local")
        el-form(:model="configs")
          el-form-item(label="Database Name (Optional)")
            el-input(placeholder="Database display name" v-model="submitForm.name")
              template(slot="append")
                el-color-picker(v-model="submitForm.color" size="mini")
          el-form-item(label="Local Database Endpoint" required)
            el-input(placeholder="Enter Endpoint" @keyup.enter.native="submitLocalForm" v-model="submitForm.configs.endpoint")
        ActionButtons(
          :cancelHandler="setToDefault"
          :confirmHandler="submitLocal"
          :confirmLoading="isConnecting"
          :confirmDisabled="isConnecting"
          :confirmText="'Connect'"
          :cancelText="'Clear'"
        )
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import { DbConfigs, SubmitForm } from '../store/modules/database/types';
import ActionButtons from './ActionButtons.vue';

@Component({
  components: {
    ActionButtons,
  },
})
export default class ConnectDatabase extends Vue {
  private inputType: string = 'password';
  private remoteTab: string = 'keys';
  private ssoProfilesLoading: boolean = false;
  private ssoLoadStarted: boolean = false;
  private isConnecting: boolean = false;
  private deviceAuth: any = null;
  @Prop(Function) private submitRemoteForm: any;
  @Prop(Function) private submitLocalForm: any;
  @Prop(Function) private setToDefault: any;
  @Prop(Object) private submitForm!: SubmitForm;
  @Prop(Array) private regionList!: string[];
  @Prop(Object) private configs!: DbConfigs;

  private mounted() {
    this.setToDefault();
    const ipc = this.getIpc();
    if (ipc && typeof ipc.on === 'function') {
      try {
        if (typeof ipc.removeAllListeners === 'function') {
          ipc.removeAllListeners('sso-device-auth');
        }
      } catch {}
      ipc.on('sso-device-auth', (_event: any, payload: any) => {
        // Ensure reactivity when assigning from IPC payload
        this.$set(this, 'deviceAuth', payload || null);
        // Make sure we're on the SSO tab so the code is visible
        this.remoteTab = 'sso';
        console.log('[renderer] sso-device-auth received', payload);
      });
    }
  }
  private beforeDestroy() {
    const ipc = this.getIpc();
    if (ipc && typeof ipc.removeAllListeners === 'function') {
      try { ipc.removeAllListeners('sso-device-auth'); } catch {}
    }
  }
  private showSecretKey() {
    if (this.inputType === 'password') {
      this.inputType = 'text';
    } else {
      this.inputType = 'password';
    }
  }
  private async submitRemoteKeys() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    this.submitForm.authMethod = 'keys';
    try {
      await this.submitRemoteForm();
    } finally {
      this.isConnecting = false;
    }
  }
  private async submitRemoteSso() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    this.submitForm.authMethod = 'sso';
    try {
      await this.submitRemoteForm();
    } finally {
      this.isConnecting = false;
      // clear code panel after attempt ends if we succeeded
      // keep it if there was an error so user can retry
    }
  }
  private async forceDeviceLogin() {
    const ipc = this.getIpc();
    if (!ipc) return;
    try {
      const name = (this.selectedProfile && this.selectedProfile.name)
        || (this.submitForm && this.submitForm.configs && this.submitForm.configs.ssoProfile)
        || '';
      await ipc.invoke('sso-clear-cache', { profile: name });
      await this.submitRemoteSso();
    } catch (e) {
      // swallow error; UI will surface through connect flow if needed
    }
  }
  private async clearSsoCacheForProfile() {
    const ipc = this.getIpc();
    if (!ipc) return;
    try {
      const name = (this.selectedProfile && this.selectedProfile.name)
        || (this.submitForm && this.submitForm.configs && this.submitForm.configs.ssoProfile)
        || '';
      await ipc.invoke('sso-clear-cache', { profile: name });
      // keep code panel cleared until next auth
      this.deviceAuth = null;
    } catch (e) {
      // ignore
    }
  }
  private async clearSsoCacheAll() {
    const ipc = this.getIpc();
    if (!ipc) return;
    try {
      await ipc.invoke('sso-clear-cache', {});
      this.deviceAuth = null;
    } catch (e) {
      // ignore
    }
  }
  private async submitLocal() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    try {
      await this.submitLocalForm();
    } finally {
      this.isConnecting = false;
    }
  }
  private ssoProfiles: Array<{ name: string; region?: string; ssoStartUrl?: string; ssoRegion?: string; ssoAccountId?: string; ssoRoleName?: string; }> = [];
  private getIpc(): any {
    try {
      if (typeof window !== 'undefined' && (window as any).ipcRenderer) {
        return (window as any).ipcRenderer;
      }
      // eslint-disable-next-line no-eval
      const req = typeof window !== 'undefined' && (window as any).require
        ? (window as any).require
        : eval('require');
      return req('electron').ipcRenderer;
    } catch {
      return null;
    }
  }
  private async loadSsoProfiles() {
    if (this.ssoProfilesLoading) return;
    this.ssoLoadStarted = true;
    this.ssoProfilesLoading = true;
    const ipc = this.getIpc();
    if (!ipc) return;
    try {
      const res = await ipc.invoke('sso-list-profiles');
      if (res && res.ok && Array.isArray(res.profiles)) {
        this.ssoProfiles = res.profiles;
        this.ssoProfilesLoading = false;
      } else {
        this.ssoProfilesLoading = false;
        setTimeout(() => this.loadSsoProfiles(), 2000);
      }
    } catch (e) {
      this.ssoProfilesLoading = false;
      setTimeout(() => this.loadSsoProfiles(), 2000);
    }
  }
  private onRemoteTabClick(tab: any) {
    const name = (tab && (tab.name || tab.paneName)) || '';
    if (name === 'sso' && !this.ssoLoadStarted) {
      this.loadSsoProfiles();
    }
    if (name !== 'sso') {
      this.deviceAuth = null;
    }
  }
  private profileLabel(p: any): string {
    const r = p.region || p.ssoRegion || '';
    return r ? `${p.name} (${r})` : p.name;
  }
  private get selectedProfile(): any {
    const name = (this.submitForm && this.submitForm.configs && this.submitForm.configs.ssoProfile) || '';
    return this.ssoProfiles.find((p) => p.name === name) || null;
  }
  private get readableExpiry(): string {
    if (!this.deviceAuth || !this.deviceAuth.expiresAt) return '';
    const ms = this.deviceAuth.expiresAt - Date.now();
    if (ms <= 0) return 'expired';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
}
</script>

<style lang="stylus" scoped>
.el-col
  display flex
  justify-content center
  align-items center

.el-tabs
  width 80%
  margin 0 auto
  max-width 700px

.el-form
  width 100%
  border-radius 2px
  height 75vh
  overflow auto
</style>
