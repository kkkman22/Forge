/**
 * 验证文件路径是否可写。
 * 如果目标文件已存在，检查文件本身是否可写。
 * 如果目标文件不存在，检查父目录是否可写。
 * @throws Error 如果路径不可写
 */
export declare function validateFileWritable(filePath: string): void;
/**
 * 创建文件写入函数。返回一个 (line: string) => void 回调，
 * 使用 appendFileSync 同步追加写入，每行末尾自动添加 \n。
 *
 * 返回的闭包与 createLogSink(config, output) 的 output 参数签名一致。
 */
export declare function createFileWriter(filePath: string): (line: string) => void;
