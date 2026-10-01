alter table public.calculations add column if not exists store text not null default 'apple';
alter table public.calculations add column if not exists google_purchase_token text;
alter table public.calculations add column if not exists google_order_id text;

alter table public.premium_subscriptions add column if not exists store text not null default 'apple';
alter table public.premium_subscriptions add column if not exists google_purchase_token text;

create unique index if not exists premium_subscriptions_google_token_key
  on public.premium_subscriptions (google_purchase_token);
create index if not exists calculations_google_token_idx
  on public.calculations (google_purchase_token);