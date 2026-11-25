export type MessageVariables = Readonly<Record<string, string | number>>;

export function formatMessage(template: string, variables: MessageVariables = {}): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, key: string) => {
    const value = variables[key];
    return value === undefined ? placeholder : String(value);
  });
}
