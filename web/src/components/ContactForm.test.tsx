import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "./ContactForm";

function mockFetch(contactResponse: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input).endsWith("/api/health")) return new Response("{}");
    return contactResponse();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome"), "Maria Silva");
  await user.type(screen.getByLabelText("E-mail"), "maria@example.com");
  await user.selectOptions(screen.getByLabelText("Assunto"), "finc");
  await user.type(screen.getByLabelText("Mensagem"), "Quero uma plataforma de agendamentos para clínicas.");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ContactForm", () => {
  it("blocks submission and focuses the first invalid field", async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ ok: true })));
    const user = userEvent.setup();
    render(<ContactForm endpoint="https://api.test" />);

    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(screen.getByText("Informe seu nome.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveFocus();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalledWith("https://api.test/api/contact", expect.anything());
  });

  it("shows success only after the API confirms, then clears the form", async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify({ ok: true })));
    const user = userEvent.setup();
    render(<ContactForm endpoint="https://api.test" />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findByText("Mensagem enviada.")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/api/contact"))!;
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ name: "Maria Silva", email: "maria@example.com", projectType: "finc", website: "" });

    await user.click(screen.getByRole("button", { name: "Enviar outra mensagem" }));
    expect(screen.getByLabelText("Nome")).toHaveValue("");
  });

  it("keeps the data and shows the error when delivery fails", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: false, error: "Não foi possível enviar sua mensagem agora." }), { status: 502 }));
    const user = userEvent.setup();
    render(<ContactForm endpoint="https://api.test" />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível enviar sua mensagem agora.");
    expect(screen.queryByText("Mensagem enviada.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveValue("Maria Silva");
  });

  it("shows a loading state while sending", async () => {
    let resolve!: (response: Response) => void;
    mockFetch(() => new Promise<Response>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ContactForm endpoint="https://api.test" />);

    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(screen.getByRole("button", { name: /Enviando/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    resolve(new Response(JSON.stringify({ ok: true })));
    await waitFor(() => expect(screen.getByText("Mensagem enviada.")).toBeInTheDocument());
  });

  it("preselects the project type chosen in the services section", async () => {
    mockFetch(() => new Response("{}"));
    render(<ContactForm endpoint="https://api.test" />);
    window.dispatchEvent(new CustomEvent("bellman:project-type", { detail: "integration" }));
    await waitFor(() => expect(screen.getByLabelText("Assunto")).toHaveValue("integration"));
  });
});
