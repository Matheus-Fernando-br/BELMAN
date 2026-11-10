import { addMonths, balanceAt, breakEven, burnAndRunway, cashFlow, monthsBetween, parseMoney, type TxLike } from "./finance-math";

describe("parseMoney", () => {
  it("reads Brazilian and plain formats", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 35,00")).toBe(3500);
    expect(parseMoney("1234.5")).toBe(123450);
    expect(parseMoney("1.500")).toBe(150000);
    expect(parseMoney("12")).toBe(1200);
  });
  it("rejects garbage", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1,2,3")).toBeNull();
  });
});

describe("months", () => {
  it("lists and shifts months across years", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

const tx = (p: Partial<TxLike>): TxLike => ({
  type: "expense",
  amount_cents: 1000,
  due_date: "2026-10-10",
  paid_amount_cents: null,
  paid_date: null,
  cancelled: false,
  ...p,
});

describe("cashFlow", () => {
  it("separates planned (by due date) from realized (by paid date) and skips cancelled", () => {
    const flows = cashFlow(
      [
        tx({ type: "income", amount_cents: 5000, due_date: "2026-10-05", paid_amount_cents: 4800, paid_date: "2026-11-02" }),
        tx({ amount_cents: 2000, due_date: "2026-10-20" }),
        tx({ amount_cents: 999, cancelled: true }),
      ],
      ["2026-10", "2026-11"],
    );
    expect(flows[0]).toMatchObject({ plannedIn: 5000, plannedOut: 2000, realizedIn: 0, realizedOut: 0 });
    expect(flows[1]).toMatchObject({ plannedIn: 0, realizedIn: 4800 });
  });
});

describe("balance, burn and break-even", () => {
  it("computes cash at a date", () => {
    const txs = [
      tx({ type: "income", paid_amount_cents: 10000, paid_date: "2026-10-01" }),
      tx({ paid_amount_cents: 3000, paid_date: "2026-10-15" }),
      tx({ paid_amount_cents: 500, paid_date: "2026-12-01" }),
    ];
    expect(balanceAt(txs, 1000, "2026-10-31")).toBe(8000);
    expect(balanceAt(txs, 1000, "2026-10-31", 2000)).toBe(10000);
  });
  it("reports burn and runway only when losing money", () => {
    const losing = [
      { month: "a", plannedIn: 0, plannedOut: 0, realizedIn: 1000, realizedOut: 3000 },
      { month: "b", plannedIn: 0, plannedOut: 0, realizedIn: 1000, realizedOut: 2000 },
    ];
    expect(burnAndRunway(losing, 15000)).toEqual({ burn: 1500, runway: 10, avgNet: -1500 });
    expect(burnAndRunway([{ month: "a", plannedIn: 0, plannedOut: 0, realizedIn: 5, realizedOut: 1 }], 10).runway).toBeNull();
  });
  it("finds the break-even revenue", () => {
    expect(breakEven(10000, 2000, 4000)).toBe(5000);
    expect(breakEven(0, 0, 100)).toBeNull();
  });
});
