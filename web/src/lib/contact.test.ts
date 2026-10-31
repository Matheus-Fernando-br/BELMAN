import { submitContact, validateContact, type ContactInput } from "./contact";

const valid: ContactInput = {
  name: "Maria Silva",
  email: "maria@example.com",
  projectType: "web",
  budget: "",
  message: "Preciso de um sistema para controlar os pedidos da loja.",
};

describe("validateContact", () => {
  it("accepts a valid message with optional budget empty", () => {
    expect(validateContact(valid)).toEqual({});
  });

  it("flags every invalid field", () => {
    const errors = validateContact({ name: " ", email: "x@", projectType: "", budget: "nope", message: "curta" });
    expect(Object.keys(errors).sort()).toEqual(["budget", "email", "message", "name", "projectType"]);
  });

  it("enforces maximum lengths", () => {
    expect(validateContact({ ...valid, message: "a".repeat(2001) }).message).toMatch(/2000/);
    expect(validateContact({ ...valid, name: "a".repeat(81) }).name).toMatch(/80/);
  });
});

describe("submitContact", () => {
  const payload = { ...valid, website: "", startedAt: 1 };

  it("only reports success when the API confirms", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(submitContact("https://api.test", payload, { fetcher })).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith("https://api.test/api/contact", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.budget).toBeUndefined();
  });

  it("returns the server message and field errors on failure", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "Revise os campos destacados.", fields: { email: "Informe um e-mail válido." } }), {
          status: 422,
        }),
    );
    const result = await submitContact("https://api.test", payload, { fetcher });
    expect(result).toEqual({ ok: false, error: "Revise os campos destacados.", fields: { email: "Informe um e-mail válido." } });
  });

  it("handles network failures and missing configuration", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await submitContact("https://api.test", payload, { fetcher });
    expect(result.ok).toBe(false);
    const unconfigured = await submitContact("", payload, { fetcher });
    expect(unconfigured.ok).toBe(false);
  });

  it("treats a 200 without confirmation as a failure", async () => {
    const fetcher = vi.fn(async () => new Response("<html>", { status: 200 }));
    const result = await submitContact("https://api.test", payload, { fetcher });
    expect(result.ok).toBe(false);
  });
});
