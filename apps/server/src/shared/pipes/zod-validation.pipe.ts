import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from "@nestjs/common";
import type { ZodTypeAny } from "zod";

/**
 * 通用 Zod 校验管道
 *
 * 与 nestjs-zod 相比：零额外依赖、错误结构贴近我们 `packages/shared` 的约定。
 */
@Injectable()
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform {
  public constructor(private readonly schema: S) {}

  public transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: "VALIDATION_FAILED",
        message: "请求体校验未通过",
        details: result.error.issues,
      });
    }
    return result.data;
  }
}
