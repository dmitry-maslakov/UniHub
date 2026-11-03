// what other modules get to know about a file
export interface FileDto {
  id: string;
  portal: string;
  name: string;
  mime: string | null;
  contentHash: string | null;
}

export const toFileDto = (file: FileDto): FileDto => ({
  id: file.id,
  portal: file.portal,
  name: file.name,
  mime: file.mime,
  contentHash: file.contentHash,
});
