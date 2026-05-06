/** 本地存储会话的键名 */
const STORAGE_KEY = 'zterm_saved_sessions'

/** 各会话类型允许持久化的字段（不含 label/group/savedId/savedAt 这些公共字段） */
const TYPE_FIELDS = {
  ssh: ['host', 'port', 'username', 'password', 'privateKey', 'passphrase', 'authType', 'enableSftp'],
  telnet: ['host', 'port', 'username', 'password'],
  serial: ['path', 'baudRate', 'dataBits', 'stopBits', 'parity'],
}

/**
 * 按会话类型裁剪配置字段，避免持久化无关参数
 * @param {Object} config 原始会话配置
 * @returns {Object} 裁剪后的会话配置
 */
function normalizeSessionForStorage(config) {
  const type = config?.type
  const allowed = TYPE_FIELDS[type] || []
  const picked = {}
  for (const key of allowed) {
    if (config[key] !== undefined) picked[key] = config[key]
  }
  return {
    type,
    label: config.label,
    group: config.group,
    ...picked,
  }
}

/**
 * 从本地存储中加载已保存的会话（JSON数组）
 * @returns {Array} 会话列表，如果没有数据或解析失败则返回空数组
 */
export function loadSavedSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) { return [] }
}

/**
 * 将会话列表保存到本地存储
 * @param {Array} sessions 要保存的会话列表（JSON数组）
 */
export function saveSessions(sessions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)) } catch (e) {}
}

/** 
 * 保证同一分组内标签名唯一
 * @param {Array} sessions 当前会话列表
 * @param {string} group 会话分组
 * @param {string} label 期望的标签名
 * @param {string} [excludeSavedId] 可选的会话savedId，用于编辑会话时排除自身
 * @returns {string} 确保唯一后的标签名，如果冲突则自动添加 (1)、(2) 等后缀
 */
export function uniqueLabelInGroup(sessions, group, label, excludeSavedId) {
  const siblings = sessions.filter(s =>
    (s.group || '') === (group || '') &&
    s.savedId !== excludeSavedId
  )  // 这里把 undefined / null 也统一当成空字符串处理，仅保留与当前 group 相同、且不是自己的会话，用于检查标签名冲突
  const used = new Set(siblings.map(s => s.label)) // 遍历取出每个会话的标签名，放入集合中用于快速查重
  if (!used.has(label)) return label
  let i = 1
  while (used.has(`${label}(${i})`)) i++
  return `${label}(${i})`
}

/**
 * 添加或更新已保存的会话，如果 config 中有 savedId 则更新对应会话，否则新建一个会话
 * @param {Array} sessions 当前会话列表
 * @param {Object} config 会话配置对象，必须包含 group、label 等属性，编辑时必须包含 savedId
 * @returns {Array} 更新后的会话列表
 */
export function addSavedSession(sessions, config) {
  const normalized = normalizeSessionForStorage(config)
  const now = Date.now()
  const sid = config.savedId || ('saved-' + now + '-' + Math.random().toString(36).slice(2, 6))  // 不存在则生产新的 savedId，格式为 saved-时间戳-随机字符串
  const label = uniqueLabelInGroup(sessions, normalized.group, normalized.label, sid)
  const newSession = { ...normalized, label, savedId: sid, savedAt: now }

  if (config.savedId) {  // 如果有 savedId，说明是编辑操作，直接替换该会话
    const next = sessions.map(s => s.savedId === config.savedId ? newSession : s)
    saveSessions(next)
    return next
  }

  const next = [...sessions, newSession]  // 该项目很多时候不直接对原数组进行修改，而是构造一个新的数组（比如使用 map、filter、扩展运算符等），以便更好地配合 React 的状态更新机制（通过比较新旧数组的引用来判断是否需要重新渲染），也避免意外影响到其他引用了同一个数组的地方
  saveSessions(next)
  return next
}

/** 
 * 复制已保存的会话
 * @param {Array} sessions 当前会话列表
 * @param {string} savedId 要复制的会话 Id
 * @returns {Array} 更新后的会话列表
 */
export function duplicateSavedSession(sessions, savedId) {
  const src = sessions.find(s => s.savedId === savedId)
  if (!src) return sessions
  const now = Date.now()
  const newId = 'saved-' + now + '-' + Math.random().toString(36).slice(2, 6)
  const label = uniqueLabelInGroup(sessions, src.group, src.label)
  const copy = { ...src, savedId: newId, label, savedAt: now }
  const next = [...sessions, copy]
  saveSessions(next)
  return next
}

/**
 * 从本地存储中删除已保存的会话
 * @param {Array} sessions 当前会话列表
 * @param {string} savedId 要删除的会话 Id
 * @returns {Array} 更新后的会话列表
 */
export function removeSavedSession(sessions, savedId) {
  const next = sessions.filter(s => s.savedId !== savedId)
  saveSessions(next)
  return next
}

/**
 * 重新排序会话列表，将 fromId 的会话移动到 toId 之前，如果 toId 为空则移动到末尾，同时可选修改分组
 * @param {Array} sessions 当前会话列表
 * @param {string} fromId 要移动的会话 Id
 * @param {string} toId 目标位置的会话 Id，或 null/undefined 表示移动到末尾
 * @param {string} [targetGroup] 可选的新分组名称，如果提供则同时修改分组
 * @returns {Array} 更新后的会话列表
 */
export function reorderSessions(sessions, fromId, toId, targetGroup) {
  const arr = [...sessions]
  const fromIdx = arr.findIndex(s => s.savedId === fromId)
  if (fromIdx === -1) return sessions
  const [item] = arr.splice(fromIdx, 1)
  const moved = { ...item, group: targetGroup !== undefined ? targetGroup : item.group }
  const tmpArr = arr.map(s => s.savedId === fromId ? null : s).filter(Boolean)  // 构造一个没有 fromId 的临时会话数组用于检查标签名冲突（filter(Boolean)会过滤掉 null 值）
  moved.label = uniqueLabelInGroup(tmpArr, moved.group, moved.label, moved.savedId)

  if (toId) {
    const toIdx = arr.findIndex(s => s.savedId === toId)
    arr.splice(toIdx >= 0 ? toIdx : arr.length, 0, moved)
  } else {
    arr.push(moved)
  }
  saveSessions(arr)
  return arr
}

/**
 * 导出会话列表为 JSON 文件，文件名包含当前日期
 * @param {Array} sessions 要导出的会话列表
 */
export function exportSessions(sessions) {
  const data = JSON.stringify(sessions, null, 2)  // null, 2 表示美化缩进为 2 个空格，方便文件阅读
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)  // 生成一个本地可访问的临时 URL，指向这个内存中的文件内容
  const a = document.createElement('a')  // 创建一个隐藏的 <a> 元素，用于触发下载
  a.href = url
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  a.download = `zterm-sessions-${date}-${hh}${mm}${ss}.json`
  a.click()  // 程序性地“点击”这个链接，启动浏览器下载流程
  URL.revokeObjectURL(url)  // 释放创建的临时 URL，避免内存泄漏
}

/**
 * 从 JSON 文件中导入会话列表，返回一个 Promise，解析成功则返回会话数组，失败则抛出错误
 * @param {File} file 用户选择的 JSON 文件对象
 * @returns {Promise<Array>} 解析后的会话列表
 */
export function importSessions(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()  // 使用浏览器提供的 FileReader API 来读取用户选中的文件内容
    reader.onload = (e) => {  // 绑定事件：文件读取后触发
      try {
        const imported = JSON.parse(e.target.result)  // e.target.result 是读取到的文本内容，尝试解析为 JSON 对象
        if (!Array.isArray(imported)) throw new Error('格式错误')
        resolve(imported)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsText(file) // 以文本形式读取文件内容，触发 onload 或 onerror 事件
  })
}

/** 占位分组（没有会话的分组）的本地存储键名 */
const PLACEHOLDER_KEY = '__zterm_group_placeholders__'

/**
 * 加载占位分组列表，返回一个字符串数组，如果没有数据或解析失败则返回空数组
 * 占位分组用于在会话列表中显示没有会话的分组，以便用户可以将会话拖入这些分组
 * @returns {Array} 占位分组名称列表
 */
export function loadGroupPlaceholders() {
  try {
    const raw = localStorage.getItem(PLACEHOLDER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * 保存占位分组列表
 * @param {Array} list 要保存的占位分组名称列表
 */
export function saveGroupPlaceholders(list) {
  try { localStorage.setItem(PLACEHOLDER_KEY, JSON.stringify(list)) } catch {}
}

/**
 * 添加一个占位分组，如果已存在则不添加，返回更新后的占位分组列表
 * @param {Array} list 当前占位分组列表
 * @param {string} groupName 要添加的分组名称
 * @returns {Array} 更新后的占位分组列表
 */
export function addGroupPlaceholder(list, groupName) {
  if (list.includes(groupName)) return list
  const next = [...list, groupName]
  saveGroupPlaceholders(next)
  return next
}

/**
 * 删除一个占位分组，返回更新后的占位分组列表
 * @param {Array} list 当前占位分组列表
 * @param {string} groupName 要删除的分组名称
 * @returns {Array} 更新后的占位分组列表
 */
export function removeGroupPlaceholder(list, groupName) {
  const next = list.filter(g => g !== groupName)
  saveGroupPlaceholders(next)
  return next
}

/**
 * 若某占位分组路径上已有已保存会话，则从占位列表中移除该项，使该分组表现为「已有会话」而非纯占位
 * @param {Array} sessions 当前已保存会话列表
 * @param {Array} placeholders 当前占位分组列表
 * @returns {Array} 修剪后的占位分组列表
 */
export function prunePlaceholdersForOccupiedGroups(sessions, placeholders) {
  const occupied = new Set()
  for (const s of sessions) {
    if (s.group) occupied.add(s.group)
  }
  return placeholders.filter(g => !occupied.has(g))
}

/**
 * 会话从某命名分组移出后，若该分组上已无任何会话，返回该分组名称以便添加占位分组（根分组不处理）
 * @param {string|undefined} oldGroup 移出前的分组名称
 * @param {Array} nextSessions 移动完成后的会话列表
 * @returns {string|undefined} 需恢复为占位符的分组名称，不需要则 undefined
 */
export function vacatedNamedGroupIfEmpty(oldGroup, nextSessions) {
  if (!oldGroup) return undefined
  if (nextSessions.some(s => (s.group || '') === (oldGroup || ''))) return undefined
  return oldGroup
}

/**
 * 从会话列表中提取分组名称列表，合并占位分组，返回一个去重且排序后的分组名称数组
 * @param {Array} sessions 当前会话列表
 * @param {Array} placeholders 占位分组列表
 * @returns {Array} 分组名称列表
 */
export function getGroups(sessions, placeholders = []) {
  const groups = new Set(placeholders)
  sessions.forEach(s => { if (s.group) groups.add(s.group) })
  return Array.from(groups).sort()
}
