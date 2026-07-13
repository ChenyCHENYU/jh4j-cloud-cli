import {
  clearTemplateCache,
  getTemplateCacheRoot,
  listTemplateCache
} from "../core/template-cache.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export async function cacheListCommand(options: { json?: boolean } = {}): Promise<void> {
  const entries = await listTemplateCache();
  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  if (!entries.length) {
    console.log(`模板缓存为空: ${getTemplateCacheRoot()}`);
    return;
  }
  console.table(
    entries.map((entry) => ({
      Key: entry.key,
      来源: entry.metadata.source,
      Ref: entry.metadata.ref,
      缓存时间: entry.metadata.cachedAt,
      大小: formatBytes(entry.sizeBytes)
    }))
  );
}

export async function cacheClearCommand(): Promise<void> {
  await clearTemplateCache();
  console.log(`模板缓存已清理: ${getTemplateCacheRoot()}`);
}
