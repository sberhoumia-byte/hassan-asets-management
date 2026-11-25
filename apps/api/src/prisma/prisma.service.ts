import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../../../../database/seeds/adapter";
import { config } from "../config";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: pgAdapter(config().DATABASE_URL) });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
