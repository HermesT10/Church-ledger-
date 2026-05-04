import type { DocumentModel, DocumentSection, DocumentTemplateKey } from './types';

export const DOCUMENT_TEMPLATE_KEYS = [
  'report-cover',
  'report-contents',
  'statement-page',
  'notes-page',
  'appendix-page',
  'signature-approval-page',
  'evidence-index',
  'export-footer',
] as const satisfies readonly DocumentTemplateKey[];

export const DOCUMENT_TEMPLATE_REGISTRY: Record<DocumentTemplateKey, { title: string; description: string }> = {
  'report-cover': {
    title: 'Report cover',
    description: 'Cover page with organisation, charity number, period, title, status, version, and generated metadata.',
  },
  'report-contents': {
    title: 'Report contents',
    description: 'Contents page built from document sections and appendix entries.',
  },
  'statement-page': {
    title: 'Statement page',
    description: 'Financial statement page for SOFA, balance sheet, trial balance, payroll, funds, and reconciliation tables.',
  },
  'notes-page': {
    title: 'Notes page',
    description: 'Narrative and accounting notes page for trustee/examiner review.',
  },
  'appendix-page': {
    title: 'Appendix page',
    description: 'Supporting schedules, raw report extracts, and audit evidence appendices.',
  },
  'signature-approval-page': {
    title: 'Signature/approval page',
    description: 'Trustee approval, examiner signoff, and status certification page.',
  },
  'evidence-index': {
    title: 'Evidence index',
    description: 'Evidence list with source, reference, date, and amount columns.',
  },
  'export-footer': {
    title: 'Export footer',
    description: 'Confidentiality text, generated timestamp, version, page numbers, and source reference.',
  },
};

export function buildContentsSection(model: DocumentModel): DocumentSection {
  return {
    id: 'contents',
    template: 'report-contents',
    title: 'Contents',
    tables: [
      {
        title: 'Contents',
        headers: ['Section', 'Template'],
        rows: model.sections.map((section) => [section.title, DOCUMENT_TEMPLATE_REGISTRY[section.template].title]),
      },
    ],
  };
}

export function buildApprovalSection(model: DocumentModel): DocumentSection {
  return {
    id: 'approval',
    template: 'signature-approval-page',
    title: 'Signature and approval',
    body: [
      `Status: ${model.metadata.status.toUpperCase()}`,
      `Version: ${model.metadata.version}`,
      'Prepared for trustee, treasurer, and examiner review.',
      'Signed by: ______________________________',
      'Date: ___________________________________',
    ],
  };
}

export function withStandardSections(model: DocumentModel): DocumentModel {
  const hasContents = model.sections.some((section) => section.template === 'report-contents');
  const hasApproval = model.sections.some((section) => section.template === 'signature-approval-page');
  return {
    ...model,
    sections: [
      ...(hasContents ? [] : [buildContentsSection(model)]),
      ...model.sections,
      ...(hasApproval ? [] : [buildApprovalSection(model)]),
    ],
  };
}
