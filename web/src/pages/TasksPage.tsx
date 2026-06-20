import { useState } from "react";
import { DayView } from "../components/tasks/DayView";
import { InboxRail } from "../components/tasks/InboxRail";
import { MonthView } from "../components/tasks/MonthView";
import { TasksHeader } from "../components/tasks/TasksHeader";
import { WeekView } from "../components/tasks/WeekView";
import type { CalendarView } from "../components/tasks/utils";

export function TasksPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [projectIds, setProjectIds] = useState<string[] | null>(null);
  const [inboxCollapsed, setInboxCollapsed] = useState(false);

  return (
    <div className="h-full flex flex-col">
      <TasksHeader
        view={view}
        setView={setView}
        anchor={anchor}
        setAnchor={setAnchor}
        projectIds={projectIds}
        setProjectIds={setProjectIds}
      />
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-hidden bg-bg">
          {view === "day" && <DayView anchor={anchor} projectIds={projectIds} />}
          {view === "week" && <WeekView anchor={anchor} projectIds={projectIds} />}
          {view === "month" && <MonthView anchor={anchor} projectIds={projectIds} />}
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
