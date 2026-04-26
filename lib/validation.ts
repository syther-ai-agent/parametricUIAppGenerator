import type { GeneratedModelSchema, ModelParameter } from '../src/types';
import type { ParameterValue } from './runtime';

const assertEnum = (parameter: ModelParameter, value: string) => {
  if (!parameter.enumOptions?.some((option) => option.value === value)) {
    throw new Error(`Parameter ${parameter.id} must be one of the allowed options.`);
  }
};

const normalizeNumber = (parameter: ModelParameter, value: unknown) => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Parameter ${parameter.id} must be numeric.`);
  }
  if (parameter.constraints?.min !== undefined && numberValue < parameter.constraints.min) {
    throw new Error(`Parameter ${parameter.id} must be at least ${parameter.constraints.min}.`);
  }
  if (parameter.constraints?.max !== undefined && numberValue > parameter.constraints.max) {
    throw new Error(`Parameter ${parameter.id} must be at most ${parameter.constraints.max}.`);
  }
  return parameter.type === 'integer' ? Math.round(numberValue) : numberValue;
};

export const normalizeParameterValues = (
  schema: GeneratedModelSchema,
  rawValues: Record<string, unknown> | undefined
): Record<string, ParameterValue> => {
  const values = rawValues ?? {};
  return Object.fromEntries(
    schema.parameters.map((parameter) => {
      const rawValue = values[parameter.id] ?? parameter.defaultValue;

      if (parameter.type === 'boolean') {
        const booleanValue =
          typeof rawValue === 'boolean'
            ? rawValue
            : typeof rawValue === 'string'
              ? ['true', '1', 'yes', 'on'].includes(rawValue.toLowerCase())
              : Boolean(rawValue);
        return [parameter.id, booleanValue];
      }

      if (parameter.type === 'number' || parameter.type === 'integer') {
        return [parameter.id, normalizeNumber(parameter, rawValue)];
      }

      if (parameter.type === 'enum') {
        const stringValue = String(rawValue);
        assertEnum(parameter, stringValue);
        return [parameter.id, stringValue];
      }

      return [parameter.id, String(rawValue)];
    })
  );
};
