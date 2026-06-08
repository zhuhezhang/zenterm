/**
 * 兼容旧设备使用的diffie-hellman-group1-sha1算法（会报错Unknown DH group）。
 * 
 * Unknown DH group 不是服务端拒绝算法，而是 ZTerm（Electron 应用）本地 crypto 层不支持 modp2 这个 DH 参数组。
 * 调用链如下：
 * 1.协商选中 diffie-hellman-group1-sha1；
 * 2.ssh2 在密钥交换时调用 Node.js 的 crypto.createDiffieHellmanGroup('modp2')；
 * 3.Electron 使用 BoringSSL，从 Node 18 起 BoringSSL 移除了 modp1 / modp2 预定义组（1024-bit 及以下，被认为不安全）；
 * 4.查找失败 → 抛出 Unknown DH group。
 *
 * 解决办法：在 Worker 加载 ssh2 之前，对 crypto.createDiffieHellmanGroup 做 monkey-patch，用 RFC 2409 的 prime + generator
 * 手动构造 DH 对象（BoringSSL 仍支持 createDiffieHellman(prime, generator)，只是不支持命名组 modp2）。
*/
import crypto from 'node:crypto'

/** RFC 2409 Section 6.2 — 1024-bit MODP group（diffie-hellman-group1-sha1 → modp2） */
const MODP2_PRIME_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381FFFFFFFFFFFFFFFF'

let installed = false

/** 安装 modp2 polyfill（幂等；原生已支持时 no-op） */
export function installLegacyModp2Polyfill(): void {
  if (installed) return
  installed = true
  try {
    crypto.createDiffieHellmanGroup('modp2').generateKeys()  // 如果原生支持，则直接返回
    return
  } catch{}

  const original = crypto.createDiffieHellmanGroup.bind(crypto)
  ;(crypto as { createDiffieHellmanGroup: typeof crypto.createDiffieHellmanGroup }).createDiffieHellmanGroup = (
    name: string,
  ) => {
    if (name === 'modp2') {
      return crypto.createDiffieHellman(MODP2_PRIME_HEX, 'hex', 2)
    }
    return original(name)
  }
}

installLegacyModp2Polyfill()
