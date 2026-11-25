/** تجزئة كلمات المرور في وضع المراجعة (PBKDF2-SHA256). الخادم يستعمل Argon2id في المرحلة 3. */
const ITERATIONS = 210_000;
const enc = new TextEncoder();

const toHex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (h: string) => {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return ["pbkdf2", ITERATIONS, toHex(salt), toHex(await derive(password, salt, ITERATIONS))].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, iter, salt, hash] = stored.split("$");
  if (!iter || !salt || !hash) return false;
  const got = toHex(await derive(password, fromHex(salt), Number(iter)));
  let diff = got.length ^ hash.length;
  for (let i = 0; i < Math.min(got.length, hash.length); i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}
