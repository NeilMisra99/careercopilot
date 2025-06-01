"use client";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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
import { motion } from "framer-motion";
import {
  AlertCircle,
  Award,
  ClipboardCheck,
  FileX,
  ListTodo,
  Phone,
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
        router.refresh();
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
        router.refresh(); // Refresh data to ensure consistency
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
        router.refresh(); // Refresh to show new application
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
      isFailedEmails: true,
    },
    {
      id: "Wishlist",
      title: "Wishlist",
      icon: <ListTodo className="h-4 w-4 text-blue-500" />,
      count: appsByStatus.Wishlist.length,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      id: "Applied",
      title: "Applied",
      icon: <ClipboardCheck className="h-4 w-4 text-violet-500" />,
      count: appsByStatus.Applied.length,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      id: "Screening",
      title: "Screening",
      icon: <Phone className="h-4 w-4 text-orange-500" />,
      count: appsByStatus.Screening.length,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      id: "Interviewing",
      title: "Interviewing",
      icon: <Video className="h-4 w-4 text-indigo-500" />,
      count: appsByStatus.Interviewing.length,
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10",
    },
    {
      id: "Offer",
      title: "Offer",
      icon: <Award className="h-4 w-4 text-green-500" />,
      count: appsByStatus.Offer.length,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      id: "Rejected",
      title: "Rejected",
      icon: <XCircle className="h-4 w-4 text-red-500" />,
      count: appsByStatus.Rejected.length,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      id: "Withdrawn",
      title: "Withdrawn",
      icon: <FileX className="h-4 w-4 text-gray-500" />,
      count: appsByStatus.Withdrawn.length,
      color: "text-gray-500",
      bgColor: "bg-gray-500/10",
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
      <div className="flex h-full flex-col">
        <ScrollArea className="max-h-full min-h-0 flex-1">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="flex h-[calc(100vh-200px)] gap-4 py-4 pr-6 pl-6"
          >
            {columns.map((column, index) => (
              <ApplicationColumn
                key={column.id}
                id={column.id}
                title={column.title}
                icon={column.icon}
                count={column.count}
                index={index}
                className={`h-full w-[340px] min-w-[340px] snap-center ${
                  index !== columns.length - 1
                    ? "border-border/30 border-r"
                    : ""
                }`}
              >
                {column.isFailedEmails ? (
                  // Failed emails column - not draggable
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: index * 0.1 + 0.3 }}
                    className="space-y-3"
                  >
                    {failedEmailsState.length === 0 ? (
                      <div className="text-muted-foreground/60 border-border/50 flex h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-white/50 p-6 text-center text-sm dark:bg-gray-800/30">
                        <AlertCircle className="text-muted-foreground/40 mb-2 h-8 w-8" />
                        <p className="font-medium">No failed emails</p>
                        <p className="text-muted-foreground/50 mt-1 text-xs">
                          All emails processed successfully
                        </p>
                      </div>
                    ) : (
                      failedEmailsState.map((failedEmail, emailIndex) => (
                        <motion.div
                          key={failedEmail.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.3,
                            delay: index * 0.1 + 0.4 + emailIndex * 0.05,
                          }}
                        >
                          <FailedEmailCard
                            failedEmail={failedEmail}
                            onClick={handleFailedEmailClick}
                          />
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                ) : (
                  <SortableContext
                    items={appsByStatus[
                      column.id as keyof typeof appsByStatus
                    ].map((app) => app.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: index * 0.1 + 0.3 }}
                      className="space-y-3"
                    >
                      {appsByStatus[column.id as keyof typeof appsByStatus]
                        .length === 0 ? (
                        <div className="text-muted-foreground/60 border-border/50 flex h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-white/50 p-6 text-center text-sm dark:bg-gray-800/30">
                          {column.icon && (
                            <div className="mb-2 opacity-40">{column.icon}</div>
                          )}
                          <p className="font-medium">No applications</p>
                          <p className="text-muted-foreground/50 mt-1 text-xs">
                            Drag cards here
                          </p>
                        </div>
                      ) : (
                        appsByStatus[
                          column.id as keyof typeof appsByStatus
                        ].map((application, appIndex) => (
                          <motion.div
                            key={application.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: index * 0.1 + 0.4 + appIndex * 0.05,
                            }}
                          >
                            <ApplicationCard
                              application={application}
                              color={column.color}
                              bgColor={column.bgColor}
                              onApplicationUpdated={onApplicationUpdated}
                            />
                          </motion.div>
                        ))
                      )}
                    </motion.div>
                  </SortableContext>
                )}
              </ApplicationColumn>
            ))}
          </motion.div>
          <ScrollBar orientation="horizontal" className="bg-border/20 h-2" />
        </ScrollArea>
        <DragOverlay>
          {activeDraggedItem ? (
            <ApplicationCard
              application={activeDraggedItem}
              color={
                columns.find((col) => col.id === activeDraggedItem.status)
                  ?.color || "text-primary"
              }
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
