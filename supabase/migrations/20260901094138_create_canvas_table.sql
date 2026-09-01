
CREATE TABLE IF NOT EXISTS public.canvas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL DEFAULT '',
  background text NOT NULL DEFAULT 'plain',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canvas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_canvas" ON public.canvas FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_canvas" ON public.canvas FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_canvas" ON public.canvas FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_canvas" ON public.canvas FOR DELETE
  TO anon, authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvas TO authenticated;
