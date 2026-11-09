# Approval API contract

The app listens on localhost and uses fictional records. Approval codes are fixed
test fixtures. This lab models a business rule, so it does not implement identity
verification or production authentication.

All API responses are JSON. Errors have the shape
`{"error":{"code":"ERROR_CODE","message":"Human-readable message."}}`.

| Request | Input | Success |
| --- | --- | --- |
| `POST /api/requests` | `{"title":"Sample document","fixture":"standard"}`. Title must contain 1–80 characters after trimming. Fixture must be `standard` or `leading-zero`. | `201` with an approval request in `pending` status |
| `GET /api/requests/:id` | ID from the create response | `200` with current status and approval timestamp |
| `POST /api/requests/:id/approve` | `{"code":"123456"}`. The code must be a string of exactly six ASCII digits. | `200` with status `approved` and a UTC approval timestamp |

The standard fixture uses `123456`. The leading-zero fixture uses `042731`.
Compare the code as text. A leading zero is a valid digit and is part of the code.

A request response has `id` (integer), `title`, `fixture`, `status`
(`pending` or `approved`), and `approvedAt` (ISO UTC timestamp or `null`).

| Status | Error code | Condition |
| --- | --- | --- |
| 400 | `INVALID_JSON` | Request body is malformed JSON |
| 400 | `INVALID_REQUEST` | Title or fixture is invalid |
| 400 | `INVALID_CODE_FORMAT` | Code is missing, numeric, or fails the six-digit rule |
| 404 | `NOT_FOUND` | Request or route is unknown |
| 409 | `ALREADY_APPROVED` | A validly formatted approval was sent for an approved request |
| 422 | `INCORRECT_CODE` | Well-formed code does not match a pending request |

A rejected approval leaves status and timestamp unchanged. A replay leaves the
original timestamp unchanged. Approval updates both fields in one SQLite statement.
