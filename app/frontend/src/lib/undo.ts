// The undo stack's rule, pure so test/finish-attestation.mjs can drive it: an undo reaches
// only the file whose review is on screen, and says what it undid.
//
// It was one stack for every file (App.tsx `undoStack.current.pop()`). U on file B's review
// popped file A's last change: a name added by hand to A — a file already finished — was
// withdrawn, A exported it readable with verification green because it was no longer a listed
// span, and nothing on screen said anything had happened. Each entry now carries its file,
// and a file with nothing left to undo says so instead of reaching into another.

/** One undoable change: the file it was made in, what its toast called it, and the exact undo
 *  (lib/review.ts restoreRows / withdrawRow, bound to that file's id when it was made). */
export interface UndoEntry { id: number; fileId: string; what: string; run: () => void }

/** how many changes are kept, across every file */
export const UNDO_CAP = 50;

export function pushUndo(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  const next = [...stack, entry];
  return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next;
}

/** The entry an undo in `fileId` takes — that file's latest change, or, from a toast's
 *  button, that toast's own change — and the stack without it. `entry` is null when the file
 *  has nothing to undo; it is never another file's change. */
export function takeUndo(stack: UndoEntry[], fileId: string, entryId?: number): { entry: UndoEntry | null; rest: UndoEntry[] } {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (e.fileId === fileId && (entryId === undefined || e.id === entryId)) {
      return { entry: e, rest: [...stack.slice(0, i), ...stack.slice(i + 1)] };
    }
  }
  return { entry: null, rest: stack };
}

/** a removed file's changes leave with it */
export const dropFile = (stack: UndoEntry[], fileId: string): UndoEntry[] => stack.filter((e) => e.fileId !== fileId);

/** what the screen says after an undo — an undo is never silent */
export const undoneNote = (e: UndoEntry): string => `Undone: ${e.what}`;
/** what U says when this document has nothing left to undo, and a toast's button whose change is gone */
export const NOTHING_TO_UNDO = 'Nothing left to undo in this document. U undoes only changes made in the document on screen.';
export const ALREADY_UNDONE = 'That change was already undone.';
