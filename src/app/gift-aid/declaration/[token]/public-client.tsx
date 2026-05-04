'use client';

import { useMemo, useState, useTransition } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { submitSelfServiceGiftAidDeclaration } from '@/lib/giftaid/actions';
import type { GiftAidDeclarationLinkPreview } from '@/lib/giftaid/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type FormState = {
  title: string;
  firstNameOrInitial: string;
  surname: string;
  fullHomeAddress: string;
  postcode: string;
  email: string;
  declarationScope: 'single' | 'future' | 'past_4_years_and_future';
  donationAmount: string;
  taxpayerConfirmation: boolean;
  eSignatureName: string;
};

function splitName(fullName: string | null | undefined) {
  const parts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length <= 1) return { first: fullName ?? '', surname: fullName ?? '' };
  return { first: parts[0], surname: parts[parts.length - 1] };
}

export function GiftAidDeclarationPublicClient({
  token,
  preview,
  error,
}: {
  token: string;
  preview: GiftAidDeclarationLinkPreview | null;
  error: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fallbackName = splitName(preview?.donor?.full_name);
  const initialForm = useMemo<FormState>(
    () => ({
      title: preview?.donor?.title ?? '',
      firstNameOrInitial: preview?.donor?.first_name ?? fallbackName.first,
      surname: preview?.donor?.last_name ?? fallbackName.surname,
      fullHomeAddress: preview?.donor?.address ?? '',
      postcode: preview?.donor?.postcode ?? '',
      email: preview?.donor?.email ?? '',
      declarationScope: 'future',
      donationAmount: '',
      taxpayerConfirmation: false,
      eSignatureName: '',
    }),
    [fallbackName.first, fallbackName.surname, preview?.donor]
  );
  const [form, setForm] = useState<FormState>(initialForm);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = () => {
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitSelfServiceGiftAidDeclaration({
        token,
        ...form,
        taxpayerConfirmation: form.taxpayerConfirmation === true,
      });
      if (!result.success) {
        setSubmitError(result.error ?? 'Unable to submit Gift Aid declaration.');
        return;
      }
      setSubmitted(true);
    });
  };

  if (error || !preview) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-10">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Gift Aid declaration link unavailable</CardTitle>
            <CardDescription>
              {error ?? 'This declaration link could not be loaded.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-10">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={22} aria-hidden="true" />
            </div>
            <CardTitle>Thank you</CardTitle>
            <CardDescription>
              Your Gift Aid declaration has been submitted securely and stored with
              {` ${preview.charity_name}`}.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Card>
          <CardHeader>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
              <ShieldCheck size={14} aria-hidden="true" />
              Secure Gift Aid declaration
            </div>
            <CardTitle>{preview.charity_name}</CardTitle>
            <CardDescription>
              Complete this declaration so the charity can reclaim Gift Aid from HMRC.
              You do not need an admin account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border bg-background p-4 text-sm leading-6">
              {preview.declaration_wording}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(event) => update('title', event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>First name or initials</Label>
                <Input
                  value={form.firstNameOrInitial}
                  onChange={(event) => update('firstNameOrInitial', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Surname</Label>
                <Input value={form.surname} onChange={(event) => update('surname', event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Full home address</Label>
              <Textarea
                value={form.fullHomeAddress}
                onChange={(event) => update('fullHomeAddress', event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input value={form.postcode} onChange={(event) => update('postcode', event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Declaration scope</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.declarationScope}
                onChange={(event) =>
                  update(
                    'declarationScope',
                    event.target.value as FormState['declarationScope']
                  )
                }
              >
                <option value="future">All future donations</option>
                <option value="single">Single donation</option>
                <option value="past_4_years_and_future">
                  Past 4 years and future donations
                </option>
              </select>
            </div>

            {form.declarationScope === 'single' ? (
              <div className="space-y-2">
                <Label>Donation amount</Label>
                <Input
                  inputMode="decimal"
                  value={form.donationAmount}
                  onChange={(event) => update('donationAmount', event.target.value)}
                  placeholder="25.00"
                />
              </div>
            ) : null}

            <label className="flex items-start gap-3 rounded-xl border bg-background p-4 text-sm">
              <Checkbox
                checked={form.taxpayerConfirmation}
                onCheckedChange={(value) => update('taxpayerConfirmation', value === true)}
              />
              <span>
                I confirm I am a UK taxpayer and understand that if I pay less
                Income Tax and/or Capital Gains Tax than the amount of Gift Aid
                claimed on all my donations in that tax year, it is my
                responsibility to pay any difference.
              </span>
            </label>

            <div className="space-y-2">
              <Label>Typed full name as e-signature</Label>
              <Input
                value={form.eSignatureName}
                onChange={(event) => update('eSignatureName', event.target.value)}
                placeholder={[form.firstNameOrInitial, form.surname].filter(Boolean).join(' ')}
              />
            </div>

            <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              {preview.donor_notification_notes}
            </div>

            {submitError ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {submitError}
              </p>
            ) : null}

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isPending || !form.taxpayerConfirmation}
            >
              {isPending ? 'Submitting...' : 'Submit Gift Aid declaration'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
