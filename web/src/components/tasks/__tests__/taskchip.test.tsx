/**
 * TaskChip hierarchy rendering: the default chip shows the parent line and the
 * sub-task count; the compact (month) chip keeps only a ring and moves the
 * parent into its tooltip. ClosedTasksToggle folds closed tasks into one row.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Entity, Project } from "../../../api/types";
import { ClosedTasksToggle, TaskChip } from "../TaskChip";

const project: Project = {
  id: "p1",
  key: "BOT",
  name: "botnote",
  color: "#ff8800"
} as Project;

function makeTask(overrides: Partial<Entity> = {}): Entity {
  return {
    id: "t1",
    projectId: "p1",
    kind: "task",
    title: "Wire the chips",
    body: "",
    tags: [],
    status: "open",
    actorId: null,
    actorKind: "human",
    idempotencyKey: null,
    parentId: null,
    metadata: {},
    dueAt: null,
    priority: "none",
    sequenceId: 137,
    pinned: false,
    completedAt: null,
    lastAccessedAt: null,
    accessCount: 0,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function wrap(ui: ReactNode) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const parent = { id: "p-129", ref: "BOT-129", title: "Calendar polish", status: "open" };
const subtasks = { total: 4, closed: 1, inProgress: 1 };

describe("TaskChip", () => {
  it("shows the parent line above a sub-task", () => {
    wrap(<TaskChip task={makeTask({ parent })} project={project} />);
    expect(screen.getByText("BOT-129")).toBeInTheDocument();
    expect(screen.getByText("Calendar polish")).toBeInTheDocument();
  });

  it("shows closed/total for a parent", () => {
    wrap(<TaskChip task={makeTask({ subtasks })} project={project} />);
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("compact keeps the ring but drops the numbers and the parent line", () => {
    wrap(<TaskChip task={makeTask({ parent, subtasks })} project={project} compact />);
    expect(screen.queryByText("1/4")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/1 of 4 sub-tasks closed/)).toBeInTheDocument();
    expect(screen.queryByText("BOT-129")).not.toBeInTheDocument();
  });

  it("puts the ref and the parent in the compact tooltip", () => {
    wrap(<TaskChip task={makeTask({ parent })} project={project} compact />);
    const chip = screen.getByRole("button", { name: /Wire the chips/ });
    expect(chip.getAttribute("title")).toBe(
      "BOT-137 · Wire the chips\nSub-task of BOT-129 · Calendar polish"
    );
  });

  it("compact drops the status picker", () => {
    const { container } = wrap(<TaskChip task={makeTask()} project={project} compact />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("ClosedTasksToggle", () => {
  it("labels done tasks and toggles", () => {
    const onToggle = vi.fn();
    render(
      <ClosedTasksToggle
        tasks={[makeTask({ status: "done" }), makeTask({ id: "t2", status: "done" })]}
        expanded={false}
        onToggle={onToggle}
      />
    );
    const button = screen.getByRole("button", { name: /2 done/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("says closed when some were cancelled", () => {
    render(
      <ClosedTasksToggle
        tasks={[makeTask({ status: "done" }), makeTask({ id: "t2", status: "rejected" })]}
        expanded
        onToggle={() => {}}
      />
    );
    const button = screen.getByRole("button", { name: /2 closed/ });
    expect(button).toHaveAttribute("title", "1 done · 1 cancelled");
  });
});
