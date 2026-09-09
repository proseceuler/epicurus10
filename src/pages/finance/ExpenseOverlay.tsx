import { MotionOverlay } from '@/components/MotionUI';
import { Button, Input, Select } from '@/components/kit';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/types';

export function ExpenseOverlay({
  open, onClose, form, setForm, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  form: { category: ExpenseCategory; amount: string; description: string };
  setForm: (next: { category: ExpenseCategory; amount: string; description: string }) => void;
  onAdd: () => void;
}) {
  return (
    <MotionOverlay open={open} onClose={onClose}>
      <h3 className="mb-4 font-semibold text-zinc-800">Add Expense</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Category</label>
          <Select value={form.category} onChange={(v) => setForm({ ...form, category: v as ExpenseCategory })} options={EXPENSE_CATEGORIES.map((c) => ({ value: c.key, label: `${c.emoji} ${c.label}` }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Amount (\u20b1)</label>
          <Input value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} type="number" placeholder="0.00" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">Description</label>
          <Input value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional note" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} variant="ghost" size="sm">Cancel</Button>
          <Button onClick={onAdd} size="sm">Add Expense</Button>
        </div>
      </div>
    </MotionOverlay>
  );
}
