// the .proto messages as @grpc/proto-loader hands them over (camelCase,
// optional fields left out when not set)

// google.protobuf.Timestamp
export interface Timestamp {
  seconds: number;
  nanos?: number;
}

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
  publishedAt?: Timestamp;
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
  updatedAt?: Timestamp;
}

export interface ContentChunk {
  externalId?: string;
  data?: Buffer;
  sha256?: string;
}

export interface ContentResult {
  hash: string;
  changed: boolean;
}

export interface Ref {
  externalId: string;
}

export interface State {
  json?: string;
}
