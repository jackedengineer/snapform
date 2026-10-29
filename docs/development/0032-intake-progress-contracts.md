# Partial progress and final-answer contracts

29 October 2026. A strict mutation contains one UUID operation identity, the expected revision and at most fifty bounded explicit answer inputs. Clients cannot select status, ownership, applicability, ending or a result revision. Partial progress preserves bounded unfinished inputs for recovery rather than pretending they are canonical final answers. Unknown field IDs and forged not-applicable states are rejected.

Final preparation repeats the shared compiler/evaluator. It requires all applicable required answers, normalizes values, computes the ending and marks hidden/skipped fields not applicable. Raw values for those fields never become submitted values. Zero remains an answer. Behavioral tests were written before the module; the initial run failed because the implementation was absent. The tests cover incomplete input versus submit, hidden-answer exclusion, email normalization, zero and malformed/foreign/oversized requests.

This is a pure contract; no mutation HTTP or respondent interface is exposed by this commit. Browser collection and durable database submission remain subsequent slices, so no browser submission is claimed here. No dependency or bundle import was added.
