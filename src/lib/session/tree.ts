import type { FlattenedTreeItem, SavedSession, SessionTreeGroupNode, SessionTreeNode } from '../../types/session'
import { sessionEndpoint } from '../../types/session'

/** 搜索时 buildTree 不注入占位分组，避免无匹配会话下出现空分组树 */
export const NO_GROUP_PLACEHOLDERS: string[] = []

export function buildTree(
  savedSessions: SavedSession[],
  groupPlaceholders: string[],
): SessionTreeNode[] {
  const groupMap: Record<string, SessionTreeGroupNode> = {}
  const getOrCreate = (path: string): SessionTreeGroupNode => {
    if (groupMap[path]) return groupMap[path]
    const name = path.split('/').pop() ?? path
    const node: SessionTreeGroupNode = { id: path, type: 'group', name, path, children: [] }
    groupMap[path] = node
    const parentPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null
    if (parentPath) getOrCreate(parentPath).children.push(node)
    return node
  }
  groupPlaceholders.forEach((g) => getOrCreate(g))
  savedSessions.forEach((s) => {
    if (s.group) getOrCreate(s.group)
  })
  const ungrouped: SessionTreeNode[] = []
  savedSessions.forEach((s) => {
    const sessNode: SessionTreeNode = {
      id: s.savedId,
      type: 'session',
      name: s.label || sessionEndpoint(s) || s.savedId,
      session: s,
    }
    if (s.group && groupMap[s.group]) groupMap[s.group].children.push(sessNode)
    else ungrouped.push(sessNode)
  })
  const rootGroups = Object.values(groupMap).filter((n) => !n.path.includes('/'))

  const sortNodes = (nodes: SessionTreeNode[]): SessionTreeNode[] => {
    const groups = nodes
      .filter((n): n is SessionTreeGroupNode => n.type === 'group')
      .sort((a, b) => a.name.localeCompare(b.name))
    const sessions = nodes
      .filter((n) => n.type === 'session')
      .sort((a, b) => a.name.localeCompare(b.name))
    groups.forEach((g) => {
      g.children = sortNodes(g.children)
    })
    return [...groups, ...sessions]
  }
  return sortNodes([...rootGroups, ...ungrouped])
}

export function flattenVisibleTree(
  nodes: SessionTreeNode[],
  isExp: (path: string) => boolean,
): FlattenedTreeItem[] {
  const out: FlattenedTreeItem[] = []
  const walk = (list: SessionTreeNode[]) => {
    for (const node of list) {
      out.push({ id: node.id, type: node.type, node })
      if (node.type === 'group' && isExp(node.path)) walk(node.children)
    }
  }
  walk(nodes)
  return out
}
