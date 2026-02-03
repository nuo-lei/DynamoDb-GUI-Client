import storeConfig from '@/store';
import database from '@/store/modules/database';
import {
  duplicateDbName,
  emptySubmitForm,
  fakeSubmitForm,
  ssoMissingSubmitForm,
  ssoSubmitForm,
  wrongSubmitForm,
} from './testData';

// Mock AWS DynamoDB client to avoid real network calls
jest.mock('aws-sdk/clients/dynamodb', () => {
  return class MockDynamoDB {
    constructor(..._args: any[]) {}
    listTables() { return { promise: () => Promise.resolve({}) }; }
  };
});

jest.mock('aws-sdk/clients/all', () => {
  class MockDocumentClient {
    scan() { return { promise: () => Promise.resolve({}) }; }
  }
  class MockDynamoDB {
    static DocumentClient = MockDocumentClient;
    listTables() { return { promise: () => Promise.resolve({}) }; }
  }
  return { DynamoDB: MockDynamoDB };
});

const store = storeConfig;

test('Database submitted with missing field', async () => {
  database.state.submitForm = emptySubmitForm;
  await store.dispatch('database/setCredentials');
  expect(database.state.list.length).toBe(0);
});

test('Database submitted with missing field', async () => {
  database.state.submitForm = wrongSubmitForm;
  const response = await store.dispatch('database/setCredentials');
  expect(response).toBeUndefined();
});

test('Database added successfully', async () => {
  database.state.submitForm = fakeSubmitForm;
  await store.dispatch('database/setCredentials');
  localStorage.setItem(`${fakeSubmitForm.name}-db`, JSON.stringify(database));
  expect(database.state.list.length).toBe(1);
  database.state.submitForm = duplicateDbName;
  await store.dispatch('database/setCredentials');
  expect(store.state.response.message).toBe(
    'Database with that name already exists',
  );
});

test('SSO submitted with missing field', async () => {
  database.state.submitForm = ssoMissingSubmitForm;
  await store.dispatch('database/setCredentials');
  // list should remain the same as previous counts
  expect(database.state.list.length).toBe(1);
});

test('SSO added successfully', async () => {
  database.state.submitForm = ssoSubmitForm;
  await store.dispatch('database/setCredentials');
  expect(database.state.list.length).toBe(2);
  expect(store.state.response.message).toBe(
    'SSO 登录配置已保存（连接校验暂未实现）',
  );
});
