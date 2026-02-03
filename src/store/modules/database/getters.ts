import { RootState } from '@/store/types';
import { GetterTree } from 'vuex';
import { DatabaseModuleState } from './types';

const validateForm = (state: DatabaseModuleState) => {
  const method = state.submitForm.authMethod || 'keys';
  const cfg: any = state.submitForm.configs;
  if (method === 'sso') {
    const required = ['ssoStartUrl', 'ssoRegion', 'ssoAccountId', 'ssoRoleName'];
    for (const k of required) {
      if (!cfg[k]) {
        return;
      }
    }
    return true;
  } else {
    for (const key in cfg) {
      if (!cfg[key] && key !== 'dynamoDbCrc32' && key !== 'sessionToken' &&
          key !== 'ssoStartUrl' && key !== 'ssoRegion' && key !== 'ssoAccountId' && key !== 'ssoRoleName') {
        return;
      }
    }
    return true;
  }
};

const getters: GetterTree<DatabaseModuleState, RootState> = {
  validateForm,
};

export default getters;
