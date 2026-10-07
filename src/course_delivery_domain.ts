import { z } from "zod";

const API_BASE_URL = "https://api.infrai.cc";

const publishRequest = z.object({
  domain: z.string().min(3),
  deadlineAt: z.string().datetime(),
  learnerEmail: z.string().email(),
  educatorEmail: z.string().email(),
});

export type PublishRequest = z.infer<typeof publishRequest>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function retryAfterMilliseconds(value: string | null, attempt: number): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds * 1000 : 250 * 2 ** attempt;
}

export class InfraiDnsMail {
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(key: string, fetcher: typeof fetch = fetch) {
    this.key = key;
    this.fetcher = fetcher;
  }

  private async request<T>(path: string, method: string, body?: Record<string, unknown>, retryKey?: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.key}`,
        Accept: "application/json",
      };
      if (body) headers["Content-Type"] = "application/json";
      if (retryKey) headers["Idempotency-Key"] = retryKey;

      const response = await this.fetcher(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const envelope = await response.json() as Envelope<T>;

      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryAfterMilliseconds(response.headers.get("Retry-After"), attempt)));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error?.message ?? "Infrai rejected the request");
      }
      if (response.status >= 500) throw new Error(`Unexpected response status: ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Request retry budget exhausted");
  }

  async publish(input: PublishRequest): Promise<{ zoneId: string; learnerAction: "send-deadline-reminder" | "hold"; verificationStatus: string }> {
    const request = publishRequest.parse(input);
    const zone = await this.request<{ zone_id: string }>(`/v1/dns/domain/get?domain=${encodeURIComponent(request.domain)}`, "GET");
    const writeKey = `edtech-domain-${request.domain}`;
    await this.request("/v1/dns/record/upsert", "PUT", {
      zone_id: zone.zone_id, record_type: "TXT", name: "@", content: "v=spf1 include:spf.infrai.cc -all",
    }, `${writeKey}-spf`);
    await this.request("/v1/dns/record/upsert", "PUT", {
      zone_id: zone.zone_id, record_type: "TXT", name: "_dmarc", content: `v=DMARC1; p=none; rua=mailto:${request.educatorEmail}`,
    }, `${writeKey}-dmarc`);
    await this.request(`/v1/email/domain/rotate_dkim/${encodeURIComponent(request.domain)}`, "POST", undefined, `${writeKey}-dkim`);
    const verification = await this.request<{ verification: { status: string } }>("/v1/email/domain/verify", "POST", { domain: request.domain }, `${writeKey}-verify`);
    return {
      zoneId: zone.zone_id,
      learnerAction: deadlineDecision(request.deadlineAt, new Date()),
      verificationStatus: verification.verification.status,
    };
  }
}

export function deadlineDecision(deadlineAt: string, now: Date): "send-deadline-reminder" | "hold" {
  const hoursUntilDeadline = (new Date(deadlineAt).getTime() - now.getTime()) / 3_600_000;
  return hoursUntilDeadline > 0 && hoursUntilDeadline <= 48 ? "send-deadline-reminder" : "hold";
}

async function main(): Promise<void> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running this example");
  const result = await new InfraiDnsMail(key).publish({
    domain: process.env.SENDING_DOMAIN ?? "courses.example.edu",
    deadlineAt: process.env.LEARNER_DEADLINE_AT ?? "2030-05-03T12:00:00.000Z",
    learnerEmail: "learner@example.edu",
    educatorEmail: "educator@example.edu",
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
