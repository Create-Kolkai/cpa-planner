# Demo Test Script

## Sales Representative

1. Open the app.
2. If Supabase is not configured, confirm the setup state appears.
3. Sign in with a demo sales representative account.
4. Confirm the profile loads and Team navigation is hidden for a sales representative.
5. Review Overview.
6. Go to Pharmacies.
7. Import the demo CSV or a test CSV.
8. Confirm the import saves and does not expose raw coordinates as a primary column.
9. Check location quality statuses.
10. Go to Availability.
11. Add an unavailable date with a reason.
12. Go to Monthly Plan.
13. Set min 4 and max 8.
14. Generate and save a plan.
15. Refresh and confirm the saved plan reloads.
16. Select a day and review ordered pharmacy stops.
17. Move one visit to another eligible date.
18. Swap the selected day with another eligible date.
19. Export the calendar CSV.
20. Sign out and back in, then confirm data remains.

## Manager

1. Sign in as a manager profile.
2. Confirm Team navigation is visible.
3. Go to Team.
4. Review representative plan readiness.
5. Add a team event.
6. Confirm future visits are replanned from that date.

## Known Demo Gap

RLS and manager workflows must be verified against a live confirmed Supabase demo project before stakeholder testing.
