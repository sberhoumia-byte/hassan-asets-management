import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type request from "supertest";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { auth, bootApp, userWithRole } from "./helpers";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * المرحلة 7 (تكملة): استيراد Excel (قالب، رفع، مطابقة، تحقق بلا كتابة، تقرير أخطاء، اعتماد ذري)
 * والوثائق المرفوعة (أنواع حقيقية، إصدارات، تنزيل ببصمة، تقييد، أرشفة بلا حذف).
 */
let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let admin = "";
let sid = "";
const s = { cat: "", room: "", viewer: "", stock: "", asset: "" };
const base = () => `/api/v1/schools/${sid}`;
const get = (path: string, token = admin) => http.get(`${base()}${path}`).set(auth(token));
const post = (path: string, body: object = {}, token = admin) => http.post(`${base()}${path}`).set(auth(token)).send(body);
const put = (path: string, body: object = {}, token = admin) => http.put(`${base()}${path}`).set(auth(token)).send(body);
const binary = (path: string, token = admin) =>
  http
    .get(`${base()}${path}`)
    .set(auth(token))
    .buffer(true)
    .parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Données");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function readXlsx(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}
const b64 = (b: Buffer) => b.toString("base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

beforeAll(async () => {
  ({ app, http, prisma, admin, schoolId: sid } = await bootApp());
  const types = (await get("/lookups?listKey=SPACE_TYPE")).body as { id: string; code: string }[];
  s.room = (await post("/rooms", { code: "R1", name: "القسم الأول", spaceTypeId: types.find((t) => t.code === "CLASSROOM")!.id, status: "GOOD" })).body.id;
  s.cat = (await post("/categories", { code: "IT", nameAr: "معدات معلوماتية", nameFr: "Matériel informatique" })).body.id;
  s.viewer = (await userWithRole(http, admin, sid, "viewer7b", ["VIEWER"])).token;
  s.stock = (await userWithRole(http, admin, sid, "stock7b", ["STOCK_MANAGER"])).token;
});

afterAll(async () => {
  await app?.close();
});

describe("استيراد Excel", () => {
  it("القالب: ورقة بيانات بعناوين اللغة المختارة، ورقة قوائم بقيم المؤسسة الفعلية، وتعليمات", async () => {
    const r = await binary("/imports/templates/ASSETS?lang=ar");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("spreadsheetml");
    const wb = await readXlsx(r.body as Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["البيانات", "القوائم", "التعليمات"]);
    const head = (wb.worksheets[0]!.getRow(1).values as unknown[]).filter(Boolean);
    expect(head[0]).toBe("اسم الممتلك *");
    expect(head).toContain("رقم الجرد");
    expect(wb.worksheets[0]!.views[0]!.rightToLeft).toBe(true);
    // لا صفوف بيانات مفترضة في القالب
    expect(wb.worksheets[0]!.rowCount).toBe(1);
    const lists = wb.worksheets[1]!;
    const values: string[] = [];
    lists.eachRow((row) => row.eachCell((c) => values.push(String(c.value))));
    expect(values).toContain("IT");
    expect(values).toContain("R1");
    const fr = await readXlsx((await binary("/imports/templates/STOCK?lang=fr")).body as Buffer);
    expect((fr.worksheets[0]!.getRow(1).values as unknown[]).filter(Boolean)[0]).toBe("Code article *");
  });

  it("يرفض ملفاً ليس Excel حقيقياً حتى لو سُمّي .xlsx", async () => {
    const r = await post("/imports", { entity: "ASSETS", fileName: "fake.xlsx", dataBase64: b64(PDF) });
    expect(r.status).toBe(400);
    expect(r.body.error.details.fields.file).toBe("errors.fileType");
  });

  let job = "";
  it("الرفع يطابق الأعمدة تلقائياً (عناوين فرنسية) والتحقق لا يكتب أي ممتلك", async () => {
    await prisma.asset.create({ data: { schoolId: sid, inventoryNumber: "EXIST-1", name: "موجود", categoryId: s.cat } });
    const before = await prisma.asset.count({ where: { schoolId: sid } });
    const file = await xlsx([
      ["Désignation *", "Catégorie", "N° d'inventaire", "Date d'acquisition", "Valeur d'acquisition (DH)", "État", "Espace", "Colonne inconnue"],
      ["حاسوب مكتبي", "IT", "", "15/09/2025", "4 500,50", "صالح", "R1", "x"],
      ["طابعة", "Matériel informatique", "IMP-1", new Date(Date.UTC(2025, 0, 2)), 1200, "En panne", "", ""],
      ["", "IT", "", "", "", "", "", ""], // اسم مفقود
      ["سبورة", "XX", "", "", "", "", "", ""], // تصنيف غير موجود
      ["جهاز عرض", "IT", "IMP-1", "", "", "", "", ""], // رقم مكرر داخل الملف
      ["جهاز", "IT", "EXIST-1", "", "", "", "", ""], // رقم موجود مسبقاً
      ["مكبر صوت", "IT", "", "31/02/2025", "abc", "مكسور", "", ""], // تاريخ وقيمة وحالة غير صالحة
      [null, null, null, null, null, null, null, null], // سطر فارغ يُتجاهل
    ]);
    const up = await post("/imports", { entity: "ASSETS", fileName: "biens.xlsx", dataBase64: b64(file) });
    expect(up.status).toBe(201);
    job = up.body.id;
    expect(up.body.status).toBe("MAPPED");
    expect(up.body.missing).toEqual([]);
    expect(up.body.totalRows).toBe(7);
    expect(up.body.mapping).toMatchObject({ name: 0, categoryId: 1, inventoryNumber: 2, acquisitionDate: 3, acquisitionValue: 4, status: 5, roomId: 6, serialNumber: null });

    const v = await post(`/imports/${job}/validate`);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ status: "VALIDATED", totalRows: 7, acceptedRows: 2, rejectedRows: 5 });
    const codes = (v.body.errors as { row: number; field: string; code: string }[]).map((e) => `${e.row}:${e.field}:${e.code}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "4:name:errors.required",
        "5:categoryId:imp.err.notFound",
        "6:inventoryNumber:imp.err.duplicateInFile",
        "7:inventoryNumber:imp.err.exists",
        "8:acquisitionDate:errors.date",
        "8:acquisitionValue:errors.number",
        "8:status:errors.invalidChoice",
      ]),
    );
    expect(await prisma.asset.count({ where: { schoolId: sid } })).toBe(before);
  });

  it("تقرير الأخطاء: الأسطر المرفوضة كما هي مع شرح كل خطأ", async () => {
    const r = await binary(`/imports/${job}/errors.xlsx?lang=ar`);
    expect(r.status).toBe(200);
    const ws = (await readXlsx(r.body as Buffer)).worksheets[0]!;
    expect(ws.rowCount).toBe(6); // عنوان + 5 أسطر مرفوضة
    expect(ws.getRow(2).getCell(1).value).toBe(4);
    expect(String(ws.getRow(2).getCell(2).value)).toContain("اسم الممتلك");
    expect(String(ws.getRow(5).getCell(2).value)).toContain("موجود مسبقاً");
    expect(ws.getRow(5).getCell(5).value).toBe("EXIST-1");
  });

  it("الاعتماد يرفض وجود أخطاء دون موافقة صريحة، ثم ينشئ المقبول في معاملة واحدة مع التدقيق", async () => {
    const no = await post(`/imports/${job}/commit`);
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe("IMPORT_HAS_ERRORS");
    const c = await post(`/imports/${job}/commit`, { acceptPartial: true });
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ status: "COMMITTED", created: 2 });
    const a = await prisma.asset.findMany({ where: { schoolId: sid, name: { in: ["حاسوب مكتبي", "طابعة"] } }, orderBy: { name: "asc" } });
    expect(a).toHaveLength(2);
    const pc = a.find((x) => x.name === "حاسوب مكتبي")!;
    expect(pc.inventoryNumber).toMatch(/\d/); // مولد حسب صيغة المؤسسة
    expect(pc.acquisitionDate?.toISOString().slice(0, 10)).toBe("2025-09-15");
    expect(Number(pc.acquisitionValue)).toBe(4500.5);
    expect(pc.roomId).toBe(s.room);
    expect(a.find((x) => x.name === "طابعة")).toMatchObject({ inventoryNumber: "IMP-1", status: "DAMAGED" });
    expect(await prisma.assetLocation.count({ where: { assetId: pc.id } })).toBe(1);
    const logs = await prisma.auditLog.findMany({ where: { schoolId: sid, action: { in: ["ASSET_CREATE", "IMPORT_COMMIT"] } } });
    expect(logs.filter((l) => l.action === "ASSET_CREATE" && (l.after as { importJobId?: string })?.importJobId === job)).toHaveLength(2);
    expect(logs.find((l) => l.action === "IMPORT_COMMIT")?.after).toMatchObject({ created: 2, rejected: 5 });
    // لا اعتماد مرتين
    const again = await post(`/imports/${job}/commit`, { acceptPartial: true });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe("IMPORT_STATE");
  });

  it("تغير البيانات بين التحقق والاعتماد يفرض تحققاً جديداً (لا إنشاء جزئي صامت)", async () => {
    const file = await xlsx([
      ["الاسم الكامل بالعربية", "الفئة", "رقم التأجير", "البريد الإلكتروني"],
      ["أستاذ مستورد", "أستاذ(ة)", "M100", ""],
      ["موظف مستورد", "ADMINISTRATIVE", "M101", "bad-email"],
    ]);
    const up = await post("/imports", { entity: "STAFF", fileName: "staff.xlsx", dataBase64: b64(file) });
    const v = await post(`/imports/${up.body.id}/validate`);
    expect(v.body).toMatchObject({ acceptedRows: 1, rejectedRows: 1 });
    expect(v.body.errors[0]).toMatchObject({ row: 3, field: "email", code: "errors.email" });
    await post("/staff", { fullNameAr: "أُضيف يدوياً", type: "TEACHER", staffNumber: "M100" });
    const c = await post(`/imports/${up.body.id}/commit`, { acceptPartial: true });
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe("IMPORT_STALE");
    expect(await prisma.staffMember.count({ where: { schoolId: sid, fullNameAr: "أستاذ مستورد" } })).toBe(0);
    // بعد إعادة التحقق: السطر صار مرفوضاً (موجود مسبقاً)
    const v2 = await post(`/imports/${up.body.id}/validate`);
    expect(v2.body).toMatchObject({ acceptedRows: 0, rejectedRows: 2 });
    expect((await post(`/imports/${up.body.id}/commit`, { acceptPartial: true })).body.error.code).toBe("IMPORT_NOTHING");
  });

  it("المطابقة اليدوية تُتحقق، والعمود الإلزامي غير المطابق يمنع التحقق", async () => {
    const file = await xlsx([["Nom", "ICE"], ["مورد 1", "001234567000089"]]);
    const up = await post("/imports", { entity: "SUPPLIERS", fileName: "f.xlsx", dataBase64: b64(file) });
    expect(up.body.status).toBe("UPLOADED");
    expect(up.body.missing).toEqual(["name"]);
    const bad = await post(`/imports/${up.body.id}/validate`);
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("IMPORT_MAPPING_REQUIRED");
    expect((await post(`/imports/${up.body.id}/validate`, { mapping: { name: 9 } })).status).toBe(400);
    const ok = await post(`/imports/${up.body.id}/validate`, { mapping: { name: 0, ice: 1 } });
    expect(ok.body).toMatchObject({ acceptedRows: 1, rejectedRows: 0 });
    expect((await post(`/imports/${up.body.id}/commit`)).body.created).toBe(1);
    expect(await prisma.supplier.count({ where: { schoolId: sid, ice: "001234567000089" } })).toBe(1);
  });

  it("مواد المخزون: بطاقات فقط بلا أرصدة، والصلاحية حسب الوحدة المستهدفة", async () => {
    const file = await xlsx([
      ["Code article", "Désignation article", "Unité de mesure", "Seuil minimum", "Suivi de la péremption"],
      ["PAP-A4", "ورق A4", "REAM", "10", "لا"],
      ["CRAIE", "طباشير", "علبة", "5,5", "نعم"],
    ]);
    // مسؤول المخزون لا يملك imports.create
    expect((await post("/imports", { entity: "STOCK", fileName: "s.xlsx", dataBase64: b64(file) }, s.stock)).status).toBe(403);
    // ولا يستورد الاطلاع فقط
    expect((await post("/imports", { entity: "STOCK", fileName: "s.xlsx", dataBase64: b64(file) }, s.viewer)).status).toBe(403);
    const up = await post("/imports", { entity: "STOCK", fileName: "s.xlsx", dataBase64: b64(file) });
    await post(`/imports/${up.body.id}/validate`);
    expect((await post(`/imports/${up.body.id}/commit`)).body.created).toBe(2);
    const items = await prisma.inventoryItem.findMany({ where: { schoolId: sid, code: { in: ["PAP-A4", "CRAIE"] } }, include: { balances: true } });
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.code === "CRAIE")).toMatchObject({ tracksExpiry: true });
    expect(Number(items.find((i) => i.code === "CRAIE")!.minQuantity)).toBe(5.5);
    expect(items.every((i) => i.balances.length === 0)).toBe(true);
    expect(await prisma.stockMovement.count({ where: { itemId: { in: items.map((i) => i.id) } } })).toBe(0);
  });

  it("سجل المهام والإلغاء", async () => {
    const list = await get("/imports");
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(4);
    expect(list.body[0].errors).toBeUndefined();
    const file = await xlsx([["Nom du fournisseur"], ["مورد ملغى"]]);
    const up = await post("/imports", { entity: "SUPPLIERS", fileName: "c.xlsx", dataBase64: b64(file) });
    expect((await post(`/imports/${up.body.id}/cancel`)).body.status).toBe("CANCELLED");
    expect((await post(`/imports/${up.body.id}/validate`)).body.error.code).toBe("IMPORT_STATE");
    expect((await get("/imports", s.viewer)).status).toBe(200);
  });
});

describe("الوثائق المرفوعة", () => {
  let doc = "";
  let cat = "";
  it("إنشاء وثيقة PDF مرتبطة بممتلك (النوع من محتوى الملف لا من اسمه)", async () => {
    cat = ((await get("/lookups?listKey=DOCUMENT_CATEGORY")).body as { id: string; code: string }[]).find((l) => l.code === "INVOICE")!.id;
    s.asset = (await prisma.asset.findFirstOrThrow({ where: { schoolId: sid, inventoryNumber: "IMP-1" } })).id;
    const bad = await post("/documents", { title: "x", fileName: "x.pdf", dataBase64: b64(Buffer.from("not a pdf")) });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.file).toBe("errors.fileType");
    const wrongLink = await post("/documents", { title: "x", fileName: "x.pdf", dataBase64: b64(PDF), links: [{ entityType: "ASSET", entityId: "11111111-1111-4111-8111-111111111111" }] });
    expect(wrongLink.status).toBe(400);
    const r = await post("/documents", {
      title: "فاتورة اقتناء الطابعة",
      categoryId: cat,
      documentDate: "2025-01-02",
      issuingBody: "مورد الاختبار",
      fileName: "facture.pdf",
      dataBase64: b64(PDF),
      links: [{ entityType: "ASSET", entityId: s.asset }],
    });
    expect(r.status).toBe(201);
    doc = r.body.id;
    expect(r.body).toMatchObject({ version: 1, mimeType: "application/pdf", fileName: "facture.pdf", accessLevel: "SCHOOL", linkCount: 1 });
    expect(r.body.links[0].label).toContain("IMP-1");
    const png = await post("/documents", { title: "صورة", fileName: "photo.pdf", dataBase64: b64(PNG) });
    expect(png.body.mimeType).toBe("image/png");
    expect((await post("/documents", { title: "x", fileName: "x.pdf", dataBase64: b64(PDF) }, s.viewer)).status).toBe(403);
  });

  it("الإصدارات: رفع جديد يضيف إصداراً ويبقي السابق قابلاً للتنزيل ببصمته", async () => {
    const v2bytes = Buffer.concat([PDF, Buffer.from("% v2\n")]);
    expect((await post(`/documents/${doc}/versions`, { fileName: "facture-v2.pdf", dataBase64: b64(v2bytes) })).status).toBe(400); // سبب التحديث إلزامي
    const r = await post(`/documents/${doc}/versions`, { fileName: "facture-v2.pdf", dataBase64: b64(v2bytes), changeNote: "نسخة موقعة" });
    expect(r.status).toBe(201);
    expect(r.body.version).toBe(2);
    expect(r.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const v1 = r.body.versions[1];
    const d1 = await binary(`/documents/${doc}/versions/${v1.id}/download`, s.viewer);
    expect(d1.status).toBe(200);
    expect(Buffer.compare(d1.body as Buffer, PDF)).toBe(0);
    expect(d1.headers["content-disposition"]).toContain("facture.pdf");
    const d2 = await binary(`/documents/${doc}/versions/${r.body.versions[0].id}/download`);
    expect(createHash("sha256").update(d2.body as Buffer).digest("hex")).toBe(r.body.versions[0].sha256);
  });

  it("تعديل البيانات والروابط يُسجل في التدقيق، والقائمة تبحث وتصفي بالكيان", async () => {
    const u = await put(`/documents/${doc}`, { title: "فاتورة الطابعة", categoryId: cat, links: [] });
    expect(u.status).toBe(200);
    expect(u.body.linkCount).toBe(0);
    await put(`/documents/${doc}`, { title: "فاتورة الطابعة", categoryId: cat, links: [{ entityType: "ASSET", entityId: s.asset }] });
    expect((await get(`/documents?entityType=ASSET&entityId=${s.asset}`)).body.map((d: { id: string }) => d.id)).toEqual([doc]);
    expect((await get("/documents?q=الطابعة")).body).toHaveLength(1);
    const logs = await prisma.auditLog.findMany({ where: { entityId: doc }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["DOCUMENT_CREATE", "DOCUMENT_VERSION_ADD", "DOCUMENT_UPDATE", "DOCUMENT_UPDATE"]);
  });

  it("الوثيقة المقيدة لا يراها إلا مسؤول الوثائق", async () => {
    const r = await post("/documents", { title: "عقد سري", accessLevel: "RESTRICTED", fileName: "c.pdf", dataBase64: b64(PDF) });
    expect((await get("/documents", s.viewer)).body.map((d: { id: string }) => d.id)).not.toContain(r.body.id);
    expect((await get(`/documents/${r.body.id}`, s.viewer)).status).toBe(404);
    expect((await get(`/documents/${r.body.id}`)).status).toBe(200);
  });

  it("الأرشفة بدل الحذف: المؤرشفة لا تقبل إصداراً جديداً حتى تُسترجع", async () => {
    expect((await post(`/documents/${doc}/archive`, {})).status).toBe(400); // السبب إلزامي
    const a = await post(`/documents/${doc}/archive`, { reason: "انتهى العمل بها" });
    expect(a.body.archivedAt).toBeTruthy();
    expect((await get("/documents")).body.map((d: { id: string }) => d.id)).not.toContain(doc);
    expect((await get("/documents?archived=1")).body.map((d: { id: string }) => d.id)).toContain(doc);
    const nv = await post(`/documents/${doc}/versions`, { fileName: "v3.pdf", dataBase64: b64(PDF), changeNote: "x" });
    expect(nv.status).toBe(422);
    expect(nv.body.error.code).toBe("DOCUMENT_ARCHIVED");
    expect((await post(`/documents/${doc}/restore`)).body.archivedAt).toBeUndefined();
    await expect(prisma.document.delete({ where: { id: doc } })).rejects.toThrow();
    await expect(prisma.documentVersion.deleteMany({ where: { documentId: doc } })).rejects.toThrow();
  });
});
