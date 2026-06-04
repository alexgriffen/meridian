import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { trace, SpanStatusCode } from "@opentelemetry/api";

/**
 * Initialise OpenTelemetry. Returns the SDK handle or null when disabled.
 *
 * Reads from env:
 *   OTEL_SDK_DISABLED            — "true" to disable entirely
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — base OTLP URL (the SDK appends /v1/traces)
 *   OTEL_EXPORTER_OTLP_HEADERS   — e.g. "Authorization=Basic <base64>"
 */
export function initTelemetry(serviceName: string): NodeSDK | null {
  if (process.env.OTEL_SDK_DISABLED?.toLowerCase() === "true") {
    return null;
  }
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
    return null;
  }
  const sdk = new NodeSDK({
    serviceName,
    // Construct the exporter with no args so it picks endpoint + headers up
    // from OTEL_EXPORTER_OTLP_* env vars per the OTel spec.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  return sdk;
}

export function tracer(name: string) {
  return trace.getTracer(name);
}

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attrs: Record<string, string | number | boolean> = {}
): Promise<T> {
  const t = trace.getTracer("meridian");
  return t.startActiveSpan(name, async (span) => {
    Object.entries(attrs).forEach(([k, v]) => span.setAttribute(k, v));
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
