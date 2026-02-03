<template lang="pug">
  el-col(:span="24")
    el-tabs(type="border-card" @tab-click="setToDefault")
      el-tab-pane(label="Remote")
        el-tabs(type="card")
          el-tab-pane(label="Access Keys")
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
              :confirmText="'Connect'"
              :cancelText="'Clear'"
            )
          el-tab-pane(label="SSO")
            el-form(:model="configs")
              el-form-item(label="Database Name (Optional)")
                el-input(placeholder="Database display name" v-model="submitForm.name")
                  template(slot="append")
                    el-color-picker(v-model="submitForm.color" size="mini")
              el-form-item(label="SSO Profile" required)
                template(v-if="ssoProfiles.length")
                  el-select(v-model="submitForm.configs.ssoProfile" placeholder="Choose SSO Profile")
                    el-option(v-for="(p, index) in ssoProfiles" :key="index" :label="profileLabel(p)" :value="p.name")
                template(v-else)
                  el-input(v-model="submitForm.configs.ssoProfile" placeholder="Profile name in ~/.aws/config")
              el-form-item(label="Profile Details" v-if="selectedProfile")
                div
                  p 名称：{{ selectedProfile.name }}
                  p 区域：{{ selectedProfile.region || selectedProfile.ssoRegion || '-' }}
                  p Start URL：{{ selectedProfile.ssoStartUrl || '-' }}
                  p 账号：{{ selectedProfile.ssoAccountId || '-' }}
                  p 权限集：{{ selectedProfile.ssoRoleName || '-' }}
            ActionButtons(
              :cancelHandler="setToDefault"
              :confirmHandler="submitRemoteSso"
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
          :confirmHandler="submitLocalForm"
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
  @Prop(Function) private submitRemoteForm: any;
  @Prop(Function) private submitLocalForm: any;
  @Prop(Function) private setToDefault: any;
  @Prop(Object) private submitForm!: SubmitForm;
  @Prop(Array) private regionList!: string[];
  @Prop(Object) private configs!: DbConfigs;

  private mounted() {
    this.setToDefault();
    this.loadSsoProfiles();
  }
  private showSecretKey() {
    if (this.inputType === 'password') {
      this.inputType = 'text';
    } else {
      this.inputType = 'password';
    }
  }
  private submitRemoteKeys() {
    this.submitForm.authMethod = 'keys';
    this.submitRemoteForm();
  }
  private submitRemoteSso() {
    this.submitForm.authMethod = 'sso';
    this.submitRemoteForm();
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
    const ipc = this.getIpc();
    if (!ipc) return;
    try {
      const res = await ipc.invoke('sso-list-profiles');
      if (res && res.ok && Array.isArray(res.profiles)) {
        this.ssoProfiles = res.profiles;
      }
    } catch {
      // ignore
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
