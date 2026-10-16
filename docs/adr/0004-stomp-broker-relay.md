# ADR-0004: STOMP over WebSocket with a RabbitMQ broker relay

**Status:** Accepted

**Decision.** Clients connect to `/ws` (raw WebSocket, STOMP 1.2). Spring relays `/topic` and `/queue` to RabbitMQ's
STOMP plugin (Amazon MQ in AWS), so any backend task can publish to any subscriber. Destinations use dots
(`/topic/orders.<id>`) because RabbitMQ maps them to topic routing keys. This deviates from the brief's
`/topic/orders/{orderId}` path style.

**Consequences.** Horizontal scaling without sticky sessions for fan-out. The ALB idle timeout is 120 s and both sides
heartbeat every 10 s. Live pushes are best-effort (`LiveBroadcaster`); clients re-fetch snapshots on reconnect.
