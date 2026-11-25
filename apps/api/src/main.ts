import { Logger } from "@nestjs/common";
import { createApp } from "./app";
import { config } from "./config";
import { NotificationsService } from "./notifications/notifications.service";
import { BackupService } from "./backup/backup.service";

async function main() {
  const c = config();
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(c.API_PORT);
  app.get(NotificationsService).startScheduler();
  app.get(BackupService).startScheduler();
  new Logger("Main").log(`API: http://localhost:${c.API_PORT}/api/v1 (docs: /api/docs)`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
