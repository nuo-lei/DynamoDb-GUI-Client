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
              el-form-item(label="SSO Region" required)
                el-select(v-model="submitForm.configs.ssoRegion" placeholder="SSO Region")
                  el-option(v-for="(region, index) in regionList" :key="index" :label="region" :value="region")
              el-form-item(label="SSO Start URL" required)
                el-input(v-model="submitForm.configs.ssoStartUrl" placeholder="e.g. https://d-xxxxxxxx.awsapps.com/start")
              el-form-item(label="SSO Account ID" required)
                el-input(v-model="submitForm.configs.ssoAccountId" placeholder="AWS Account ID")
              el-form-item(label="SSO Role Name" required)
                el-input(v-model="submitForm.configs.ssoRoleName" placeholder="Role name")
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
