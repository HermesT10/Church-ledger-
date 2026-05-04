'use client';

import { type ChangeEvent, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  activateDeclaration,
  cancelDeclaration,
  createDeclaration,
  generateDeclarationPdf,
  generateGiftAidDeclarationLink,
  updateDeclaration,
  uploadSignedDeclarationCopy,
} from '@/lib/giftaid/actions';
import {
  GIFT_AID_DECLARATION_WORDING,
  GIFT_AID_DONOR_NOTIFICATION_NOTES,
  penceToPoundsInput,
  poundsToPence,
  type GiftAidDeclarationStatus,
} from '@/lib/giftaid/declaration-form';
import {
  declarationIdentityFieldsMatchBaseline,
  extractDonorProfileBaselineFromForm,
  listMissingDeclarationIdentityFields,
  mapDonorProfileToDeclarationFields,
  type DonorProfileBaseline,
  type GiftAidDeclarationDonorRow,
} from '@/lib/giftaid/declaration-donor-mapping';
import type { GiftAidDeclarationRow } from '@/lib/giftaid/types';
import { toast } from 'sonner';
import { Download, FileCheck, FileText, FileX, LinkIcon, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

type DeclarationFormState = {
  donorId: string;
  declarationType: 'single' | 'enduring' | 'oral';
  status: GiftAidDeclarationStatus;
  startDate: string;
  endDate: string;
  declarationDate: string;
  donationAmount: string;
  charityName: string;
  donorTitle: string;
  donorFirstNameOrInitial: string;
  donorSurname: string;
  donorFullHomeAddress: string;
  donorPostcode: string;
  taxpayerConfirmation: boolean;
  declarationWording: string;
  donorNotificationNotes: string;
  coversPastDonations: boolean;
  hmrcVersion: string;
  templateVersion: string;
  notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM: DeclarationFormState = {
  donorId: '',
  declarationType: 'single',
  status: 'draft',
  startDate: today(),
  endDate: '',
  declarationDate: today(),
  donationAmount: '',
  charityName: '',
  donorTitle: '',
  donorFirstNameOrInitial: '',
  donorSurname: '',
  donorFullHomeAddress: '',
  donorPostcode: '',
  taxpayerConfirmation: false,
  declarationWording: GIFT_AID_DECLARATION_WORDING,
  donorNotificationNotes: GIFT_AID_DONOR_NOTIFICATION_NOTES,
  coversPastDonations: false,
  hmrcVersion: 'HMRC single donation declaration',
  templateVersion: 'church-ledger-2026-04',
  notes: '',
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(pence: number | null) {
  if (!pence) return '-';
  return `£${(pence / 100).toFixed(2)}`;
}

function statusVariant(status: GiftAidDeclarationStatus) {
  if (status === 'active') return 'default' as const;
  if (status === 'cancelled' || status === 'invalid') return 'destructive' as const;
  return 'outline' as const;
}

function formFromDeclaration(declaration: GiftAidDeclarationRow): DeclarationFormState {
  return {
    donorId: declaration.donor_id,
    declarationType:
      declaration.declaration_type === 'enduring' ||
      declaration.declaration_type === 'oral'
        ? declaration.declaration_type
        : 'single',
    status: declaration.status,
    startDate: declaration.start_date,
    endDate: declaration.end_date ?? '',
    declarationDate: declaration.declaration_date ?? declaration.signed_date ?? today(),
    donationAmount: penceToPoundsInput(declaration.donation_amount_pence),
    charityName: declaration.charity_name ?? '',
    donorTitle: declaration.donor_title_snapshot ?? '',
    donorFirstNameOrInitial:
      declaration.donor_first_name_or_initial_snapshot ?? '',
    donorSurname: declaration.donor_surname_snapshot ?? '',
    donorFullHomeAddress: declaration.donor_full_home_address_snapshot ?? '',
    donorPostcode: declaration.donor_postcode_snapshot ?? '',
    taxpayerConfirmation: declaration.taxpayer_confirmation,
    declarationWording:
      declaration.declaration_wording ?? GIFT_AID_DECLARATION_WORDING,
    donorNotificationNotes:
      declaration.donor_notification_notes ?? GIFT_AID_DONOR_NOTIFICATION_NOTES,
    coversPastDonations: declaration.covers_past_donations,
    hmrcVersion: declaration.hmrc_version ?? '',
    templateVersion: declaration.template_version ?? '',
    notes: declaration.notes ?? '',
  };
}

function actionPayload(form: DeclarationFormState, updateDonorProfile: boolean) {
  return {
    donorId: form.donorId,
    declarationType: form.declarationType,
    status: form.status,
    startDate: form.startDate,
    endDate: form.endDate || null,
    declarationDate: form.declarationDate,
    signedDate: form.declarationDate,
    donationAmountPence: poundsToPence(form.donationAmount),
    charityName: form.charityName,
    donorTitle: form.donorTitle,
    donorFirstNameOrInitial: form.donorFirstNameOrInitial,
    donorSurname: form.donorSurname,
    donorFullHomeAddress: form.donorFullHomeAddress,
    donorPostcode: form.donorPostcode,
    taxpayerConfirmation: form.taxpayerConfirmation,
    declarationWording: form.declarationWording,
    donorNotificationNotes: form.donorNotificationNotes,
    coversPastDonations: form.coversPastDonations,
    hmrcVersion: form.hmrcVersion || undefined,
    templateVersion: form.templateVersion || undefined,
    notes: form.notes || undefined,
    updateDonorProfile,
  };
}

function donorIdentityDirty(
  form: DeclarationFormState,
  baseline: DonorProfileBaseline | null,
): boolean {
  if (!baseline) return false;
  return !declarationIdentityFieldsMatchBaseline(
    extractDonorProfileBaselineFromForm(form),
    baseline,
  );
}

function DeclarationForm({
  form,
  setForm,
  donors,
  charityNameDefault,
  activeDeclarationIdByDonorId,
  formInstanceKey,
  mode,
  updateDonorProfile,
  setUpdateDonorProfile,
}: {
  form: DeclarationFormState;
  setForm: (form: DeclarationFormState) => void;
  donors: GiftAidDeclarationDonorRow[];
  charityNameDefault: string;
  activeDeclarationIdByDonorId: Record<string, string>;
  formInstanceKey: string;
  mode: 'create' | 'edit';
  updateDonorProfile: boolean;
  setUpdateDonorProfile: (value: boolean) => void;
}) {
  const donorsById = useMemo(() => new Map(donors.map((d) => [d.id, d])), [donors]);

  const [donorFieldBaseline, setDonorFieldBaseline] = useState<DonorProfileBaseline | null>(null);
  const [structuredNameWarning, setStructuredNameWarning] = useState(false);

  useEffect(() => {
    if (mode === 'edit') {
      setDonorFieldBaseline(extractDonorProfileBaselineFromForm(form));
    } else {
      setDonorFieldBaseline(null);
    }
    setStructuredNameWarning(false);
    setUpdateDonorProfile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline when dialog session (`formInstanceKey`) changes; not on every keystroke
  }, [formInstanceKey, mode]);

  function applyDonorIdentityChange(next: DeclarationFormState) {
    setForm(next);
    if (donorFieldBaseline) {
      setUpdateDonorProfile(donorIdentityDirty(next, donorFieldBaseline));
    }
  }

  function handleDonorSelect(nextDonorId: string) {
    if (nextDonorId === form.donorId) return;

    if (form.donorId && donorFieldBaseline && donorIdentityDirty(form, donorFieldBaseline)) {
      const ok = window.confirm(
        'You edited donor details manually. Replace them with the selected donor profile?',
      );
      if (!ok) return;
    }

    if (!nextDonorId) {
      setForm({
        ...form,
        donorId: '',
        donorTitle: '',
        donorFirstNameOrInitial: '',
        donorSurname: '',
        donorFullHomeAddress: '',
        donorPostcode: '',
        charityName: charityNameDefault,
      });
      setDonorFieldBaseline(null);
      setStructuredNameWarning(false);
      setUpdateDonorProfile(false);
      return;
    }

    const donor = donorsById.get(nextDonorId);
    if (!donor) return;

    const mapped = mapDonorProfileToDeclarationFields(donor, charityNameDefault);
    const baseline: DonorProfileBaseline = {
      donorTitle: mapped.donorTitle,
      donorFirstNameOrInitial: mapped.donorFirstNameOrInitial,
      donorSurname: mapped.donorSurname,
      donorFullHomeAddress: mapped.donorFullHomeAddress,
      donorPostcode: mapped.donorPostcode,
    };

    setForm({
      ...form,
      donorId: nextDonorId,
      charityName: mapped.charityName || charityNameDefault,
      donorTitle: mapped.donorTitle,
      donorFirstNameOrInitial: mapped.donorFirstNameOrInitial,
      donorSurname: mapped.donorSurname,
      donorFullHomeAddress: mapped.donorFullHomeAddress,
      donorPostcode: mapped.donorPostcode,
    });
    setDonorFieldBaseline(baseline);
    setStructuredNameWarning(mapped.missingStructuredName);
    setUpdateDonorProfile(false);
  }

  const missingIdentity = form.donorId ? listMissingDeclarationIdentityFields(form) : [];
  const activeDeclId = form.donorId ? activeDeclarationIdByDonorId[form.donorId] : undefined;

  const donorRow = form.donorId ? donorsById.get(form.donorId) : undefined;
  const contactLines: string[] = [];
  if (donorRow?.email?.trim()) contactLines.push(`Email: ${donorRow.email.trim()}`);
  if (donorRow?.phone?.trim()) contactLines.push(`Phone: ${donorRow.phone.trim()}`);

  return (
    <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
      <p className="text-xs text-muted-foreground">
        Donor details are pulled from the donor profile and saved as a declaration snapshot. You
        can edit them before saving.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Donor *</Label>
          <select
            className={SELECT_CLASS}
            value={form.donorId}
            onChange={(event) => handleDonorSelect(event.target.value)}
          >
            <option value="">Select a donor...</option>
            {donors.map((donor) => (
              <option key={donor.id} value={donor.id}>
                {donor.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Declaration type</Label>
          <select
            className={SELECT_CLASS}
            value={form.declarationType}
            onChange={(event) =>
              setForm({
                ...form,
                declarationType: event.target.value as DeclarationFormState['declarationType'],
              })
            }
          >
            <option value="single">Single donation</option>
            <option value="enduring">Enduring</option>
            <option value="oral">Oral</option>
          </select>
        </div>
      </div>

      {form.donorId && activeDeclId ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            This donor already has an active Gift Aid declaration.
          </p>
          <p className="mt-1 text-muted-foreground">
            You can still create another record if your process allows it (for example a replacement
            draft). Review the active declaration first.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/gift-aid/declarations#declaration-${activeDeclId}`}>View on this page</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {form.donorId ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            missingIdentity.length === 0 && !structuredNameWarning
              ? 'border-emerald-500/25 bg-emerald-500/5'
              : 'border-border/80 bg-muted/30'
          }`}
        >
          {structuredNameWarning ? (
            <p className="font-medium text-amber-800 dark:text-amber-200">
              This donor is missing first name and surname in their profile. Please complete details
              before finalising.
            </p>
          ) : null}
          {missingIdentity.length === 0 && !structuredNameWarning ? (
            <p className="text-emerald-800 dark:text-emerald-200">Donor details are complete.</p>
          ) : null}
          {missingIdentity.length > 0 ? (
            <p className="mt-1 font-medium">Some details are missing before this declaration can be finalised.</p>
          ) : null}
          {missingIdentity.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {missingIdentity.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {contactLines.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{contactLines.join(' · ')}</p>
          ) : null}
          <div className="mt-2">
            <Button asChild variant="link" className="h-auto p-0 text-sm">
              <Link href={`/gift-aid/donors/${form.donorId}`}>Update donor profile</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {form.donorId ? (
        <div className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            id={`update-donor-profile-${formInstanceKey}`}
            checked={updateDonorProfile}
            onCheckedChange={(checked) => setUpdateDonorProfile(checked === true)}
          />
          <div className="space-y-1">
            <Label htmlFor={`update-donor-profile-${formInstanceKey}`} className="font-normal">
              Update donor profile with these details
            </Label>
            <p className="text-xs text-muted-foreground">
              When checked, the donor record is updated when you save, and an audit entry is written.
              When unchecked, only this declaration snapshot is stored.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{form.declarationType === 'single' ? 'Donation amount *' : 'Donation amount'}</Label>
          <Input
            inputMode="decimal"
            placeholder="25.00"
            value={form.donationAmount}
            onChange={(event) => setForm({ ...form, donationAmount: event.target.value })}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Charity name *</Label>
          <Input
            value={form.charityName}
            onChange={(event) => setForm({ ...form, charityName: event.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Title *</Label>
          <Input
            value={form.donorTitle}
            onChange={(event) =>
              applyDonorIdentityChange({ ...form, donorTitle: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>First name or initials *</Label>
          <Input
            value={form.donorFirstNameOrInitial}
            onChange={(event) =>
              applyDonorIdentityChange({
                ...form,
                donorFirstNameOrInitial: event.target.value,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Surname *</Label>
          <Input
            value={form.donorSurname}
            onChange={(event) =>
              applyDonorIdentityChange({ ...form, donorSurname: event.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Full home address *</Label>
        <Textarea
          value={form.donorFullHomeAddress}
          onChange={(event) =>
            applyDonorIdentityChange({ ...form, donorFullHomeAddress: event.target.value })
          }
          rows={3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Postcode *</Label>
          <Input
            value={form.donorPostcode}
            onChange={(event) =>
              applyDonorIdentityChange({ ...form, donorPostcode: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Signed date *</Label>
          <Input
            type="date"
            value={form.declarationDate}
            onChange={(event) =>
              setForm({
                ...form,
                declarationDate: event.target.value,
                startDate: event.target.value || form.startDate,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Valid to</Label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) => setForm({ ...form, endDate: event.target.value })}
          />
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={form.taxpayerConfirmation}
            onCheckedChange={(checked) =>
              setForm({ ...form, taxpayerConfirmation: checked === true })
            }
          />
          <div className="space-y-1">
            <Label>Taxpayer confirmation *</Label>
            <p className="text-sm text-muted-foreground">
              Donor confirms they are a UK taxpayer and understand their Gift Aid responsibility.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Required Gift Aid declaration wording *</Label>
        <Textarea
          value={form.declarationWording}
          onChange={(event) =>
            setForm({ ...form, declarationWording: event.target.value })
          }
          rows={5}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Donor notification notes *</Label>
        <Textarea
          value={form.donorNotificationNotes}
          onChange={(event) =>
            setForm({ ...form, donorNotificationNotes: event.target.value })
          }
          rows={3}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>HMRC version</Label>
          <Input
            value={form.hmrcVersion}
            onChange={(event) => setForm({ ...form, hmrcVersion: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Template version</Label>
          <Input
            value={form.templateVersion}
            onChange={(event) =>
              setForm({ ...form, templateVersion: event.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Internal notes</Label>
        <Textarea
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          rows={3}
        />
      </div>
    </div>
  );
}

interface Props {
  declarations: GiftAidDeclarationRow[];
  donors: GiftAidDeclarationDonorRow[];
  charityNameDefault: string;
  activeDeclarationIdByDonorId: Record<string, string>;
  canEdit: boolean;
}

export function DeclarationsClient({
  declarations,
  donors,
  charityNameDefault,
  activeDeclarationIdByDonorId,
  canEdit,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [createSession, setCreateSession] = useState(0);
  const [createUpdateDonorProfile, setCreateUpdateDonorProfile] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUpdateDonorProfile, setEditUpdateDonorProfile] = useState(false);
  const [form, setForm] = useState<DeclarationFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<DeclarationFormState>(EMPTY_FORM);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelDeclarationId, setCancelDeclarationId] = useState<string | null>(null);
  const [cancelDate, setCancelDate] = useState(today());
  const [cancelReason, setCancelReason] = useState('Cancelled from Gift Aid declaration management.');
  const [cancelEvidence, setCancelEvidence] = useState('');

  const grouped = useMemo(
    () => ({
      draft: declarations.filter((item) => item.status === 'draft'),
      active: declarations.filter((item) => item.status === 'active'),
      other: declarations.filter((item) => item.status !== 'draft' && item.status !== 'active'),
    }),
    [declarations]
  );

  const handleCreate = () => {
    startTransition(async () => {
      const { success, error } = await createDeclaration(actionPayload(form, createUpdateDonorProfile));
      if (!success || error) {
        toast.error(error ?? 'Unable to create declaration.');
        return;
      }
      toast.success('Draft declaration created.');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setCreateUpdateDonorProfile(false);
      router.refresh();
    });
  };

  const openEdit = (declaration: GiftAidDeclarationRow) => {
    setEditingId(declaration.id);
    setEditForm(formFromDeclaration(declaration));
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingId) return;
    startTransition(async () => {
      const { success, error } = await updateDeclaration({
        declarationId: editingId,
        ...actionPayload({ ...editForm, status: 'draft' }, editUpdateDonorProfile),
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to update declaration.');
        return;
      }
      toast.success('Draft declaration updated.');
      setEditOpen(false);
      setEditingId(null);
      setEditUpdateDonorProfile(false);
      router.refresh();
    });
  };

  const handleActivate = (declarationId: string) => {
    startTransition(async () => {
      const { success, error } = await activateDeclaration(declarationId);
      if (!success || error) {
        toast.error(error ?? 'Unable to activate declaration.');
        return;
      }
      toast.success('Declaration activated.');
      router.refresh();
    });
  };

  const openCancelDialog = (declarationId: string) => {
    setCancelDeclarationId(declarationId);
    setCancelDate(today());
    setCancelReason('Cancelled from Gift Aid declaration management.');
    setCancelEvidence('');
    setCancelOpen(true);
  };

  const confirmCancelDeclaration = () => {
    if (!cancelDeclarationId) return;
    startTransition(async () => {
      const { success, error } = await cancelDeclaration(cancelDeclarationId, {
        cancellationDate: cancelDate,
        reason: cancelReason,
        evidenceNotes: cancelEvidence.trim() || undefined,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to cancel declaration.');
        return;
      }
      toast.success('Declaration cancelled.');
      setCancelOpen(false);
      setCancelDeclarationId(null);
      router.refresh();
    });
  };

  const handleGeneratePdf = (declarationId: string) => {
    startTransition(async () => {
      const { url, error } = await generateDeclarationPdf(declarationId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Declaration PDF generated.');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      router.refresh();
    });
  };

  const handleGenerateLink = (declaration: GiftAidDeclarationRow) => {
    startTransition(async () => {
      const result = await generateGiftAidDeclarationLink({
        donorId: declaration.donor_id,
        declarationId: declaration.id,
      });
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Unable to generate declaration link.');
        return;
      }
      await navigator.clipboard.writeText(result.data.url);
      toast.success('Declaration link generated and copied.');
      router.refresh();
    });
  };

  const handleUpload = (declarationId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append('declarationId', declarationId);
      formData.append('file', file);
      const { error } = await uploadSignedDeclarationCopy(formData);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Signed declaration copy uploaded.');
      router.refresh();
    });
  };

  const renderTable = (rows: GiftAidDeclarationRow[], title: string, description: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{title} ({rows.length})</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Donation</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead>Documents</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEdit ? 6 : 5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No declarations in this section.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((declaration) => (
                  <TableRow key={declaration.id} id={`declaration-${declaration.id}`}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{declaration.donor_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {declaration.donor_title_snapshot}{' '}
                          {declaration.donor_first_name_or_initial_snapshot}{' '}
                          {declaration.donor_surname_snapshot}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {declaration.donor_postcode_snapshot ?? 'No postcode'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(declaration.status)}>
                        {declaration.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{formatPounds(declaration.donation_amount_pence)}</p>
                        <p className="text-muted-foreground">
                          {declaration.charity_name ?? 'No charity name'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(declaration.signed_date)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {declaration.attachment_download_url ? (
                          <Button asChild variant="link" className="h-auto px-0 text-xs">
                            <a
                              href={declaration.attachment_download_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileCheck size={12} className="mr-1" />
                              Signed copy
                            </a>
                          </Button>
                        ) : null}
                        {declaration.generated_pdf_download_url ? (
                          <Button asChild variant="link" className="h-auto px-0 text-xs">
                            <a
                              href={declaration.generated_pdf_download_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText size={12} className="mr-1" />
                              Generated PDF
                            </a>
                          </Button>
                        ) : null}
                        {!declaration.attachment_download_url &&
                        !declaration.generated_pdf_download_url
                          ? '-'
                          : null}
                      </div>
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {declaration.status === 'draft' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(declaration)}
                              disabled={isPending}
                            >
                              Edit draft
                            </Button>
                          ) : null}
                          {declaration.status !== 'active' &&
                          declaration.status !== 'cancelled' ? (
                            <Button
                              size="sm"
                              onClick={() => handleActivate(declaration.id)}
                              disabled={isPending}
                            >
                              Activate
                            </Button>
                          ) : null}
                          {declaration.status !== 'cancelled' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openCancelDialog(declaration.id)}
                              disabled={isPending}
                            >
                              <FileX size={14} className="mr-1" />
                              Cancel
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGeneratePdf(declaration.id)}
                            disabled={isPending}
                          >
                            <Download size={14} className="mr-1" />
                            PDF
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateLink(declaration)}
                            disabled={isPending}
                          >
                            <LinkIcon size={14} className="mr-1" />
                            Link
                          </Button>
                          <Label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm">
                            <Upload size={14} className="mr-1" />
                            Upload
                            <Input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              className="hidden"
                              onChange={(event) => handleUpload(declaration.id, event)}
                              disabled={isPending}
                            />
                          </Label>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {canEdit ? (
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (open) {
                setForm({
                  ...EMPTY_FORM,
                  charityName: charityNameDefault,
                  startDate: today(),
                  declarationDate: today(),
                });
                setCreateUpdateDonorProfile(false);
                setCreateSession((s) => s + 1);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus size={14} className="mr-1" />
                New declaration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>New Gift Aid declaration</DialogTitle>
                <DialogDescription>
                  Recreate the HMRC-style single donation declaration and save it
                  as a draft before activation.
                </DialogDescription>
              </DialogHeader>
              <DeclarationForm
                form={form}
                setForm={setForm}
                donors={donors}
                charityNameDefault={charityNameDefault}
                activeDeclarationIdByDonorId={activeDeclarationIdByDonorId}
                formInstanceKey={`create-${createSession}`}
                mode="create"
                updateDonorProfile={createUpdateDonorProfile}
                setUpdateDonorProfile={setCreateUpdateDonorProfile}
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isPending}>
                  {isPending ? 'Saving...' : 'Create draft'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {renderTable(
        grouped.draft,
        'Draft declarations',
        'Fillable declarations that can still be edited before activation.'
      )}
      {renderTable(
        grouped.active,
        'Active declarations',
        'Declarations currently valid for Gift Aid claim validation.'
      )}
      {renderTable(
        grouped.other,
        'Cancelled, expired, and invalid declarations',
        'Historical declaration records retained for audit.'
      )}

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingId(null);
            setEditUpdateDonorProfile(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit draft declaration</DialogTitle>
            <DialogDescription>
              Draft declarations can be changed before activation. Active
              declarations should be cancelled or replaced instead.
            </DialogDescription>
          </DialogHeader>
          <DeclarationForm
            form={editForm}
            setForm={setEditForm}
            donors={donors}
            charityNameDefault={charityNameDefault}
            activeDeclarationIdByDonorId={activeDeclarationIdByDonorId}
            formInstanceKey={editingId ? `edit-${editingId}` : 'edit-none'}
            mode="edit"
            updateDonorProfile={editUpdateDonorProfile}
            setUpdateDonorProfile={setEditUpdateDonorProfile}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelDeclarationId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel declaration</DialogTitle>
            <DialogDescription>
              Donations dated after the cancellation date will not fall under Gift Aid for this declaration.
              Past gifts within coverage stay as validated on existing claims unless you edit them individually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-date">Effective cancellation date</Label>
              <Input
                id="cancel-date"
                type="date"
                value={cancelDate}
                onChange={(e) => setCancelDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">Reason (summary)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-evidence">Evidence / trustee notes (optional)</Label>
              <Textarea
                id="cancel-evidence"
                value={cancelEvidence}
                onChange={(e) => setCancelEvidence(e.target.value)}
                placeholder="Meeting reference, HMRC letter ref, filing note…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelOpen(false);
                setCancelDeclarationId(null);
              }}
              disabled={isPending}
            >
              Back
            </Button>
            <Button variant="destructive" onClick={confirmCancelDeclaration} disabled={isPending}>
              {isPending ? 'Cancelling…' : 'Confirm cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
