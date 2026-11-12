ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS training_type text DEFAULT 'General' NOT NULL,
  ADD COLUMN IF NOT EXISTS address text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS partial_paid_amount numeric DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS balance_amount numeric DEFAULT 0 NOT NULL;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_training_type_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_training_type_check
  CHECK (training_type IN ('Personal', 'General', 'Couple'));

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_payment_status_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_payment_status_check
  CHECK (payment_status IN ('Paid', 'Pending', 'Partially Paid'));

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_partial_paid_amount_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_partial_paid_amount_check
  CHECK (partial_paid_amount >= 0 AND partial_paid_amount <= fees_amount);

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_balance_amount_check;

ALTER TABLE public.members
  ADD CONSTRAINT members_balance_amount_check
  CHECK (balance_amount >= 0);

UPDATE public.members
SET
  training_type = COALESCE(training_type, 'General'),
  address = COALESCE(address, ''),
  partial_paid_amount =
    CASE
      WHEN payment_status = 'Paid' THEN fees_amount
      ELSE COALESCE(partial_paid_amount, 0)
    END,
  balance_amount =
    CASE
      WHEN payment_status = 'Paid' THEN 0
      WHEN payment_status = 'Pending' THEN fees_amount
      ELSE GREATEST(fees_amount - COALESCE(partial_paid_amount, 0), 0)
    END;
