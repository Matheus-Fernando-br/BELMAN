import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const gerar = vi.fn(async () => ({ png: "data:image/png;base64,AAAA", width: 1080, height: 1080, name: "icone-quadrado" }));
vi.mock("./actions", () => ({ gerarArteAction: (...a: unknown[]) => gerar(...(a as [])) }));

import { ArtesForm } from "./ArtesForm";

describe("ArtesForm", () => {
  it("gera a prévia, troca de modelo com os campos padrão e oferece o download", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ArtesForm slug="obra-facil" />);
    await act(async () => void vi.advanceTimersByTime(800));
    expect(gerar).toHaveBeenLastCalledWith("obra-facil", expect.objectContaining({ modelo: "icone", formato: "quadrado" }));
    expect(await screen.findByRole("link", { name: "Baixar PNG" })).toHaveAttribute("download", "obra-facil-icone-quadrado.png");

    await user.click(screen.getByRole("radio", { name: /Número \+ texto/ }));
    expect(screen.getByLabelText("Número")).toHaveValue("5");
    await act(async () => void vi.advanceTimersByTime(800));
    expect(gerar).toHaveBeenLastCalledWith("obra-facil", expect.objectContaining({ modelo: "dicas", campos: expect.objectContaining({ numero: "5" }) }));

    await user.click(screen.getByRole("radio", { name: /Foto com frase/ }));
    expect(screen.getByLabelText("Foto")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
