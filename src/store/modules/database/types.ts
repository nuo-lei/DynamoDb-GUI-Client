export interface SingleDatabaseModuleState {
  name: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  maxRetries: number;
}

export interface DatabaseModuleState {
  list: SingleDatabaseModuleState[];
  submitForm: SubmitForm;
  regionList: string[];
  showEditModal: boolean;
}

export interface SubmitForm {
  configs: DbConfigs;
  name: string;
  color: string;
  createdAt: number;
  authMethod: 'keys' | 'sso';
}

export interface DbConfigs {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  endpoint: string;
  maxRetries: number;
  dynamoDbCrc32: boolean;
  // SSO-specific optional fields
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
}
