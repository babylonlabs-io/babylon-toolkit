import type { Page, Request } from "@playwright/test";

export interface SentryEvent {
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
    }>;
  };
  message?: string;
  level?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface SentryEnvelope {
  header: Record<string, unknown>;
  items: Array<{
    type: string;
    payload: SentryEvent;
  }>;
}

function parseSentryEnvelope(body: string): SentryEnvelope | null {
  try {
    const lines = body.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      return null;
    }

    const header = JSON.parse(lines[0]);
    const items: SentryEnvelope["items"] = [];

    for (let i = 1; i < lines.length; i += 2) {
      if (i + 1 < lines.length) {
        const itemHeader = JSON.parse(lines[i]);
        const payload = JSON.parse(lines[i + 1]);
        items.push({
          type: itemHeader.type,
          payload,
        });
      }
    }

    return { header, items };
  } catch {
    return null;
  }
}

export class SentryInterceptor {
  private capturedEvents: SentryEvent[] = [];
  private capturedRequests: Request[] = [];

  async setup(page: Page): Promise<void> {
    this.capturedEvents = [];
    this.capturedRequests = [];

    await page.route("**/sentry-tunnel", async (route) => {
      const request = route.request();
      this.capturedRequests.push(request);

      const postData = request.postData();
      if (postData) {
        const envelope = parseSentryEnvelope(postData);
        if (envelope) {
          for (const item of envelope.items) {
            if (item.type === "event" || item.type === "error") {
              this.capturedEvents.push(item.payload);
            }
          }
        }
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-event-id" }),
      });
    });
  }

  getEvents(): SentryEvent[] {
    return [...this.capturedEvents];
  }

  getRequests(): Request[] {
    return [...this.capturedRequests];
  }

  hasEventWithMessage(messagePattern: RegExp): boolean {
    return this.capturedEvents.some((event) => {
      if (event.message && messagePattern.test(event.message)) {
        return true;
      }

      const exceptionValues = event.exception?.values;
      if (exceptionValues) {
        return exceptionValues.some(
          (ex) => ex.value && messagePattern.test(ex.value),
        );
      }

      return false;
    });
  }

  hasEventWithTag(tagKey: string, tagValue?: string): boolean {
    return this.capturedEvents.some((event) => {
      if (!event.tags) return false;
      if (tagValue !== undefined) {
        return event.tags[tagKey] === tagValue;
      }
      return tagKey in event.tags;
    });
  }

  clear(): void {
    this.capturedEvents = [];
    this.capturedRequests = [];
  }

  async waitForEvent(
    page: Page,
    options: { timeout?: number } = {},
  ): Promise<void> {
    const timeout = options.timeout ?? 10000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.capturedEvents.length > 0) {
        return;
      }
      await page.waitForTimeout(100);
    }
  }
}
