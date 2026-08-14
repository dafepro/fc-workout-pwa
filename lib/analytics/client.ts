import type {
  ClientEvent,
  ClientEventBatch,
  ClientEventName,
  ProductEventProperties,
} from "./catalog";

export interface AnalyticsClient {
  track<Name extends ClientEventName>(
    name: Name,
    properties: ProductEventProperties[Name],
  ): void;
  flush(): Promise<void>;
}

interface AnalyticsClientOptions {
  enabled: boolean;
  send(batch: ClientEventBatch): Promise<void>;
  now?: () => Date;
  uuid?: () => string;
  visitId?: string;
}

export function createAnalyticsClient({
  enabled,
  send,
  now = () => new Date(),
  uuid = () => crypto.randomUUID(),
  visitId = uuid(),
}: AnalyticsClientOptions): AnalyticsClient {
  let queue: ClientEvent[] = [];
  let sending = false;
  return {
    track(name, properties) {
      if (!enabled) return;
      queue.push({
        id: uuid(),
        visit_id: visitId,
        occurred_at: now().toISOString(),
        name,
        properties,
      } as ClientEvent);
      if (queue.length > 20) queue = queue.slice(-20);
    },
    async flush() {
      if (!enabled || sending || queue.length === 0) return;
      const batch = queue;
      queue = [];
      sending = true;
      try {
        await send({ events: batch });
      } catch {
        queue = [...batch, ...queue].slice(-20);
      } finally {
        sending = false;
      }
    },
  };
}
