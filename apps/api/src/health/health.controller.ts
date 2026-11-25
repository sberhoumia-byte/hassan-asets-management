import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/context";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("system")
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get("health")
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
