import { RootState } from '@/store/types';
import { GetterTree } from 'vuex';
import { DatabaseModuleState } from './types';

const validateForm = (state: DatabaseModuleState) => {
  const obj: any = state.submitForm.configs;
  for (const key in obj) {
    if (!obj[key] && key !== 'dynamoDbCrc32' && key !== 'sessionToken') {
      return;
    }
  }
  return true;
};

const getters: GetterTree<DatabaseModuleState, RootState> = {
  validateForm,
};

export default getters;
