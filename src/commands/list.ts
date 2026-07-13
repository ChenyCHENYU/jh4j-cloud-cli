import { BUILTIN_TEMPLATES } from "../catalog.js";

export function listCommand(): void {
  console.table(
    BUILTIN_TEMPLATES.map((template) => ({
      ID: template.id,
      名称: template.name,
      类型: template.category,
      状态: template.status,
      默认分支: template.defaultRef
    }))
  );
}
