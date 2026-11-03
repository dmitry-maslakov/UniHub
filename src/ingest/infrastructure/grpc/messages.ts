// the .proto messages as @grpc/proto-loader hands them over (camelCase,
// optional fields left out when not set)

export interface CourseRecord {
  externalId: string;
  name: string;
  url?: string;
  metaJson?: string;
}

export interface ItemRecord {
  externalId: string;
  course?: string;
  kind: string;
  title?: string;
  url?: string;
  publishedAt?: string;
  rawJson: string;
}

export interface FileRecord {
  externalId: string;
  course?: string;
  item?: string;
  name: string;
  path?: string;
  url?: string;
  size?: number;
  mime?: string;
  updatedAt?: string;
}

export interface ContentChunk {
  externalId?: string;
  data?: Buffer;
}

export interface Removal {
  kind: string;
  externalId: string;
}

export interface State {
  json?: string;
}
