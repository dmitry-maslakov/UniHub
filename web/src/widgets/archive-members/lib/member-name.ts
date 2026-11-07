// a file inside an archive by its name, without the folders of its path
export const memberName = (path: string) => path.split('/').at(-1) || path;

// the folders of a member's path, '' at the top of the archive
export const memberFolder = (path: string) =>
  path.split('/').slice(0, -1).join('/');
