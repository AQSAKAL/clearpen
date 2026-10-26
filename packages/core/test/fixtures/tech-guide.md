Nimbus API v2.3.1 authenticates every request with an API key. This guide shows you how to create a key, store it safely, and rotate it without downtime. It is written for developers who already have a Nimbus account and have been given access to the project they want to call.

## Before you begin

You need:

- A Nimbus account with the **Owner** or **Admin** role on the project.
- `curl` 7.68 or later.

> **Note:** API keys created before v2.0 use the legacy `nk_` prefix and cannot be rotated with the CLI. Recreate them first.

## Create your first key

1. Sign in to the Nimbus console and open **Settings > API Keys**.
2. Click **New key**, give it a descriptive name such as `billing-service-prod`, and choose a scope.
3. Copy the token. It is only shown once.
4. Export it as an environment variable:

```bash
export NIMBUS_API_KEY="nmb_live_4f9c2e7a1b"
```

5. Check that it works:

```bash
curl -H "Authorization: Bearer $NIMBUS_API_KEY" \
  https://api.nimbus.example/v2/projects
```

A succesful call returns a JSON list of your projects:

```json
{
  "projects": [
    { "id": "prj_8812", "name": "billing", "region": "eu-west-1" }
  ],
  "api_version": "2.3.1"
}
```

If you get a `401`, the key was probably copied with a trailing space, which is a surprisingly common mistake that happens when you copy the key from the console on some browsers and paste it into a terminal that does not strip whitespace, and it can be very hard to spot because the shell does not show it.

## Store the key safely

For local development, put the key in a `.env` file in your project root and make sure `.env` is listed in `.gitignore`. The Nimbus SDK for Node (`@nimbus/sdk` 4.2.0) reads `NIMBUS_API_KEY` automatically, so you do not need to pass the token in your code. In production, the key should be injected by your deployment platform rather than read from a file.

```bash
echo "NIMBUS_API_KEY=nmb_live_4f9c2e7a1b" >> .env
```

## Rotate a key

Keys should be rotated every 90 days. Rotation is done with the Nimbus CLI (version 1.8.0 or later), and the old key is kept alive during a grace period so that nothing breaks.

1. Run the rotate command for the key you want to replace:

```bash
nimbus keys rotate billing-service-prod --expire 30d
```

The CLI prints the new secret and the date the old one stops working. The `--expire` flag sets how long the old key keeps working; if you leave it out, the old key is revoked after 24 hours.

2. Update the key everywhere it is used.
3. Restart the service.
4. Confirm the new token works by running the `curl` command from step 5 above.
5. Once traffic has moved over, revoke the old key:

```bash
nimbus keys revoke nmb_live_4f9c2e7a1b
```

> **Warning:** Revoking a key is immediate and cannot be undone. Any request still using it will fail with `403 key_revoked`.

## Rate limits and errors

Each key is limited by plan. Requests over the limit are rejected with `429` and a `Retry-After` header.

| Plan | Requests per minute | Burst |
|------|--------------------:|------:|
| Free | 60 | 10 |
| Team | 600 | 100 |
| Enterprise | 6000 | 1000 |

| Status | Code | Meaning |
|--------|------|---------|
| 401 | `invalid_key` | The key is missing, malformed or unknown. |
| 403 | `key_revoked` | The key was revoked or has expired. |
| 403 | `scope_denied` | The key does not have the scope this endpoint needs. |
| 429 | `rate_limited` | Too many requests. Wait for `Retry-After` seconds. |

## Best practices

- Never commit a key to source control. Use a secret manager such as Vault or AWS Secrets Manager, and load it into `NIMBUS_API_KEY` at runtime.
- Use one key per service so a leaked key can be revoked without breaking everything else.
- Give each key the smallest scope it needs. A read-only reporting job does not need `projects:write`.
- Set an alert for `key_revoked` errors so you notice quickly if a service is still using an old token.

It is important to note that the grace period during rotation is 48 hours by default, so plan your deploys accordingly.
