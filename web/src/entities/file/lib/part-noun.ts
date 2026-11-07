import { fileType } from './file-type';

// what a file's parts are called
export const partNoun = (mime: string | null, name: string) => {
  const type = fileType(mime, name);
  return type === 'pdf' ? 'page' : type === 'slides' ? 'slide' : 'section';
};
