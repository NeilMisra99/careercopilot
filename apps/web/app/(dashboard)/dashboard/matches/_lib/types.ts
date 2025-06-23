export interface JobResumeMatch {
  id: string;
  application_id: string;
  resume_id: string;
  user_id: string;
  overall_fit_score: number;
  skills_match_score: number;
  experience_match_score: number;
  education_match_score: number;
  calculated_at: string;
  match_analysis: {
    strengths: string[];
    gaps: string[];
    recommendations: string[];
    matched_skills: string[];
    missing_skills: string[];
    relevant_experiences: Array<{
      company: string;
      role: string;
      relevance_score: number;
      relevance_reason: string;
    }>;
    job_requirements: {
      required_skills: string[];
      preferred_skills: string[];
      experience_level: string;
      education_requirements: string[];
    };
    confidence_score: string;
  };
  // Additional fields from the worker response
  matched_skills: string[];
  missing_skills: string[];
  relevant_experiences: string; // JSON string
  job_requirements_extracted: string[];
  job_required_skills: string[];
  job_preferred_skills: string[];
  job_experience_level: string;
  job_education_requirements: string[];
  match_analysis_confidence: string;
  match_reasoning: string;
  suggestions_for_improvement: string[];
  job_analysis: string;
  strengths: string;
  weaknesses: string;
  recommendations: string;
  // Joined data from applications and resumes
  company_name: string;
  job_title: string;
  application_status: string;
  application_date: string;
  job_location?: string;
  salary_range?: string;
  resume_name: string;
  is_primary_resume: boolean;
  candidate_name: string;
}

export interface MatchStats {
  totalMatches: number;
  averageFitScore: number;
  excellentMatches: number;
  goodMatches: number;
  poorMatches: number;
  recentMatches: number;
  totalApplications: number;
  totalResumes: number;
}
