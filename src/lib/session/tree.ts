/** 搜索时 buildTree 不注入占位分组，避免无匹配会话下出现空分组树 */
export const NO_GROUP_PLACEHOLDERS = []

/**
 * 构建会话树结构，支持分组和未分组会话
 * @param {array} savedSessions 已保存的会话列表，每个会话包含 id、label、group 等属性
 * @param {array} groupPlaceholders 分组占位符列表
 * @returns {array} 构建按照名称排序好的会话树结构（根层包含：顶级分组 + 未分组会话），每个节点包含 id、type、name、path 和 children 属性
 * @example
 * const tree = buildTree(savedSessions, groupPlaceholders)
 * console.log(tree)
 * // [
 * //   { id: '这是顶级分组', type: 'group', name: '这是顶级分组', path: '这是顶级分组', children: [{未分组会话节点属性（id、type、name、path 和 session）}] },
 * //   { id: 'group1', type: 'group', name: 'group1', path: 'group1', children: [{该顶级分组下的所有属性树结构（分组、会话）}] },
 * //   { id: 'saved-1774879238543-ui6r', type: 'session', name: '会话名字', session: {session属性字段} }{
 * // ]
 */
interface TreeGroupNode {
  id: string
  type: 'group'
  name: string
  path: string
  children: unknown[]
}

export function buildTree(savedSessions, groupPlaceholders) {
  const groupMap: Record<string, TreeGroupNode> = {}  // 临时存储分组节点，key 是分组路径，value 是分组对象
  /**
   * 获取或创建分组节点，如果不存在则创建一个新的分组节点并添加到 groupMap 中，同时处理父分组关系
   * @param {string} path 分组路径，例如 "分组1/子分组A"
   * @returns {object} 分组节点对象，包含 id、type、name、path 和 children 属性
   * @example
   * const node = getOrCreate('group1/subgroup1')
   * console.log(node)
   * // { id: 'group1/subgroup1', type: 'group', name: 'subgroup1', path: 'group1/subgroup1', children: [] }
   */
  const getOrCreate = (path) => {
    if (groupMap[path]) return groupMap[path]  // 如果分组节点已存在，直接返回
    const name = path.split('/').pop()  // 取路径最后一段作为分组显示名，例如 prod/db => db
    const node: TreeGroupNode = { id: path, type: 'group', name, path, children: [] }  // 创建新的分组节点对象，id 和 path 都使用完整路径，name 使用最后一段
    groupMap[path] = node  // 将节点缓存到 groupMap，后续可以直接复用
    const parentPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null  // 计算父分组路径，例如 prod/db => prod，单层分组则没有父分组
    if (parentPath) getOrCreate(parentPath).children.push(node)  // 如果有父分组，递归获取或创建父分组节点，并将当前节点添加到父分组的 children 中，构建树形结构
    return node
  }
  groupPlaceholders.forEach(g => getOrCreate(g))  // 先处理分组占位符（没有会话属于该分组），确保所有占位分组节点都被创建
  savedSessions.forEach(s => { if (s.group) getOrCreate(s.group) })  // 处理已保存的会话，确保所有已保存会话所属的分组节点都被创建
  const ungrouped = []
  savedSessions.forEach(s => {  // 把会话挂到对应分组；无分组会话放到根
    const sessNode = { id: s.savedId, type: 'session', name: s.label || s.host || s.id, session: s }
    if (s.group && groupMap[s.group]) groupMap[s.group].children.push(sessNode)  // 若 s.group 存在且对应分组节点存在 -> push 到该分组 children
    else ungrouped.push(sessNode)  // 否则放进 ungrouped（根级未分组会话）
  })
  const rootGroups = Object.values(groupMap).filter(n => !n.path.includes('/'))  // 拿到根分组：rootGroups = groupMap 中路径不含 / 的分组（顶级分组）

  const sortNodes = (nodes) => {  // 分组和会话分别按名称排序
    const groups = nodes.filter(n => n.type === 'group').sort((a, b) => a.name.localeCompare(b.name))
    const sessions = nodes.filter(n => n.type === 'session').sort((a, b) => a.name.localeCompare(b.name))
    groups.forEach(g => { g.children = sortNodes(g.children) })
    return [...groups, ...sessions]
  }
  return sortNodes([...rootGroups, ...ungrouped])
}

/**
 * 按当前展开状态深度优先扁平化可见树节点（供搜索框键盘导航）
 * @param {Array} nodes 树根节点列表
 * @param {function} isExp 分组是否展开
 * @returns {Array<{ id: string, type: string, node: object }>}
 */
export function flattenVisibleTree(nodes, isExp) {
  const out = []
  const walk = (list) => {
    for (const node of list) {
      out.push({ id: node.id, type: node.type, node })
      if (node.type === 'group' && isExp(node.path)) walk(node.children)
    }
  }
  walk(nodes)
  return out
}
