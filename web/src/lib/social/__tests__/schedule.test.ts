import { alternateTypes, duePosts, metricsDue, nextFreeSlot, nextWeekRange, shouldDefer, slotsBetween, spacingOk, withinQuota, zonedTime } from "@shared/social/schedule";

const SP = "America/Sao_Paulo";
const rules = [
  { id: "a", format: "carousel", weekday: 2, local_time: "19:00", timezone: SP, count: 1 },
  { id: "b", format: "carousel", weekday: 4, local_time: "19:00", timezone: SP, count: 1 },
];

describe("agendador", () => {
  it("converte horário local de São Paulo para UTC", () => {
    expect(zonedTime("2026-11-17", "19:00", SP).toISOString()).toBe("2026-11-17T22:00:00.000Z");
  });
  it("gera terça e quinta às 19h", () => {
    const s = slotsBetween(rules, new Date("2026-11-16T03:00:00Z"), new Date("2026-11-23T03:00:00Z"));
    expect(s.map((x) => x.at.toISOString())).toEqual(["2026-11-17T22:00:00.000Z", "2026-11-19T22:00:00.000Z"]);
  });
  it("próxima semana começa na segunda 00h local", () => {
    const { from, to } = nextWeekRange(new Date("2026-11-15T21:00:00Z"), SP); // domingo 18h
    expect(from.toISOString()).toBe("2026-11-16T03:00:00.000Z");
    expect(to.getTime() - from.getTime()).toBe(7 * 864e5);
  });
  it("próximo horário livre pula os ocupados", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(nextFreeSlot(rules, [], now)?.toISOString()).toBe("2026-11-17T22:00:00.000Z");
    expect(nextFreeSlot(rules, [new Date("2026-11-17T22:00:00Z")], now)?.toISOString()).toBe("2026-11-19T22:00:00.000Z");
  });
  it("só publica aprovado e vencido (até +2 min)", () => {
    const now = new Date("2026-11-17T22:00:00Z");
    const base = { require_review: true, approved_at: "2026-11-16T00:00:00Z", account_id: "x" };
    const posts = [
      { ...base, id: "1", status: "scheduled", scheduled_at: "2026-11-17T22:01:30Z" },
      { ...base, id: "2", status: "scheduled", scheduled_at: "2026-11-17T22:10:00Z" },
      { ...base, id: "3", status: "review", scheduled_at: "2026-11-17T21:00:00Z" },
      { ...base, id: "4", status: "approved", scheduled_at: "2026-11-17T21:00:00Z", approved_at: null },
      { ...base, id: "5", status: "approved", scheduled_at: "2026-11-17T21:00:00Z", approved_at: null, require_review: false },
    ];
    expect(duePosts(posts, now).map((p) => p.id)).toEqual(["5", "1"]);
  });
  it("espaçamento, cota com folga e adiamento por uso", () => {
    const now = new Date("2026-11-17T22:00:00Z");
    expect(spacingOk(new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(spacingOk(new Date(now.getTime() - 121_000), now)).toBe(true);
    expect(withinQuota(89, 100)).toBe(true);
    expect(withinQuota(90, 100)).toBe(false);
    expect(shouldDefer(80)).toBe(true);
    expect(shouldDefer(79)).toBe(false);
  });
  it("métricas em 24 h, 72 h, 7 dias e semanal até 30 dias", () => {
    const pub = new Date("2026-11-01T00:00:00Z");
    expect(metricsDue(pub, null, new Date("2026-11-01T23:00:00Z"))).toBe(false);
    expect(metricsDue(pub, null, new Date("2026-11-02T01:00:00Z"))).toBe(true);
    expect(metricsDue(pub, new Date("2026-11-02T01:00:00Z"), new Date("2026-11-03T00:00:00Z"))).toBe(false);
    expect(metricsDue(pub, new Date("2026-11-02T01:00:00Z"), new Date("2026-11-04T01:00:00Z"))).toBe(true);
    expect(metricsDue(pub, new Date("2026-12-01T01:00:00Z"), new Date("2026-12-20T00:00:00Z"))).toBe(false);
  });
  it("tipos alternados, nunca dois iguais seguidos", () => {
    const t = alternateTypes(6, ["ensino", "prova"], "ensino");
    expect(t).toEqual(["prova", "ensino", "prova", "ensino", "prova", "ensino"]);
    expect(alternateTypes(3, ["ensino"])).toEqual(["ensino", "ensino", "ensino"]);
  });
});
