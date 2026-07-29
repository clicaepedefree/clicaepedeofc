ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS public_tracking_token_encrypted text;

ALTER TABLE public.public_order_submissions
  ADD COLUMN IF NOT EXISTS tracking_token_encrypted text;

COMMENT ON COLUMN public.orders.public_tracking_token_encrypted IS
  'Server-encrypted copy of the public tracking token so store admins can copy the active customer link without rotating it.';

COMMENT ON COLUMN public.public_order_submissions.tracking_token_encrypted IS
  'Server-encrypted copy of the public tracking token so store admins can copy the active customer link without rotating it.';
