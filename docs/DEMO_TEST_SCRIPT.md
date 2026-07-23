# Demo Test Script

## Sales Representative

1. Open the app.
2. Review Overview.
3. Go to Pharmacies.
4. Import the demo CSV or a test CSV.
5. Confirm raw coordinates are not shown as a primary table column.
6. Check location quality statuses.
7. Go to Availability.
8. Add an unavailable date with a reason.
9. Go to Monthly Plan.
10. Set min 4 and max 8.
11. Generate a plan.
12. Select a day and review ordered pharmacy stops.
13. Move one visit to another eligible date.
14. Swap the selected day with another eligible date.
15. Export the calendar CSV.
16. Refresh and confirm local demo state persists.

## Manager

1. Go to Team.
2. Review representative plan readiness.
3. Add a team event.
4. Confirm future visits are replanned from that date.

## Known Demo Gap

Supabase sign-in, multi-user persistence, manager assignments, and RLS must be wired before this becomes a true multi-user test demo.
