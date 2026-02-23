/* Profile types (shared, not a server action file) */

export interface ProfileData {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  role: string;
  organisationName: string;
  lastSignInAt: string | null;
  authProvider: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: string;
  defaultLandingPage: string;
  defaultReportView: string;
  numberFormat: string;
  dateFormatPreference: string;
}
