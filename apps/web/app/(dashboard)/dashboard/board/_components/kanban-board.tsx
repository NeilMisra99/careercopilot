"use client";

import {
  Active,
  DndContext,
  DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  AlertCircle,
  Award,
  ClipboardCheck,
  FileX,
  ListTodo,
  Phone,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ManualCorrectionDialog } from "../../_components/manual-correction-dialog";
import type {
  FailedEmail,
  ManualCorrectionRequest,
} from "../../_lib/actions/failed-email-actions";
import { submitManualCorrectionAction } from "../../_lib/actions/failed-email-actions";
import {
  updateApplicationOrderServerAction,
  updateApplicationStatusServerAction,
} from "../_lib/actions/application-actions";
import { ApplicationCard } from "./application-card";
import { ApplicationColumn } from "./application-column";
import { FailedEmailCard } from "./failed-email-card";

// Interface for applications data
interface Application {
  id: string;
  company_name: string;
  role: string;
  status: string;
  applied_at: string;
  notes?: string;
  job_url?: string;
  source_email_id?: string;
  source_thread_id?: string;
  order_in_column?: number;
}

interface KanbanBoardProps {
  applicationsByStatus: {
    Opportunity: Application[];
    Wishlist: Application[];
    Applied: Application[];
    Screening: Application[];
    Interviewing: Application[];
    Offer: Application[];
    Rejected: Application[];
    Withdrawn: Application[];
  };
  failedEmails: FailedEmail[];
  onApplicationUpdated?: () => void;
}

export function KanbanBoard({
  applicationsByStatus,
  failedEmails,
  onApplicationUpdated,
}: KanbanBoardProps) {
  const router = useRouter();
  const [appsByStatus, setAppsByStatus] = useState(applicationsByStatus);
  const [failedEmailsState, setFailedEmailsState] = useState(failedEmails);
  const [selectedFailedEmail, setSelectedFailedEmail] =
    useState<FailedEmail | null>(null);
  const [isCorrectingEmail, setIsCorrectingEmail] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeDraggedItem, setActiveDraggedItem] =
    useState<Application | null>(null);
  const dndContextId = useId();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
  );

  function findContainer(id: string) {
    if (id in appsByStatus) {
      return id;
    }
    return Object.keys(appsByStatus).find((key) =>
      appsByStatus[key as keyof typeof appsByStatus].find(
        (app) => app.id === id,
      ),
    );
  }

  function handleDragStart(event: { active: Active }) {
    const { active } = event;
    const activeId = String(active.id);
    const activeContainerKey = findContainer(activeId);
    if (activeContainerKey) {
      const item = appsByStatus[
        activeContainerKey as keyof typeof appsByStatus
      ].find((app) => app.id === activeId);
      setActiveDraggedItem(item || null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    setActiveDraggedItem(null);

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeContainerKey = findContainer(activeId);
    const overContainerKey = findContainer(overId);

    if (!activeContainerKey || !overContainerKey) {
      return;
    }

    if (activeContainerKey !== overContainerKey) {
      const oldStatus = activeContainerKey as keyof typeof appsByStatus;
      const newStatus = overContainerKey as keyof typeof appsByStatus;

      // Find the draggedApp from the current state BEFORE the optimistic update
      const appToDrag = (appsByStatus[oldStatus] || []).find(
        (app) => app.id === activeId,
      );

      if (!appToDrag) {
        toast.error("Drag error", {
          description:
            "Could not identify the dragged application. Please refresh.",
        });
        return;
      }
      // Create a stable instance of the app being dragged for the server action
      const draggedAppForAction = { ...appToDrag };

      const originalAppsByStatus = JSON.parse(JSON.stringify(appsByStatus));

      setAppsByStatus((prev) => {
        const newAppsState = { ...prev };
        const sourceItems = [...(newAppsState[oldStatus] || [])];
        const destinationItems = [...(newAppsState[newStatus] || [])]; // Ensure it's mutable

        const activeItemIndex = sourceItems.findIndex(
          (item) => item.id === activeId,
        );

        if (activeItemIndex === -1) {
          // This shouldn't happen if appToDrag was found, but good for safety
          return prev; // Should not proceed if appToDrag was not found initially
        }

        const itemBeingMoved = sourceItems[activeItemIndex];

        newAppsState[oldStatus] = sourceItems.filter(
          (item) => item.id !== activeId,
        );

        // Determine where to insert in the destination list
        // If overId is a column ID, 'overItemIndex' will be -1. We append.
        // If overId is an item ID, 'overItemIndex' will be its index. We insert.
        const overTargetIsColumn = overId === newStatus; // Check if over.id is the column itself
        let overItemIndex = -1;

        if (!overTargetIsColumn) {
          overItemIndex = destinationItems.findIndex(
            (item) => item.id === overId,
          );
        }

        const itemWithNewStatus = { ...itemBeingMoved, status: newStatus };

        if (overItemIndex !== -1) {
          // Dropping onto another item in the new column
          destinationItems.splice(overItemIndex, 0, itemWithNewStatus);
        } else {
          // Dropping onto the column itself (or an empty column, or end of list)
          destinationItems.push(itemWithNewStatus);
        }
        newAppsState[newStatus] = destinationItems;
        return newAppsState;
      });

      // Now use 'draggedAppForAction' which was defined *before* setAppsByStatus
      const { error } = await updateApplicationStatusServerAction(
        draggedAppForAction.id,
        newStatus,
      );

      if (error) {
        toast.error("Error updating status", {
          description: error.message || "An unexpected error occurred",
        });
        setAppsByStatus(originalAppsByStatus); // Revert optimistic update
      } else {
        toast.success("Status updated", {
          description: `Moved ${draggedAppForAction.company_name} to ${newStatus}`,
        });
        setTimeout(() => {
          router.refresh();
        }, 100);
      }
    } else if (activeId !== overId) {
      const columnKey = activeContainerKey as keyof typeof appsByStatus;
      setAppsByStatus((prev) => {
        const itemsInColumn = [...(prev[columnKey] || [])];
        const oldIndex = itemsInColumn.findIndex(
          (item) => item.id === activeId,
        );
        const newIndex = itemsInColumn.findIndex((item) => item.id === overId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const reorderedItems = arrayMove(itemsInColumn, oldIndex, newIndex);
          return { ...prev, [columnKey]: reorderedItems };
        }
        return prev;
      });
      toast.info("Application reordered locally.");

      // Persist the new order
      const updatedColumnItems =
        appsByStatus[columnKey as keyof typeof appsByStatus];
      const orderUpdates = updatedColumnItems.map((app, index) => ({
        id: app.id,
        order_in_column: index,
      }));

      const { error: orderError } =
        await updateApplicationOrderServerAction(orderUpdates);

      if (orderError) {
        toast.error("Error updating order", {
          description:
            orderError.message ||
            "An unexpected error occurred while reordering.",
        });
        // Optionally, revert the optimistic update if the server action fails
        // This would require storing the state before the optimistic update for this specific case too.
        // For now, we'll rely on router.refresh() to eventually correct if needed, or user to retry.
      } else {
        toast.success("Order updated", {
          description: `Applications in ${columnKey} reordered.`,
        });
        setTimeout(() => {
          router.refresh();
        }, 100); // Refresh data to ensure consistency
      }
    }
  }

  // Handle failed email correction
  const handleFailedEmailClick = (failedEmail: FailedEmail) => {
    setSelectedFailedEmail(failedEmail);
    setIsDialogOpen(true);
  };

  const handleSubmitCorrection = async (
    correction: ManualCorrectionRequest,
  ) => {
    setIsCorrectingEmail(true);
    try {
      const result = await submitManualCorrectionAction(correction);
      if (result.success) {
        toast.success("Application created!", {
          description: result.message,
        });
        // Remove the corrected email from the list
        setFailedEmailsState((prev) =>
          prev.filter((email) => email.email_id !== correction.emailId),
        );
        setIsDialogOpen(false);
        setSelectedFailedEmail(null);
        setTimeout(() => {
          router.refresh();
        }, 100); // Refresh to show new application
      } else {
        toast.error("Failed to create application", {
          description: result.error || "Unknown error occurred",
        });
      }
    } catch {
      toast.error("Network error", {
        description: "Failed to submit correction. Please try again.",
      });
    } finally {
      setIsCorrectingEmail(false);
    }
  };

  const columns = [
    {
      id: "FailedEmails",
      title: "Failed Emails",
      icon: <AlertCircle className="h-4 w-4 text-orange-500" />,
      count: failedEmailsState.length,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      badgeColor:
        "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800/30",
      isFailedEmails: true,
    },
    {
      id: "Opportunity",
      title: "Opportunity",
      icon: <Users className="h-4 w-4 text-teal-500 dark:text-teal-400" />,
      count: appsByStatus.Opportunity.length,
      color: "text-teal-500 dark:text-teal-400",
      bgColor: "bg-teal-500 dark:bg-teal-400",
      badgeColor:
        "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800/30",
    },
    {
      id: "Wishlist",
      title: "Wishlist",
      icon: (
        <ListTodo className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
      ),
      count: appsByStatus.Wishlist.length,
      color: "text-indigo-500 dark:text-indigo-400",
      bgColor: "bg-indigo-500 dark:bg-indigo-400",
      badgeColor:
        "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-800/30",
    },
    {
      id: "Applied",
      title: "Applied",
      icon: (
        <ClipboardCheck className="h-4 w-4 text-blue-500 dark:text-blue-400" />
      ),
      count: appsByStatus.Applied.length,
      color: "text-blue-500 dark:text-blue-400",
      bgColor: "bg-blue-500 dark:bg-blue-400",
      badgeColor:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/30",
    },
    {
      id: "Screening",
      title: "Screening",
      icon: <Phone className="h-4 w-4 text-amber-500 dark:text-amber-400" />,
      count: appsByStatus.Screening.length,
      color: "text-amber-500 dark:text-amber-400",
      bgColor: "bg-amber-500 dark:bg-amber-400",
      badgeColor:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/30",
    },
    {
      id: "Interviewing",
      title: "Interviewing",
      icon: <Video className="h-4 w-4 text-violet-500 dark:text-violet-400" />,
      count: appsByStatus.Interviewing.length,
      color: "text-violet-500 dark:text-violet-400",
      bgColor: "bg-violet-500 dark:bg-violet-400",
      badgeColor:
        "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/30",
    },
    {
      id: "Offer",
      title: "Offer",
      icon: (
        <Award className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
      ),
      count: appsByStatus.Offer.length,
      color: "text-emerald-500 dark:text-emerald-400",
      bgColor: "bg-emerald-500 dark:bg-emerald-400",
      badgeColor:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/30",
    },
    {
      id: "Rejected",
      title: "Rejected",
      icon: <XCircle className="h-4 w-4 text-rose-500 dark:text-rose-400" />,
      count: appsByStatus.Rejected.length,
      color: "text-rose-500 dark:text-rose-400",
      bgColor: "bg-rose-500 dark:bg-rose-400",
      badgeColor:
        "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/30",
    },
    {
      id: "Withdrawn",
      title: "Withdrawn",
      icon: <FileX className="h-4 w-4 text-slate-500 dark:text-slate-400" />,
      count: appsByStatus.Withdrawn.length,
      color: "text-slate-500 dark:text-slate-400",
      bgColor: "bg-slate-500 dark:bg-slate-400",
      badgeColor:
        "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300 dark:border-slate-800/30",
    },
  ];

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full">
        <div className="scrollbar-thin scrollbar-thumb-border/40 scrollbar-track-transparent h-full overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 p-1">
            {columns.map((column) => (
              <ApplicationColumn
                key={column.id}
                id={column.id}
                title={column.title}
                icon={column.icon}
                count={column.count}
                badgeColor={column.badgeColor}
                className="h-full w-[340px] min-w-[340px] flex-shrink-0"
              >
                {column.isFailedEmails ? (
                  // Failed emails column - not draggable
                  <div className="space-y-3">
                    {failedEmailsState.length === 0 ? (
                      <div className="flex h-32 flex-col items-center justify-center text-center">
                        <AlertCircle className="text-muted-foreground mb-2 h-6 w-6" />
                        <p className="text-muted-foreground text-sm">
                          No failed emails
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          All emails processed successfully
                        </p>
                      </div>
                    ) : (
                      failedEmailsState.map((failedEmail) => (
                        <div key={failedEmail.id}>
                          <FailedEmailCard
                            failedEmail={failedEmail}
                            onClick={handleFailedEmailClick}
                          />
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <SortableContext
                    items={appsByStatus[
                      column.id as keyof typeof appsByStatus
                    ].map((app) => app.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {appsByStatus[column.id as keyof typeof appsByStatus]
                        .length === 0 ? (
                        <div className="flex h-32 flex-col items-center justify-center text-center">
                          {column.icon && (
                            <div className="text-muted-foreground mb-2">
                              {column.icon}
                            </div>
                          )}
                          <p className="text-muted-foreground text-sm">
                            No applications
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            Drag cards here
                          </p>
                        </div>
                      ) : (
                        appsByStatus[
                          column.id as keyof typeof appsByStatus
                        ].map((application) => (
                          <div key={application.id}>
                            <ApplicationCard
                              application={application}
                              bgColor={column.bgColor}
                              onApplicationUpdated={onApplicationUpdated}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </SortableContext>
                )}
              </ApplicationColumn>
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeDraggedItem ? (
            <ApplicationCard
              application={activeDraggedItem}
              bgColor={
                columns.find((col) => col.id === activeDraggedItem.status)
                  ?.bgColor || "bg-primary/5"
              }
              onApplicationUpdated={onApplicationUpdated}
            />
          ) : null}
        </DragOverlay>
      </div>

      <ManualCorrectionDialog
        email={selectedFailedEmail}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmitCorrection}
        isSubmitting={isCorrectingEmail}
      />
    </DndContext>
  );
}
