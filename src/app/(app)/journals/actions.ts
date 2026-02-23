'use server';

import {
  createJournal as _createJournal,
  updateJournal as _updateJournal,
  approveJournal as _approveJournal,
  postJournal as _postJournal,
  deleteJournal as _deleteJournal,
  reverseJournal as _reverseJournal,
} from '@/lib/journals/actions';

export async function createJournal(formData: FormData) {
  return _createJournal(formData);
}

export async function updateJournal(formData: FormData) {
  return _updateJournal(formData);
}

export async function approveJournal(formData: FormData) {
  return _approveJournal(formData);
}

export async function postJournal(formData: FormData) {
  return _postJournal(formData);
}

export async function deleteJournal(formData: FormData) {
  return _deleteJournal(formData);
}

export async function reverseJournal(journalId: string) {
  return _reverseJournal(journalId);
}
