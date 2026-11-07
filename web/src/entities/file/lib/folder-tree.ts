export interface FolderNode<F> {
  // '' for the root
  name: string;
  // 'Predavanja/2026'
  path: string;
  folders: FolderNode<F>[];
  files: F[];
  // files in it and below
  count: number;
}

const byName = new Intl.Collator('und', { numeric: true });

// Files into their folders by `path` ('' is the root; 'a/b' nests b in a).
// Folders by name, numbers as people count them (l2 before l10), before
// files; files in the order given.
export function folderTree<F extends { path: string }>(
  files: readonly F[],
): FolderNode<F> {
  const root: FolderNode<F> = {
    name: '',
    path: '',
    folders: [],
    files: [],
    count: 0,
  };
  for (const file of files) {
    let node = root;
    node.count += 1;
    let path = '';
    for (const name of file.path.split('/').filter(Boolean)) {
      path = path ? `${path}/${name}` : name;
      let next = node.folders.find((folder) => folder.name === name);
      if (!next) {
        next = { name, path, folders: [], files: [], count: 0 };
        node.folders.push(next);
      }
      node = next;
      node.count += 1;
    }
    node.files.push(file);
  }
  sortFolders(root);
  return root;
}

function sortFolders<F>(node: FolderNode<F>) {
  node.folders.sort((a, b) => byName.compare(a.name, b.name));
  node.folders.forEach(sortFolders);
}
