/* Onboarding types (shared, not a server action file) */

export interface OnboardingProgress {
  organisationId: string;
  currentStep: number;
  completedSteps: number[];
  isCompleted: boolean;
}
