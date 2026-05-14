# 测试模式库

> 供 Phase 5 使用。定义项目内标准测试模式，按测试维度和技术栈分类。

---

## 一、测试维度与模式速查

| 维度 | 核心思路 | 典型模式 |
|------|----------|----------|
| **Happy Path** | 正常输入得到期望输出 | Arrange-Act-Assert（AAA），Given-When-Then |
| **边界值** | 边界条件不崩溃 | 两边界法（min-1, min, max, max+1），空/零值断言 |
| **异常输入** | 非法输入被正确拒绝 | Zod safeParse 断言，异常类型匹配 |
| **并发/竞态** | 并发场景数据一致性 | 并发提交幂等，BullMQ 重复消费防护 |
| **权限/安全** | 未授权被拒绝 | 无 Token 401，越权 403，过期 Token 刷新 |
| **性能边界** | 极端数据量不 OOM | 分页边界、流式处理、超时断言 |

---

## 二、NestJS 测试模式

### 2.1 Service 单元测试

```typescript
// tests/<module>/<name>.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '@golevelup/ts-jest'; // 或 vitest mock

describe('XxxService', () => {
  let service: XxxService;
  let mockRepo: ReturnType<typeof createMock<XxxRepository>>;

  beforeEach(async () => {
    mockRepo = createMock<XxxRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XxxService,
        { provide: XxxRepository, useValue: mockRepo },
      ],
    }).compile();
    service = module.get(XxxService);
  });

  // === Happy Path ===
  it('给定有效输入，应返回预期结果', async () => {
    // Arrange
    const input = { ... };
    mockRepo.findById.mockResolvedValue({ ... });

    // Act
    const result = await service.doSomething(input);

    // Assert
    expect(result).toEqual({ ... });
  });

  // === 异常输入 ===
  it('给定无效 ID，应抛出 AppException', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.doSomething({ id: 999 })).rejects.toThrow(AppException);
  });
});
```

### 2.2 Controller 测试（含 ZodValidationPipe）

```typescript
// tests/<module>/<name>.controller.spec.ts
// 使用 NestJS TestingModule 启动轻量应用，注入 INestApplication
// 调用 supertest(app.getHttpServer()) 发起请求
// 验证：200 + body.data / 400 校验失败 / 401 无权限
```

### 2.3 BullMQ Processor 测试

```typescript
// tests/<module>/<name>.processor.spec.ts
describe('XxxProcessor', () => {
  let processor: XxxProcessor;
  let mockJob: ReturnType<typeof createMock<Job>>;

  beforeEach(() => { /* 同 Service 模式 */ });

  it('给定合法 Job data，应处理成功', async () => {
    mockJob.data = { ... };
    await processor.process(mockJob);
    expect(mockService.handle).toHaveBeenCalledWith(...);
  });

  it('处理失败应更新 Job progress 或 rethrow', async () => {
    mockService.handle.mockRejectedValue(new Error('DB down'));
    await expect(processor.process(mockJob)).rejects.toThrow();
  });

  it('重复 Job（幂等）不应产生副作用', async () => {
    // 第一次 success，第二次 skip
    await processor.process(mockJob);
    await processor.process(mockJob);
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });
});
```

### 2.4 集成测试（Dockerized PG 强制）

```typescript
// tests/integration/<module>/<flow>.spec.ts
// 使用 @testcontainers/postgresql 拉起真实 PG
// 运行 Drizzle migration 后执行测试
// 禁止 mock 数据库连接
```

---

## 三、Zod Schema 测试模式

```typescript
// tests/<package>/<schema>.test.ts
describe('XxxSchema', () => {
  // Happy Path
  it('合法输入应通过校验', () => {
    const result = XxxSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  // 边界值
  it('空字符串应拒绝', () => {
    const result = XxxSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  // 异常输入
  it('缺失必填字段应返回对应 path 的 error', () => {
    const result = XxxSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('name');
    }
  });

  // 类型推导验证（编译时已保证，仅需确认无 any）
  it('z.infer 类型应对齐预期接口', () => {
    type Inferred = z.infer<typeof XxxSchema>;
    // 此用例编译即验证，无需运行时断言
    expect(true).toBe(true);
  });
});
```

---

## 四、React / Next.js 组件测试模式

### 4.1 服务端组件（RSC）

```typescript
// tests/<path>/<component>.test.tsx
import { render, screen } from '@testing-library/react';

describe('ServerComponent', () => {
  it('给定 props，应渲染预期内容', async () => {
    const jsx = await ServerComponent({ data: mockData });
    render(jsx);
    expect(screen.getByText(mockData.title)).toBeInTheDocument();
  });

  it('空数据应渲染 Empty 状态', async () => {
    const jsx = await ServerComponent({ data: null });
    render(jsx);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});
```

### 4.2 客户端组件

```typescript
// tests/<path>/<component>.test.tsx
import userEvent from '@testing-library/user-event';

describe('ClientComponent', () => {
  it('点击按钮应触发回调', async () => {
    const onAction = vi.fn();
    render(<ClientComponent onAction={onAction} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('Loading 状态下按钮应 disabled', () => {
    render(<ClientComponent loading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

---

## 五、SDK 浏览器兼容性测试模式

```typescript
// tests/<plugin>/<name>.test.ts
// 使用 jsdom + Playwright 补齐浏览器 API

describe('SDK Plugin (Browser)', () => {
  it('不应引用任何 Node.js API', () => {
    // 在 jsdom 环境下加载 SDK 模块
    // 如引用了 process.cwd() / fs / path 等 Node API，会直接 throw
    expect(() => require('@g-heal-claw/sdk')).not.toThrow();
  });

  it('IntersectionObserver 环境下插件正常初始化', () => {
    // 模拟 IntersectionObserver
    global.IntersectionObserver = vi.fn(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    }));
    const plugin = new ExposurePlugin({ threshold: 0.5 });
    expect(plugin).toBeDefined();
  });
});
```

---

## 六、Mock 策略速查

| 被测对象 | Mock 什么 | 不 Mock 什么 |
|----------|-----------|--------------|
| NestJS Service | Repository、外部 HTTP 调用 | 业务逻辑、Zod Schema |
| NestJS Controller | Service（注入 mock） | ZodValidationPipe（测试真实校验） |
| BullMQ Processor | Service、外部 API | Job 数据结构（用真实格式） |
| React 组件 | fetch / Server Action | 渲染逻辑、用户交互 |
| SDK 插件 | 浏览器 API（IntersectionObserver 等） | 插件核心逻辑 |
| 集成测试 | **不 mock 数据库** | **不 mock 数据库**（Dockerized PG） |
| 单元测试（纯函数） | 无（纯函数不 mock） | 无 |

---

## 七、测试文件放置对照

```
✅ 正确位置：
apps/server/tests/<module>/<name>.service.spec.ts
packages/sdk/tests/plugins/error.test.ts
packages/shared/tests/schemas/event.test.ts

❌ 违规位置（审查红线）：
apps/server/src/<module>/<name>.service.spec.ts
apps/server/src/<module>/__tests__/<name>.test.ts
packages/sdk/src/__tests__/error.test.ts
```
