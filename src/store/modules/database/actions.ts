import { RootState } from '@/store/types';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { ActionContext, ActionTree } from 'vuex';
import { DatabaseModuleState } from './types';
// Access Electron's ipcRenderer safely without bundling 'electron' in web build
function getIpcRenderer(): any {
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

function removeDbFromStorage(
  { commit, dispatch }: ActionContext<DatabaseModuleState, RootState>,
  db: any,
) {
  localStorage.removeItem(`${db.name}-db`);
  commit('removeDbFromState', null, { root: true });
  dispatch('getDbList');
}

async function setCredentials({
  commit,
  dispatch,
  getters,
  state,
  rootState,
}: ActionContext<DatabaseModuleState, RootState>) {
  const database = state.submitForm;
  if (!getters.validateForm) {
    return;
  }
  // For SSO auth method, connection check via AWS SDK v2 is not implemented here.
  // SSO 登录（基于 ~/.aws/config 的 profile）
  if (database.authMethod === 'sso') {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
      commit('showResponse', { message: '请在 Electron 模式下执行 SSO 连接' }, { root: true });
      return;
    }
    const profile = database.configs.ssoProfile || '';
    if (!profile) {
      commit('showResponse', { message: '请填写 SSO Profile 名称' }, { root: true });
      return;
    }
    try {
      const result = await ipcRenderer.invoke('sso-connect-profile', {
        profile,
        region: database.configs.region || undefined,
      });
      if (!result || !result.ok) {
        commit('showResponse', { message: result?.error || 'SSO 连接失败' }, { root: true });
        return;
      }
      database.configs.accessKeyId = result.credentials.accessKeyId;
      database.configs.secretAccessKey = result.credentials.secretAccessKey;
      database.configs.sessionToken = result.credentials.sessionToken;
      database.configs.region = result.region;
      // Now that region is known, construct endpoint for remote service
      commit('correctInputs', 'remote');
      database.createdAt = +new Date();
      localStorage.setItem(`${database.name}-db`, JSON.stringify(database));
      dispatch('getDbList');
      dispatch('getCurrentDb', database.name, { root: true });
      commit('setToDefault');
      return;
    } catch (err) {
      commit('showResponse', err as any, { root: true });
      return;
    }
  }
  // In case of editing remove existing db first
  localStorage.removeItem(`${rootState.currentDb}-db`);
  if (localStorage.getItem(`${database.name}-db`)) {
    commit(
      'showResponse',
      { message: 'Database with that name already exists' },
      { root: true },
    );
    return;
  }
  const DB = new DynamoDB({ ...database.configs });
  try {
    await DB.listTables().promise();
  } catch (err) {
    commit('showResponse', err, { root: true });
    return;
  }
  database.createdAt = +new Date();
  localStorage.setItem(`${database.name}-db`, JSON.stringify(database));
  dispatch('getDbList');
  dispatch('getCurrentDb', database.name, { root: true });
  commit('setToDefault');
}

function submitRemoteForm({
  dispatch,
  commit,
  state,
}: ActionContext<DatabaseModuleState, RootState>) {
  if (state.submitForm.authMethod === 'sso') {
    // Region may not be known yet in SSO flow; defer endpoint construction
    dispatch('setCredentials');
  } else {
    commit('correctInputs', 'remote');
    dispatch('setCredentials');
  }
}

function submitLocalForm({
  dispatch,
  commit,
}: ActionContext<DatabaseModuleState, RootState>) {
  commit('correctInputs', 'local');
  dispatch('setCredentials');
}

function getDbList({ commit }: ActionContext<DatabaseModuleState, RootState>) {
  const newDbList = [];
  for (let i = 0; i < localStorage.length; i++) {
    try {
      JSON.parse(Object.values(localStorage)[i]);
    } catch (err) {
      continue;
    }
    newDbList.push(JSON.parse(Object.values(localStorage)[i]));
  }
  newDbList.sort((a, b) => a.createdAt - b.createdAt);
  commit('setDbList', newDbList);
}

const actions: ActionTree<DatabaseModuleState, RootState> = {
  removeDbFromStorage,
  setCredentials,
  submitRemoteForm,
  submitLocalForm,
  getDbList,
};

export default actions;
