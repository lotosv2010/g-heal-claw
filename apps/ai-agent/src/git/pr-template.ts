interface PrTemplateVars {
  readonly issueId: string;
  readonly issueTitle: string;
  readonly diagnosis: string;
  readonly confidence: string;
  readonly healJobId: string;
}

/**
 * PR Body Markdown 模板（ADR-0036 · DESIGN §8.3）
 */
export function renderPrBody(vars: PrTemplateVars): string {
  return `## 🤖 AI 自动修复

> 由 g-heal-claw AI Agent 自动生成 | Job: \`${vars.healJobId}\`

### 关联 Issue

- **Issue ID**: \`${vars.issueId}\`
- **标题**: ${vars.issueTitle}

### 诊断摘要

${vars.diagnosis}

### 置信度

**${vars.confidence.toUpperCase()}** — ${getConfidenceDescription(vars.confidence)}

### 审阅建议

- [ ] 确认根因分析正确
- [ ] 确认修复不引入新问题
- [ ] 确认测试覆盖变更路径
- [ ] 如有疑问，请联系原 Issue 触发者

---

<sub>🔗 [查看 Heal Job 详情](/settings/ai) | 📋 自动标签: \`ai-heal\`, \`auto-generated\`</sub>
`;
}

function getConfidenceDescription(confidence: string): string {
  switch (confidence) {
    case "high":
      return "Agent 对根因和修复方案高度确信，建议快速 review 后合并";
    case "medium":
      return "Agent 有合理依据但存在不确定性，建议仔细检查边界情况";
    case "low":
      return "Agent 尝试性修复，建议验证是否真正解决问题";
    default:
      return "请人工验证";
  }
}
