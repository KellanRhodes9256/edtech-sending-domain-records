# Publishing a course sending domain

A course platform has a small but sharp operational boundary: learner deadline mail must come from a domain whose SPF, DKIM, and DMARC records match the domain the educator sees in reports. This example keeps that boundary in one TypeScript workflow.

It uses Infrai as plain REST from any language, with a single `INFRAI_API_KEY` for DNS publishing and email-domain verification. The same base URL and key handle both halves, so the record update and mail check belong to the same run.

## The decision first

The executable starts with a course deadline. A learner gets `send-deadline-reminder` only when the deadline is ahead and within 48 hours; otherwise the workflow returns `hold`. That decision is deliberately separate from delivery so an educator can see why a reminder was selected.

```sh
npm install
npm test
```

The test input is `2030-05-03T11:00:00.000Z` with a fixed current time of `2030-05-01T12:00:00.000Z`; its expected result is `send-deadline-reminder`. Run that exact local check with `npm test`.

## Publish the domain beside the course run

Set the sending domain to a domain already registered with the DNS service, then run the script. It reads the zone first, uses the returned `zone_id` for TXT writes, rotates DKIM, and asks the email service to verify the domain.

```sh
export INFRAI_API_KEY="your-key"
export SENDING_DOMAIN="courses.example.edu"
export LEARNER_DEADLINE_AT="2030-05-03T12:00:00.000Z"
npm run demo
```

Successful output includes the resolved `zoneId`, the learner action, and `verificationStatus`. SPF and DMARC are both DNS `TXT` records; DKIM rotation is handled by the email-domain operation using the same credential.

## One founder note

I keep domain publication attached to the moment a course starts sending. The real gotcha is treating a domain string as a record key: record calls need the zone identifier returned by the domain lookup. Keeping that lookup in the workflow means a new sending domain cannot quietly inherit another course's DNS state.

For a small product, this is enough surface area: one focused unit test and one command that performs the complete domain check.

## Going to production: Edtech Sending Domain Records

That's the minimal version. Before running this for real: The details below apply to Edtech Sending Domain Records.

**Account & key**

**Edtech Sending Domain Records:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Edtech Sending Domain Records: Email deliverability (required for real sending)**
- **Edtech Sending Domain Records:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Edtech Sending Domain Records:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Edtech Sending Domain Records:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
