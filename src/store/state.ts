import { createDocumentClient, createDynamoDB } from './dynamoFactory';
import { RootState } from './types';

const state: RootState = {
  dbInstance: createDynamoDB(),
  dbClient: createDocumentClient(),
  currentTable: '',
  currentDb: '',
  tables: [],
  filterText: '',
  loading: false,
  response: {
    title: '',
    type: '',
    message: '',
  },
};

export default state;
