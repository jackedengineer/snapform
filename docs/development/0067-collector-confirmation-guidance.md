# Collector confirmation guidance — 29 October 2026

Failing browser regression case, observed during the notification journey:
given valid reviewed synthetic answers (including zero budget), when Send response
is activated and confirmation is pending, controls must lock and show saving /
Confirming without reporting a saved-state fault. Observed: the ordinary pending
request displayed “Resolve the saved-state issue before editing.” The shared
frozen flag represented both pending submission and actual recovery errors.

The editable-review hint is presentation copy. The fix shows it only while
review is editable; saving/confirmation indicators and genuine recovery alerts
remain responsible for their states. No domain save/submit behavior changes.

After the fix, the actual 1280×720 browser showed Confirming with locked fields,
no saved-state fault and no editable-review hint. Three Enter presses completed
one durable response/outbox event with zero budget preserved and no email intent
while notifications were off. The receipt heading received focus. Markup-like
email input stayed inert, failed validation and focused its field; correcting it
allowed normal review/submission. There was no overflow or console warning/error.
The screenshot with synthetic answers remains private rather than in Git.

The existing eight progress tests pass, including uncertain-submit locking and
stable-operation retry. The real three-Worker HTTP smoke checks, build and approved
route budgets pass: collector 160.11 KiB gzip, aggregate 199.97 KiB; CSS/font unchanged.
This static presentation fix adds no dependency or domain behavior test that
merely mirrors its rendering condition. The failing/verified browser case above
is its regression evidence; genuine recovery notices remain separately rendered.
