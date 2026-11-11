const PROGRESS_STORAGE_KEY = "sr_book_reader_progress_v1";
const PREFS_STORAGE_KEY = "sr_book_reader_prefs_v1";
export const STORAGE_SYNC_EVENT = "sr-book-reader-storage-sync";

const isBrowser = () => typeof window !== "undefined";

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function notifySync() {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(STORAGE_SYNC_EVENT));
}

export function getAllReadingProgress() {
  if (!isBrowser()) return {};
  return safeParse(window.localStorage.getItem(PROGRESS_STORAGE_KEY), {});
}

export function getBookProgress(slug) {
  const all = getAllReadingProgress();
  return all[slug] || null;
}

function writeAllReadingProgress(data) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(data));
    notifySync();
  } catch {
    // Ignore storage quota errors cleanly
  }
}

/**
 * Automatically record the last viewed page (0-based pageIndex) so reading can resume later.
 */
export function updateLastReadPage(slug, pageIndex, totalPages) {
  if (!slug || typeof pageIndex !== "number" || pageIndex < 0) return null;
  const all = getAllReadingProgress();
  const existing = all[slug] || { bookmarks: [] };
  const updated = {
    ...existing,
    lastPage: pageIndex,
    totalPages: totalPages || existing.totalPages || 0,
    lastReadAt: new Date().toISOString(),
  };
  all[slug] = updated;
  writeAllReadingProgress(all);
  return updated;
}

/**
 * Set or update the primary "Continue Next Time" bookmark for a book.
 * Also ensures the page is saved in the book's bookmarks list.
 */
export function savePrimaryBookmark(slug, pageIndex, totalPages, note = "") {
  if (!slug || typeof pageIndex !== "number" || pageIndex < 0) return null;
  const all = getAllReadingProgress();
  const existing = all[slug] || { bookmarks: [] };
  const existingBookmarks = Array.isArray(existing.bookmarks) ? existing.bookmarks : [];
  const now = new Date().toISOString();

  const alreadyAtPage = existingBookmarks.find((b) => b.pageIndex === pageIndex);
  const nextBookmarks = alreadyAtPage
    ? existingBookmarks.map((b) =>
        b.pageIndex === pageIndex
          ? { ...b, note: note || b.note, updatedAt: now }
          : b
      )
    : [
        {
          id: `${slug}-${pageIndex}-${Date.now()}`,
          pageIndex,
          note: note || `পৃষ্ঠা ${pageIndex + 1}`,
          createdAt: now,
          updatedAt: now,
        },
        ...existingBookmarks,
      ].sort((a, b) => a.pageIndex - b.pageIndex);

  const updated = {
    ...existing,
    lastPage: pageIndex,
    totalPages: totalPages || existing.totalPages || 0,
    lastReadAt: now,
    bookmark: {
      pageIndex,
      note: note || alreadyAtPage?.note || "",
      updatedAt: now,
    },
    bookmarks: nextBookmarks,
  };

  all[slug] = updated;
  writeAllReadingProgress(all);
  return updated;
}

/**
 * Add an additional named bookmark without necessarily removing older ones,
 * and optionally set it as the primary resume bookmark.
 */
export function addNamedBookmark(slug, pageIndex, totalPages, note, setAsPrimary = true) {
  return savePrimaryBookmark(slug, pageIndex, totalPages, note);
}

/**
 * Remove a saved bookmark by pageIndex.
 * If it was the primary resume bookmark, falls back to the latest remaining bookmark or clears it.
 */
export function removeBookmark(slug, pageIndex) {
  const all = getAllReadingProgress();
  const existing = all[slug];
  if (!existing) return null;

  const existingBookmarks = Array.isArray(existing.bookmarks) ? existing.bookmarks : [];
  const nextBookmarks = existingBookmarks.filter((b) => b.pageIndex !== pageIndex);

  let nextPrimary = existing.bookmark || null;
  if (nextPrimary && nextPrimary.pageIndex === pageIndex) {
    nextPrimary = nextBookmarks.length > 0
      ? {
          pageIndex: nextBookmarks[0].pageIndex,
          note: nextBookmarks[0].note || "",
          updatedAt: nextBookmarks[0].updatedAt || nextBookmarks[0].createdAt,
        }
      : null;
  }

  const updated = {
    ...existing,
    bookmark: nextPrimary,
    bookmarks: nextBookmarks,
  };

  all[slug] = updated;
  writeAllReadingProgress(all);
  return updated;
}

export function clearPrimaryBookmark(slug) {
  const all = getAllReadingProgress();
  const existing = all[slug];
  if (!existing) return null;
  const updated = {
    ...existing,
    bookmark: null,
  };
  all[slug] = updated;
  writeAllReadingProgress(all);
  return updated;
}

export function getResumePageIndex(progress) {
  if (!progress) return 0;
  if (progress.bookmark && typeof progress.bookmark.pageIndex === "number") {
    return progress.bookmark.pageIndex;
  }
  if (typeof progress.lastPage === "number") {
    return progress.lastPage;
  }
  return 0;
}

export function getReaderPrefs() {
  if (!isBrowser()) {
    return { libraryTheme: "dark", readerTheme: "dark" };
  }
  return {
    libraryTheme: "dark",
    readerTheme: "dark",
    ...safeParse(window.localStorage.getItem(PREFS_STORAGE_KEY), {}),
  };
}

export function saveReaderPrefs(partial) {
  if (!isBrowser()) return;
  const next = { ...getReaderPrefs(), ...partial };
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    notifySync();
  } catch {
    // Ignore storage errors
  }
  return next;
}

