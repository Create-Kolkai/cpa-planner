export type UserRole = "sales_rep" | "manager" | "admin";
export type LocationQuality = "exact" | "address" | "place" | "suburb" | "area_estimate" | "unresolved";
export type PlanStatus = "draft" | "generating" | "review" | "complete" | "submitted" | "unresolved" | "failed";
export type VisitStatus = "scheduled" | "unresolved" | "removed";
export type BlockedDateType = "training" | "meeting" | "leave" | "conference" | "public_holiday" | "other";

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: AuthUser;
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  manager_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RepPharmacyRow = {
  id: string;
  rep_id: string;
  directory_pharmacy_id: string | null;
  practice_number: string | null;
  pharmacy_name: string;
  address: string | null;
  suburb: string | null;
  town: string | null;
  province: string | null;
  telephone: string | null;
  latitude: number | null;
  longitude: number | null;
  location_quality: LocationQuality;
  grade: string;
  required_visits_override: number | null;
  visit_duration_minutes: number;
  priority: number;
  notes: string | null;
  active: boolean;
  source: string;
  created_at: string;
  updated_at: string;
};

export type PlanningDefaultsRow = {
  rep_id: string;
  grade_a_visits: number;
  grade_b_visits: number;
  grade_c_visits: number;
  min_visits_per_day: number;
  max_visits_per_day: number;
  working_weekdays: number[];
  default_visit_duration_minutes: number;
  minimum_repeat_visit_gap_days: number;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  created_at: string;
  updated_at: string;
};

export type BlockedDateRow = {
  id: string;
  rep_id: string;
  date: string;
  type: BlockedDateType;
  reason: string;
  created_by: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type MonthlyPlanRow = {
  id: string;
  rep_id: string;
  month: string;
  status: PlanStatus;
  version: number;
  generation_mode: string;
  settings_snapshot: Record<string, unknown>;
  required_visit_count: number;
  scheduled_visit_count: number;
  unresolved_visit_count: number;
  available_capacity: number;
  generated_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanDayRow = {
  id: string;
  plan_id: string;
  date: string;
  locked: boolean;
  manually_modified: boolean;
  primary_area: string | null;
  visit_count: number;
  route_mode: string;
  route_distance_meters: number | null;
  route_duration_seconds: number | null;
  route_geometry: unknown | null;
  created_at: string;
  updated_at: string;
};

export type PlanVisitRow = {
  id: string;
  plan_id: string;
  plan_day_id: string | null;
  rep_pharmacy_id: string;
  occurrence_number: number;
  stop_order: number | null;
  status: VisitStatus;
  manually_moved: boolean;
  original_date: string | null;
  planning_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectorySearchRow = {
  id: string;
  practice_number: string | null;
  practice_name: string;
  suburb: string | null;
  town: string | null;
  province: string | null;
  physical_address: string | null;
  location_quality: LocationQuality;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
