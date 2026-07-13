export type TemplateCategory = "frontend" | "backend" | "mobile";

export interface TemplateRuntime {
  node: string;
  recommendedNode: string;
  packageManager: string;
}

export interface TemplateDefaults {
  projectName: string;
  moduleName: string;
  title: string;
  devServerPort: number;
  localBackendUrl?: string;
  localPublicUrl?: string;
  npmRegistry: string;
  jhlcRegistry: string;
}

export interface TemplateFeature {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  required?: boolean;
  package?: string;
}

export interface TemplateManifest {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  version: string;
  category: TemplateCategory;
  runtime: TemplateRuntime;
  defaults: TemplateDefaults;
  features?: TemplateFeature[];
  entry: {
    interactive: string;
    nonInteractive: string;
  };
  generatedMetadata: string;
}

export interface CatalogTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  sourceEnvironment?: string;
  defaultSource: string;
  defaultRef: string;
  status: "stable" | "beta";
  tags?: string[];
}

export interface CatalogFile {
  schemaVersion: number;
  templates: CatalogTemplate[];
}

export interface UserConfig {
  schemaVersion: number;
  catalogFile?: string;
  templateSource?: string;
  templateRef?: string;
  npmRegistry?: string;
  jhlcRegistry?: string;
  autoInstall: boolean;
  autoGit: boolean;
  cacheTtlMinutes: number;
}

export interface ProjectInput {
  projectName: string;
  moduleName: string;
  title: string;
  devServerPort: number;
  localBackendUrl: string;
  localPublicUrl: string;
  npmRegistry: string;
  jhlcRegistry: string;
  environments: Record<string, { webUrl: string; apiPrefix: string }>;
  features: string[];
}

export interface CreateOptions {
  category?: TemplateCategory;
  template?: string;
  features?: string;
  standards?: boolean;
  source?: string;
  ref?: string;
  module?: string;
  title?: string;
  port?: string;
  npmRegistry?: string;
  jhlcRegistry?: string;
  localBackend?: string;
  localPublic?: string;
  config?: string;
  yes?: boolean;
  dryRun?: boolean;
  skipInstall?: boolean;
  skipGit?: boolean;
  force?: boolean;
  cache?: boolean;
}

export interface ProjectMetadata {
  schemaVersion: number;
  template: { id: string; version: string };
  platformVersion: string | null;
  createdAt: string;
  createdBy: string;
  parameters: Record<string, unknown>;
}

export interface TemplateCacheMetadata {
  schemaVersion: number;
  source: string;
  ref: string;
  cachedAt: string;
  templateId?: string;
  templateVersion?: string;
}
