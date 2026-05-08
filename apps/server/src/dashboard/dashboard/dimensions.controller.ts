import { Controller, Get, Query, UseGuards, UsePipes } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "../../shared/pipes/zod-validation.pipe.js";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard.js";
import { ProjectGuard } from "../../modules/auth/project.guard.js";
import { DimensionsService } from "./dimensions.service.js";
import {
  DimensionValuesQuerySchema,
  type DimensionValuesQuery,
  type DimensionValuesResponse,
} from "../dto/dimension-values.dto.js";

@ApiTags("dashboard")
@Controller("dashboard/v1/dimensions")
@UseGuards(JwtAuthGuard, ProjectGuard)
export class DimensionsController {
  public constructor(private readonly service: DimensionsService) {}

  @Get("values")
  @ApiOperation({ summary: "获取指定维度的可选值列表（Top N by count）" })
  @UsePipes(new ZodValidationPipe(DimensionValuesQuerySchema))
  public async getValues(
    @Query() query: DimensionValuesQuery,
  ): Promise<{ data: DimensionValuesResponse }> {
    const result = await this.service.getValues(query);
    return { data: result };
  }
}
