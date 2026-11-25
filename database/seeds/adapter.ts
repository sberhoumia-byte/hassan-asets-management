import { PrismaPg } from "@prisma/adapter-pg";

/** محوّل PostgreSQL يحترم معامل ?schema= في الرابط (تستعمله الاختبارات لمخطط معزول). */
export function pgAdapter(url: string) {
  const schema = new URL(url).searchParams.get("schema") ?? undefined;
  return new PrismaPg({ connectionString: url, ...(schema ? { options: `-c search_path="${schema.replace(/"/g, "")}"` } : {}) }, schema ? { schema } : undefined);
}
