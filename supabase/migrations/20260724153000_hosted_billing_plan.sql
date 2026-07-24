-- Track 1: hosted plan + Stripe ids on user_settings (quota still authoritative).
-- Clients may read plan fields; only service role / webhooks may write them.

alter table user_settings
  add column if not exists plan text not null default 'free';

alter table user_settings
  add column if not exists stripe_customer_id text;

alter table user_settings
  add column if not exists stripe_subscription_id text;

alter table user_settings
  add column if not exists stripe_subscription_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_settings_plan_check'
  ) then
    alter table user_settings
      add constraint user_settings_plan_check
      check (plan in ('free', 'pro'));
  end if;
end $$;

create unique index if not exists user_settings_stripe_customer_id_uidx
  on user_settings (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists user_settings_stripe_subscription_id_uidx
  on user_settings (stripe_subscription_id)
  where stripe_subscription_id is not null;
