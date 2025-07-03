export interface InterviewSession {
  id: string;
  session_name: string;
  session_type: "behavioral" | "technical" | "company_specific" | "mixed";
  status: "preparing" | "ready" | "completed";
  application_id: string;
  resume_id: string;
  created_at: string;
  updated_at: string;
  // Generation status fields for realtime updates
  question_generation_status?: string | null;
  brief_generation_status?: string | null;
  star_generation_status?: string | null;
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
  question_text: string; // Standardized field name matching database
  question_type:
    | "behavioral"
    | "technical"
    | "company_culture"
    | "role_specific";
  difficulty: "easy" | "medium" | "hard";
  suggested_answer?: string;
  source?: string;
  order_index?: number;
  created_at: string;
  // Enhanced fields for comprehensive interview preparation
  context?: string; // Why this question matters for the role/company
  expected_structure?: string; // How to structure the answer effectively
  follow_ups?: string[]; // Potential interviewer follow-up questions
  star_story_ids?: string[]; // Related STAR stories
  skills_assessed?: string[]; // Key skills this question evaluates
  estimated_time?: number; // Expected answer duration in minutes
  interview_flow_position?: "opening" | "early" | "middle" | "late" | "closing"; // Position in interview flow
  personalization_notes?: string; // Tailored advice for this specific candidate
  quality_score?: number; // AI-generated quality rating (0.0-1.0)
  complexity_level?: number; // Cognitive complexity level (1-5)
  tags?: string[]; // Searchable tags for categorizing questions
  preparation_time?: number; // Recommended preparation time in minutes
  answer_framework?: string; // Suggested framework: 'STAR', 'PAR', 'CAR', 'SAO'
  industry_specific?: boolean; // Whether this requires industry-specific knowledge
  followup_depth?: number; // Expected depth of follow-up questioning (0-3)
}

// Updated to match new interview_star_stories table structure
export interface InterviewStarStory {
  id: string;
  session_id: string; // Changed from user_id/resume_id to session_id for application-specific stories
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
  relevance_score?: number; // AI-calculated relevance to the specific job (0.0-1.0)
  job_alignment_notes?: string; // AI-generated notes on job relevance
  created_at: string;
  updated_at?: string;
}

// Keep legacy StarStory interface for backward compatibility during migration
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
  questions_to_ask?: string[];
  red_flags_to_avoid?: string[];
  created_at: string;
  updated_at?: string;
}

export interface InterviewPrepStats {
  totalSessions: number;
  completedSessions: number;
  preparingSessions: number;
  readySessions: number;
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
