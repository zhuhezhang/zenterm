8. 终端编码/数据流处理建议集中为独立模块
你现在有 terminalEncodings、encodeTerminalWrite 之类文件，说明你已经在做模块化，这是好事。
但这块通常容易出现“各处都能写编码逻辑”的问题。
建议
所有终端输入输出编码转换统一放到一个 service
只保留少量公共入口
不要让 SSH/Telnet/Serial 各自实现一套不同编码处理
好处
行为一致
bug 更少
将来支持更多编码时不会到处改

检查一下shared文件夹里面的函数和常量，只有被前后端共同调用的才放到shared文件夹下，否则放到electron（后端）或src（前端）文件夹下

拥抱typescript

现在是默认就有按下ctrl和-或+能够实现缩放，我想要按下ctrl+滚轮也能实现放大缩小