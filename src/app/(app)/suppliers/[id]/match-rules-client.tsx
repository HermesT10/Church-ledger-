'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMatchRule, deleteMatchRule } from '@/lib/suppliers/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus } from 'lucide-react';
import type { SupplierMatchRule } from '@/lib/suppliers/types';

interface Props {
  supplierId: string;
  rules: SupplierMatchRule[];
  canEdit: boolean;
}

export function MatchRulesSection({ supplierId, rules, canEdit }: Props) {
  const router = useRouter();
  const [pattern, setPattern] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!pattern.trim()) {
      toast.error('Pattern is required.');
      return;
    }
    setLoading(true);
    const result = await createMatchRule({ supplierId, pattern: pattern.trim() });
    setLoading(false);

    if (result.success) {
      toast.success('Match rule added.');
      setPattern('');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to add rule.');
    }
  }

  async function handleDelete(ruleId: string) {
    setDeletingId(ruleId);
    const result = await deleteMatchRule(ruleId);
    setDeletingId(null);

    if (result.success) {
      toast.success('Match rule removed.');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete rule.');
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When allocating a bank line, the description is matched against these patterns to auto-suggest this supplier.
      </p>

      {rules.length > 0 ? (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                  contains
                </span>
                <span className="font-medium">&ldquo;{rule.pattern}&rdquo;</span>
              </div>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(rule.id)}
                  disabled={deletingId === rule.id}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No match rules configured yet.</p>
      )}

      {canEdit && (
        <div className="flex items-end gap-2 pt-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Pattern (case-insensitive)</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. BRITISH GAS or PAYPAL"
              className="text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
          </div>
          <Button onClick={handleAdd} disabled={loading || !pattern.trim()} size="sm">
            <Plus size={14} className="mr-1" />
            {loading ? 'Adding...' : 'Add Rule'}
          </Button>
        </div>
      )}
    </div>
  );
}
