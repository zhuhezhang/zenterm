/** errorMappers.js */
export const ERRORS = {
  zh: {
    "withRaw": "{friendly}（{raw}）",
    "ssh": {
      "unknown": "SSH 连接失败：未知错误",
      "auth": "SSH 认证失败：用户名或密码错误",
      "timeout": "SSH 连接超时：服务器无响应，请检查网络、主机和端口",
      "refused": "SSH 连接被拒绝：目标端口未开启 SSH 服务",
      "dns": "SSH 主机不可达：地址无法解析，请检查主机名或 IP",
      "net": "SSH 主机不可达：网络路由不可达，请检查网络连通性",
      "generic": "SSH 连接失败：请检查连接参数和网络状态"
    },
    "sftp": {
      "unknown": "SFTP 连接失败：未知错误",
      "kex": "SFTP 连接失败：没有匹配的密钥交换算法",
      "subsystem": "SFTP 连接失败：不支持打开 SFTP 子系统",
      "generic": "SFTP 连接失败：请检查连接参数、网络状态、服务器配置等"
    },
    "telnet": {
      "unknown": "Telnet 连接失败：未知错误",
      "timeout": "Telnet 连接超时：服务器无响应，请检查网络、主机和端口",
      "refused": "Telnet 连接被拒绝：目标端口未开启 Telnet 服务",
      "dns": "Telnet 主机不可达：地址无法解析，请检查主机名或 IP",
      "net": "Telnet 主机不可达：网络路由不可达，请检查网络连通性",
      "generic": "Telnet 连接失败：请检查连接参数和网络状态"
    },
    "serial": {
      "unknown": "串口连接失败：未知错误",
      "access": "串口打开失败：端口被占用或权限不足",
      "missing": "串口不存在：请检查端口路径是否正确",
      "baud": "串口参数错误：请检查波特率等配置",
      "generic": "串口连接失败：请检查端口状态和连接参数"
    }
  },
  en: {
    "withRaw": "{friendly} ({raw})",
    "ssh": {
      "unknown": "SSH failed: unknown error",
      "auth": "SSH authentication failed: bad username or password",
      "timeout": "SSH timed out: check network, host, and port",
      "refused": "SSH refused: SSH service may not be listening",
      "dns": "SSH host unreachable: cannot resolve address",
      "net": "SSH host unreachable: no network route",
      "generic": "SSH failed: check parameters and network"
    },
    "sftp": {
      "unknown": "SFTP failed: unknown error",
      "kex": "SFTP failed: no matching key exchange algorithm",
      "subsystem": "SFTP failed: SFTP subsystem unavailable",
      "generic": "SFTP failed: check parameters, network, and server"
    },
    "telnet": {
      "unknown": "Telnet failed: unknown error",
      "timeout": "Telnet timed out: check network, host, and port",
      "refused": "Telnet refused: service may not be listening",
      "dns": "Telnet host unreachable: cannot resolve address",
      "net": "Telnet host unreachable: no network route",
      "generic": "Telnet failed: check parameters and network"
    },
    "serial": {
      "unknown": "Serial failed: unknown error",
      "access": "Serial open failed: busy or permission denied",
      "missing": "Serial port missing: check the device path",
      "baud": "Serial misconfigured: check baud rate, etc",
      "generic": "Serial failed: check device and parameters"
    }
  },
}
