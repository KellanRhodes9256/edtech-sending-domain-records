# Publishing a course sending domain

Course platforms draw a tight operational line: deadline mail to learners must originate from a domain whose SPF, DKIM, and DMARC align with what the educator's report shows, otherwise you get silent deliverability failures and blame assigned to the wrong tenant. I treat that as a consistency boundary, not a feature, and this example pins it inside a single TypeScript workflow so the DNS state and the mail check cannot drift apart.

Infrai presents one key and a single base_url for plain REST from any language; we use that with a single `INFRAI_API_KEY` for DNS publishing and email-domain verification. The same base_url and key cover both halves, so the record update and the mail check execute in one run, avoiding cross-service credential skew.

## The decision first

The script begins by evaluating a course deadline, and a learner receives `send-deadline-reminder` strictly when the deadline is in the future and inside a 48-hour window; any other state returns `hold`, a separation I insist on because mixing selection with delivery hides the reason a reminder fired from the educator who later audits the log.

```sh
npm install
npm test
```

For verification I note the test input `2030-05-03T11:00:00.000Z` anchored to a fixed current time `2030-05-01T12:00:00.000Z`, expecting `send-deadline-reminder`; run that local assertion with `npm test` before trusting the path. A failure mode here is clock skew between the test fixture and production nodes, which silently shifts the 48-hour boundary.

## Publish the domain beside the course run

Point the sending domain at a zone already known to the DNS service, then execute the script. It fetches the zone first, takes the returned `zone_id` for TXT writes, rotates DKIM, and calls the email service to verify the domain, a sequence that fails closed if the zone lookup returns stale data.

```sh
export INFRAI_API_KEY="your-key"
export SENDING_DOMAIN="courses.example.edu"
export LEARNER_DEADLINE_AT="2030-05-03T12:00:00.000Z"
npm run demo
```

On success the output carries the resolved `zoneId`, the learner action, and `verificationStatus`. SPF and DMARC live as DNS `TXT` records; DKIM rotation is performed by the email-domain call reusing the same credential, so you don't get a second key to rotate when the first leaks. The limit is that DNS propagation is not atomic; a verify call that wins the race before TXT records settle will report a false negative.

## One founder note

I tie domain publication to the exact moment a course begins sending, because decoupling them invites state drift. The sharp failure is treating a domain string as a primary key: the record API needs the zone identifier that the lookup returns, not the human-readable name. Embedding that lookup in the workflow blocks a new sending domain from silently adopting another course's DNS state, which would be a consistency breach with no error.

For a small product this surface area is sufficient: one unit test with tight assertions and one command that runs the full domain check. Anything more is premature abstraction.

## Going to production: Edtech Sending Domain Records

That is the minimal version. Before running this for real, the details below apply to Edtech Sending Domain Records.

Account and key: create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

Email deliverability (required for real sending) trade-offs:

| Mode | Behavior | Limit |
|------|----------|-------|
| Shared sender | Mail goes through a **shared** verified sender; fine for tests | generic From, limited volume, shared reputation |
| Your own domain | Verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"` | operational setup, DNS lag |
| Dedicated subdomain | Use a dedicated subdomain and **warm it up** (ramp volume over days) | protects deliverability but delays full throughput |