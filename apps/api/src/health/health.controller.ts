import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Perm, Public } from "../common/context";
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

  /** القوائم المرجعية: القيم العامة + قيم المؤسسة. */
  @Perm("lookups.view")
  @Get("schools/:schoolId/lookups")
  async lookups(@Param("schoolId", ParseUUIDPipe) schoolId: string, @Query("listKey") listKey?: string) {
    const rows = await this.prisma.lookupValue.findMany({
      where: { isActive: true, OR: [{ schoolId: null }, { schoolId }], ...(listKey ? { listKey } : {}) },
      orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, listKey: r.listKey, code: r.code, labelAr: r.labelAr, labelFr: r.labelFr ?? undefined, global: r.schoolId === null }));
  }
}
