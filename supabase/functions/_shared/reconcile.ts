// Settles a Lago-billed payment whose invoice Lago has not marked paid.
//
// Lago receives Flutterwave's webhook, but for these one-off payment links it has been seen to leave
// the invoice pending after the payer paid. So the invoice is not the only thing we trust: Flutterwave
// itself is asked whether a successful transaction exists for this invoice (its reference is
// "<invoice id>-<random>"), the amount and currency are checked, the payer is enrolled, and the payment
// is then recorded in Lago so the ledger agrees.
import { admin, flutterwave, settleFromLagoInvoice, settlePayment, VerifiedTransaction, verifyByReference } from './flutterwave.ts';
import { getInvoice, invoiceIdFromReference, recordLagoPayment } from './lago.ts';

export interface PendingPayment {
  tx_ref: string;
  email: string;
  amount_minor: number;
  currency: string;
  created_at: string;
  lago_invoice_id: string;
}

/** A successful Flutterwave transaction that belongs to this invoice, found by its customer and date. */
async function findTransactionForInvoice(payment: PendingPayment): Promise<VerifiedTransaction | null> {
  const from = new Date(new Date(payment.created_at).getTime() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const body = await flutterwave<{ data?: VerifiedTransaction[] }>(
    `/transactions?customer_email=${encodeURIComponent(payment.email)}&status=successful&from=${from}&to=${to}`,
  );
  return (body.data ?? []).find((tx) => invoiceIdFromReference(String(tx.tx_ref ?? '')) === payment.lago_invoice_id) ?? null;
}

/**
 * Returns the settlement result, or null when nothing has been paid yet.
 * `reference` is the reference Flutterwave put on the return URL, when the payer came back through it.
 */
export async function confirmLagoPayment(payment: PendingPayment, reference?: string) {
  // 1. Lago already knows.
  const invoice = await getInvoice(payment.lago_invoice_id);
  if (invoice?.payment_status === 'succeeded') return settleFromLagoInvoice(invoice, invoice);

  // 2. Ask Flutterwave. A reference from the return URL is only used if it belongs to this invoice.
  let transaction: VerifiedTransaction | null = null;
  if (reference && invoiceIdFromReference(reference) === payment.lago_invoice_id) transaction = await verifyByReference(reference);
  if (!transaction || transaction.status !== 'successful') transaction = await findTransactionForInvoice(payment);
  if (!transaction || transaction.status !== 'successful') return null;
  if (invoiceIdFromReference(String(transaction.tx_ref ?? '')) !== payment.lago_invoice_id) return null;

  // 3. Settle on our side, then make Lago agree.
  const result = await settlePayment(payment.tx_ref, transaction, transaction);
  if (result.settled) await recordLagoPayment(payment.lago_invoice_id, Math.round(Number(transaction.amount) * 100), String(transaction.id));
  return result;
}

/** Pending Lago payments old enough to have been paid, newest first. */
export async function pendingLagoPayments(limit = 50): Promise<PendingPayment[]> {
  const { data, error } = await admin()
    .from('payments')
    .select('tx_ref, email, amount_minor, currency, created_at, lago_invoice_id')
    .eq('status', 'pending')
    .not('lago_invoice_id', 'is', null)
    .lt('created_at', new Date(Date.now() - 60_000).toISOString())
    .gt('created_at', new Date(Date.now() - 3 * 86_400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as PendingPayment[];
}
