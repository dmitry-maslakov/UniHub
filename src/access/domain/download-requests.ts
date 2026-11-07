// What a user asked to download at once: files and files inside archives,
// by the ids and paths they named. Kept for a few minutes, so the link
// POST /api/downloads answers with is a plain GET.
export interface DownloadRequest {
  userId: string;
  items: { file: string; member?: string }[];
}

export abstract class DownloadRequests {
  // keeps the request, usable more than once while it's kept; its id
  abstract put(request: DownloadRequest): Promise<string>;
  // null once it ran out, or never was
  abstract get(id: string): Promise<DownloadRequest | null>;
}
