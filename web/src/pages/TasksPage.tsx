import { useState } from "react";
import { DayView } from "../components/tasks/DayView";
import { InboxRail } from "../components/tasks/InboxRail";
import { MonthView } from "../components/tasks/MonthView";
import { TasksHeader } from "../components/tasks/TasksHeader";
import { WeekView } from "../components/tasks/WeekView";
import type { CalendarView } from "../components/tasks/utils";
import { useIsMobile } from "../hooks/useIsMobile";

export function TasksPage() {
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [projectIds, setProjectIds] = useState<string[] | null>(null);
  const [inboxCollapsed, setInboxCollapsed] = useState(isMobile);

  // Multi-column calendars don't fit narrow screens; force the day view there.
  const effectiveView: CalendarView = isMobile ? "day" : view;

  return (
    <div className="h-full flex flex-col">
      <TasksHeader
        view={effectiveView}
        setView={setView}
        anchor={anchor}
        setAnchor={setAnchor}
        projectIds={projectIds}
        setProjectIds={setProjectIds}
      />
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-hidden bg-bg">
          {effectiveView === "day" && <DayView anchor={anchor} projectIds={projectIds} />}
          {effectiveView === "week" && <WeekView anchor={anchor} projectIds={projectIds} />}
          {effectiveView === "month" && <MonthView anchor={anchor} projectIds={projectIds} />}
        </div>
        <InboxRail
          projectIds={projectIds}
          collapsed={inboxCollapsed}
          onToggle={() => setInboxCollapsed((v) => !v)}
        />
      </div>
    </div>
  );
}
