import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type {
  DiscoveredSpreadsheetCell,
  EnumOption,
  GeneratedModelSchema,
  ModelParameter,
  ParameterType,
  SidecarConfig
} from './types';

const DEFAULT_SPREADSHEET_NAME = 'Parameters';
const KNOWN_METADATA_HEADERS = new Set([
  'label',
  'description',
  'unit',
  'default',
  'min',
  'max',
  'step',
  'group',
  'section',
  'hidden',
  'order',
  'options',
  'enum',
  'enumoptions'
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false
});

type ParsedSpreadsheet = {
  spreadsheetName: string;
  cells: DiscoveredSpreadsheetCell[];
};

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const getAttribute = (node: Record<string, unknown>, name: string): string | undefined => {
  const candidates = [
    `@_${name}`,
    `@_${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`,
    name,
    name[0]?.toUpperCase() ? `${name[0].toUpperCase()}${name.slice(1)}` : name
  ];
  for (const candidate of candidates) {
    const value = node[candidate];
    if (typeof value === 'string') return value;
  }
  return undefined;
};

const getNestedText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const direct = record['#text'];
  if (typeof direct === 'string') return direct;
  for (const nested of Object.values(record)) {
    const text = getNestedText(nested);
    if (text) return text;
  }
  return undefined;
};

const stripSpreadsheetTextPrefix = (raw: string): string => {
  const trimmed = raw.trim();
  return trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
};

const splitAddress = (address: string) => {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid spreadsheet cell address "${address}".`);
  }
  return {
    column: match[1].toUpperCase(),
    row: Number(match[2])
  };
};

const humanizeIdentifier = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const parseNumericToken = (raw: string): { value: number; unit?: string } | null => {
  const trimmed = stripSpreadsheetTextPrefix(raw);
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z%°]+)?$/);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: match[2]
  };
};

const parseBooleanToken = (raw: string): boolean | null => {
  const normalized = stripSpreadsheetTextPrefix(raw).trim().toLowerCase();
  if (['true', 'yes', 'on'].includes(normalized)) return true;
  if (['false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const parseEnumOptions = (raw: string | undefined): EnumOption[] | undefined => {
  if (!raw) return undefined;
  const values = raw
    .split(/[|,]/)
    .map((entry) => stripSpreadsheetTextPrefix(entry).trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  return values.map((value) => ({
    label: humanizeIdentifier(value),
    value
  }));
};

const inferParameterType = (
  rawValue: string,
  metadata: Record<string, string | undefined>,
  enumOptions: EnumOption[] | undefined
): { type: ParameterType; defaultValue: string | number | boolean; unit?: string } => {
  if (enumOptions && enumOptions.length > 0) {
    return {
      type: 'enum',
      defaultValue: stripSpreadsheetTextPrefix(metadata.default ?? rawValue).trim()
    };
  }

  const booleanValue = parseBooleanToken(metadata.default ?? rawValue);
  if (booleanValue !== null) {
    return {
      type: 'boolean',
      defaultValue: booleanValue
    };
  }

  const numericValue = parseNumericToken(metadata.default ?? rawValue);
  if (numericValue) {
    const explicitStep = parseNumericToken(metadata.step ?? '');
    const explicitType: ParameterType = explicitStep
      ? Number.isInteger(explicitStep.value) && Number.isInteger(numericValue.value)
        ? 'integer'
        : 'number'
      : Number.isInteger(numericValue.value)
        ? 'integer'
        : 'number';
    return {
      type: explicitType,
      defaultValue: numericValue.value,
      unit: metadata.unit ?? numericValue.unit
    };
  }

  return {
    type: 'text',
    defaultValue: stripSpreadsheetTextPrefix(metadata.default ?? rawValue)
  };
};

const buildConstraints = (metadata: Record<string, string | undefined>) => {
  const min = parseNumericToken(metadata.min ?? '');
  const max = parseNumericToken(metadata.max ?? '');
  const step = parseNumericToken(metadata.step ?? '');
  if (!min && !max && !step) return undefined;
  return {
    min: min?.value,
    max: max?.value,
    step: step?.value
  };
};

const collectObjects = (root: Record<string, unknown>) => {
  const document = toRecord(root.Document);
  const objectData = toRecord(document.ObjectData);
  return asArray(toRecord(objectData).Object).map(toRecord);
};

const findSpreadsheetObject = (root: Record<string, unknown>, spreadsheetName: string) => {
  const objects = collectObjects(root);
  return objects.find((objectNode) => {
    const name = getAttribute(objectNode, 'name');
    if (name === spreadsheetName) return true;
    const properties = asArray(toRecord(objectNode.Properties).Property).map(toRecord);
    return properties.some((propertyNode) => {
      const propertyName = getAttribute(propertyNode, 'name');
      if (propertyName !== 'Label') return false;
      const text = getNestedText(propertyNode);
      return typeof text === 'string' && text.trim() === spreadsheetName;
    });
  });
};

const hasSpreadsheetCellsProperty = (objectNode: Record<string, unknown>) => {
  const properties = asArray(toRecord(objectNode.Properties).Property).map(toRecord);
  return properties.some((propertyNode) => {
    const propertyName = getAttribute(propertyNode, 'name');
    const propertyType = getAttribute(propertyNode, 'type');
    return propertyName === 'cells' && typeof propertyType === 'string' && propertyType.startsWith('Spreadsheet::PropertySheet');
  });
};

const listSpreadsheetObjects = (root: Record<string, unknown>) =>
  collectObjects(root).filter((objectNode) => hasSpreadsheetCellsProperty(objectNode));

const collectCellsRecursive = (node: unknown, cells: DiscoveredSpreadsheetCell[]) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((entry) => collectCellsRecursive(entry, cells));
    return;
  }

  const record = node as Record<string, unknown>;
  const address = getAttribute(record, 'address');
  const alias = getAttribute(record, 'alias');
  const content = getAttribute(record, 'content') ?? getNestedText(record);
  if (address && typeof content === 'string') {
    cells.push({
      address,
      alias,
      raw: content
    });
  }

  for (const value of Object.values(record)) {
    collectCellsRecursive(value, cells);
  }
};

export const parseFCStdSpreadsheet = async (
  modelPath: string,
  spreadsheetName = DEFAULT_SPREADSHEET_NAME
): Promise<ParsedSpreadsheet> => {
  const buffer = await readFile(modelPath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('Document.xml')?.async('string');
  if (!documentXml) {
    throw new Error(`Could not find Document.xml inside ${path.basename(modelPath)}.`);
  }

  const parsed = xmlParser.parse(documentXml) as Record<string, unknown>;
  let spreadsheetObject = findSpreadsheetObject(parsed, spreadsheetName);
  if (!spreadsheetObject) {
    const spreadsheetObjects = listSpreadsheetObjects(parsed);
    if (spreadsheetObjects.length === 1) {
      spreadsheetObject = spreadsheetObjects[0];
      spreadsheetName = getAttribute(spreadsheetObject, 'name') ?? spreadsheetName;
    }
  }
  if (!spreadsheetObject) {
    throw new Error(`Could not find spreadsheet "${spreadsheetName}" in ${path.basename(modelPath)}.`);
  }

  const cells: DiscoveredSpreadsheetCell[] = [];
  collectCellsRecursive(spreadsheetObject, cells);

  const deduped = cells.filter(
    (cell, index, all) =>
      all.findIndex((entry) => entry.address === cell.address && entry.alias === cell.alias && entry.raw === cell.raw) === index
  );

  if (deduped.length === 0) {
    throw new Error(`Spreadsheet "${spreadsheetName}" does not contain any discoverable cells.`);
  }

  return {
    spreadsheetName,
    cells: deduped
  };
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

export const buildSchemaFromSpreadsheet = (
  modelPath: string,
  spreadsheet: ParsedSpreadsheet,
  sidecar?: SidecarConfig
): GeneratedModelSchema => {
  const rowMap = new Map<number, DiscoveredSpreadsheetCell[]>();

  spreadsheet.cells.forEach((cell) => {
    const { row } = splitAddress(cell.address);
    rowMap.set(row, [...(rowMap.get(row) ?? []), cell]);
  });

  const headerRow = rowMap.get(1) ?? [];
  const headerByColumn = new Map<string, string>();
  for (const cell of headerRow) {
    const { column } = splitAddress(cell.address);
    const header = normalizeHeader(stripSpreadsheetTextPrefix(cell.raw));
    if (KNOWN_METADATA_HEADERS.has(header)) {
      headerByColumn.set(column, header);
    }
  }

  const aliasedCells = spreadsheet.cells
    .filter((cell) => Boolean(cell.alias))
    .sort((left, right) => left.address.localeCompare(right.address, undefined, { numeric: true }));

  const parameters: ModelParameter[] = aliasedCells.map((cell, index) => {
    const alias = cell.alias as string;
    const { row } = splitAddress(cell.address);
    const rowCells = rowMap.get(row) ?? [];
    const metadata: Record<string, string | undefined> = {};

    for (const rowCell of rowCells) {
      const rowColumn = splitAddress(rowCell.address).column;
      const header = headerByColumn.get(rowColumn);
      if (!header) continue;
      metadata[header === 'section' ? 'group' : header] = stripSpreadsheetTextPrefix(rowCell.raw).trim();
    }

    if (!metadata.default) {
      metadata.default = stripSpreadsheetTextPrefix(cell.raw).trim();
    }
    if (!metadata.label) {
      metadata.label = humanizeIdentifier(alias);
    }
    if (!metadata.order) {
      metadata.order = String(index);
    }

    const enumOptions = parseEnumOptions(metadata.enumoptions ?? metadata.enum ?? metadata.options);
    const inferred = inferParameterType(cell.raw, metadata, enumOptions);

    return {
      id: alias,
      address: cell.address.toUpperCase(),
      label: metadata.label,
      description: metadata.description,
      unit: inferred.unit,
      group: metadata.group,
      hidden: parseBooleanToken(metadata.hidden ?? '') ?? false,
      order: Number(metadata.order),
      type: inferred.type,
      defaultValue: inferred.defaultValue,
      constraints: buildConstraints(metadata),
      enumOptions,
      sourceValue: stripSpreadsheetTextPrefix(cell.raw)
    };
  });

  const mergedParameters = parameters.map((parameter) => {
    const override = sidecar?.parameters?.[parameter.id];
    if (!override) return parameter;
    return {
      ...parameter,
      ...override,
      id: parameter.id,
      address: parameter.address,
      sourceValue: parameter.sourceValue
    };
  });

  mergedParameters.sort((left, right) => {
    const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });

  const fileName = path.basename(modelPath);
  const modelId =
    sidecar?.modelId ??
    fileName
      .replace(/\.FCStd$/i, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

  return {
    version: 1,
    modelId,
    title: sidecar?.branding?.title ?? sidecar?.title ?? humanizeIdentifier(modelId),
    source: {
      type: 'FCStd',
      fileName,
      spreadsheetName: sidecar?.spreadsheetName ?? spreadsheet.spreadsheetName
    },
    outputs: {
      preview: 'STL',
      downloads: ['STL', 'STEP']
    },
    parameters: mergedParameters
  };
};

export const loadSidecarConfig = async (sidecarPath: string): Promise<SidecarConfig> => {
  const raw = await readFile(sidecarPath, 'utf8');
  return JSON.parse(raw) as SidecarConfig;
};

export const inspectFreeCADModel = async (modelPath: string, sidecar?: SidecarConfig): Promise<GeneratedModelSchema> => {
  const spreadsheetName = sidecar?.spreadsheetName ?? DEFAULT_SPREADSHEET_NAME;
  const spreadsheet = await parseFCStdSpreadsheet(modelPath, spreadsheetName);
  return buildSchemaFromSpreadsheet(modelPath, spreadsheet, sidecar);
};
