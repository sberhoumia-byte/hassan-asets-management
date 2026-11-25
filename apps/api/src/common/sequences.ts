import { Prisma } from "@prisma/client";

/**
 * التسلسل التالي لمفتاح داخل مؤسسة وسنة، في عبارة واحدة ذرية:
 * طلبان متزامنان لا يحصلان أبداً على نفس الرقم (قفل الصف ضمني في ON CONFLICT DO UPDATE).
 */
export async function nextSequence(tx: Prisma.TransactionClient, schoolId: string, key: string, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO number_sequences (id, "schoolId", key, year, next)
    VALUES (gen_random_uuid(), ${schoolId}::uuid, ${key}, ${year}, 2)
    ON CONFLICT ("schoolId", key, year) DO UPDATE SET next = number_sequences.next + 1
    RETURNING next - 1 AS n`;
  return Number(rows[0]!.n);
}
