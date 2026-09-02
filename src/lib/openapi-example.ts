export function generateExampleBody(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return '{}';
  const normalized = normalizeSchema(schema as Record<string, unknown>);
  const example = normalized.example !== undefined
    ? normalized.example
    : getDefaultForType(normalized);
  return JSON.stringify(example ?? {}, null, 2);
}

function getDefaultForType(schema: Record<string, unknown>): unknown {
  const normalized = normalizeSchema(schema);
  if (normalized.example !== undefined) return normalized.example;
  if (normalized.default !== undefined) return normalized.default;
  if (normalized.enum && Array.isArray(normalized.enum)) return normalized.enum[0];
  if (normalized.properties && (normalized.type === 'object' || !normalized.type)) {
    const properties = normalized.properties as Record<string, Record<string, unknown>>;
    const required = Array.isArray(normalized.required) ? normalized.required as string[] : [];
    const example: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value.readOnly === true) continue;
      if (!required.includes(key) && Object.keys(properties).length > 6) continue;
      example[key] = getDefaultForType(value);
    }
    return example;
  }
  switch (normalized.type) {
    case 'string': return '';
    case 'number': case 'integer': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return null;
  }
}

function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const preferredBranch = Array.isArray(schema.oneOf)
    ? schema.oneOf[0]
    : Array.isArray(schema.anyOf)
      ? schema.anyOf[0]
      : undefined;
  if (preferredBranch && typeof preferredBranch === 'object') {
    return normalizeSchema(preferredBranch as Record<string, unknown>);
  }

  if (!Array.isArray(schema.allOf)) return schema;

  const merged: Record<string, unknown> = { ...schema };
  delete merged.allOf;
  const properties: Record<string, unknown> = schema.properties && typeof schema.properties === 'object'
    ? { ...schema.properties as Record<string, unknown> }
    : {};
  const required = new Set<string>(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : []
  );

  for (const branch of schema.allOf) {
    if (!branch || typeof branch !== 'object') continue;
    const normalized = normalizeSchema(branch as Record<string, unknown>);
    Object.assign(merged, normalized);
    if (normalized.properties && typeof normalized.properties === 'object') {
      Object.assign(properties, normalized.properties);
    }
    if (Array.isArray(normalized.required)) {
      for (const key of normalized.required) {
        if (typeof key === 'string') required.add(key);
      }
    }
  }

  if (Object.keys(properties).length > 0) merged.properties = properties;
  if (required.size > 0) merged.required = [...required];
  return merged;
}
