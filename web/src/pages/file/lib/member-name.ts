// a file inside an archive by its name, without the folders of its path
export const memberName = (path: string) => path.split('/').at(-1) || path;
