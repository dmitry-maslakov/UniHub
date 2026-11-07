import type { FolderNode } from './folder-tree';

// every file in a folder and below it, in the order the tree shows them:
// its own files after its folders'
export function filesIn<F>(node: FolderNode<F>): F[] {
  return [...node.folders.flatMap(filesIn), ...node.files];
}
