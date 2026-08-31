export type Severity = 0 | 1 | 2 | 3; // Info | Soon | Urgent | Overdue

export interface Alert {
  id: string;
  module: string;
  kind: string;
  severity: Severity;
  title: string;
  message: string;
  dueOn: string | null;
  daysLeft: number | null;
  actionLabel: string | null;
  actionPath: string | null;
  relatedType: string | null;
  relatedId: number | null;
}

export interface Insight {
  id: string;
  icon: string;
  message: string;
  actionPath: string | null;
}

export interface DashboardSummary {
  alertsTotal: number;
  overdue: number;
  urgent: number;
  soon: number;
  monthlyIncome: number;
  monthlyFixedCosts: number;
  monthlyBalance: number;
  openTasks: number;
  missingDocuments: number;
  nextTripTitle: string | null;
  nextTripInDays: number | null;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  alerts: Alert[];
  insights: Insight[];
}

export interface FamilyMember {
  id: number; userId: number; fullName: string; relation?: string | null;
  birthDate?: string | null; nationality?: string | null;
  schoolName?: string | null; schoolGrade?: string | null;
  schoolNote?: string | null; jmbg?: string | null; notes?: string | null;
}

export interface Doc {
  id: number; userId: number; familyMemberId?: number | null;
  title: string; category: string; documentType?: string | null;
  issuedOn?: string | null; expiresOn?: string | null; reminderDays: number;
  storagePath?: string | null; originalName?: string | null;
  contentType?: string | null; sizeBytes?: number | null; notes?: string | null;
}

export interface Appointment {
  id: number; userId: number; attendeeIds: number[];
  title: string; category: string; startsAt: string; endsAt?: string | null;
  location?: string | null; reminderDays: number; notes?: string | null; isDone: boolean;
}

export interface ImportantDate {
  id: number; userId: number; familyMemberId?: number | null;
  title: string; category: string; dateValue: string; repeatsYearly: boolean;
  reminderDays: number; notes?: string | null;
}

export interface RequiredDocument {
  id: number; authorityCaseId: number; name: string;
  isMandatory: boolean; documentId?: number | null;
  dueOn?: string | null; notes?: string | null;
}

export interface AuthorityCase {
  id: number; userId: number; familyMemberId?: number | null;
  caseType: string; title: string; authority?: string | null;
  referenceNo?: string | null; status: string;
  submittedOn?: string | null; deadlineOn?: string | null;
  nextActionOn?: string | null; reminderDays: number;
  notes?: string | null; requiredDocuments: RequiredDocument[];
}

export interface Income {
  id: number; userId: number; source: string; amount: number;
  currency: string; cadence: string; dayOfMonth?: number | null;
  isActive: boolean; notes?: string | null;
}

export interface FixedCost {
  id: number; userId: number; name: string; category?: string | null;
  amount: number; currency: string; cadence: string;
  dayOfMonth?: number | null; isActive: boolean; notes?: string | null;
}

export type ContractFlowType = "none" | "cost" | "income";

export interface Subscription {
  id: number; userId: number; name: string; provider?: string | null;
  flowType: ContractFlowType; familyMemberId?: number | null;
  amount: number | null; currency: string; cadence: string;
  startOn?: string | null; endOn?: string | null;
  renewsOn: string; cancelByOn?: string | null;
  noticePeriodDays?: number | null; noticeText?: string | null;
  isActive: boolean; notes?: string | null;
}

export interface Payment {
  id: number; userId: number; title: string; amount: number;
  currency: string; dueOn: string; category?: string | null;
  isPaid: boolean; paidOn?: string | null; notes?: string | null;
}

export interface HomeItem {
  id: number; userId: number; kind: string; title: string;
  room?: string | null; vendor?: string | null; cost?: number | null;
  currency: string; purchasedOn?: string | null; warrantyUntil?: string | null;
  status: string; scheduledOn?: string | null;
  documentId?: number | null; notes?: string | null;
}

export interface Booking {
  id: number; tripId: number; kind: string; title: string;
  referenceNo?: string | null; startsAt?: string | null; endsAt?: string | null;
  amount?: number | null; currency: string; documentId?: number | null; notes?: string | null;
}

export interface PackingItem {
  id: number; tripId: number; name: string; quantity: number;
  category?: string | null; isPacked: boolean;
}

export interface Trip {
  id: number; userId: number; title: string; destination?: string | null;
  startsOn: string; endsOn?: string | null; status: string;
  budget?: number | null; notes?: string | null;
  bookings: Booking[]; packingItems: PackingItem[];
}

export interface TaskItem {
  id: number; userId: number; title: string; module: string;
  dueOn?: string | null; priority: string; isDone: boolean;
  relatedType?: string | null; relatedId?: number | null; notes?: string | null;
}

export interface AuthResponse {
  token: string; userId: number; email: string; displayName: string;
}
