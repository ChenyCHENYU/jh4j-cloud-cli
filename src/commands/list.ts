import { loadCatalog } from "../catalog.js";
import { loadUserConfig } from "../core/user-config.js";

export async function listCommand(options: { json?: boolean } = {}): Promise<void> {
  const templates = await loadCatalog(await loadUserConfig());
  if (options.json) {
    console.log(JSON.stringify(templates, null, 2));
    return;
  }
  console.table(
    templates.map((template) => ({
      ID: template.id,
      名称: template.name,
      类型: template.category,
      状态: template.status,
      默认分支: template.defaultRef,
      标签: template.tags?.join(", ") ?? ""
    }))
  );
}
