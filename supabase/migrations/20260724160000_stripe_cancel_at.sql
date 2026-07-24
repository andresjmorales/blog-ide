-- Store Stripe subscription cancel_at for Account settings copy.

alter table user_settings
  add column if not exists stripe_cancel_at timestamptz;
