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

export interface TemplateManifest {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  version: string;
  category: TemplateCategory;
  runtime: TemplateRuntime;
  defaults: TemplateDefaults;
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
  sourceEnvironment: string;
  developmentPath: string;
  defaultRef: string;
  status: "stable" | "beta";
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
}

export interface CreateOptions {
  template?: string;
  source?: string;
  ref?: string;
  module?: string;
  title?: string;
  port?: string;
  npmRegistry?: string;
  jhlcRegistry?: string;
  localBackend?: string;
  localPublic?: string;
  yes?: boolean;
  dryRun?: boolean;
  skipInstall?: boolean;
  skipGit?: boolean;
  force?: boolean;
}

export interface ProjectMetadata {
  schemaVersion: number;
  template: { id: string; version: string };
  platformVersion: string | null;
  createdAt: string;
  createdBy: string;
  parameters: Record<string, unknown>;
}
