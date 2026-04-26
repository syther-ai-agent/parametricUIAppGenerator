export type ParameterType = 'number' | 'integer' | 'boolean' | 'enum' | 'text';
export type ModelSourceType = 'FCStd' | 'STEP';
export type ProjectSourceType = ModelSourceType;
export type PreviewFormat = 'STL' | 'GLB';
export type DownloadFormat = 'STL' | 'STEP';

export type ParameterConstraint = {
  min?: number;
  max?: number;
  step?: number;
};

export type VisibilityRule = {
  parameter: string;
  equals: string | number | boolean;
};

export type EnumOption = {
  label: string;
  value: string;
};

export type ModelParameter = {
  id: string;
  address: string;
  label: string;
  description?: string;
  unit?: string;
  group?: string;
  hidden?: boolean;
  order?: number;
  type: ParameterType;
  defaultValue: string | number | boolean;
  constraints?: ParameterConstraint;
  enumOptions?: EnumOption[];
  visibleWhen?: VisibilityRule;
  sourceValue: string;
};

export type GeneratedModelSchema = {
  version: 1;
  modelId: string;
  title: string;
  source: {
    type: ModelSourceType;
    fileName: string;
    spreadsheetName?: string;
  };
  outputs: {
    preview: PreviewFormat;
    downloads: DownloadFormat[];
  };
  parameters: ModelParameter[];
};

export type DiscoveredSpreadsheetCell = {
  address: string;
  alias?: string;
  raw: string;
};

export type SidecarParameterOverride = Partial<
  Omit<ModelParameter, 'id' | 'address' | 'type' | 'defaultValue' | 'sourceValue'>
> & {
  type?: ParameterType;
  defaultValue?: string | number | boolean;
};

export type SidecarConfig = {
  title?: string;
  modelId?: string;
  spreadsheetName?: string;
  branding?: {
    title?: string;
    subtitle?: string;
  };
  parameters?: Record<string, SidecarParameterOverride>;
};

export type ProjectCapabilities = {
  configurable: boolean;
  previewFormats: PreviewFormat[];
  downloadFormats: DownloadFormat[];
};

export type ProjectRecord = {
  id: string;
  sourceType: ModelSourceType;
  sourceFileName: string;
  createdAt: string;
  title: string;
  capabilities: ProjectCapabilities;
};
