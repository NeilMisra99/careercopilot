import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function JobDiscoveryLoading() {
  return (
    <div className="container mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
        <div className="h-4 w-96 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div className="h-8 w-12 rounded bg-slate-200 dark:bg-slate-700"></div>
                </div>
                <div className="h-12 w-12 rounded-xl bg-slate-200 dark:bg-slate-700"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex space-x-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-1 py-4">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
            </div>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 w-48 rounded bg-slate-200 dark:bg-slate-700"></div>
            <div className="h-4 w-96 rounded bg-slate-200 dark:bg-slate-700"></div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Form Fields */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div className="h-10 rounded bg-slate-200 dark:bg-slate-700"></div>
                </div>
              ))}
            </div>

            {/* Advanced Filters */}
            <div className="space-y-4">
              <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700"></div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700"></div>
                    <div className="h-10 rounded bg-slate-200 dark:bg-slate-700"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <div className="h-10 w-40 rounded bg-slate-200 dark:bg-slate-700"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
