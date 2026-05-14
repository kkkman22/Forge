import { accessSync, appendFileSync, constants, existsSync } from "node:fs";
import { dirname } from "node:path";
/**
 * 验证文件路径是否可写。
 * 如果目标文件已存在，检查文件本身是否可写。
 * 如果目标文件不存在，检查父目录是否可写。
 * @throws Error 如果路径不可写
 */
export function validateFileWritable(filePath) {
    if (existsSync(filePath)) {
        try {
            accessSync(filePath, constants.W_OK);
        }
        catch {
            throw new Error(`Log file path is not writable: ${filePath}`);
        }
        return;
    }
    const parentDir = dirname(filePath);
    if (!existsSync(parentDir)) {
        throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
    try {
        accessSync(parentDir, constants.W_OK);
    }
    catch {
        throw new Error(`Parent directory is not writable: ${parentDir}`);
    }
}
/**
 * 创建文件写入函数。返回一个 (line: string) => void 回调，
 * 使用 appendFileSync 同步追加写入，每行末尾自动添加 \n。
 *
 * 返回的闭包与 createLogSink(config, output) 的 output 参数签名一致。
 */
export function createFileWriter(filePath) {
    return (line) => {
        appendFileSync(filePath, `${line}\n`);
    };
}
//# sourceMappingURL=log-file-writer.js.map