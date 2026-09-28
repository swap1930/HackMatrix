import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

async function chat(system: string, user: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project.");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`AI gateway failed [${res.status}]: ${body}`);
    throw new Error(
      res.status === 429
        ? "AI is busy right now — try again in a moment."
        : "AI request failed. Please try again.",
    );
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

const triageSchema = z.object({
  complaint: z.string().min(3).max(2000),
  age: z.number().int().min(0).max(130).nullable().optional(),
  sex: z.string().max(20).nullable().optional(),
});

export const suggestTriage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => triageSchema.parse(data))
  .handler(async ({ data }) => {
    const content = await chat(
      [
        "You support ambulance dispatchers in Pune, India. From a short complaint, infer triage needs.",
        'Reply with ONLY compact JSON: {"severity":"critical|serious|stable","capabilities":[...],"needs":{"icu":bool,"er":bool,"ventilator":bool,"ot":bool},"rationale":"one short sentence"}.',
        "capabilities must be a subset of: trauma, cardiac_cath, stroke, neuro_surgery, burn, obstetrics, pediatric, er_general.",
        "This is decision support only, never a diagnosis.",
      ].join(" "),
      `Complaint: ${data.complaint}\nAge: ${data.age ?? "unknown"}\nSex: ${data.sex ?? "unknown"}`,
    );
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false as const, error: "AI returned an unexpected answer." };
    try {
      const parsed = JSON.parse(match[0]) as {
        severity?: string;
        capabilities?: string[];
        needs?: Record<string, boolean>;
        rationale?: string;
      };
      return { ok: true as const, suggestion: parsed };
    } catch {
      return { ok: false as const, error: "AI returned an unexpected answer." };
    }
  });

const briefSchema = z.object({
  complaint: z.string().min(1).max(2000),
  severity: z.string().max(40),
  age: z.number().int().min(0).max(130).nullable().optional(),
  sex: z.string().max(20).nullable().optional(),
  hospitalName: z.string().max(200),
  etaMinutes: z.number().min(0).max(600),
  capabilities: z.array(z.string().max(60)).max(20),
  resources: z.string().max(400),
});

export const generateHandoverBrief = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => briefSchema.parse(data))
  .handler(async ({ data }) => {
    const content = await chat(
      "You write concise pre-arrival handover briefs for hospital emergency teams. Use plain clinical English, max 120 words, in this order: Patient, Presentation, Severity, Resources requested, ETA, Actions for receiving team. No diagnosis, no invented vitals.",
      [
        `Patient: age ${data.age ?? "unknown"}, sex ${data.sex ?? "unknown"}`,
        `Presentation: ${data.complaint}`,
        `Severity: ${data.severity}`,
        `Receiving hospital: ${data.hospitalName}`,
        `ETA: ${Math.round(data.etaMinutes)} minutes`,
        `Requested resources: ${data.resources}`,
        `Required capabilities: ${data.capabilities.join(", ") || "none specified"}`,
      ].join("\n"),
    );
    if (!content) return { ok: false as const, error: "AI returned an empty brief." };
    return { ok: true as const, brief: content };
  });
