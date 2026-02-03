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

const namespace: string = 'database';

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
  @Prop(Function) private submitRemoteForm: any;
  @Prop(Function) private submitLocalForm: any;
  @Prop(Function) private setToDefault: any;
  @Prop(Object) private submitForm!: SubmitForm;
  @Prop(Array) private regionList!: string[];
  @Prop(Object) private configs!: DbConfigs;

  private mounted() {
    this.setToDefault();
    const ipc = this.getIpc();
    if (ipc && typeof ipc.send === 'function') {
      ipc.send('write-log', 'renderer mounted; waiting SSO tab activation before loading profiles');
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
      if (typeof ipc.send === 'function') ipc.send('write-log', 'loadSsoProfiles invoke start');
      const res = await ipc.invoke('sso-list-profiles');
      if (res && res.ok && Array.isArray(res.profiles)) {
        this.ssoProfiles = res.profiles;
        if (typeof ipc.send === 'function') ipc.send('write-log', `loadSsoProfiles success count=${this.ssoProfiles.length}`);
        this.ssoProfilesLoading = false;
      } else {
        if (typeof ipc.send === 'function') ipc.send('write-log', `loadSsoProfiles invalid response: ${JSON.stringify(res)}`);
        this.ssoProfilesLoading = false;
        setTimeout(() => this.loadSsoProfiles(), 2000);
      }
    } catch (e) {
      const err: any = e as any;
      if (typeof ipc.send === 'function') ipc.send('write-log', `loadSsoProfiles error: ${(err && err.message) ? err.message : String(err)}`);
      this.ssoProfilesLoading = false;
      setTimeout(() => this.loadSsoProfiles(), 2000);
    }
  }
  private onRemoteTabClick(tab: any) {
    const name = (tab && (tab.name || tab.paneName)) || '';
    if (name === 'sso' && !this.ssoLoadStarted) {
      const ipc = this.getIpc();
      if (ipc && typeof ipc.send === 'function') ipc.send('write-log', 'SSO tab activated; start loading profiles');
      this.loadSsoProfiles();
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
  height 50vh
</style>
