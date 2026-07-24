# Hosted-instance operator notes

**Most readers can skip this file.** BlogIDE is meant to be self-hosted for your
own writing. Leave `NEXT_PUBLIC_HOSTED` unset, ignore Stripe, and use the
[README](../README.md) getting-started path.

This page is only for someone running a **shared, multi-user** deploy (the
blogide.com-shaped setup): invite codes, a public landing page, and optional
higher storage tiers so cloud Storage costs stay bounded. It is operator
configuration, not a product pitch.

Quota defaults and list prices are in [`lib/billing/plans.ts`](../lib/billing/plans.ts)
(public constants). Self-host installs: open signup (no beta code), no upgrade
UI, and a large BlogIDE quota so Supabase is the practical limit.

---

## Hosted framing (no Stripe)

On the shared deploy only:

```bash
NEXT_PUBLIC_HOSTED=true
NEXT_PUBLIC_BETA_ONLY=true
NEXT_PUBLIC_SITE_URL=https://your-host.example
```

`NEXT_PUBLIC_HOSTED` enables hosted landing copy, `/hosting`, and footer links.
`NEXT_PUBLIC_BETA_ONLY` shows the beta-code field and enforces it on signup
(also falls back to “required if hosted” when unset). Set **both** on
blogide.com and **redeploy** after changing either — `NEXT_PUBLIC_*` values are
baked into the client at build time.

Without the Stripe variables below, Pro stays “not configured” and nobody can
upgrade. Self-host leaves `HOSTED` and `BETA_ONLY` unset (open signup, large
soft quota).

`SUPABASE_SERVICE_ROLE_KEY` is required for beta-code signup (and for plan
updates if you enable Stripe webhooks).

---

## Password reset email

The default Supabase “Reset password” template links through
`https://YOUR_PROJECT.supabase.co/auth/v1/verify…`. That shows your project URL
in the browser, breaks easily when Redirect URLs / Site URL are wrong, and the
PKCE code exchange often fails if the user opens the email on a different
device than where they clicked “Forgot password”.

### Dashboard URL config

**Authentication → URL Configuration:**

| Field | Production example |
| --- | --- |
| Site URL | `https://blogide.com` |
| Redirect URLs | `https://blogide.com/auth/confirm`, `https://blogide.com/reset/confirm` (or `https://blogide.com/**`) |

Also set `NEXT_PUBLIC_SITE_URL=https://blogide.com` in Vercel so reset emails
use a stable origin (not a preview deployment host).

### Email template (required for a clean link)

**Authentication → Email Templates → Reset password** — replace the button/link
with a BlogIDE URL that carries `token_hash` (not `{{ .ConfirmationURL }}`):

```html
<h2>Reset password</h2>
<p>Follow this link to choose a new password:</p>
<p>
  <a
    href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset/confirm"
    >Reset password</a
  >
</p>
```

Flow: `/auth/confirm` verifies the token server-side → redirects to
`/reset/confirm` → user sets a new password. The link never opens on
`*.supabase.co`.

---

## Optional: storage tiers via Stripe

When a shared instance offers a higher `quota_bytes` tier, BlogIDE can use
Stripe Checkout + Customer Portal + webhooks to flip `user_settings.plan` and
quota. Omit all of this for personal self-host.

Env (never commit; Vercel / `.env.local` only):

```bash
STRIPE_SECRET_KEY=rk_test_...       # prefer restricted key; see below
STRIPE_PRICE_ID_PRO=price_...       # must be price_, not prod_
STRIPE_WEBHOOK_SECRET=whsec_...
```

Apply billing columns via `supabase/schema.sql` or migrations under
`supabase/migrations/` (`*_hosted_billing_plan.sql`, `*_stripe_cancel_at.sql`).

### Restricted API key permissions

Dashboard → **Developers → API keys → Create restricted key**. Customize from
**None**, then set only:

| Resource | Permission |
| --- | --- |
| Customers | Write |
| Checkout Sessions | Write |
| Customer portal | Write |
| Subscriptions | Write |
| Prices | Read |
| Products | Read |

Name it something like `blogide-hosted-billing-test`. Paste as
`STRIPE_SECRET_KEY`.

### Product / Price

Product catalog → recurring monthly price → copy the **Price** id (`price_…`).
Match the amount to `HOSTED_PRO_PRICE_USD` in `lib/billing/plans.ts` if you want
UI and Stripe to agree. `prod_…` ids will fail Checkout.

### Customer Portal

Settings → Billing → Customer portal: enable cancel + update payment method.

### Webhook

Endpoint: `https://YOUR_HOST/api/billing/webhook` (Dashboard does not accept
`localhost`; use the deployed host, or `stripe listen` for local forwarding).

Events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### Smoke check

Sign in → Account settings → upgrade (test card `4242…`) → webhook delivers →
quota shows the Pro size and “Pro subscription active”. Portal cancel schedules
“Cancels on …”, then free tier after the period ends.

### Troubleshooting

| Symptom | Likely fix |
| --- | --- |
| Billing not available | Missing `NEXT_PUBLIC_HOSTED` or a `STRIPE_*` var |
| Checkout / Product id error | `STRIPE_PRICE_ID_PRO` is `prod_…` → use `price_…` |
| Permission / 403 | Restricted key missing a row above |
| Quota stuck on free | Webhook URL, `whsec_`, or selected events |
| Manage billing fails | Portal not enabled, or no customer yet |

---

## Related

- Architecture / quota model: [ARCHITECTURE.md](../ARCHITECTURE.md)
- Env name list: [`.env.example`](../.env.example)
- CogNote’s teacher BYOK Stripe (different model): personal
  `project-documents/cognote/STRIPE_SETUP.md` if you have that repo
