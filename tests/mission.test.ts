import { expect, it, vi } from "vitest";
import type { Content } from "@google/genai";
import { runMission } from "../src/lib/ai/mission";
import type { AIProvider } from "../src/lib/ai/provider";
import type { BrowserSession } from "../src/lib/browser/session";
import { ToolBudget } from "../src/lib/security/url";

function fixture(
  contents: Content[],
  execute = vi.fn(async () => "Cart contains one item"),
) {
  const callTools = vi.fn(async (history: Content[]) => {
    expect(history.length).toBeGreaterThan(0);
    return contents.shift()!;
  });
  const ai = { callTools } as unknown as AIProvider;
  const browser = {
    page: { url: () => "https://example.com" },
    budget: new ToolBudget(),
    allowSubmission: false,
    execute,
  } as unknown as BrowserSession;
  return { ai, browser, callTools, execute };
}
const success = (evidence: unknown[] = []): Content => ({
  role: "model",
  parts: [
    {
      text: JSON.stringify({
        outcome: "SUCCESS",
        summary: "Cart updated",
        evidence,
      }),
    },
  ],
});
it("downgrades success without observed evidence", async () => {
  const { ai, browser } = fixture([success()]);
  expect((await runMission(ai, browser, "Add one item", vi.fn())).outcome).toBe(
    "PARTIAL",
  );
});
it("accepts a result citing an exact observation from a real tool step", async () => {
  const { ai, browser } = fixture([
    {
      role: "model",
      parts: [
        { functionCall: { id: "call-1", name: "getPageText", args: {} } },
      ],
    },
    success([{ step: 1, observation: "Cart contains one item" }]),
  ]);
  const result = await runMission(ai, browser, "Add one item", vi.fn());
  expect(result.outcome).toBe("SUCCESS");
  expect(result.evidence).toHaveLength(1);
});
it("does not accept a failed tool as success evidence", async () => {
  const { ai, browser } = fixture(
    [
      {
        role: "model",
        parts: [{ functionCall: { name: "clickElement", args: {} } }],
      },
      success([{ step: 1, observation: "blocked" }]),
    ],
    vi.fn(async () => {
      throw new Error("blocked");
    }),
  );
  expect(
    (await runMission(ai, browser, "Create an account", vi.fn())).outcome,
  ).toBe("PARTIAL");
});
it("preserves thought signatures and returns every function call ID", async () => {
  const model: Content = {
    role: "model",
    parts: Array.from({ length: 5 }, (_, i) => ({
      thoughtSignature: i === 0 ? "signature" : undefined,
      functionCall: { id: `call-${i}`, name: "getPageText", args: {} },
    })),
  };
  const { ai, browser, callTools, execute } = fixture([model, success()]);
  await runMission(ai, browser, "Inspect cart", vi.fn());
  const history = callTools.mock.calls[1][0] as Content[];
  expect(history[1]).toBe(model);
  expect(history[2].parts?.map((p) => p.functionResponse?.id)).toEqual([
    "call-0",
    "call-1",
    "call-2",
    "call-3",
    "call-4",
  ]);
  expect(execute).toHaveBeenCalledTimes(4);
  expect(JSON.stringify(history[2].parts?.[4])).toContain("At most four tools");
});
it("delivers screenshot pixels to the model and stores only a reference in the tool log", async () => {
  const { ai, browser, callTools } = fixture(
    [
      {
        role: "model",
        parts: [{ functionCall: { name: "takeScreenshot", args: {} } }],
      },
      success(),
    ],
    vi.fn(async () => Buffer.from("image pixels")) as never,
  );
  const step = vi.fn();
  const store = vi.fn(async () => "private/shot.png");
  await runMission(ai, browser, "Inspect mobile nav", step, store);
  expect(store).toHaveBeenCalledOnce();
  expect(JSON.stringify(step.mock.calls)).toContain("private/shot.png");
  expect(JSON.stringify(step.mock.calls)).not.toContain("image pixels");
  expect(JSON.stringify(callTools.mock.calls[1])).toContain("inlineData");
});
