import { SessionDetailSkeleton } from "../_components/session-detail-skeleton";

export default function Loading() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <SessionDetailSkeleton />
    </div>
  );
}