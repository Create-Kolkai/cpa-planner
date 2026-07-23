# Route Planning

## Current Mode

The demo currently uses approximate route ordering:

- Stored coordinates.
- Haversine distance.
- Stable geographic grouping.
- Max visits as a hard limit.
- Min visits as a soft target.

It must not show road distance, driving time, or road-following route lines in approximate mode.

## Provider Mode

When a route provider is configured, add a provider abstraction for:

- Geocoding.
- Stop ordering.
- Route distance.
- Route duration.
- Route geometry.
- Optional travel matrix.

Keep provider secrets server-side. Cache route results to avoid unnecessary calls.

## Planning Priorities

1. Schedule all required visit occurrences or mark them unresolved.
2. Respect unavailable dates and maximum capacity.
3. Preserve locked/manual days during partial replan.
4. Separate repeat visits.
5. Keep nearby pharmacies together.
6. Avoid mixing distant suburbs merely to fill a day.
7. Keep workload close to min/max targets.

The included `npm run test` script checks the required Sea Point and Green Point overflow scenarios.
