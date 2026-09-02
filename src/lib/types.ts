// === Environment & Auth Types ===

export interface Environment {
  id: string;
  name: string;
  baseUrl: string;         // e.g. https://api.github.com
  enterpriseSlug: string;  // e.g. tpitest
  orgName: string;         // e.g. tpitest-org
  authMethod: 'pat' | 'github-app';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatCredential {
  environmentId: string;
  token: string; // encrypted at rest
}

export interface AppCredential {
  environmentId: string;
  appId: string;
  privateKey: string;       // encrypted at rest
  installationId: string;
}

// === OpenAPI / Endpoint Types ===

export interface ApiEndpoint {
  id: string;
  category: string;
  subcategory: string;
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  pathParams: ApiParameter[];
  queryParams: ApiParameter[];
  bodySchema: string | null;   // JSON string of the schema
  responseSchema: string | null;
  isDeprecated: boolean;
  specVersion: string;         // e.g. "api.github.com" or "ghes-3.12"
}

export interface ApiParameter {
  name: string;
  description: string;
  required: boolean;
  type: string;
  default?: string;
  enum?: string[];
  style?: string;
  explode?: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// === Request/Response Types ===

export interface ExecuteRequest {
  environmentId: string;
  method: HttpMethod;
  path: string;
  pathParams: Record<string, string>;
  queryParams: Record<string, string | string[]>;
  headers: Record<string, string>;
  body: string | null;
}

export interface ExecuteResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  timing: number;         // ms
  rateLimit: RateLimitInfo | null;
  nextPageUrl: string | null;
  nextPageRequest?: {
    environmentId: string;
    method: HttpMethod;
    path: string;
    headers: Record<string, string>;
    operationId?: string;
    category?: string;
  } | null;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;   // unix timestamp
  used: number;
  resource: string;
}

// === History Types ===

export interface HistoryEntry {
  id: string;
  environmentId: string;
  method: HttpMethod;
  path: string;
  resolvedUrl: string;
  status: number;
  timing: number;
  requestBody: string | null;
  responseBody: string | null;
  responseHeaders: string | null;
  createdAt: string;
  operationId: string | null;
  category: string | null;
}

// === Collection Types ===

export interface Collection {
  id: string;
  name: string;
  description: string;
  environmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  operationId: string | null;
  method: HttpMethod;
  path: string;
  pathParams: string;    // JSON
  queryParams: string;   // JSON
  headers: string;       // JSON
  body: string | null;
  sortOrder: number;
}

// === App State ===

export interface AppState {
  activeEnvironmentId: string | null;
  selectedEndpoint: ApiEndpoint | null;
  sidebarCollapsed: boolean;
  responseCollapsed: boolean;
}
