"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCompanyEnrichment } from "@/hooks/use-company-enrichment";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Building,
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { ApplicationFormData } from "../_lib/types";

// Improved debounce implementation for string inputs
function useDebouncedCallback(
  callback: (value: string) => void,
  delay: number,
): (value: string) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref to always use latest callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (value: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(value);
      }, delay);
    },
    [delay],
  );
}

interface EnhancedCompanyFieldProps {
  form: UseFormReturn<ApplicationFormData>;
}

export function EnhancedCompanyField({ form }: EnhancedCompanyFieldProps) {
  const [hasEnrichmentData, setHasEnrichmentData] = useState(false);
  const [showEnrichmentCard, setShowEnrichmentCard] = useState(false);
  const [suggestedValues, setSuggestedValues] = useState<{
    website?: string;
    location?: string;
  }>({});
  const [lastEnrichedCompany, setLastEnrichedCompany] = useState<string>("");
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const {
    isLoading: isEnriching,
    data: enrichmentData,
    cached: isCached,
    enrichQuick,
    enrichComprehensive,
    reset: clearData,
  } = useCompanyEnrichment({
    onSuccess: (data) => {
      setHasEnrichmentData(true);
      setShowEnrichmentCard(true);

      // Prepare suggestions based on enriched data
      const suggestions: { website?: string; location?: string } = {};

      if ("website" in data && data.website && !form.getValues("jobUrl")) {
        suggestions.website = data.website;
      }

      if (
        "headquarters" in data &&
        data.headquarters &&
        !form.getValues("location")
      ) {
        suggestions.location = data.headquarters;
      }

      setSuggestedValues(suggestions);
    },
    onError: () => {
      setShowEnrichmentCard(false);
      setSuggestedValues({});
    },
  });

  // Debounced enrichment trigger
  const debouncedEnrich = useDebouncedCallback(
    async (companyName: string) => {
      if (companyName.length > 2) {
        // Prevent duplicate requests for the same company
        if (
          companyName.toLowerCase().trim() ===
          lastEnrichedCompany.toLowerCase().trim()
        ) {
          return;
        }

        try {
          setLastEnrichedCompany(companyName);
          await enrichQuick(
            companyName,
            undefined, // domain
            ["logo", "domain", "description", "industry"], // includeFields
          );
        } catch (enrichmentError) {
          // Error is handled by the hook
          console.warn("Quick enrichment failed:", enrichmentError);
          // Reset on error so we can retry
          setLastEnrichedCompany("");
        }
      } else {
        clearData();
        setShowEnrichmentCard(false);
        setHasEnrichmentData(false);
        setSuggestedValues({});
        setLastEnrichedCompany("");
      }
    },
    600, // Faster response - 600ms after user stops typing
  );

  const handleApplySuggestion = (
    field: "website" | "location",
    value: string,
  ) => {
    if (field === "website") {
      form.setValue("jobUrl", value);
    } else if (field === "location") {
      form.setValue("location", value);
    }

    // Remove the suggestion after applying
    setSuggestedValues((prev) => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  };

  const handleStartComprehensiveEnrichment = async () => {
    const companyName = form.getValues("companyName");
    if (companyName) {
      try {
        // Don't force refresh - let it check cache for comprehensive data first
        // If comprehensive data isn't cached, it will automatically fetch fresh data
        await enrichComprehensive(companyName, undefined, false);
        // The onSuccess callback will be triggered automatically by the hook
      } catch (enrichmentError) {
        // Error handled by hook
        console.warn("Comprehensive enrichment failed:", enrichmentError);
      }
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-emerald-600 dark:text-emerald-400";
    if (confidence >= 0.6) return "text-amber-600 dark:text-amber-400";
    return "text-slate-500 dark:text-slate-400";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High confidence";
    if (confidence >= 0.6) return "Medium confidence";
    return "Low confidence";
  };

  // Reset expansion state when enrichment data changes
  useEffect(() => {
    setIsDescriptionExpanded(false);
  }, [enrichmentData]);

  return (
    <TooltipProvider>
      {/* Company Name Field - Keep this clean and simple */}
      <FormField
        control={form.control}
        name="companyName"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              Company Name
              {hasEnrichmentData && (
                <div className="flex items-center gap-1">
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    <Brain className="mr-1 h-3 w-3" />
                    AI Enhanced
                  </Badge>
                  {isCached && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-xs text-blue-600 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                        >
                          <Clock className="mr-1 h-3 w-3" />
                          Cached
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Using recently cached data (within 24 hours)</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </FormLabel>
            <FormControl>
              <div className="relative">
                <Input
                  {...field}
                  placeholder="e.g. Scotiabank, Google, Microsoft"
                  onChange={(e) => {
                    field.onChange(e);
                    debouncedEnrich(e.target.value);
                  }}
                  className={
                    hasEnrichmentData
                      ? "border-emerald-200 pr-10 dark:border-emerald-700"
                      : ""
                  }
                />
                {isEnriching && (
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  </div>
                )}
                {hasEnrichmentData && !isEnriching && (
                  <div className="absolute top-1/2 right-3 -translate-y-1/2">
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                  </div>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Smart Suggestions - Show before enrichment card */}
      <AnimatePresence>
        {(suggestedValues.website || suggestedValues.location) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="col-span-full space-y-2"
          >
            {suggestedValues.website && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 bg-gradient-to-b from-blue-50 to-blue-100/60 p-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-blue-800/30 dark:bg-blue-950/30 dark:from-blue-950/30 dark:to-blue-950/20 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-blue-700 dark:text-blue-300">
                  Suggestion: Use company website as job URL?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleApplySuggestion("website", suggestedValues.website!)
                  }
                  className="ml-auto h-6 px-2 text-xs"
                >
                  Apply
                </Button>
              </div>
            )}
            {suggestedValues.location && (
              <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 bg-gradient-to-b from-purple-50 to-purple-100/60 p-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-purple-800/30 dark:bg-purple-950/30 dark:from-purple-950/30 dark:to-purple-950/20 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-purple-700 dark:text-purple-300">
                  Suggestion: Use &quot;{suggestedValues.location}&quot; as
                  location?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    handleApplySuggestion("location", suggestedValues.location!)
                  }
                  className="ml-auto h-6 px-2 text-xs"
                >
                  Apply
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Enrichment Card */}
      <AnimatePresence>
        {showEnrichmentCard && enrichmentData && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="col-span-full rounded-lg border border-emerald-200 bg-emerald-50 bg-gradient-to-b from-emerald-50 to-emerald-100/60 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-emerald-800/30 dark:bg-emerald-950/30 dark:from-emerald-950/30 dark:to-emerald-950/20 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            <div className="flex items-start gap-4">
              {/* Company Logo */}
              {enrichmentData.logoUrl ? (
                <div className="flex-shrink-0">
                  <Image
                    src={enrichmentData.logoUrl}
                    alt={`${enrichmentData.companyName} logo`}
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-lg bg-white object-contain p-1.5 shadow-sm"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  <Building className="h-7 w-7 text-slate-400" />
                </div>
              )}

              {/* Company Details */}
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {enrichmentData.companyName}
                  </h3>

                  {enrichmentData.confidenceScore >= 0.8 && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-100 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    >
                      <Star className="mr-1 h-3 w-3 fill-emerald-700 text-emerald-700 dark:fill-emerald-300 dark:text-emerald-300" />
                      Verified
                    </Badge>
                  )}
                </div>

                {/* Description */}
                {enrichmentData.description && (
                  <div className="space-y-1">
                    <p
                      className={`text-sm leading-relaxed text-slate-600 dark:text-slate-400 ${
                        isDescriptionExpanded ? "" : "line-clamp-1"
                      }`}
                    >
                      {enrichmentData.description}
                    </p>
                    {enrichmentData.description.length > 160 && (
                      <button
                        type="button"
                        onClick={() =>
                          setIsDescriptionExpanded(!isDescriptionExpanded)
                        }
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {isDescriptionExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}

                {/* Company Details Grid */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {enrichmentData.industry && (
                    <div className="flex items-center gap-1.5">
                      <div className="rounded-full bg-blue-100 p-1 dark:bg-blue-900/30">
                        <Building className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {enrichmentData.industry}
                      </span>
                    </div>
                  )}

                  {"companySize" in enrichmentData &&
                    enrichmentData.companySize && (
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-full bg-green-100 p-1 dark:bg-green-900/30">
                          <Users className="h-3 w-3 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {enrichmentData.companySize}
                        </span>
                      </div>
                    )}

                  {"foundedYear" in enrichmentData &&
                    enrichmentData.foundedYear && (
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-full bg-purple-100 p-1 dark:bg-purple-900/30">
                          <Calendar className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Founded {enrichmentData.foundedYear}
                        </span>
                      </div>
                    )}

                  {"headquarters" in enrichmentData &&
                    enrichmentData.headquarters && (
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-full bg-orange-100 p-1 dark:bg-orange-900/30">
                          <MapPin className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {enrichmentData.headquarters}
                        </span>
                      </div>
                    )}

                  {enrichmentData.domain && (
                    <div className="flex items-center gap-1.5">
                      <div className="rounded-full bg-slate-100 p-1 dark:bg-slate-700">
                        <Globe className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                      </div>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {enrichmentData.domain}
                      </span>
                    </div>
                  )}

                  {enrichmentData.website && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto justify-start p-0 text-xs"
                          onClick={() =>
                            window.open(enrichmentData.website, "_blank")
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <div className="rounded-full bg-indigo-100 p-1 dark:bg-indigo-900/30">
                              <ExternalLink className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
                              Visit Website
                            </span>
                          </div>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Open company website</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* AI Insights */}
                {"newsData" in enrichmentData &&
                  enrichmentData.newsData &&
                  enrichmentData.newsData.length > 0 && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 bg-gradient-to-b from-blue-50 to-blue-100/60 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-blue-800/30 dark:bg-blue-950/30 dark:from-blue-950/30 dark:to-blue-950/20 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
                      <div className="mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          AI Insights
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {enrichmentData.newsData
                          .slice(0, 2)
                          .map((item, index) => (
                            <li
                              key={index}
                              className="text-xs text-blue-600 dark:text-blue-300"
                            >
                              • {item.summary}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                {/* Grounding Sources */}
                {enrichmentData.groundingMetadata &&
                  ((enrichmentData.groundingMetadata.webSearchQueries &&
                    enrichmentData.groundingMetadata.webSearchQueries.length >
                      0) ||
                    (enrichmentData.groundingMetadata.groundingSupports &&
                      enrichmentData.groundingMetadata.groundingSupports
                        .length > 0)) && (
                    <div className="rounded-md border-2 border-emerald-200 bg-transparent p-3 dark:border-emerald-800/30 dark:bg-transparent">
                      <div className="mb-2 flex items-center gap-2">
                        <Star className="h-4 w-4 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                          Information Sources
                        </span>
                      </div>

                      {/* Web Search Queries */}
                      {enrichmentData.groundingMetadata.webSearchQueries &&
                        enrichmentData.groundingMetadata.webSearchQueries
                          .length > 0 && (
                          <div className="mb-2">
                            <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              Search Queries:
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {enrichmentData.groundingMetadata.webSearchQueries
                                .slice(0, 3)
                                .map((query, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:border-emerald-700 dark:bg-emerald-800/30 dark:text-emerald-300"
                                  >
                                    &ldquo;{query}&rdquo;
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}

                      {/* Grounding Supports */}
                      {enrichmentData.groundingMetadata.groundingSupports &&
                        enrichmentData.groundingMetadata.groundingSupports
                          .length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              Source Confidence:
                            </p>
                            <div className="space-y-1">
                              {enrichmentData.groundingMetadata.groundingSupports
                                .slice(0, 2)
                                .map((support, index) => (
                                  <div key={index} className="text-xs">
                                    {support.segment && (
                                      <div className="flex items-center gap-2">
                                        <span className="line-clamp-1 flex-1 text-emerald-600 dark:text-emerald-300">
                                          &ldquo;
                                          {support.segment.text.slice(0, 80)}
                                          ...&rdquo;
                                        </span>
                                        {support.confidenceScores &&
                                          support.confidenceScores[0] && (
                                            <span className="font-medium text-emerald-500">
                                              {Math.round(
                                                support.confidenceScores[0] *
                                                  100,
                                              )}
                                              %
                                            </span>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleStartComprehensiveEnrichment}
                      disabled={isEnriching}
                      className="border-emerald-200 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/70 dark:hover:text-emerald-200"
                    >
                      {isEnriching ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Enriching...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1 h-3 w-3" />
                          Get Full Data
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Data Quality Indicator - Confidence Only */}
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={getConfidenceColor(
                        enrichmentData.confidenceScore,
                      )}
                    >
                      {getConfidenceLabel(enrichmentData.confidenceScore)}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      • {Math.round(enrichmentData.confidenceScore * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State - Also positioned to not disrupt grid */}
      {isEnriching && !enrichmentData && (
        <div className="col-span-full mt-2 rounded-lg border border-gray-200/80 bg-white bg-gradient-to-b from-white to-gray-50/40 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.25)] dark:border-white/10 dark:bg-transparent dark:from-white/3 dark:to-transparent dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="h-3 w-64" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}
