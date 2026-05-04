'use client';

import Link from 'next/link';
import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useMemo,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Eye,
  FileText,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  assignDonationDonor,
  createDeclaration,
  createGiftAidDonor,
  refreshGiftAidReviewMatches,
  setDonationGiftAidValidation,
  updateDeclaration,
  updateGiftAidDonor,
  uploadDeclarationFile,
} from '@/lib/giftaid/actions';
import type { GiftAidDonorRow, GiftAidReviewQueueRow } from '@/lib/giftaid/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterBar, FilterBarLabel } from '@/components/ui/filter-bar';
import { SearchInput } from '@/components/ui/search-input';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

function formatConfidence(value: number | null) {
  if (value == null) return 'Manual review';
  return `${Math.round(value * 100)}%`;
}

function formatSource(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm';

type DonorFormState = {
  title: string;
  firstName: string;
  lastName: string;
  displayName: string;
  donorReferenceCode: string;
  fullName: string;
  houseNameOrNumber: string;
  postcode: string;
  email: string;
  phone: string;
  notes: string;
};

type DeclarationFormState = {
  donorId: string;
  declarationType: string;
  status: 'active' | 'cancelled' | 'expired';
  declarationDate: string;
  startDate: string;
  endDate: string;
  coversPastDonations: boolean;
  hmrcVersion: string;
  templateVersion: string;
  notes: string;
};

const EMPTY_DONOR_FORM: DonorFormState = {
  title: '',
  firstName: '',
  lastName: '',
  displayName: '',
  donorReferenceCode: '',
  fullName: '',
  houseNameOrNumber: '',
  postcode: '',
  email: '',
  phone: '',
  notes: '',
};

const EMPTY_DECLARATION_FORM: DeclarationFormState = {
  donorId: '',
  declarationType: 'enduring',
  status: 'active',
  declarationDate: new Date().toISOString().slice(0, 10),
  startDate: '',
  endDate: '',
  coversPastDonations: false,
  hmrcVersion: '',
  templateVersion: '',
  notes: '',
};

function hasDonorName(form: DonorFormState) {
  return Boolean(
    form.fullName.trim() ||
      form.displayName.trim() ||
      form.firstName.trim() ||
      form.lastName.trim()
  );
}

function DonorFormFields({
  form,
  setForm,
}: {
  form: DonorFormState;
  setForm: Dispatch<SetStateAction<DonorFormState>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Display name</Label>
          <Input
            value={form.displayName}
            onChange={(event) =>
              setForm((current) => ({ ...current, displayName: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>First name</Label>
          <Input
            value={form.firstName}
            onChange={(event) =>
              setForm((current) => ({ ...current, firstName: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Last name</Label>
          <Input
            value={form.lastName}
            onChange={(event) =>
              setForm((current) => ({ ...current, lastName: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Donor reference code</Label>
          <Input
            value={form.donorReferenceCode}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                donorReferenceCode: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Legacy full name</Label>
          <Input
            value={form.fullName}
            onChange={(event) =>
              setForm((current) => ({ ...current, fullName: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>House name or number</Label>
          <Input
            value={form.houseNameOrNumber}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                houseNameOrNumber: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Postcode</Label>
          <Input
            value={form.postcode}
            onChange={(event) =>
              setForm((current) => ({ ...current, postcode: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
          rows={4}
        />
      </div>
    </div>
  );
}

function DeclarationFormFields({
  form,
  setForm,
  donors,
  attachmentUrl,
  uploadingFile,
  onFileUpload,
}: {
  form: DeclarationFormState;
  setForm: Dispatch<SetStateAction<DeclarationFormState>>;
  donors: GiftAidDonorRow[];
  attachmentUrl: string | null;
  uploadingFile: boolean;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Donor</Label>
        <select
          className={SELECT_CLASS}
          value={form.donorId}
          onChange={(event) =>
            setForm((current) => ({ ...current, donorId: event.target.value }))
          }
        >
          <option value="">Select donor</option>
          {donors.map((donor) => (
            <option key={donor.id} value={donor.id}>
              {donor.display_name ?? donor.full_name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Declaration type</Label>
          <select
            className={SELECT_CLASS}
            value={form.declarationType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                declarationType: event.target.value,
              }))
            }
          >
            <option value="enduring">Enduring</option>
            <option value="single">Single donation</option>
            <option value="oral">Oral</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <select
            className={SELECT_CLASS}
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as DeclarationFormState['status'],
              }))
            }
          >
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Declaration date</Label>
          <Input
            type="date"
            value={form.declarationDate}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                declarationDate: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Valid from</Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) =>
              setForm((current) => ({ ...current, startDate: event.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Valid to</Label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) =>
              setForm((current) => ({ ...current, endDate: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Evidence upload</Label>
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={onFileUpload}
            disabled={uploadingFile}
          />
          {attachmentUrl ? (
            <p className="text-xs text-success">Evidence attached</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-3">
        <Checkbox
          id="review-declaration-covers-past"
          checked={form.coversPastDonations}
          onCheckedChange={(checked) =>
            setForm((current) => ({ ...current, coversPastDonations: checked }))
          }
        />
        <Label htmlFor="review-declaration-covers-past" className="cursor-pointer">
          Covers past donations
        </Label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>HMRC version</Label>
          <Input
            value={form.hmrcVersion}
            onChange={(event) =>
              setForm((current) => ({ ...current, hmrcVersion: event.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Template version</Label>
          <Input
            value={form.templateVersion}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                templateVersion: event.target.value,
              }))
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={(event) =>
            setForm((current) => ({ ...current, notes: event.target.value }))
          }
          rows={4}
        />
      </div>
    </div>
  );
}

export function ReviewQueueClient({
  rows,
  donors,
  canEdit,
  initialStage = 'all',
}: {
  rows: GiftAidReviewQueueRow[];
  donors: GiftAidDonorRow[];
  canEdit: boolean;
  initialStage?: 'all' | 'needs_review' | GiftAidReviewQueueRow['workflow_stage'];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<
    'all' | 'needs_review' | GiftAidReviewQueueRow['workflow_stage']
  >(initialStage);
  const [isPending, startTransition] = useTransition();
  const [donorSelections, setDonorSelections] = useState<Record<string, string>>({});
  const [ineligibleReasons, setIneligibleReasons] = useState<Record<string, string>>(
    {}
  );

  const [createDonorOpen, setCreateDonorOpen] = useState(false);
  const [editDonorOpen, setEditDonorOpen] = useState(false);
  const [donorDialogDonationId, setDonorDialogDonationId] = useState<string | null>(
    null
  );
  const [editingDonorId, setEditingDonorId] = useState<string | null>(null);
  const [donorForm, setDonorForm] = useState<DonorFormState>(EMPTY_DONOR_FORM);

  const [createDeclarationOpen, setCreateDeclarationOpen] = useState(false);
  const [editDeclarationOpen, setEditDeclarationOpen] = useState(false);
  const [editingDeclarationId, setEditingDeclarationId] = useState<string | null>(
    null
  );
  const [declarationForm, setDeclarationForm] =
    useState<DeclarationFormState>(EMPTY_DECLARATION_FORM);
  const [declarationAttachmentUrl, setDeclarationAttachmentUrl] = useState<
    string | null
  >(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const donorMap = useMemo(
    () => new Map(donors.map((donor) => [donor.id, donor])),
    [donors]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        stage === 'needs_review' &&
        row.workflow_stage !== 'match' &&
        row.workflow_stage !== 'validate'
      ) {
        return false;
      }
      if (
        stage !== 'all' &&
        stage !== 'needs_review' &&
        row.workflow_stage !== stage
      ) {
        return false;
      }
      if (!query.trim()) return true;
      const search = query.toLowerCase();
      return [
        row.source,
        row.bank_reference,
        row.donor_name,
        row.donor_email,
        row.suggested_donor_name,
        row.fund_name,
        row.queue_reason,
        row.validation_reason,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(search));
    });
  }, [query, rows, stage]);

  const handleAssign = (donationId: string, matchId?: string | null) => {
    const donorId = donorSelections[donationId];
    if (!donorId) {
      toast.error('Choose a donor before matching this donation.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await assignDonationDonor({
        donationId,
        donorId,
        matchId,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to match donor.');
        return;
      }
      toast.success('Donation matched to donor.');
      router.refresh();
    });
  };

  const handleConfirmSuggested = (row: GiftAidReviewQueueRow) => {
    const suggestedDonorId = row.suggested_donor_id;
    if (!suggestedDonorId) {
      toast.error('No suggested donor is available for this donation.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await assignDonationDonor({
        donationId: row.donation_id,
        donorId: suggestedDonorId,
        matchId: row.suggested_match_id,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to confirm donor.');
        return;
      }
      toast.success('Suggested donor confirmed.');
      router.refresh();
    });
  };

  const handleValidate = (donationId: string, eligible: boolean) => {
    startTransition(async () => {
      const { success, error } = await setDonationGiftAidValidation({
        donationId,
        eligible,
        reason: eligible ? undefined : ineligibleReasons[donationId],
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to update Gift Aid validation.');
        return;
      }
      toast.success(
        eligible
          ? 'Donation marked as Gift Aid eligible.'
          : 'Donation excluded from Gift Aid.'
      );
      router.refresh();
    });
  };

  const handleRefreshMatches = () => {
    startTransition(async () => {
      const { success, error } = await refreshGiftAidReviewMatches();
      if (!success || error) {
        toast.error(error ?? 'Unable to refresh donor suggestions.');
        return;
      }
      toast.success('Donor suggestions refreshed.');
      router.refresh();
    });
  };

  const openCreateDonor = (row: GiftAidReviewQueueRow) => {
    setDonorDialogDonationId(row.donation_id);
    setEditingDonorId(null);
    setDonorForm({
      ...EMPTY_DONOR_FORM,
      displayName: row.suggested_donor_name ?? '',
      fullName: row.suggested_donor_name ?? '',
      email: row.suggested_donor_email ?? '',
      postcode: row.donor_postcode ?? '',
    });
    setCreateDonorOpen(true);
  };

  const openEditDonor = (row: GiftAidReviewQueueRow) => {
    const donorId = row.donor_id;
    if (!donorId) {
      toast.error('Link a donor before editing.');
      return;
    }
    const donor = donorMap.get(donorId);
    if (!donor) {
      toast.error('Unable to load donor details.');
      return;
    }
    setEditingDonorId(donorId);
    setDonorDialogDonationId(row.donation_id);
    setDonorForm({
      title: donor.title ?? '',
      firstName: donor.first_name ?? '',
      lastName: donor.last_name ?? '',
      displayName: donor.display_name ?? '',
      donorReferenceCode: donor.donor_reference_code ?? donor.reference_code ?? '',
      fullName: donor.full_name,
      houseNameOrNumber: donor.house_name_or_number ?? '',
      postcode: donor.postcode ?? '',
      email: donor.email ?? '',
      phone: donor.phone ?? '',
      notes: donor.notes ?? '',
    });
    setEditDonorOpen(true);
  };

  const handleCreateDonor = () => {
    if (!donorDialogDonationId) return;
    if (!hasDonorName(donorForm)) {
      toast.error('Enter the donor name before saving.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await createGiftAidDonor({
        title: donorForm.title,
        firstName: donorForm.firstName,
        lastName: donorForm.lastName,
        displayName: donorForm.displayName,
        donorReferenceCode: donorForm.donorReferenceCode,
        fullName: donorForm.fullName,
        houseNameOrNumber: donorForm.houseNameOrNumber,
        postcode: donorForm.postcode,
        email: donorForm.email,
        phone: donorForm.phone,
        notes: donorForm.notes,
        donationId: donorDialogDonationId,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to create donor.');
        return;
      }
      toast.success('Donor created and linked to the donation.');
      setCreateDonorOpen(false);
      setDonorDialogDonationId(null);
      setDonorForm(EMPTY_DONOR_FORM);
      router.refresh();
    });
  };

  const handleEditDonor = () => {
    if (!editingDonorId) return;
    if (!hasDonorName(donorForm)) {
      toast.error('Enter the donor name before saving.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await updateGiftAidDonor({
        donorId: editingDonorId,
        title: donorForm.title,
        firstName: donorForm.firstName,
        lastName: donorForm.lastName,
        displayName: donorForm.displayName,
        donorReferenceCode: donorForm.donorReferenceCode,
        fullName: donorForm.fullName,
        houseNameOrNumber: donorForm.houseNameOrNumber,
        postcode: donorForm.postcode,
        email: donorForm.email,
        phone: donorForm.phone,
        notes: donorForm.notes,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to update donor.');
        return;
      }
      toast.success('Donor updated.');
      setEditDonorOpen(false);
      setEditingDonorId(null);
      router.refresh();
    });
  };

  const openCreateDeclaration = (row: GiftAidReviewQueueRow) => {
    if (!row.donor_id) {
      toast.error('Link a donor before creating a declaration.');
      return;
    }
    setEditingDeclarationId(null);
    setDeclarationForm({
      ...EMPTY_DECLARATION_FORM,
      donorId: row.donor_id,
      declarationDate: row.donation_date,
      startDate: row.donation_date,
      status: 'active',
    });
    setDeclarationAttachmentUrl(null);
    setCreateDeclarationOpen(true);
  };

  const openEditDeclaration = (row: GiftAidReviewQueueRow) => {
    if (!row.declaration_id || !row.donor_id) {
      toast.error('No declaration is linked to this donation.');
      return;
    }
    setEditingDeclarationId(row.declaration_id);
    setDeclarationForm({
      donorId: row.donor_id,
      declarationType: row.declaration_type ?? 'enduring',
      status: row.declaration_status === 'missing' ? 'active' : row.declaration_status,
      declarationDate: row.declaration_date ?? row.donation_date,
      startDate: row.declaration_start_date ?? row.donation_date,
      endDate: row.declaration_end_date ?? '',
      coversPastDonations: row.declaration_covers_past_donations,
      hmrcVersion: row.declaration_hmrc_version ?? '',
      templateVersion: row.declaration_template_version ?? '',
      notes: row.declaration_notes ?? '',
    });
    setDeclarationAttachmentUrl(row.declaration_attachment_url ?? null);
    setEditDeclarationOpen(true);
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    const { url, error } = await uploadDeclarationFile(formData);
    setUploadingFile(false);
    if (error) {
      toast.error(error);
      return;
    }
    setDeclarationAttachmentUrl(url ?? null);
  };

  const handleCreateDeclaration = () => {
    if (!declarationForm.donorId || !declarationForm.startDate) {
      toast.error('Choose a donor and start date before saving.');
      return;
    }
    startTransition(async () => {
      const { success, error } = await createDeclaration({
        donorId: declarationForm.donorId,
        declarationType: declarationForm.declarationType,
        status: declarationForm.status,
        declarationDate: declarationForm.declarationDate,
        startDate: declarationForm.startDate,
        endDate: declarationForm.endDate || null,
        coversPastDonations: declarationForm.coversPastDonations,
        hmrcVersion: declarationForm.hmrcVersion,
        templateVersion: declarationForm.templateVersion,
        attachmentUrl: declarationAttachmentUrl ?? undefined,
        notes: declarationForm.notes,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to create declaration.');
        return;
      }
      toast.success('Declaration created.');
      setCreateDeclarationOpen(false);
      setDeclarationForm(EMPTY_DECLARATION_FORM);
      setDeclarationAttachmentUrl(null);
      router.refresh();
    });
  };

  const handleEditDeclaration = () => {
    if (!editingDeclarationId) return;
    startTransition(async () => {
      const { success, error } = await updateDeclaration({
        declarationId: editingDeclarationId,
        donorId: declarationForm.donorId,
        declarationType: declarationForm.declarationType,
        status: declarationForm.status,
        declarationDate: declarationForm.declarationDate,
        startDate: declarationForm.startDate,
        endDate: declarationForm.endDate || null,
        coversPastDonations: declarationForm.coversPastDonations,
        hmrcVersion: declarationForm.hmrcVersion,
        templateVersion: declarationForm.templateVersion,
        attachmentUrl: declarationAttachmentUrl,
        notes: declarationForm.notes,
      });
      if (!success || error) {
        toast.error(error ?? 'Unable to update declaration.');
        return;
      }
      toast.success('Declaration updated.');
      setEditDeclarationOpen(false);
      setEditingDeclarationId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="min-w-[260px] flex-1">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search source, reference, donor, or review reason"
          />
        </div>
        <FilterBarLabel>Stage</FilterBarLabel>
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value as typeof stage)}
          className={SELECT_CLASS}
        >
          <option value="all">All stages</option>
          <option value="needs_review">Needs review</option>
          <option value="match">Match</option>
          <option value="validate">Validate</option>
          <option value="prepare_claim">Ready to claim</option>
        </select>
        {canEdit ? (
          <Button variant="outline" onClick={handleRefreshMatches} disabled={isPending}>
            <RefreshCw size={14} className="mr-1" />
            Refresh suggestions
          </Button>
        ) : null}
      </FilterBar>

      <ReportTableCard
        title="Review Queue"
        description="Review donor suggestions, manage donor and declaration records, and validate Gift Aid eligibility before building a claim."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donation date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Bank reference</TableHead>
                <TableHead>Suggested donor</TableHead>
                <TableHead>Declaration status</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    No donations match the current review filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((row) => (
                  <TableRow key={row.donation_id}>
                    <TableCell className="align-top">
                      <p className="font-medium">{formatDate(row.donation_date)}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <p className="font-medium">{formatPounds(row.amount_pence)}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.fund_name ?? 'Unassigned fund'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <p className="font-medium">{formatSource(row.source)}</p>
                        <StatusBadge status={row.workflow_stage} />
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {row.bank_reference ?? 'No bank reference'}
                        </p>
                        {row.validation_reason ? (
                          <p className="text-xs text-muted-foreground">
                            {row.validation_reason}
                          </p>
                        ) : null}
                        {row.duplicate_warning ? (
                          <p
                            className={
                              row.duplicate_blocking
                                ? 'text-xs font-medium text-destructive'
                                : 'text-xs text-warning'
                            }
                          >
                            {row.duplicate_warning}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {row.donor_name ? (
                        <div className="space-y-1">
                          <p className="font-medium">{row.donor_name}</p>
                          <p className="text-xs text-muted-foreground">Linked donor</p>
                        </div>
                      ) : row.suggested_donor_name ? (
                        <div className="space-y-1">
                          <p className="font-medium">{row.suggested_donor_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {row.suggested_donor_email ?? 'No email on file'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.suggested_match_method?.replace(/_/g, ' ') ??
                              'Suggested match'}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Manual review needed
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {row.declaration_status === 'active' ? (
                        <div className="space-y-1">
                          <StatusBadge status="active" label="Active declaration" />
                          <p className="text-xs text-muted-foreground">
                            {row.declaration_type ?? 'Declaration'} on{' '}
                            {row.declaration_date
                              ? formatDate(row.declaration_date)
                              : 'file'}
                          </p>
                        </div>
                      ) : row.declaration_status === 'missing' ? (
                        <StatusBadge status="warning" label="No declaration" />
                      ) : (
                        <StatusBadge
                          status="warning"
                          label={row.declaration_status.replace('_', ' ')}
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <StatusBadge
                          status={
                            row.gift_aid_eligible
                              ? 'approved'
                              : row.gift_aid_status === 'ineligible'
                                ? 'inactive'
                                : 'warning'
                          }
                          label={row.eligibility_status}
                        />
                        {row.duplicate_warning ? (
                          <StatusBadge
                            status={row.duplicate_blocking ? 'inactive' : 'warning'}
                            label={row.duplicate_blocking ? 'Duplicate blocker' : 'Duplicate warning'}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {formatConfidence(row.confidence_score)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.queue_reason}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex min-w-[320px] flex-col items-end gap-2">
                        {canEdit && row.suggested_donor_id ? (
                          <Button
                            size="sm"
                            onClick={() => handleConfirmSuggested(row)}
                            disabled={isPending}
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Confirm donor
                          </Button>
                        ) : null}
                        {canEdit ? (
                          <div className="flex w-full flex-col gap-2">
                            <select
                              value={donorSelections[row.donation_id] ?? ''}
                              onChange={(event) =>
                                setDonorSelections((current) => ({
                                  ...current,
                                  [row.donation_id]: event.target.value,
                                }))
                              }
                              className={SELECT_CLASS}
                            >
                              <option value="">Choose another donor</option>
                              {donors.map((donor) => (
                                <option key={donor.id} value={donor.id}>
                                  {donor.display_name ?? donor.full_name}
                                  {donor.donor_reference_code
                                    ? ` (${donor.donor_reference_code})`
                                    : ''}
                                </option>
                              ))}
                            </select>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAssign(row.donation_id)}
                                disabled={isPending}
                              >
                                <Users size={14} className="mr-1" />
                                Choose donor
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openCreateDonor(row)}
                                disabled={isPending}
                              >
                                <UserPlus size={14} className="mr-1" />
                                Create donor
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDonor(row)}
                                disabled={isPending || !row.donor_id}
                              >
                                Edit donor
                              </Button>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openCreateDeclaration(row)}
                                disabled={isPending || !row.donor_id}
                              >
                                <FileText size={14} className="mr-1" />
                                Create declaration
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDeclaration(row)}
                                disabled={isPending || !row.declaration_id}
                              >
                                Edit declaration
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {canEdit ? (
                          <div className="flex w-full flex-col gap-2">
                            <Input
                              value={ineligibleReasons[row.donation_id] ?? ''}
                              onChange={(event) =>
                                setIneligibleReasons((current) => ({
                                  ...current,
                                  [row.donation_id]: event.target.value,
                                }))
                              }
                              placeholder="Reason if marking ineligible"
                            />
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleValidate(row.donation_id, true)}
                                disabled={isPending || !row.donor_id}
                              >
                                <CheckCircle2 size={14} className="mr-1" />
                                Validate
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleValidate(row.donation_id, false)}
                                disabled={isPending}
                              >
                                <XCircle size={14} className="mr-1" />
                                Mark ineligible
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/donations/${row.donation_id}`}>
                                  <Eye size={14} className="mr-1" />
                                  View details
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <ShieldAlert
                              className="mt-1 size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ReportTableCard>

      <Dialog open={createDonorOpen} onOpenChange={setCreateDonorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create donor</DialogTitle>
            <DialogDescription>
              Create a donor record and link it to this donation from the review queue.
            </DialogDescription>
          </DialogHeader>
          <DonorFormFields form={donorForm} setForm={setDonorForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDonorOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreateDonor} disabled={isPending}>
              {isPending ? 'Saving...' : 'Create donor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDonorOpen} onOpenChange={setEditDonorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit donor</DialogTitle>
            <DialogDescription>
              Update donor details without leaving the review queue.
            </DialogDescription>
          </DialogHeader>
          <DonorFormFields form={donorForm} setForm={setDonorForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDonorOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleEditDonor} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save donor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDeclarationOpen} onOpenChange={setCreateDeclarationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create declaration</DialogTitle>
            <DialogDescription>
              Create a Gift Aid declaration for the linked donor from the review queue.
            </DialogDescription>
          </DialogHeader>
          <DeclarationFormFields
            form={declarationForm}
            setForm={setDeclarationForm}
            donors={donors}
            attachmentUrl={declarationAttachmentUrl}
            uploadingFile={uploadingFile}
            onFileUpload={handleFileUpload}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDeclarationOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateDeclaration} disabled={isPending}>
              {isPending ? 'Saving...' : 'Create declaration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDeclarationOpen} onOpenChange={setEditDeclarationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit declaration</DialogTitle>
            <DialogDescription>
              Update declaration coverage, dates, and evidence from the review queue.
            </DialogDescription>
          </DialogHeader>
          <DeclarationFormFields
            form={declarationForm}
            setForm={setDeclarationForm}
            donors={donors}
            attachmentUrl={declarationAttachmentUrl}
            uploadingFile={uploadingFile}
            onFileUpload={handleFileUpload}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDeclarationOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEditDeclaration} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save declaration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
