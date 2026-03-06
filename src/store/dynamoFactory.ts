import DynamoDBImport from 'aws-sdk/clients/dynamodb';

function getRuntimeDynamoDBCtor(): any {
  try {
    // Prefer Node runtime SDK in Electron renderer to avoid browser XHR/CORS path.
    // eslint-disable-next-line no-eval
    const req = typeof window !== 'undefined' && (window as any).require
      ? (window as any).require
      : eval('require');
    const mod = req('aws-sdk/clients/dynamodb');
    return mod.default || mod;
  } catch {
    return DynamoDBImport as any;
  }
}

export function createDynamoDB(configs?: any): DynamoDBImport {
  const DynamoDBCtor = getRuntimeDynamoDBCtor();
  return new DynamoDBCtor(configs);
}

export function createDocumentClient(configs?: any): DynamoDBImport.DocumentClient {
  const DynamoDBCtor = getRuntimeDynamoDBCtor();
  return new DynamoDBCtor.DocumentClient(configs);
}
