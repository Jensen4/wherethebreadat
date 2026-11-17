export type PaystubInput = {
  employer: string;
  pay_date: string;
  gross_cents: number;
  deductions_cents: number;
  net_cents: number;
  currency: string;
};
export type Paystub = PaystubInput & { id: string };
export type PaymentInput = {
  recipient: string;
  category: string;
  amount_cents: number;
  currency: string;
  due_date: string;
  status: 'pending' | 'paid';
  paid_date: string | null;
  notes: string | null;
};
export type Payment = PaymentInput & { id: string };
export type Session = { id: string; email: string; csrf_token: string };
export type Editor = { kind: 'paystub'; record?: Paystub } | { kind: 'payment'; record?: Payment };
export type View = 'overview' | 'paystubs' | 'payments';
