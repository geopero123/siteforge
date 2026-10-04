import {
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "@google/genai";
import { z } from "zod";
import type { AIProvider } from "./provider";
import type { BrowserSession } from "../browser/session";
import { ToolBudget } from "../security/url";
const toolDefinitions: Array<[string, string, Record<string, Type>]> = [
  ["getInteractiveElements", "List visible element IDs", {}],
  ["getPageText", "Read bounded page text", {}],
  ["getDOMSnapshot", "Inspect metadata and layout", {}],
  ["getConsoleErrors", "Read console errors", {}],
  ["getFailedRequests", "Read failed network requests", {}],
  ["getLinks", "List links", {}],
  ["takeScreenshot", "Capture the current viewport for visual inspection", {}],
  ["navigateTo", "Navigate same origin", { url: Type.STRING }],
  ["clickElement", "Click current element ID", { id: Type.STRING }],
  [
    "typeText",
    "Fill an input with synthetic test data",
    { id: Type.STRING, text: Type.STRING },
  ],
  ["inspectElement", "Inspect element bounds and markup", { id: Type.STRING }],
  ["scrollPage", "Scroll by pixels", { amount: Type.NUMBER }],
  ["goBack", "Go back", {}],
];
const declarations: FunctionDeclaration[] = toolDefinitions.map(
  ([name, description, properties]) => ({
    name: name as string,
    description: description as string,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, type]) => [name, { type }]),
      ),
      required: Object.keys(properties),
    },
  }),
);
export const missionResultSchema = z.object({
  outcome: z.enum(["SUCCESS", "PARTIAL", "FAILED"]),
  summary: z.string().max(5000),
  evidence: z
    .array(
      z.object({
        step: z.number().int().min(1),
        observation: z.string().min(3).max(1000),
      }),
    )
    .max(10)
    .default([]),
});
export async function runMission(
  ai: AIProvider,
  browser: BrowserSession,
  objective: string,
  onStep: (tool: string, args: unknown, result: unknown) => Promise<void>,
  onScreenshot?: (image: Buffer, url: string) => Promise<string>,
): Promise<z.infer<typeof missionResultSchema>> {
  browser.budget = new ToolBudget();
  const observedResults: string[] = [];
  const startedAt = Date.now();
  const history: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: `Mission: ${objective}. Current URL: ${browser.page.url()}. Form submissions authorized: ${browser.allowSubmission}. Never invent completion. Finish with JSON containing outcome, summary and evidence: [{step: 1, observation: "exact substring of the observed tool result"}]. Every result has a one-based step number. SUCCESS requires evidence that demonstrates the objective; otherwise report PARTIAL or FAILED.`,
        },
      ],
    },
  ];
  for (let turn = 0; turn < 20; turn++) {
    if (Date.now() - startedAt > 120000)
      return {
        outcome: "PARTIAL" as const,
        summary: "Mission time limit reached.",
        evidence: [],
      };
    const content = await ai.callTools(history, declarations);
    history.push(content);
    const calls =
      content.parts
        ?.filter((p) => p.functionCall)
        .map((p) => p.functionCall!) ?? [];
    if (!calls.length) {
      const raw = content.parts?.map((p) => p.text ?? "").join("") ?? "";
      return validateMissionCompletion(raw, observedResults);
    }
    // Return tool results and screenshot data as separate conversation messages.
    const responses: Part[] = [];
    const images: Part[] = [];
    for (const [index, call] of calls.entries()) {
      let result: unknown;
      try {
        if (index >= 4)
          throw new Error(
            "At most four tools per turn; request remaining tools next turn.",
          );
        result = await browser.execute(call.name ?? "", call.args ?? {});
        if (Buffer.isBuffer(result)) {
          const reference = await onScreenshot?.(result, browser.page.url());
          images.push({
            inlineData: {
              mimeType: "image/png",
              data: result.toString("base64"),
            },
          });
          result = { captured: true, url: browser.page.url(), reference };
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed" };
      }
      await onStep(call.name ?? "", call.args, result);
      // Failed steps keep their number but cannot support a success claim.
      observedResults.push(
        result && typeof result === "object" && "error" in result
          ? ""
          : JSON.stringify(result),
      );
      responses.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: { result, step: observedResults.length },
        },
      });
    }
    history.push({ role: "user", parts: responses });
    if (images.length) history.push({ role: "user", parts: images });
    if (getTextContextSize(history) > 60000)
      return {
        outcome: "PARTIAL" as const,
        summary: "Mission stopped at context limit. Review recorded steps.",
        evidence: [],
      };
  }
  return {
    outcome: "PARTIAL" as const,
    summary: "Mission stopped at maximum agent turns.",
    evidence: [],
  };
}

function validateMissionCompletion(raw: string, observedResults: string[]) {
  try {
    const result = missionResultSchema.parse(
      JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")),
    );
    // Evidence uses one-based step numbers and must quote a recorded result.
    result.evidence = result.evidence.filter((evidence) =>
      observedResults[evidence.step - 1]?.includes(evidence.observation),
    );
    if (result.outcome === "SUCCESS" && !result.evidence.length)
      return {
        outcome: "PARTIAL" as const,
        summary:
          "The agent claimed success without verifiable tool evidence. Review recorded steps.",
        evidence: [],
      };
    return result;
  } catch {
    return {
      outcome: "PARTIAL" as const,
      summary: "The agent stopped without a validated completion result.",
      evidence: [],
    };
  }
}

function getTextContextSize(history: Content[]) {
  // Count text and tool results without including base64 screenshot bytes.
  return JSON.stringify(
    history.map((content) => ({
      ...content,
      parts: content.parts?.map((part) =>
        part.inlineData ? { text: "[screenshot]" } : part,
      ),
    })),
  ).length;
}
