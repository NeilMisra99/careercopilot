import type { JobEmailClassification } from './ai-classifier';
import type { AIParsedDataFromExtractor } from './ai-extractor';
import type { EmailToParse } from './types';

/**
 * Interface for confidence calculation result
 */
export interface ConfidenceResult {
	overall: number; // 0.0 to 1.0
	factors: {
		classification: number;
		extraction: number;
		dataQuality: number;
		consistency: number;
	};
	reasoning: string;
}

/**
 * Calculate confidence score for classification result
 */
function calculateClassificationConfidence(classification: JobEmailClassification, emailData: EmailToParse): number {
	let confidence = 0.5; // Base confidence

	// Strong indicators for high confidence
	if (classification.isJobApplicationRelated) {
		// Company domain (not job board) increases confidence
		const senderDomain = emailData.gmailMessage.from?.split('@')[1]?.toLowerCase() || '';
		const isJobBoard = [
			'linkedin.com',
			'indeed.com',
			'glassdoor.com',
			'ziprecruiter.com',
			'monster.com',
			'careerbuilder.com',
			'jobs.com',
			'workday.com',
			'wellfound.com',
		].some((domain) => senderDomain.includes(domain));

		if (!isJobBoard && senderDomain) {
			confidence += 0.2; // Company email increases confidence
		}

		// Specific keywords in subject indicate high confidence
		const subject = emailData.gmailMessage.subject?.toLowerCase() || '';
		const highConfidenceKeywords = [
			'application',
			'interview',
			'offer',
			'rejection',
			'status',
			'next steps',
			'thank you for applying',
			'position',
		];

		const keywordMatches = highConfidenceKeywords.filter((keyword) => subject.includes(keyword)).length;

		confidence += Math.min(keywordMatches * 0.1, 0.3);
	} else {
		// For non-job emails, check certainty indicators
		const reasoning = classification.reasoning?.toLowerCase() || '';
		const certaintyIndicators = ['newsletter', 'promotional', 'job alert', 'marketing', 'unrelated', 'spam', 'advertisement'];

		const certaintyMatches = certaintyIndicators.filter((indicator) => reasoning.includes(indicator)).length;

		confidence += Math.min(certaintyMatches * 0.15, 0.4);
	}

	// Content length affects confidence (more content = more context)
	const contentLength = (emailData.gmailMessage.bodyText || emailData.gmailMessage.snippet || '').length;

	if (contentLength > 500) confidence += 0.1;
	else if (contentLength < 100) confidence -= 0.1;

	return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Calculate confidence score for data extraction
 */
function calculateExtractionConfidence(extractedData: AIParsedDataFromExtractor, emailData: EmailToParse): number {
	let confidence = 0.3; // Base confidence

	// Check data completeness
	const hasCompanyName = extractedData.companyName && extractedData.companyName.trim() !== '';
	const hasJobTitle = extractedData.jobTitle && extractedData.jobTitle.trim() !== '';
	const hasStatus = extractedData.status && extractedData.status !== null;

	if (hasCompanyName) confidence += 0.25;
	if (hasJobTitle) confidence += 0.25;
	if (hasStatus) confidence += 0.2;

	// Check data quality
	if (hasCompanyName && extractedData.companyName!.length > 2) {
		confidence += 0.1; // Not just initials
	}

	if (hasJobTitle && extractedData.jobTitle!.length > 3) {
		confidence += 0.1; // Meaningful job title
	}

	// Cross-validate with email content
	const emailContent = (emailData.gmailMessage.bodyText || emailData.gmailMessage.snippet || '').toLowerCase();

	if (hasCompanyName && emailContent.includes(extractedData.companyName!.toLowerCase())) {
		confidence += 0.15; // Company name appears in email
	}

	// Status consistency check
	if (hasStatus) {
		const status = extractedData.status;
		const statusKeywords = {
			Opportunity: [
				'opportunity',
				'please see job description',
				'let me know if you are interested',
				'recruiter',
				'recruiting',
				'talent acquisition',
			],
			Applied: ['applied', 'application received', 'thank you for applying'],
			Screening: ['reviewing', 'under review', 'being considered'],
			Interviewing: ['interview', 'schedule', 'meet with'],
			Offer: ['offer', 'pleased to offer', 'job offer'],
			Rejected: ['unfortunately', 'not moving forward', 'other candidates', 'regret'],
		};

		const relevantKeywords = statusKeywords[status as keyof typeof statusKeywords] || [];
		const hasRelevantKeywords = relevantKeywords.some((keyword) => emailContent.includes(keyword));

		if (hasRelevantKeywords) confidence += 0.15;
	}

	return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Calculate data quality score
 */
function calculateDataQuality(extractedData: AIParsedDataFromExtractor, emailData: EmailToParse): number {
	let quality = 0.5; // Base quality

	// Check for generic/placeholder values
	const companyName = extractedData.companyName?.toLowerCase() || '';
	const jobTitle = extractedData.jobTitle?.toLowerCase() || '';

	const genericCompanyNames = ['company', 'unknown', 'employer', 'organization'];
	const genericJobTitles = ['position', 'role', 'job', 'unknown'];

	if (genericCompanyNames.some((generic) => companyName.includes(generic))) {
		quality -= 0.3; // Penalize generic company names
	}

	if (genericJobTitles.some((generic) => jobTitle.includes(generic))) {
		quality -= 0.2; // Penalize generic job titles
	}

	// Reward specific, detailed information
	if (companyName.length > 5 && !companyName.includes('unknown')) {
		quality += 0.2;
	}

	if (jobTitle.length > 8 && !jobTitle.includes('unknown')) {
		quality += 0.2;
	}

	// Check email sender consistency with extracted company
	if (extractedData.companyName) {
		const senderDomain = emailData.gmailMessage.from?.split('@')[1]?.toLowerCase() || '';
		const companyDomain = extractedData.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');

		if (senderDomain.includes(companyDomain) || companyDomain.includes(senderDomain.split('.')[0])) {
			quality += 0.3; // Sender domain matches company
		}
	}

	return Math.max(0.1, Math.min(1.0, quality));
}

/**
 * Calculate overall consistency score
 */
function calculateConsistency(
	classification: JobEmailClassification,
	extractedData: AIParsedDataFromExtractor,
	emailData: EmailToParse,
): number {
	let consistency = 0.7; // Base consistency

	// If classified as job-related but no data extracted, reduce consistency
	if (classification.isJobApplicationRelated) {
		const hasExtractedData = extractedData.companyName || extractedData.jobTitle || extractedData.status;
		if (!hasExtractedData) {
			consistency -= 0.4;
		}
	} else {
		// If not job-related but we extracted data, that's inconsistent
		const hasExtractedData = extractedData.companyName || extractedData.jobTitle || extractedData.status;
		if (hasExtractedData) {
			consistency -= 0.3;
		}
	}

	// Check status consistency with classification
	if (classification.isJobApplicationRelated && extractedData.status) {
		const validStatuses = ['Opportunity', 'Applied', 'Screening', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn'];
		if (validStatuses.includes(extractedData.status)) {
			consistency += 0.2;
		}
	}

	return Math.max(0.1, Math.min(1.0, consistency));
}

/**
 * Calculate comprehensive AI confidence score
 */
export function calculateAIConfidence(
	classification: JobEmailClassification,
	extractedData: AIParsedDataFromExtractor,
	emailData: EmailToParse,
): ConfidenceResult {
	// Calculate individual factor scores
	const classificationScore = calculateClassificationConfidence(classification, emailData);
	const extractionScore = calculateExtractionConfidence(extractedData, emailData);
	const dataQualityScore = calculateDataQuality(extractedData, emailData);
	const consistencyScore = calculateConsistency(classification, extractedData, emailData);

	// Weight the factors
	const weights = {
		classification: 0.3,
		extraction: 0.3,
		dataQuality: 0.2,
		consistency: 0.2,
	};

	// Calculate weighted overall score
	const overall =
		classificationScore * weights.classification +
		extractionScore * weights.extraction +
		dataQualityScore * weights.dataQuality +
		consistencyScore * weights.consistency;

	// Generate reasoning
	const reasoning = generateConfidenceReasoning(
		{ classificationScore, extractionScore, dataQualityScore, consistencyScore },
		classification,
		extractedData,
		overall,
	);

	return {
		overall: Math.round(overall * 100) / 100, // Round to 2 decimal places
		factors: {
			classification: Math.round(classificationScore * 100) / 100,
			extraction: Math.round(extractionScore * 100) / 100,
			dataQuality: Math.round(dataQualityScore * 100) / 100,
			consistency: Math.round(consistencyScore * 100) / 100,
		},
		reasoning,
	};
}

/**
 * Generate human-readable reasoning for confidence score
 */
function generateConfidenceReasoning(
	scores: { classificationScore: number; extractionScore: number; dataQualityScore: number; consistencyScore: number },
	classification: JobEmailClassification,
	extractedData: AIParsedDataFromExtractor,
	overall: number,
): string {
	const factors = [];

	// Classification reasoning
	if (scores.classificationScore > 0.7) {
		factors.push(classification.isJobApplicationRelated ? 'strong job application indicators' : 'clear non-job email signals');
	} else if (scores.classificationScore < 0.4) {
		factors.push('unclear email classification');
	}

	// Extraction reasoning
	if (scores.extractionScore > 0.7) {
		factors.push('comprehensive data extraction');
	} else if (scores.extractionScore < 0.4) {
		factors.push('limited data extraction');
	}

	// Data quality reasoning
	if (scores.dataQualityScore > 0.7) {
		factors.push('high-quality extracted data');
	} else if (scores.dataQualityScore < 0.4) {
		factors.push('generic or low-quality data');
	}

	// Consistency reasoning
	if (scores.consistencyScore > 0.7) {
		factors.push('consistent AI analysis');
	} else if (scores.consistencyScore < 0.4) {
		factors.push('inconsistent AI results');
	}

	// Overall assessment
	let overallAssessment = '';
	if (overall > 0.8) {
		overallAssessment = 'Very high confidence';
	} else if (overall > 0.6) {
		overallAssessment = 'High confidence';
	} else if (overall > 0.4) {
		overallAssessment = 'Moderate confidence';
	} else {
		overallAssessment = 'Low confidence';
	}

	const factorText = factors.length > 0 ? ` based on: ${factors.join(', ')}` : '';
	return `${overallAssessment}${factorText}`;
}

/**
 * Get confidence level category
 */
export function getConfidenceLevel(confidence: number): 'very_high' | 'high' | 'moderate' | 'low' | 'very_low' {
	if (confidence >= 0.8) return 'very_high';
	if (confidence >= 0.65) return 'high';
	if (confidence >= 0.45) return 'moderate';
	if (confidence >= 0.25) return 'low';
	return 'very_low';
}

/**
 * Determine if confidence is sufficient for auto-approval
 */
export function shouldAutoApprove(confidence: number, userPreferences?: { autoApprovalThreshold?: number }): boolean {
	const threshold = userPreferences?.autoApprovalThreshold || 0.75; // Default 75% threshold
	return confidence >= threshold;
}
