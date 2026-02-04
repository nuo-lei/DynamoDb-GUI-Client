declare module 'ini' {
  export function parse(str: string): Record<string, any>;
  export function stringify(obj: any): string;
}
