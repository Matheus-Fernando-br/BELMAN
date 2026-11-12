// @vitest-environment node
import { randomBytes } from "node:crypto";
import { CryptoConfigError, open, seal, socialKey } from "@shared/social/crypto";

const key = randomBytes(32);

describe("crypto (AES-256-GCM)", () => {
  it("ida e volta", () => {
    const c = seal("EAAtoken-secreto", key);
    expect(c).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(c).not.toContain("EAAtoken");
    expect(open(c, key)).toBe("EAAtoken-secreto");
  });
  it("IV aleatório: mesmo texto gera cifras diferentes", () => {
    expect(seal("x", key)).not.toBe(seal("x", key));
  });
  it("detecta adulteração dos dados e da tag", () => {
    const [v, iv, tag, data] = seal("token", key).split(":");
    const flip = (s: string) => Buffer.from(s, "base64url").map((b, i) => (i === 0 ? b ^ 1 : b)) as unknown as Buffer;
    expect(() => open([v, iv, tag, Buffer.from(flip(data)).toString("base64url")].join(":"), key)).toThrow();
    expect(() => open([v, iv, Buffer.from(flip(tag)).toString("base64url"), data].join(":"), key)).toThrow();
  });
  it("chave errada não abre", () => {
    expect(() => open(seal("t", key), randomBytes(32))).toThrow();
  });
  it("valida a chave", () => {
    expect(() => socialKey(undefined)).toThrow(CryptoConfigError);
    expect(() => socialKey(Buffer.alloc(16).toString("base64"))).toThrow(CryptoConfigError);
    expect(socialKey(key.toString("base64")).length).toBe(32);
  });
});
