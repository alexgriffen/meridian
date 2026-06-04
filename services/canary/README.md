# canary

End-to-end canary that exercises the public Meridian API at a steady cadence.

Runs a known tenant (the seeded one) through a realistic mix of operations:
- Usage events (3–7 per tick, mixed metrics)
- Read paths (~30% of ticks)
- Subscription creates (~5% of ticks)
- Plan changes (~2% of ticks)

OTel auto-instrumentation traces the outbound calls; spans propagate to the
gateway, so Grafana shows full canary → gateway → postgres traces.

## Why

In a real billing platform we run canary tenants in production to confirm
end-to-end flows are healthy independently of customer traffic. For the alpha
this doubles as a steady runtime signal for observability tooling
(PlayerZero, Grafana Application Observability, etc.).

## Env

| var | default | purpose |
|---|---|---|
| `API_URL` | `https://meridian-gateway.fly.dev` | Gateway base URL |
| `TENANT_ID` | seeded UUID | Tenant the canary runs against |
| `CUSTOMER_ID` | seeded UUID | Customer for usage events |
| `SUBSCRIPTION_ID` | seeded UUID | Subscription for plan changes |
| `INTERVAL_MS` | `60000` | Tick interval (default 60s) |

## Local dev

```bash
pnpm --filter @meridian/canary dev
```
