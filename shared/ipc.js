"use strict";
/**
 * 主进程 ↔ 渲染进程 IPC 统一响应：{ success, content }；失败时另含 errorKnown
 * 前后端共用：主进程 ipcOk/ipcFail、渲染进程 window.zterm.invoke 返回值、formatIpcError 等
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIpcError = isIpcError;
/**
 * 判断是否为 ipc 错误
 * @param e 未知对象
 * @returns 是否为 ipc 错误
 */
function isIpcError(e) {
    return (!!e &&
        typeof e === 'object' &&
        'ipcCode' in e &&
        typeof e.ipcCode === 'string');
}
