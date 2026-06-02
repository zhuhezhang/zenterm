检查一下各文件里面的函数和常量，只有被前后端共同调用的才放到shared文件夹下，否则放到electron（后端）或src（前端）文件夹下

本项目代码还有什么值得优化的地方

当前设置里面的“终端I/O日志”有“缓存快照覆盖”和“原始流追加”两种模式，想要把这两种模式的的优点（日志文件内容与屏幕输出一致、追加写入日志文件、磁盘友好）结合起来合并成一种


已为 Linux/Unix 增加与 Windows「非系统盘整盘放行」对等的策略。

行为说明
collectResolvedRoots() 在原有用户目录（home、documents 等）之外，还会加入：

平台	额外放行的根路径
Windows（原有）
系统盘以外的盘符根，如 D:\、E:\
Linux 等
从 /proc/mounts 或 /etc/mtab 读取的、非 / 的块设备 / 网络挂载点，如 /mnt/data、/media/user/USB、/home（独立分区时）
macOS
/Volumes/ 下各卷宗，如 /Volumes/MyDisk
不会放行：

根文件系统 / 本身（避免整系统可读可写）
tmpfs、proc、sysfs、overlay 等虚拟/临时文件系统
实现要点
parseProcMountsForPolicy()：解析挂载表，过滤伪文件系统，排除 /
collectUnixNonSystemMountRoots()：Linux 读挂载表；macOS 扫描 /Volumes
已补充单元测试覆盖块设备挂载与 NFS 挂载解析
这样在 Linux 上，SFTP 本地路径、日志目录、导入/导出等校验会自动允许独立挂载盘下的路径，与 Windows 上 D 盘整盘放行的思路一致。