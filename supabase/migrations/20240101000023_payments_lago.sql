-- Payments through Lago: Lago holds the invoice, Flutterwave takes the money.
-- A payment row can now point at the Lago invoice that bills it, so the Lago
-- webhook (and the callback page, which only gets Lago's reference back) can find it.

alter table breadmaker.payments
  add column if not exists lago_invoice_id text,
  add column if not exists lago_customer_id text;

create unique index if not exists payments_lago_invoice_idx
  on breadmaker.payments (lago_invoice_id)
  where lago_invoice_id is not null;

-- The existing payment_status(tx_ref) lookup is unchanged; the edge functions use the service role.
