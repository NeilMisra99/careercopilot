export interface InterviewSession {
  id: string;
  session_name: string;
  session_type: "behavioral" | "technical" | "company_specific" | "mixed";
  status: "draft" | "in_progress" | "completed";
  application_id: string;
  resume_id: string;
  created_at: string;
  updated_at: string;
  // Generation status fields for realtime updates
  question_generation_status?: string | null;
  brief_generation_status?: string | null;
  generation_progress?: number | null;
  generation_metadata?: Record<string, unknown> | null;
  applications: {
    id: string;
    company_name: string;
    role: string;
    job_description?: string;
  };
  resumes: {
    id: string;
    name: string;
  };
}

export interface InterviewQuestion {
  id: string;
  session_id: string;
  question: string; // Main question text
  question_text?: string; // Alternative field name for compatibility
  category: string; // Question category
  question_type?:
    | "behavioral"
    | "technical"
    | "company_culture"
    | "role_specific";
  difficulty: "easy" | "medium" | "hard";
  context?: string; // Additional context for the question
  expected_structure?: string; // Expected answer format
  follow_ups?: string[]; // Follow-up questions
  suggested_answer?: string;
  star_story_ids?: string[];
  skills_assessed?: string[];
  estimated_time?: number;
  source?: string;
  order_index?: number;
  created_at: string;
}

export interface StarStory {
  id: string;
  user_id: string;
  resume_id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  skills_demonstrated: string[];
  achievement_metrics?: Record<string, unknown>;
  story_category: string;
  confidence_score?: number;
  source_section?: string;
  usage_count?: number;
  created_at: string;
}

export interface InterviewBrief {
  id: string;
  session_id: string;
  content: string; // Main HTML/markdown content
  key_insights?: string[];
  preparation_tips?: string[];
  questions_to_ask?: string[];
  estimated_duration?: number;
  confidence_score?: number;
  company_research?: {
    companyOverview?: string;
    recentNews?: string[];
    cultureValues?: string[];
    industryPosition?: string;
    keyInsights?: string[];
  };
  role_analysis?: {
    keyResponsibilities?: string[];
    requiredSkills?: string[];
    teamStructure?: string;
    growthOpportunities?: string[];
    challenges?: string[];
  };
  match_insights?: {
    strengthsToHighlight?: string[];
    gapsToAddress?: string[];
    uniqueValueProposition?: string;
    competitiveAdvantages?: string[];
  };
  talking_points?: string[];
  red_flags_to_avoid?: string[];
  created_at: string;
  updated_at?: string;
}

export interface InterviewPrepStats {
  totalSessions: number;
  completedSessions: number;
  draftSessions: number;
  inProgressSessions: number;
  totalQuestions: number;
  totalStarStories: number;
  averageConfidenceScore: number;
  recentActivity: number;
}

export interface CreateSessionData {
  sessionName: string;
  sessionType: "behavioral" | "technical" | "company_specific" | "mixed";
  applicationId: string;
  resumeId: string;
}

export interface Application {
  id: string;
  company_name: string;
  role: string;
  job_description?: string;
}

export interface Resume {
  id: string;
  name: string;
  parsing_status: string;
}
