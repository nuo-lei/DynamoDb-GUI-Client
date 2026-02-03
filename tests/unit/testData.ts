import { SubmitForm } from '@/store/modules/database/types';
export const fakeSubmitForm: SubmitForm = {
  configs: {
    accessKeyId: 'testKey',
    secretAccessKey: 'testSecretKey',
    region: 'localhost',
    endpoint: 'http://localhost:8000',
    maxRetries: 2,
    dynamoDbCrc32: false,
  },
  name: 'Database 1',
  color: '#00f97c',
  createdAt: +new Date(),
  authMethod: 'keys',
};

export const duplicateDbName: SubmitForm = {
  configs: {
    accessKeyId: 'testKey2',
    secretAccessKey: 'testSecretKey2',
    region: 'localhost',
    endpoint: 'http://localhost:8000',
    maxRetries: 2,
    dynamoDbCrc32: false,
  },
  name: 'Database 1',
  color: '#00f97c',
  createdAt: +new Date(),
  authMethod: 'keys',
};

export const wrongSubmitForm: SubmitForm = {
  configs: {
    accessKeyId: 'testKey',
    secretAccessKey: 'testSecretKey',
    region: 'localhost',
    endpoint: 'wrongEndpoint',
    maxRetries: 2,
    dynamoDbCrc32: false,
  },
  name: 'Database 1',
  color: '#00f97c',
  createdAt: +new Date(),
  authMethod: 'keys',
};

export const emptySubmitForm: SubmitForm = {
  configs: {
    accessKeyId: '',
    secretAccessKey: '',
    region: 'es-west',
    endpoint: 'http://localhost',
    maxRetries: 2,
    dynamoDbCrc32: false,
  },
  name: 'Database 1',
  color: '#00f97c',
  createdAt: +new Date(),
  authMethod: 'keys',
};

export const ssoMissingSubmitForm: SubmitForm = {
  configs: {
    accessKeyId: '',
    secretAccessKey: '',
    region: '',
    endpoint: '',
    maxRetries: 1,
    dynamoDbCrc32: false,
    ssoStartUrl: '',
    ssoRegion: '',
    ssoAccountId: '',
    ssoRoleName: '',
  },
  name: 'Database SSO 1',
  color: '#00f97c',
  createdAt: +new Date(),
  authMethod: 'sso',
};

export const ssoSubmitForm: SubmitForm = {
  configs: {
    accessKeyId: '',
    secretAccessKey: '',
    region: '',
    endpoint: '',
    maxRetries: 1,
    dynamoDbCrc32: false,
    ssoStartUrl: 'https://d-xxxxxxxx.awsapps.com/start',
    ssoRegion: 'us-west-2',
    ssoAccountId: '123456789012',
    ssoRoleName: 'Admin',
  },
  name: 'Database SSO 1',
  color: '#00f97c',
  createdAt: +new Date(),
  authMethod: 'sso',
};
