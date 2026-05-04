'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateBankCardAppearanceFromForm } from '@/lib/banking/actions';
import {
  BANK_CARD_THEME_KEYS,
  BANK_CARD_THEMES,
  DEFAULT_BANK_CARD_THEME,
  getReadableTextColor,
  isBankCardTheme,
  isSafeHexColour,
  resolveBankCardAppearance,
  type BankCardTheme,
} from '@/lib/banking/cardAppearance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface BankCardAppearanceFormProps {
  bankAccountId: string;
  accountName: string;
  bankName?: string | null;
  maskedAccount?: string | null;
  currency?: string | null;
  balanceLabel: string;
  cardTheme?: string | null;
  cardColour?: string | null;
  canEdit: boolean;
}

export function BankCardAppearanceForm({
  bankAccountId,
  accountName,
  bankName,
  maskedAccount,
  currency,
  balanceLabel,
  cardTheme,
  cardColour,
  canEdit,
}: BankCardAppearanceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTheme, setSelectedTheme] = useState<BankCardTheme>(
    isBankCardTheme(cardTheme) ? cardTheme : DEFAULT_BANK_CARD_THEME
  );
  const [customColour, setCustomColour] = useState(
    isSafeHexColour(cardColour) ? cardColour : ''
  );

  const customColourIsValid = !customColour || isSafeHexColour(customColour);
  const previewAppearance =
    customColour && customColourIsValid
      ? {
          theme: selectedTheme,
          label: 'Custom',
          background: customColour,
          foreground: getReadableTextColor(customColour),
          isCustom: true,
        }
      : resolveBankCardAppearance({
          card_theme: selectedTheme,
          card_colour: null,
        });

  function resetToDefault() {
    setSelectedTheme(DEFAULT_BANK_CARD_THEME);
    setCustomColour('');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!customColourIsValid) {
      toast.error('Use a safe hex colour such as #7c3aed.');
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set('card_theme', selectedTheme);
    formData.set('card_colour', customColour);

    startTransition(async () => {
      const result = await updateBankCardAppearanceFromForm(formData);
      if (result.success) {
        toast.success('Card appearance updated.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not update card appearance.');
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-border/70 bg-card p-6 shadow-card"
    >
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <input type="hidden" name="card_theme" value={selectedTheme} />
      <input type="hidden" name="card_colour" value={customColour} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Card appearance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a colour to help identify this bank account.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetToDefault}
            >
              Reset to default
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !customColourIsValid}
            >
              {isPending ? 'Saving...' : 'Save appearance'}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="space-y-5">
          <div>
            <Label className="text-sm font-medium">Preset options</Label>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BANK_CARD_THEME_KEYS.map((theme) => {
                const option = BANK_CARD_THEMES[theme];
                const selected = selectedTheme === theme && !customColour;
                return (
                  <button
                    key={theme}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={selected}
                    data-bank-card-theme-option={theme}
                    onClick={() => {
                      setSelectedTheme(theme);
                      setCustomColour('');
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border border-border/70 bg-background p-2 text-left text-sm transition-colors',
                      selected && 'border-primary/50 ring-2 ring-primary/15',
                      !canEdit && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <span
                      className="h-6 w-6 shrink-0 rounded-full border border-white/30 shadow-sm"
                      style={{ backgroundColor: option.background }}
                      aria-hidden="true"
                    />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="card_colour">Custom colour</Label>
            <div className="flex gap-2">
              <Input
                id="card_colour"
                value={customColour}
                disabled={!canEdit}
                placeholder="#7c3aed"
                maxLength={7}
                onChange={(event) => setCustomColour(event.target.value.trim())}
                className="font-mono"
              />
              <Input
                aria-label="Custom card colour picker"
                type="color"
                value={
                  customColourIsValid && customColour
                    ? customColour
                    : BANK_CARD_THEMES[selectedTheme].background
                }
                disabled={!canEdit}
                onChange={(event) => setCustomColour(event.target.value)}
                className="h-10 w-14 shrink-0 cursor-pointer p-1"
              />
            </div>
            <p
              className={cn(
                'text-xs text-muted-foreground',
                !customColourIsValid && 'text-danger'
              )}
            >
              Optional. Only safe hex colours are accepted.
            </p>
          </div>
        </div>

        <div
          className="relative min-h-[190px] overflow-hidden rounded-2xl p-5 shadow-soft"
          data-bank-card-theme={previewAppearance.theme}
          style={{
            backgroundColor: previewAppearance.background,
            color: previewAppearance.foreground,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_90%_90%,rgba(255,255,255,0.13),transparent_34%)]" />
          <div className="relative flex min-h-[150px] flex-col justify-between">
            <div>
              <p className="text-sm font-semibold opacity-95">Church Ledger</p>
              <p className="mt-1 truncate text-xs font-medium opacity-70">
                {accountName}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
                {bankName || 'Bank account'}
              </p>
              <p className="mt-2 font-mono text-lg font-semibold tracking-[0.18em]">
                {maskedAccount || 'No account number'}
              </p>
            </div>
            <div className="flex items-end justify-between gap-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                  Balance
                </p>
                <p className="mt-1 font-semibold">{balanceLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
                  Currency
                </p>
                <p className="font-semibold">{currency ?? 'GBP'}</p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-5 right-5 h-8 w-12 rounded-lg bg-white/15"
            aria-hidden="true"
          >
            <span className="absolute left-2 top-2 h-4 w-4 rounded-full bg-amber-300/90" />
            <span className="absolute left-5 top-2 h-4 w-4 rounded-full bg-rose-400/90 mix-blend-screen" />
          </div>
        </div>
      </div>
    </form>
  );
}
