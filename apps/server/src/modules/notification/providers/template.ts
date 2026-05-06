/**
 * 通知模板变量替换工具
 *
 * 支持 {{varName}} 和 {{nested.key}} 格式的模板变量。
 * 未匹配的变量保留原始占位符。
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(
    /\{\{(\w+(?:\.\w+)*)\}\}/g,
    (_, key: string) => vars[key] ?? `{{${key}}}`,
  );
}
