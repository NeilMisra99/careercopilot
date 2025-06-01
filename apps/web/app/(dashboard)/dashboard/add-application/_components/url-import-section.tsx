"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Sparkles } from "lucide-react"
import { useState } from "react"

interface UrlImportSectionProps {
  onImport: (url: string) => void
  isImporting: boolean
}

export function UrlImportSection({
  onImport,
  isImporting,
}: UrlImportSectionProps) {
  const [url, setUrl] = useState("")
  const [isValidUrl, setIsValidUrl] = useState(false)

  const handleUrlChange = (value: string) => {
    setUrl(value)

    // Basic URL validation
    try {
      new URL(value)
      setIsValidUrl(true)
    } catch {
      setIsValidUrl(false)
    }
  }

  const handleImport = () => {
    if (isValidUrl && !isImporting) {
      onImport(url)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isValidUrl && !isImporting) {
      handleImport()
    }
  }

  const supportedSites = [
    "LinkedIn Jobs",
    "Indeed",
    "Glassdoor",
    "AngelList",
    "Remote.co",
    "Company career pages",
  ]

  return (
    <Card className="border-dashed relative">
      {/* Loading overlay for URL importing */}
      {isImporting && (
        <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px] z-10 rounded-lg" />
      )}

      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-medium">Import from Job URL</h3>
          </div>

          <p className="text-sm text-muted-foreground">
            Paste a job posting URL to automatically extract company name, job
            title, and other details using smart web scraping enhanced with AI.
          </p>

          <div className="space-y-3">
            <Label htmlFor="job-url">Job Posting URL</Label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  id="job-url"
                  type="url"
                  placeholder="https://jobs.linkedin.com/view/1234567890"
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isImporting}
                />
              </div>
              <Button
                onClick={handleImport}
                disabled={!isValidUrl || isImporting}
                variant="secondary"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Smart Import
                  </>
                )}
              </Button>
            </div>

            {url && !isValidUrl && (
              <p className="text-sm text-destructive">
                Please enter a valid URL
              </p>
            )}
          </div>

          <div className="border-t pt-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                🤖 Smart extraction features:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• Traditional web scraping for known job boards</div>
                <div>• AI-enhanced extraction for complex or custom sites</div>
                <div>
                  • Automatic fallback to AI when traditional methods are
                  incomplete
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Supported job boards and career sites:
              </p>
              <div className="flex flex-wrap gap-2">
                {supportedSites.map((site) => (
                  <span
                    key={site}
                    className="inline-flex items-center px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded-md"
                  >
                    {site}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
