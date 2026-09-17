import type { BookmarkNode } from './browser-api';

export interface FlatBookmarkNode extends BookmarkNode {
  depth: number;
}

export interface SearchResult {
  node: BookmarkNode;
  breadcrumb: string[];
}

export function isFolder(node: BookmarkNode): boolean {
  return !node.url;
}

export function collectFolders(nodes: BookmarkNode[], result = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (isFolder(node)) {
      result.add(node.id);
      collectFolders(node.children ?? [], result);
    }
  }
  return result;
}

export function flattenVisibleNodes(
  nodes: BookmarkNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
): FlatBookmarkNode[] {
  const flattened: FlatBookmarkNode[] = [];

  for (const node of nodes) {
    flattened.push({ ...node, depth });
    if (isFolder(node) && expanded.has(node.id)) {
      flattened.push(...flattenVisibleNodes(node.children ?? [], expanded, depth + 1));
    }
  }

  return flattened;
}

export function searchBookmarks(nodes: BookmarkNode[], query: string): SearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const results: SearchResult[] = [];
  const visit = (currentNodes: BookmarkNode[], breadcrumb: string[]) => {
    for (const node of currentNodes) {
      const nextBreadcrumb = node.title ? [...breadcrumb, node.title] : breadcrumb;
      if (!isFolder(node)) {
        const haystack = `${node.title} ${node.url ?? ''}`.toLocaleLowerCase();
        if (haystack.includes(normalizedQuery)) {
          results.push({ node, breadcrumb });
        }
      }
      if (node.children) {
        visit(node.children, nextBreadcrumb);
      }
    }
  };

  visit(nodes, []);
  return results;
}

export function findNode(nodes: BookmarkNode[], id: string): BookmarkNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNode(node.children ?? [], id);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function isDescendant(nodes: BookmarkNode[], ancestorId: string, candidateId: string): boolean {
  const ancestor = findNode(nodes, ancestorId);
  return Boolean(ancestor?.children && findNode(ancestor.children, candidateId));
}

export function getFolderOptions(nodes: BookmarkNode[], excludedId?: string): Array<BookmarkNode & { depth: number }> {
  const options: Array<BookmarkNode & { depth: number }> = [];
  const visit = (currentNodes: BookmarkNode[], depth: number) => {
    for (const node of currentNodes) {
      if (!isFolder(node)) continue;
      // A folder cannot become its own descendant. Excluding the whole branch
      // also keeps the move picker aligned with the server-side tree invariant.
      if (node.id === excludedId) continue;
      options.push({ ...node, depth });
      visit(node.children ?? [], depth + 1);
    }
  };
  visit(nodes, 0);
  return options;
}

export function countBookmarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((total, node) => total + (isFolder(node) ? countBookmarks(node.children ?? []) : 1), 0);
}

export function countFolders(nodes: BookmarkNode[]): number {
  return nodes.reduce((total, node) => total + (isFolder(node) ? 1 + countFolders(node.children ?? []) : 0), 0);
}
