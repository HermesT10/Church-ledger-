import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AnnualAccountsPack, AnnualAccountsStep } from '@/lib/annual-accounts/types';
import { ANNUAL_ACCOUNTS_STEPS } from '@/lib/annual-accounts/types';

function money(pence: number) {
  return (pence / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

const STEP_LABELS: Record<AnnualAccountsStep, string> = {
  'select-financial-year': 'Year',
  'select-accounting-basis': 'Basis',
  'confirm-charity-details': 'Charity details',
  'review-trustees-officers': 'Trustees',
  'review-financial-statements': 'Statements',
  'review-notes': 'Notes',
  'add-trustee-narrative': 'Narrative',
  'attach-examiner-details': 'Examiner',
  'validate-pack': 'Validate',
  'trustee-approval': 'Approval',
  'export-final-pack': 'Export',
};

export function AnnualAccountsStepper({
  currentStep,
  onStepChange,
}: {
  currentStep: AnnualAccountsStep;
  onStepChange?: (step: AnnualAccountsStep) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      {ANNUAL_ACCOUNTS_STEPS.map((step, index) => (
        <button
          key={step}
          type="button"
          onClick={() => onStepChange?.(step)}
          className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
            step === currentStep ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-card hover:bg-accent'
          }`}
        >
          <span className="block text-xs text-muted-foreground">Step {index + 1}</span>
          <span className="font-semibold">{STEP_LABELS[step]}</span>
        </button>
      ))}
    </div>
  );
}

export function AnnualAccountsCover({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader>
        <Badge className="w-fit" variant="outline">Annual Accounts</Badge>
        <CardTitle className="text-3xl">{pack.charityDetails.legalName || pack.charityDetails.charityName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Financial year ended {pack.periodEnd}</p>
        <p>Charity number: {pack.charityDetails.charityNumber || 'To be confirmed'}</p>
        <p>{pack.charityDetails.principalAddress || 'Principal address to be confirmed'}</p>
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsContents() {
  return (
    <Card>
      <CardHeader><CardTitle>Accounts Pack Contents</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {[
          'Cover', 'Contents', 'Charity information', "Trustees' Annual Report", 'Independent examiner/auditor placeholder',
          'SOFA', 'Balance sheet', 'Cashflow', 'Notes', 'Fund movements', 'Approval page', 'Evidence index',
        ].map((item) => <div key={item} className="rounded-xl border border-border/70 px-3 py-2">{item}</div>)}
      </CardContent>
    </Card>
  );
}

export function CharityInformationSection({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Charity Information</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
        <p><span className="font-semibold">Name:</span> {pack.charityDetails.legalName || pack.charityDetails.charityName}</p>
        <p><span className="font-semibold">Charity number:</span> {pack.charityDetails.charityNumber || 'To be confirmed'}</p>
        <p><span className="font-semibold">Treasurer:</span> {pack.charityDetails.treasurerName || 'To be confirmed'}</p>
        <p><span className="font-semibold">Bank accounts:</span> {pack.charityDetails.bankAccountNames.join(', ') || 'None listed'}</p>
        <p className="md:col-span-2"><span className="font-semibold">Address:</span> {pack.charityDetails.principalAddress || 'To be confirmed'}</p>
      </CardContent>
    </Card>
  );
}

export function TrusteesAnnualReportSection({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Trustees&apos; Annual Report</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm md:grid-cols-2">
        {Object.entries(pack.narrativeSections)
          .filter(([key]) => key !== 'reviewed')
          .map(([key, value]) => (
            <div key={key} className="rounded-xl border border-border/70 p-4">
              <h3 className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1')}</h3>
              <p className="mt-2 text-muted-foreground">{String(value)}</p>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

export function ExaminerPlaceholderSection({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Independent Examiner / Auditor</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{pack.examinerDetails.name || 'Examiner name to be confirmed'}</p>
        <p className="text-muted-foreground">{pack.examinerDetails.reportText}</p>
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsSOFA({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Statement Of Financial Activities</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Unrestricted</TableHead>
              <TableHead className="text-right">Restricted</TableHead>
              <TableHead className="text-right">Designated</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Prior year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pack.sofaRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-right">{money(row.unrestrictedPence)}</TableCell>
                <TableCell className="text-right">{money(row.restrictedPence)}</TableCell>
                <TableCell className="text-right">{money(row.designatedPence)}</TableCell>
                <TableCell className="text-right font-semibold">{money(row.totalCurrentYearPence)}</TableCell>
                <TableCell className="text-right">{money(row.totalPriorYearPence)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsBalanceSheet({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Balance Sheet</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Line</TableHead><TableHead>Section</TableHead><TableHead className="text-right">Current year</TableHead><TableHead className="text-right">Prior year</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {pack.balanceSheetRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.label}</TableCell>
                <TableCell>{row.section}</TableCell>
                <TableCell className="text-right">{money(row.currentYearPence)}</TableCell>
                <TableCell className="text-right">{money(row.priorYearPence)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsCashflow() {
  return (
    <Card>
      <CardHeader><CardTitle>Cashflow</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Cashflow source data is included in the pack snapshot for export and examiner review.
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsNotes({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Notes To The Accounts</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {pack.notes.map((note) => (
          <div key={note.id} className="rounded-xl border border-border/70 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{note.title}</h3>
              {note.required && <Badge variant={note.missingReason ? 'destructive' : 'outline'}>Required</Badge>}
            </div>
            <p className="mt-2 text-muted-foreground whitespace-pre-line">{note.text}</p>
            {note.missingReason && <p className="mt-2 text-xs text-amber-700">{note.missingReason}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsApprovalPage({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Approval Page</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
        <p>Approved by: {pack.approval.approvedByName || 'Pending trustee approval'}</p>
        <p>Meeting date: {pack.approval.trusteeMeetingDate || 'To be confirmed'}</p>
        <p>Signature: {pack.approval.signatureName || 'Signature placeholder'}</p>
        <p>Status: {pack.approval.final ? 'Final approved pack' : 'Draft pack'}</p>
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsEvidenceIndex({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Evidence Index</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Evidence</TableHead><TableHead>Source</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
          <TableBody>
            {pack.evidenceIndex.map((item) => (
              <TableRow key={item.id}><TableCell>{item.title}</TableCell><TableCell>{item.source}</TableCell><TableCell>{item.reference}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsValidationPanel({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Validation</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {pack.validationResults.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3 text-sm">
            <div><p className="font-semibold">{item.title}</p><p className="text-muted-foreground">{item.message}</p></div>
            <Badge variant={item.severity === 'blocker' && item.status === 'failed' ? 'destructive' : 'outline'}>{item.status}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AnnualAccountsExportActions({ pack }: { pack: AnnualAccountsPack }) {
  return (
    <Card>
      <CardHeader><CardTitle>Exports</CardTitle></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {pack.exports.map((item) => (
          <div key={item.format} className="rounded-xl border border-border/70 p-4">
            <h3 className="font-semibold">{item.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">Rendered through the document-production template system with metadata, footer, versioning and draft/final status.</p>
            <Button className="mt-4" variant={item.requiresApproval && !pack.approval.final ? 'outline' : 'default'} disabled={item.requiresApproval && !pack.approval.final}>
              {item.requiresApproval && !pack.approval.final ? 'Approval required' : 'Generate'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
