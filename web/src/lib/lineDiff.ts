export type DiffOp = { type: "same" | "add" | "del"; text: string };

const MAX_LINES = 600;

/**
 * Line-level diff (LCS). Bodies here are notes and task descriptions, so the
 * quadratic table is fine; past MAX_LINES per side it degrades to a plain
 * replace so a pasted log cannot freeze the drawer.
 */
export function lineDiff(before: string, after: string): DiffOp[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text) => ({ type: "del" as const, text })),
      ...b.map((text) => ({ type: "add" as const, text }))
    ];
  }
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ type: "del", text: a[i]! });
      i++;
    } else {
      ops.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", text: a[i++]! });
  while (j < m) ops.push({ type: "add", text: b[j++]! });
  return ops;
}

/** Collapse long unchanged runs so a diff shows context, not the whole document. */
export function withContext(ops: DiffOp[], context = 2): Array<DiffOp | { type: "skip"; count: number }> {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, idx) => {
    if (op.type === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(ops.length - 1, idx + context); k++) {
      keep[k] = true;
    }
  });
  const out: Array<DiffOp | { type: "skip"; count: number }> = [];
  let skipped = 0;
  ops.forEach((op, idx) => {
    if (keep[idx]) {
      if (skipped > 0) out.push({ type: "skip", count: skipped });
      skipped = 0;
      out.push(op);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ type: "skip", count: skipped });
  return out;
}
