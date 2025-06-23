import {
  enrichCompanyComprehensive,
  enrichCompanyQuick,
} from "@/app/(dashboard)/dashboard/add-application/_lib/actions/company-enrichment-actions";
import type {
  CompanyEnrichmentData,
  QuickEnrichmentData,
} from "@/lib/types/company-enrichment";
import { useCallback, useRef, useState } from "react";

interface UseCompanyEnrichmentOptions {
  onSuccess?: (
    data: QuickEnrichmentData | CompanyEnrichmentData,
    cached?: boolean,
  ) => void;
  onError?: (error: string) => void;
  timeoutMs?: number;
}

interface EnrichmentResult {
  data: QuickEnrichmentData | CompanyEnrichmentData | null;
  isLoading: boolean;
  error: string | null;
  cached: boolean;
  enrichQuick: (
    companyName: string,
    domain?: string,
    includeFields?: string[],
  ) => Promise<QuickEnrichmentData | null>;
  enrichComprehensive: (
    companyName: string,
    domain?: string,
    forceRefresh?: boolean,
  ) => Promise<CompanyEnrichmentData | null>;
  reset: () => void;
}

export function useCompanyEnrichment(
  options: UseCompanyEnrichmentOptions = {},
): EnrichmentResult {
  const [data, setData] = useState<
    QuickEnrichmentData | CompanyEnrichmentData | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  // Track active requests to prevent duplicates
  const activeQuickRequests = useRef<
    Map<string, Promise<QuickEnrichmentData | null>>
  >(new Map());
  const activeComprehensiveRequests = useRef<
    Map<string, Promise<CompanyEnrichmentData | null>>
  >(new Map());

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
    setCached(false);
    // Clear any pending requests
    activeQuickRequests.current.clear();
    activeComprehensiveRequests.current.clear();
  }, []);

  const enrichQuick = useCallback(
    async (
      companyName: string,
      domain?: string,
      includeFields?: string[],
    ): Promise<QuickEnrichmentData | null> => {
      if (!companyName) return null;

      const requestKey = `${companyName.toLowerCase().trim()}-${domain || ""}-${(includeFields || []).join(",")}`;

      // Check if there's already an active request for this company
      const existingRequest = activeQuickRequests.current.get(requestKey);
      if (existingRequest) {
        return existingRequest;
      }

      setIsLoading(true);
      setError(null);

      const requestPromise = (async (): Promise<QuickEnrichmentData | null> => {
        try {
          const result = await enrichCompanyQuick(companyName, domain);

          if (result.success && result.data) {
            setData(result.data);
            setCached(result.cached || false);
            options.onSuccess?.(result.data, result.cached);
            return result.data;
          } else {
            throw new Error(result.error || "Quick enrichment failed");
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : "Quick enrichment failed";
          setError(errorMessage);
          setCached(false);
          options.onError?.(errorMessage);
          return null;
        } finally {
          setIsLoading(false);
          // Remove from active requests when done
          activeQuickRequests.current.delete(requestKey);
        }
      })();

      // Store the promise to deduplicate concurrent requests
      activeQuickRequests.current.set(requestKey, requestPromise);
      return requestPromise;
    },
    [options.onSuccess, options.onError],
  );

  const enrichComprehensive = useCallback(
    async (
      companyName: string,
      domain?: string,
      forceRefresh?: boolean,
    ): Promise<CompanyEnrichmentData | null> => {
      if (!companyName) return null;

      const requestKey = `${companyName.toLowerCase().trim()}-${domain || ""}-${forceRefresh || false}`;

      // Check if there's already an active request for this company (unless force refresh)
      if (!forceRefresh) {
        const existingRequest =
          activeComprehensiveRequests.current.get(requestKey);
        if (existingRequest) {
          return existingRequest;
        }
      }

      setIsLoading(true);
      setError(null);

      const requestPromise =
        (async (): Promise<CompanyEnrichmentData | null> => {
          try {
            const result = await enrichCompanyComprehensive(
              companyName,
              domain,
              forceRefresh,
            );

            if (result.success && result.data) {
              setData(result.data);
              setCached(result.cached || false);
              options.onSuccess?.(result.data, result.cached);
              return result.data;
            } else {
              throw new Error(
                result.error || "Comprehensive enrichment failed",
              );
            }
          } catch (err) {
            const errorMessage =
              err instanceof Error
                ? err.message
                : "Comprehensive enrichment failed";
            setError(errorMessage);
            setCached(false);
            options.onError?.(errorMessage);
            return null;
          } finally {
            setIsLoading(false);
            // Remove from active requests when done
            activeComprehensiveRequests.current.delete(requestKey);
          }
        })();

      // Store the promise to deduplicate concurrent requests
      activeComprehensiveRequests.current.set(requestKey, requestPromise);
      return requestPromise;
    },
    [options.onSuccess, options.onError],
  );

  return {
    data,
    isLoading,
    error,
    cached,
    enrichQuick,
    enrichComprehensive,
    reset,
  };
}
