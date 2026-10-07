import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/lib/ai/provider";
import { reportSchema } from "../src/lib/audit/schema";

const fetchMock = vi.fn();
const validReport = { issues: [], summary: "Connection successful" };
function response(text: string) {
  return Response.json({
    id: "test-interaction",
    status: "completed",
    output_text: text,
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  });
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("sends audit reports and image evidence through the actual SDK's Interactions transport", async () => {
  fetchMock.mockResolvedValue(response(JSON.stringify(validReport)));
  expect(
    await new GeminiProvider().analyzeImage(
      "Inspect evidence",
      [Buffer.from("image")],
      reportSchema,
    ),
  ).toEqual(validReport);
  const request = fetchMock.mock.calls[0][0] as Request;
  expect(request.url).toContain("/interactions");
  const body = await request.json();
  expect(body).toMatchObject({
    model: "gemini-3.8-flash",
    store: false,
    response_format: { type: "text", mime_type: "application/json" },
    input: [
      { type: "text", text: "Inspect evidence" },
      {
        type: "image",
        mime_type: "image/png",
        data: Buffer.from("image").toString("base64"),
      },
    ],
  });
  expect(
    body.response_format.schema.properties.issues.items.properties.evidence,
  ).toBeDefined();
  expect(body).not.toHaveProperty("generationConfig.responseJsonSchema");
});

it("repairs an invalid report once and still validates the final response", async () => {
  fetchMock
    .mockResolvedValueOnce(response('{"issues":[],"summary":42}'))
    .mockResolvedValueOnce(response(JSON.stringify(validReport)));
  expect(
    await new GeminiProvider().generateStructured("Inspect", reportSchema),
  ).toEqual(validReport);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const second = await (fetchMock.mock.calls[1][0] as Request).json();
  expect(second.input.at(-1).text).toContain("did not validate");
});

it("rejects reports that remain invalid after the repair", async () => {
  fetchMock.mockImplementation(async () =>
    response('{"issues":[],"summary":42}'),
  );
  await expect(
    new GeminiProvider().generateStructured("Inspect", reportSchema),
  ).rejects.toThrow("invalid structured output");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("does not treat an API request failure as a report validation retry", async () => {
  fetchMock.mockImplementation(async () =>
    Response.json(
      {
        error: {
          code: 400,
          message: "Invalid request",
          status: "INVALID_ARGUMENT",
        },
      },
      { status: 400 },
    ),
  );
  await expect(
    new GeminiProvider().generateStructured("Inspect", reportSchema),
  ).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
