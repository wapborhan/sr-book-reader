"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as pdfjsLib from "pdfjs-dist";

import { getBookBySlug } from "@/data/books";
import {
  STORAGE_SYNC_EVENT,
  addNamedBookmark,
  getBookProgress,
  getReaderPrefs,
  getResumePageIndex,
  removeBookmark,
  savePrimaryBookmark,
  saveReaderPrefs,
  updateLastReadPage,
} from "@/lib/reading-storage";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
}

function resolveInitialPage(slug) {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get("page");
    if (pageParam) {
      const parsed = parseInt(pageParam, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        return parsed - 1;
      }
    }
  }
  return getResumePageIndex(getBookProgress(slug));
}

/**
 * Renders a single PDF page canvas + selectable text layer with cancellation safety.
 */
function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  rotation,
  readerTheme,
  brightness,
  isBookmarked,
  onToggleBookmark,
  shouldRender = true,
  fallbackSize = { width: 620, height: 860 },
  className = "",
}) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [pageSize, setPageSize] = useState(fallbackSize);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!rendered) {
      setPageSize(fallbackSize);
    }
  }, [fallbackSize, rendered]);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    let textTask = null;

    if (!pdfDoc || !shouldRender) {
      setRendered(false);
      return undefined;
    }

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale, rotation });
        setPageSize({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });

        await renderTask.promise;
        if (cancelled) return;
        setRendered(true);

        // Render selectable text layer
        const textContainer = textLayerRef.current;
        if (textContainer) {
          textContainer.innerHTML = "";
          textContainer.style.setProperty("--scale-factor", `${viewport.scale}`);
          const textContent = await page.getTextContent();
          if (cancelled) return;

          textTask = pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textContainer,
            viewport,
            textDivs: [],
          });
          if (textTask?.promise) {
            await textTask.promise;
          }
        }
      } catch (err) {
        if (err?.name !== "RenderingCancelledException" && !cancelled) {
          // Non-fatal render cancellation or interrupted load
        }
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      try {
        if (renderTask) renderTask.cancel();
        if (textTask?.cancel) textTask.cancel();
      } catch {
        // Ignore cancellation errors
      }
    };
  }, [pdfDoc, pageNumber, scale, rotation, shouldRender]);

  const filterStyle = useMemo(() => {
    const b = brightness / 100;
    if (readerTheme === "dark") {
      return {
        filter: `invert(0.91) hue-rotate(180deg) brightness(${b}) contrast(0.95)`,
      };
    }
    if (readerTheme === "sepia") {
      return {
        filter: `sepia(0.36) brightness(${b * 0.96}) contrast(0.97)`,
      };
    }
    return {
      filter: `brightness(${b})`,
    };
  }, [brightness, readerTheme]);

  return (
    <div
      className={`group/page relative shrink-0 select-text overflow-hidden rounded-lg transition-shadow duration-300 ${
        readerTheme === "dark"
          ? "bg-[#181a20] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.85)] ring-1 ring-white/10"
          : readerTheme === "sepia"
          ? "bg-[#f4ecd8] shadow-[0_18px_45px_-12px_rgba(92,70,40,0.3)] ring-1 ring-stone-400/30"
          : "bg-white shadow-[0_18px_50px_-12px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/10"
      } ${className}`}
      style={{
        width: `${pageSize.width}px`,
        height: `${pageSize.height}px`,
      }}
    >
      {/* Interactive Corner Bookmark Ribbon */}
      <button
        type="button"
        onClick={() => onToggleBookmark(pageNumber - 1)}
        title={
          isBookmarked
            ? `পৃষ্ঠা ${pageNumber} বুকমার্ক করা আছে`
            : `পৃষ্ঠা ${pageNumber} বুকমার্ক করুন`
        }
        className={`absolute right-4 top-0 z-20 flex flex-col items-center rounded-b-lg px-2 pb-2 pt-1.5 text-[10px] font-bold shadow-md transition-all duration-300 ${
          isBookmarked
            ? "animate-ribbon-drop translate-y-0 bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 opacity-100"
            : "-translate-y-2 bg-slate-900/70 text-white opacity-0 backdrop-blur-md group-hover/page:translate-y-0 group-hover/page:opacity-100 hover:bg-amber-500 hover:text-slate-950"
        }`}
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 3a2 2 0 0 0-2 2v16l8-3.5L20 21V5a2 2 0 0 0-2-2H6z" />
        </svg>
        <span className="mt-0.5 leading-none">{pageNumber}</span>
      </button>

      {/* Canvas & Selectable Text Layer */}
      <div className="relative h-full w-full" style={filterStyle}>
        <canvas
          ref={canvasRef}
          className={`block h-full w-full transition-opacity duration-200 ${
            rendered ? "opacity-100" : "opacity-0"
          }`}
        />
        <div ref={textLayerRef} className="textLayer" />
      </div>

      {/* Placeholder Skeleton while page renders */}
      {!rendered && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-40">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
          <span className="text-xs font-semibold">পৃষ্ঠা {pageNumber}</span>
        </div>
      )}

      {/* Subtle Bottom Page Number Stamp */}
      <div className="pointer-events-none absolute bottom-2 right-3 z-10 rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/page:opacity-100">
        {pageNumber}
      </div>
    </div>
  );
}

/**
 * Lazy-rendered Thumbnail card for Sidebar.
 */
function ThumbnailCard({
  pdfDoc,
  pageNumber,
  isActive,
  isBookmarked,
  onSelect,
}) {
  const canvasRef = useRef(null);
  const holderRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    if (!visible || !pdfDoc) return undefined;

    const drawThumb = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 0.24 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch {
        // Ignore canceled thumb renders
      }
    };
    drawThumb();

    return () => {
      cancelled = true;
      try {
        if (renderTask) renderTask.cancel();
      } catch {
        // ignore
      }
    };
  }, [pdfDoc, pageNumber, visible]);

  return (
    <button
      ref={holderRef}
      type="button"
      onClick={() => onSelect(pageNumber - 1)}
      className={`group relative flex flex-col items-center rounded-xl border p-2 transition-all ${
        isActive
          ? "border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40"
          : "border-white/10 bg-white/[0.03] hover:border-amber-500/40"
      }`}
    >
      {isBookmarked && (
        <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950 shadow">
          🔖
        </span>
      )}
      <div className="flex h-28 w-20 items-center justify-center overflow-hidden rounded bg-white/90 shadow-sm">
        <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
      </div>
      <span className="mt-1.5 text-[11px] font-bold opacity-80">
        পৃষ্ঠা {pageNumber}
      </span>
    </button>
  );
}

function PDFReaderInner({ bookName }) {
  const bookMeta = getBookBySlug(bookName);
  const initialPrefs = useMemo(() => getReaderPrefs(), []);

  const [initialPage] = useState(() => resolveInitialPage(bookName));
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(() => getBookProgress(bookName)?.totalPages || 0);
  const [progress, setProgress] = useState(() => getBookProgress(bookName));

  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadPercent, setLoadPercent] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [outline, setOutline] = useState([]);

  // Reading Experience Preferences
  const [readingMode, setReadingMode] = useState(initialPrefs.readingMode || "single"); // single | spread | scroll
  const [readerTheme, setReaderTheme] = useState(initialPrefs.readerTheme || "dark"); // light | sepia | dark
  const [brightness, setBrightness] = useState(initialPrefs.readerBrightness || 100);
  const [fitMode, setFitMode] = useState(initialPrefs.readerScaleMode || "fit-page"); // fit-width | fit-page | custom
  const [customZoom, setCustomZoom] = useState(initialPrefs.readerZoom || 1.15);
  const [rotation, setRotation] = useState(0);

  // UI Panels & Modals
  const [zenMode, setZenMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("bookmarks"); // bookmarks | outline | thumbnails
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [jumpInput, setJumpInput] = useState("");
  const [scrubberPage, setScrubberPage] = useState(null);
  const [toast, setToast] = useState(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Scroll mode virtualization & viewport sizing
  const viewportRef = useRef(null);
  const [viewportBox, setViewportBox] = useState({ width: 900, height: 700 });
  const [basePageDims, setBasePageDims] = useState({ width: 595, height: 842 });
  const [visiblePagesSet, setVisiblePagesSet] = useState(() => new Set([initialPage + 1]));
  const pageRefsMap = useRef(new Map());
  const initialScrollDoneRef = useRef(false);
  const toastTimerRef = useRef(null);
  const resumedToastShownRef = useRef(false);

  const showToast = useCallback((message, type = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3600);
  }, []);

  // Measure reading stage container for crisp Fit-Width & Fit-Page scaling
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const updateSize = () => {
      setViewportBox({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sidebarOpen, zenMode]);

  // Sync storage events
  useEffect(() => {
    const sync = () => setProgress(getBookProgress(bookName));
    window.addEventListener(STORAGE_SYNC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STORAGE_SYNC_EVENT, sync);
      window.removeEventListener("storage", sync);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [bookName]);

  // Load PDF document via pdfjs-dist
  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;

    setPdfDoc(null);
    setLoadError(null);
    setLoadPercent(0);
    initialScrollDoneRef.current = false;

    const loadPdf = async () => {
      try {
        loadingTask = pdfjsLib.getDocument({
          url: `/pdf/${bookName}.pdf`,
          cMapPacked: true,
        });

        loadingTask.onProgress = (p) => {
          if (!cancelled && p.total > 0) {
            setLoadPercent(Math.min(100, Math.round((p.loaded / p.total) * 100)));
          }
        };

        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy();
          return;
        }

        setPdfDoc(doc);
        setTotalPages(doc.numPages);

        // Read base page size from initial page (or page 1)
        const safeInit = Math.min(initialPage, doc.numPages - 1);
        const firstPage = await doc.getPage(safeInit + 1);
        if (!cancelled) {
          const vp = firstPage.getViewport({ scale: 1, rotation: 0 });
          setBasePageDims({ width: vp.width, height: vp.height });
          setCurrentPage(safeInit);
          const updated = updateLastReadPage(bookName, safeInit, doc.numPages);
          if (updated) setProgress(updated);
        }

        // Load outline (Table of Contents)
        try {
          const rawOutline = await doc.getOutline();
          if (!cancelled && Array.isArray(rawOutline)) {
            setOutline(rawOutline);
          }
        } catch {
          // Outline is optional
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || "PDF লোড করা যায়নি");
        }
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (loadingTask) {
        loadingTask.destroy().catch(() => {});
      }
    };
  }, [bookName, initialPage]);

  // Show resume toast when continuing from saved page
  useEffect(() => {
    if (pdfDoc && !resumedToastShownRef.current && initialPage > 0) {
      resumedToastShownRef.current = true;
      const saved = getBookProgress(bookName);
      const isSavedBookmark = saved?.bookmark?.pageIndex === initialPage;
      showToast(
        isSavedBookmark
          ? `বুকমার্ক করা পৃষ্ঠা ${initialPage + 1} থেকে আবার শুরু হয়েছে`
          : `আগের পঠিত পৃষ্ঠা ${initialPage + 1} থেকে আবার শুরু হয়েছে`,
        "resume"
      );
    }
  }, [bookName, initialPage, pdfDoc, showToast]);

  // Compute responsive scale based on fitMode, readingMode, and viewport dimensions
  const computedScale = useMemo(() => {
    const isRotatedSideways = rotation % 180 !== 0;
    const rawW = isRotatedSideways ? basePageDims.height : basePageDims.width;
    const rawH = isRotatedSideways ? basePageDims.width : basePageDims.height;

    const horizontalPadding = readingMode === "spread" ? 84 : 44;
    const verticalPadding = zenMode ? 72 : 120;
    const availW = Math.max(280, viewportBox.width - horizontalPadding);
    const availH = Math.max(320, viewportBox.height - verticalPadding);

    if (fitMode === "custom") {
      return customZoom;
    }
    if (fitMode === "fit-width") {
      const targetW = readingMode === "spread" ? (availW - 24) / 2 : Math.min(availW, 920);
      return Math.max(0.45, Math.min(2.6, targetW / rawW));
    }
    // fit-page
    const targetW = readingMode === "spread" ? (availW - 24) / 2 : availW;
    const scaleW = targetW / rawW;
    const scaleH = availH / rawH;
    return Math.max(0.45, Math.min(2.4, Math.min(scaleW, scaleH)));
  }, [basePageDims, customZoom, fitMode, readingMode, rotation, viewportBox, zenMode]);

  const scaledFallbackSize = useMemo(() => {
    const isRotatedSideways = rotation % 180 !== 0;
    const w = isRotatedSideways ? basePageDims.height : basePageDims.width;
    const h = isRotatedSideways ? basePageDims.width : basePageDims.height;
    return {
      width: Math.floor(w * computedScale),
      height: Math.floor(h * computedScale),
    };
  }, [basePageDims, computedScale, rotation]);

  const savedBookmarksList = useMemo(() => {
    return Array.isArray(progress?.bookmarks) ? progress.bookmarks : [];
  }, [progress]);

  const bookmarkedPagesSet = useMemo(() => {
    const set = new Set();
    savedBookmarksList.forEach((b) => set.add(b.pageIndex));
    if (progress?.bookmark) set.add(progress.bookmark.pageIndex);
    return set;
  }, [progress, savedBookmarksList]);

  const primaryBookmark = progress?.bookmark || null;
  const isCurrentPagePrimaryBookmark = primaryBookmark?.pageIndex === currentPage;

  // Persist current page changes
  const setAndSavePage = useCallback(
    (pageIdx) => {
      const clamped = Math.max(0, totalPages > 0 ? Math.min(pageIdx, totalPages - 1) : pageIdx);
      setCurrentPage(clamped);
      if (totalPages > 0) {
        const updated = updateLastReadPage(bookName, clamped, totalPages);
        if (updated) setProgress(updated);
      }
    },
    [bookName, totalPages]
  );

  // Jump to page across all 3 reading modes
  const jumpToPage = useCallback(
    (pageIdx, behavior = "smooth") => {
      const clamped = Math.max(0, totalPages > 0 ? Math.min(pageIdx, totalPages - 1) : pageIdx);
      if (readingMode === "scroll") {
        const el = pageRefsMap.current.get(clamped + 1);
        if (el) {
          el.scrollIntoView({ behavior, block: "start" });
        }
      }
      setAndSavePage(clamped);
    },
    [readingMode, setAndSavePage, totalPages]
  );

  // Scroll to initialPage once when entering scroll mode
  useEffect(() => {
    if (!pdfDoc || readingMode !== "scroll" || initialScrollDoneRef.current) return;
    const el = pageRefsMap.current.get(currentPage + 1);
    if (el) {
      initialScrollDoneRef.current = true;
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      });
    }
  }, [currentPage, pdfDoc, readingMode]);

  // IntersectionObserver for Continuous Scroll Mode (virtualization + active page detection)
  useEffect(() => {
    if (!pdfDoc || readingMode !== "scroll" || !viewportRef.current) return undefined;

    const rootEl = viewportRef.current;
    const ratioMap = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePagesSet((prev) => {
          const next = new Set(prev);
          entries.forEach((entry) => {
            const pNum = parseInt(entry.target.dataset.pageNumber, 10);
            if (Number.isNaN(pNum)) return;
            if (entry.isIntersecting) {
              next.add(pNum);
              if (pNum > 1) next.add(pNum - 1);
              if (pNum < totalPages) next.add(pNum + 1);
              ratioMap.set(pNum, entry.intersectionRatio);
            } else {
              ratioMap.delete(pNum);
              if (Math.abs(pNum - (currentPage + 1)) > 3) {
                next.delete(pNum);
              }
            }
          });
          return next;
        });

        // Pick most visible page
        let bestPage = null;
        let bestRatio = 0;
        ratioMap.forEach((r, pNum) => {
          if (r > bestRatio) {
            bestRatio = r;
            bestPage = pNum;
          }
        });
        if (bestPage !== null && bestRatio > 0.15) {
          setAndSavePage(bestPage - 1);
        }
      },
      {
        root: rootEl,
        rootMargin: "650px 0px",
        threshold: [0, 0.25, 0.5, 0.75],
      }
    );

    pageRefsMap.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [currentPage, pdfDoc, readingMode, setAndSavePage, totalPages]);

  const handleSaveBookmarkAtPage = useCallback(
    (pageIdx) => {
      const updated = savePrimaryBookmark(bookName, pageIdx, totalPages);
      setProgress(updated);
      showToast(
        `পৃষ্ঠা ${pageIdx + 1} বুকমার্ক করা হয়েছে — পরের বার এখান থেকেই শুরু হবে!`,
        "success"
      );
    },
    [bookName, showToast, totalPages]
  );

  const handleToggleBookmarkAtPage = useCallback(
    (pageIdx) => {
      if (bookmarkedPagesSet.has(pageIdx)) {
        const updated = removeBookmark(bookName, pageIdx);
        setProgress(updated);
        showToast(`পৃষ্ঠা ${pageIdx + 1}-এর বুকমার্ক সরানো হয়েছে`, "info");
      } else {
        handleSaveBookmarkAtPage(pageIdx);
      }
    },
    [bookName, bookmarkedPagesSet, handleSaveBookmarkAtPage, showToast]
  );

  const handleSaveBookmarkWithNote = (e) => {
    e.preventDefault();
    const cleaned = noteInput.trim() || `পৃষ্ঠা ${currentPage + 1}`;
    const updated = addNamedBookmark(bookName, currentPage, totalPages, cleaned, true);
    setProgress(updated);
    setNoteInput("");
    setNoteModalOpen(false);
    showToast(`পৃষ্ঠা ${currentPage + 1} (“${cleaned}”) সেভ করা হয়েছে!`, "success");
  };

  const handleReadingModeChange = (mode) => {
    initialScrollDoneRef.current = false;
    setReadingMode(mode);
    saveReaderPrefs({ readingMode: mode });
  };

  const handleThemeChange = (nextTheme) => {
    setReaderTheme(nextTheme);
    saveReaderPrefs({ readerTheme: nextTheme });
  };

  const handleBrightnessChange = (val) => {
    setBrightness(val);
    saveReaderPrefs({ readerBrightness: val });
  };

  const handleZoomStep = (delta) => {
    const next = Math.max(0.5, Math.min(2.5, Number((computedScale + delta).toFixed(2))));
    setFitMode("custom");
    setCustomZoom(next);
    saveReaderPrefs({ readerScaleMode: "custom", readerZoom: next });
  };

  const handleFitModeChange = (mode) => {
    setFitMode(mode);
    saveReaderPrefs({ readerScaleMode: mode });
  };

  const stepPage = useCallback(
    (direction) => {
      const step = readingMode === "spread" ? 2 : 1;
      jumpToPage(currentPage + direction * step);
    },
    [currentPage, jumpToPage, readingMode]
  );

  // Resolve PDF outline destination to 0-based page index
  const handleOutlineClick = async (item) => {
    if (!pdfDoc || !item.dest) return;
    try {
      const dest =
        typeof item.dest === "string"
          ? await pdfDoc.getDestination(item.dest)
          : item.dest;
      if (Array.isArray(dest) && dest[0]) {
        const idx = await pdfDoc.getPageIndex(dest[0]);
        jumpToPage(idx);
        if (window.innerWidth < 1024) setSidebarOpen(false);
      }
    } catch {
      // Ignore invalid outline target
    }
  };

  // In-PDF Full-Text Search
  const handleSearch = async (e) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q || !pdfDoc) return;
    setSearching(true);
    const matches = [];
    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const combined = textContent.items.map((it) => it.str).join(" ");
        const idx = combined.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 35);
          const end = Math.min(combined.length, idx + q.length + 55);
          matches.push({
            pageIndex: i - 1,
            snippet: (start > 0 ? "..." : "") + combined.slice(start, end) + (end < combined.length ? "..." : ""),
          });
          if (matches.length >= 40) break;
        }
      }
      setSearchResults(matches);
    } finally {
      setSearching(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (readingMode !== "scroll") {
          e.preventDefault();
          stepPage(1);
        }
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (readingMode !== "scroll") {
          e.preventDefault();
          stepPage(-1);
        }
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        handleSaveBookmarkAtPage(currentPage);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setZenMode((v) => !v);
      } else if (e.key === "/") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "Escape") {
        setZenMode(false);
        setSearchOpen(false);
        setSettingsOpen(false);
        setNoteModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, handleSaveBookmarkAtPage, readingMode, stepPage]);

  const handleJumpForm = (e) => {
    e.preventDefault();
    const target = parseInt(jumpInput, 10);
    if (Number.isNaN(target) || target < 1) return;
    jumpToPage(target - 1);
    setJumpInput("");
  };

  const progressPercentage =
    totalPages > 0 ? Math.min(100, Math.round(((currentPage + 1) / totalPages) * 100)) : 0;
  const remainingPages = totalPages > 0 ? Math.max(0, totalPages - (currentPage + 1)) : 0;
  const estMinutesLeft = Math.max(1, Math.round(remainingPages * 1.2));

  const isDarkUI = readerTheme === "dark";
  const deskClass =
    readerTheme === "dark"
      ? "bg-[#090b10] text-slate-100"
      : readerTheme === "sepia"
      ? "bg-[#e7dcc4] text-stone-900"
      : "bg-[#e5e9f0] text-slate-900";

  const chromeClass = isDarkUI
    ? "border-white/10 bg-[#0d111a]/95 text-slate-100"
    : readerTheme === "sepia"
    ? "border-stone-400/35 bg-[#f4ecd8]/95 text-stone-900"
    : "border-slate-300/70 bg-white/95 text-slate-900";

  const spreadLeftPage = currentPage % 2 === 0 ? currentPage : currentPage - 1;
  const spreadRightPage = spreadLeftPage + 1 < totalPages ? spreadLeftPage + 1 : null;

  const pagesArray = useMemo(() => {
    if (!totalPages) return [];
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }, [totalPages]);

  return (
    <div className={`flex h-[100dvh] w-full flex-col overflow-hidden transition-colors duration-300 ${deskClass}`}>
      {/* Ultra-slim Top Reading Progress Line */}
      <div className="h-1 w-full shrink-0 bg-black/15">
        <div
          className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-emerald-400 transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Top Glassmorphic Reader Toolbar */}
      {!zenMode && (
        <header className={`z-30 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur-xl sm:px-5 ${chromeClass}`}>
          {/* Left: Library Back + Sidebar Toggle + Book Info */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all hover:-translate-x-0.5 ${
                isDarkUI
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-black/10 bg-black/5 hover:bg-black/10"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">লাইব্রেরি</span>
            </Link>

            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              title="বুকমার্ক, সূচীপত্র ও পৃষ্ঠা তালিকা"
              className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                sidebarOpen
                  ? "border-amber-500 bg-amber-500/20 text-amber-500"
                  : isDarkUI
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-black/10 bg-black/5 hover:bg-black/10"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
              <span className="hidden md:inline">সূচী ও বুকমার্ক</span>
              {savedBookmarksList.length > 0 && (
                <span className="rounded-full bg-amber-500/25 px-1.5 py-0.2 text-[10px] text-amber-400">
                  {savedBookmarksList.length}
                </span>
              )}
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-sm font-extrabold sm:text-base">
                {bookMeta ? bookMeta.title : bookName.replaceAll("-", " ")}
              </h1>
              <p className="truncate text-[11px] opacity-65">
                {bookMeta ? bookMeta.author : "Book Reader"} • পৃষ্ঠা {currentPage + 1}
                {totalPages > 0 ? ` / ${totalPages}` : ""}
              </p>
            </div>
          </div>

          {/* Center: Reading Layout Switcher (Single / Spread / Scroll) */}
          <div
            className={`hidden items-center rounded-xl border p-0.5 lg:flex ${
              isDarkUI ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"
            }`}
          >
            {[
              { id: "single", label: "📖 ১ পৃষ্ঠা" },
              { id: "spread", label: "📚 ২ পৃষ্ঠা" },
              { id: "scroll", label: "📜 স্ক্রল" },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleReadingModeChange(mode.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  readingMode === mode.id
                    ? "bg-amber-500 text-slate-950 shadow-sm"
                    : "opacity-75 hover:opacity-100"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Right: Bookmark, Search, Appearance, Zen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {primaryBookmark && primaryBookmark.pageIndex !== currentPage && (
              <button
                type="button"
                onClick={() => jumpToPage(primaryBookmark.pageIndex)}
                className="hidden items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-slate-950 xl:inline-flex"
              >
                🔖 পৃ. {primaryBookmark.pageIndex + 1} এ যান
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveBookmarkAtPage(currentPage)}
              title="শর্টকাট: B"
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                isCurrentPagePrimaryBookmark
                  ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md shadow-amber-500/25"
                  : "border border-amber-500/40 bg-amber-500/15 text-amber-500 hover:bg-amber-500 hover:text-slate-950"
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 3a2 2 0 0 0-2 2v16l8-3.5L20 21V5a2 2 0 0 0-2-2H6z" />
              </svg>
              <span>
                {isCurrentPagePrimaryBookmark
                  ? `সেভ করা (পৃ.${currentPage + 1})`
                  : `বুকমার্ক (পৃ.${currentPage + 1})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setNoteModalOpen(true)}
              title="নোটসহ বুকমার্ক"
              className={`hidden rounded-xl border px-2.5 py-1.5 text-xs font-bold sm:inline-flex ${
                isDarkUI
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-black/10 bg-black/5 hover:bg-black/10"
              }`}
            >
              + নোট
            </button>

            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              title="বইয়ের ভেতর খুঁজুন (/)"
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition-colors ${
                searchOpen
                  ? "border-amber-500 bg-amber-500/20 text-amber-500"
                  : isDarkUI
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-black/10 bg-black/5 hover:bg-black/10"
              }`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              title="পড়ার থিম, জুম ও সেটিংস"
              className={`flex h-8 items-center gap-1 rounded-xl border px-2.5 text-xs font-bold transition-colors ${
                settingsOpen
                  ? "border-amber-500 bg-amber-500/20 text-amber-500"
                  : isDarkUI
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-black/10 bg-black/5 hover:bg-black/10"
              }`}
            >
              <span>Aa</span>
            </button>

            <button
              type="button"
              onClick={() => setZenMode(true)}
              title="ফোকাস মোড (F)"
              className={`hidden h-8 items-center rounded-xl border px-2.5 text-xs font-bold md:inline-flex ${
                isDarkUI
                  ? "border-white/10 bg-white/5 hover:bg-white/10"
                  : "border-black/10 bg-black/5 hover:bg-black/10"
              }`}
            >
              ফোকাস
            </button>
          </div>
        </header>
      )}

      {/* Appearance, Layout & Zoom Settings Popover */}
      {settingsOpen && !zenMode && (
        <div
          className={`fixed right-4 top-16 z-40 w-80 rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${chromeClass}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider opacity-70">
              রিডিং সেটিংস
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>

          {/* Eye Comfort Theme */}
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-bold">চোখের আরামের থিম</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "light", label: "হালকা", bg: "bg-white text-slate-900 border-slate-300" },
                { id: "sepia", label: "সেপিয়া", bg: "bg-[#f4ecd8] text-stone-900 border-amber-700/30" },
                { id: "dark", label: "নাইট ডার্ক", bg: "bg-[#141720] text-slate-100 border-white/20" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleThemeChange(t.id)}
                  className={`rounded-xl border py-2 text-xs font-bold transition-all ${t.bg} ${
                    readerTheme === t.id ? "ring-2 ring-amber-500 scale-[1.03]" : "opacity-80"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reading Mode */}
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-bold">পড়ার ধরন</div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: "single", label: "১ পৃষ্ঠা" },
                { id: "spread", label: "২ পৃষ্ঠা" },
                { id: "scroll", label: "স্ক্রল" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleReadingModeChange(m.id)}
                  className={`rounded-xl border py-1.5 text-xs font-bold ${
                    readingMode === m.id
                      ? "border-amber-500 bg-amber-500 text-slate-950"
                      : "border-white/10 bg-black/10 opacity-80"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom & Fit Controls */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold">
              <span>জুম ও ফিট</span>
              <span className="text-amber-500">{Math.round(computedScale * 100)}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleZoomStep(-0.15)}
                className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-bold hover:bg-amber-500/20"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => handleFitModeChange("fit-page")}
                className={`flex-1 rounded-lg border py-1 text-[11px] font-bold ${
                  fitMode === "fit-page"
                    ? "border-amber-500 bg-amber-500/20 text-amber-500"
                    : "border-white/15 opacity-75"
                }`}
              >
                ফিট পেজ
              </button>
              <button
                type="button"
                onClick={() => handleFitModeChange("fit-width")}
                className={`flex-1 rounded-lg border py-1 text-[11px] font-bold ${
                  fitMode === "fit-width"
                    ? "border-amber-500 bg-amber-500/20 text-amber-500"
                    : "border-white/15 opacity-75"
                }`}
              >
                ফিট প্রস্থ
              </button>
              <button
                type="button"
                onClick={() => handleZoomStep(0.15)}
                className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-bold hover:bg-amber-500/20"
              >
                +
              </button>
            </div>
          </div>

          {/* Brightness & Rotate */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs font-bold">
              <span>উজ্জ্বলতা (চোখের আরাম)</span>
              <span>{brightness}%</span>
            </div>
            <input
              type="range"
              min={65}
              max={115}
              value={brightness}
              onChange={(e) => handleBrightnessChange(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
            >
              ↻ পৃষ্ঠা ঘোরান
            </button>
            <a
              href={`/pdf/${bookName}.pdf`}
              download={`${bookName}.pdf`}
              className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
            >
              ↓ ডাউনলোড
            </a>
          </div>
        </div>
      )}

      {/* In-PDF Search Drawer */}
      {searchOpen && !zenMode && (
        <div
          className={`fixed right-4 top-16 z-40 w-80 max-w-[92vw] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${chromeClass}`}
        >
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="বইয়ের শব্দ খুঁজুন..."
              className="flex-1 rounded-xl border border-white/15 bg-black/15 px-3 py-2 text-xs outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={searching}
              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50"
            >
              {searching ? "..." : "খুঁজুন"}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              <div className="text-[11px] font-semibold opacity-70">
                {searchResults.length}টি পৃষ্ঠায় পাওয়া গেছে
              </div>
              {searchResults.map((res, idx) => (
                <button
                  key={`${res.pageIndex}-${idx}`}
                  type="button"
                  onClick={() => jumpToPage(res.pageIndex)}
                  className="block w-full rounded-xl border border-white/10 bg-black/10 p-2.5 text-left transition-colors hover:border-amber-500/50"
                >
                  <div className="text-xs font-bold text-amber-500">
                    পৃষ্ঠা {res.pageIndex + 1}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] opacity-80">
                    {res.snippet}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Split Area: Left Sidebar + Reading Stage */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Collapsible Left Sidebar */}
        {sidebarOpen && !zenMode && (
          <aside className={`z-20 flex h-full w-72 shrink-0 flex-col border-r backdrop-blur-xl sm:w-80 ${chromeClass}`}>
            {/* Sidebar Tabs */}
            <div className="grid grid-cols-3 gap-1 border-b border-white/10 p-2">
              {[
                { id: "bookmarks", label: "🔖 বুকমার্ক" },
                { id: "outline", label: "📑 সূচী" },
                { id: "thumbnails", label: "🖼️ পৃষ্ঠা" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id)}
                  className={`rounded-lg py-1.5 text-xs font-bold transition-colors ${
                    sidebarTab === tab.id
                      ? "bg-amber-500 text-slate-950"
                      : "opacity-75 hover:opacity-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {sidebarTab === "bookmarks" && (
                <div className="space-y-3">
                  <form onSubmit={handleJumpForm} className="flex gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={totalPages || undefined}
                      value={jumpInput}
                      onChange={(e) => setJumpInput(e.target.value)}
                      placeholder={`পৃষ্ঠায় যান (১–${totalPages || "..."})`}
                      className="flex-1 rounded-xl border border-white/15 bg-black/15 px-3 py-2 text-xs outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950"
                    >
                      যান
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={() => handleSaveBookmarkAtPage(currentPage)}
                    className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2.5 text-xs font-extrabold text-slate-950 shadow-md"
                  >
                    🔖 বর্তমান পৃষ্ঠা ({currentPage + 1}) বুকমার্ক করুন
                  </button>

                  {savedBookmarksList.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-500/30 p-5 text-center text-xs opacity-75">
                      কোনো বুকমার্ক সেভ করা নেই। পড়া থামানোর আগে বুকমার্ক করে রাখুন, পরের বার ঠিক এখান থেকেই শুরু হবে।
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {savedBookmarksList.map((bm) => {
                        const isPrimary = primaryBookmark?.pageIndex === bm.pageIndex;
                        return (
                          <div
                            key={bm.id}
                            className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors ${
                              isPrimary
                                ? "border-amber-500/60 bg-amber-500/10"
                                : "border-white/10 bg-black/10 hover:border-amber-500/40"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => jumpToPage(bm.pageIndex)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
                                <span>{isPrimary ? "🔖" : "📌"}</span>
                                <span>পৃষ্ঠা {bm.pageIndex + 1}</span>
                                {isPrimary && (
                                  <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px]">
                                    রিজিউম
                                  </span>
                                )}
                              </div>
                              {bm.note && (
                                <div className="mt-0.5 truncate text-[11px] opacity-80">
                                  {bm.note}
                                </div>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = removeBookmark(bookName, bm.pageIndex);
                                setProgress(updated);
                              }}
                              className="rounded-lg p-1 text-xs opacity-60 hover:bg-rose-500/20 hover:text-rose-400 hover:opacity-100"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {sidebarTab === "outline" && (
                <div className="space-y-1.5">
                  {outline.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-500/30 p-5 text-center text-xs opacity-75">
                      এই PDF বইটিতে আলাদা কোনো ডিজিটাল সূচীপত্র যুক্ত নেই। পৃষ্ঠা থাম্বনেইল বা সার্চ ব্যবহার করুন।
                    </div>
                  ) : (
                    outline.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => handleOutlineClick(item)}
                          className="w-full rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-left text-xs font-semibold transition-colors hover:border-amber-500/50 hover:text-amber-400"
                        >
                          {item.title}
                        </button>
                        {Array.isArray(item.items) && item.items.length > 0 && (
                          <div className="space-y-1 pl-3">
                            {item.items.map((sub, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => handleOutlineClick(sub)}
                                className="w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] opacity-80 hover:bg-white/5 hover:text-amber-400"
                              >
                                • {sub.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {sidebarTab === "thumbnails" && pdfDoc && (
                <div className="grid grid-cols-2 gap-2.5">
                  {pagesArray.map((pNum) => (
                    <ThumbnailCard
                      key={pNum}
                      pdfDoc={pdfDoc}
                      pageNumber={pNum}
                      isActive={currentPage === pNum - 1}
                      isBookmarked={bookmarkedPagesSet.has(pNum - 1)}
                      onSelect={(idx) => jumpToPage(idx)}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main Reading Desk Viewport */}
        <div
          ref={viewportRef}
          className="relative flex-1 overflow-auto px-3 pb-24 pt-5 sm:px-6"
        >
          {loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="text-5xl">📄</div>
              <h2 className="text-xl font-bold">বইটি লোড করা যায়নি</h2>
              <p className="max-w-md text-sm opacity-75">{loadError}</p>
              <Link
                href="/"
                className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950"
              >
                লাইব্রেরিতে ফিরে যান
              </Link>
            </div>
          ) : !pdfDoc ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500/25 border-t-amber-500" />
              <div className="text-sm font-bold">
                বইটি প্রস্তুত হচ্ছে... {loadPercent > 0 ? `${loadPercent}%` : ""}
              </div>
              <div className="h-2 w-64 overflow-hidden rounded-full bg-slate-500/25">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-200"
                  style={{ width: `${Math.max(8, loadPercent)}%` }}
                />
              </div>
            </div>
          ) : readingMode === "single" ? (
            /* Single Page Book Flip View */
            <div className="relative flex min-h-full items-center justify-center">
              {/* Left Prev Page Button */}
              <button
                type="button"
                disabled={currentPage <= 0}
                onClick={() => stepPage(-1)}
                aria-label="আগের পৃষ্ঠা"
                className="fixed left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/65 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-amber-500 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-20 md:flex"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <div key={`single-${currentPage}`} className="animate-page-enter">
                <PdfPageCanvas
                  pdfDoc={pdfDoc}
                  pageNumber={currentPage + 1}
                  scale={computedScale}
                  rotation={rotation}
                  readerTheme={readerTheme}
                  brightness={brightness}
                  isBookmarked={bookmarkedPagesSet.has(currentPage)}
                  onToggleBookmark={handleToggleBookmarkAtPage}
                  fallbackSize={scaledFallbackSize}
                />
              </div>

              {/* Right Next Page Button */}
              <button
                type="button"
                disabled={currentPage >= totalPages - 1}
                onClick={() => stepPage(1)}
                aria-label="পরের পৃষ্ঠা"
                className="fixed right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/65 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-amber-500 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-20 md:flex"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          ) : readingMode === "spread" ? (
            /* Open Two-Page Book Spread View */
            <div className="relative flex min-h-full items-center justify-center">
              <button
                type="button"
                disabled={spreadLeftPage <= 0}
                onClick={() => stepPage(-1)}
                aria-label="আগের দুই পৃষ্ঠা"
                className="fixed left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/65 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-amber-500 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-20 md:flex"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>

              <div
                key={`spread-${spreadLeftPage}`}
                className="animate-page-enter relative flex items-center justify-center gap-0.5 rounded-2xl p-1 shadow-2xl"
              >
                <PdfPageCanvas
                  pdfDoc={pdfDoc}
                  pageNumber={spreadLeftPage + 1}
                  scale={computedScale}
                  rotation={rotation}
                  readerTheme={readerTheme}
                  brightness={brightness}
                  isBookmarked={bookmarkedPagesSet.has(spreadLeftPage)}
                  onToggleBookmark={handleToggleBookmarkAtPage}
                  fallbackSize={scaledFallbackSize}
                  className="rounded-r-none"
                />
                {spreadRightPage !== null && (
                  <>
                    {/* Book Spine Shadow Crease */}
                    <div className="pointer-events-none z-10 h-full w-2 bg-gradient-to-r from-black/25 via-black/5 to-black/20" />
                    <PdfPageCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={spreadRightPage + 1}
                      scale={computedScale}
                      rotation={rotation}
                      readerTheme={readerTheme}
                      brightness={brightness}
                      isBookmarked={bookmarkedPagesSet.has(spreadRightPage)}
                      onToggleBookmark={handleToggleBookmarkAtPage}
                      fallbackSize={scaledFallbackSize}
                      className="rounded-l-none"
                    />
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={spreadLeftPage + 2 >= totalPages}
                onClick={() => stepPage(1)}
                aria-label="পরের দুই পৃষ্ঠা"
                className="fixed right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/65 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-amber-500 hover:text-slate-950 disabled:pointer-events-none disabled:opacity-20 md:flex"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          ) : (
            /* Continuous Virtualized Scroll Mode */
            <div className="mx-auto flex flex-col items-center gap-5">
              {pagesArray.map((pNum) => (
                <div
                  key={pNum}
                  data-page-number={pNum}
                  ref={(el) => {
                    if (el) pageRefsMap.current.set(pNum, el);
                    else pageRefsMap.current.delete(pNum);
                  }}
                >
                  <PdfPageCanvas
                    pdfDoc={pdfDoc}
                    pageNumber={pNum}
                    scale={computedScale}
                    rotation={rotation}
                    readerTheme={readerTheme}
                    brightness={brightness}
                    isBookmarked={bookmarkedPagesSet.has(pNum - 1)}
                    onToggleBookmark={handleToggleBookmarkAtPage}
                    shouldRender={visiblePagesSet.has(pNum)}
                    fallbackSize={scaledFallbackSize}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Apple-Books Style Page Scrubber Dock */}
      {pdfDoc && (
        <div
          className={`fixed bottom-3 left-1/2 z-30 w-[94vw] max-w-2xl -translate-x-1/2 transition-all duration-300 ${
            zenMode ? "opacity-20 hover:opacity-100" : "opacity-100"
          }`}
        >
          <div className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-2 shadow-2xl backdrop-blur-xl sm:gap-3.5 ${chromeClass}`}>
            <button
              type="button"
              disabled={currentPage <= 0}
              onClick={() => stepPage(-1)}
              className="rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-amber-500/20 disabled:opacity-30"
            >
              ◀
            </button>

            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span>
                  পৃষ্ঠা {(scrubberPage !== null ? scrubberPage : currentPage) + 1} / {totalPages}
                </span>
                <span className="opacity-70">
                  {progressPercentage}% • প্রায় {estMinutesLeft} মি. বাকি
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalPages - 1)}
                value={scrubberPage !== null ? scrubberPage : currentPage}
                onChange={(e) => setScrubberPage(Number(e.target.value))}
                onMouseUp={() => {
                  if (scrubberPage !== null) {
                    jumpToPage(scrubberPage);
                    setScrubberPage(null);
                  }
                }}
                onTouchEnd={() => {
                  if (scrubberPage !== null) {
                    jumpToPage(scrubberPage);
                    setScrubberPage(null);
                  }
                }}
                onKeyUp={() => {
                  if (scrubberPage !== null) {
                    jumpToPage(scrubberPage);
                    setScrubberPage(null);
                  }
                }}
                className="h-1.5 w-full cursor-pointer accent-amber-500"
              />
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => stepPage(1)}
              className="rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-amber-500/20 disabled:opacity-30"
            >
              ▶
            </button>

            {zenMode && (
              <button
                type="button"
                onClick={() => setZenMode(false)}
                className="rounded-xl bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950"
              >
                বের হন
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add Bookmark Note Modal */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveBookmarkWithNote}
            className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${chromeClass}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">
                🔖 পৃষ্ঠা {currentPage + 1}-এ নোটসহ বুকমার্ক
              </h2>
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="rounded-lg px-2 py-1 text-xs opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs opacity-70">
              অধ্যায়ের নাম বা যেখান থেকে পড়বেন তার একটি নোট লিখে রাখুন।
            </p>
            <input
              type="text"
              autoFocus
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="যেমন: অধ্যায় ৩ — প্রিয় অংশ"
              className="mt-3 w-full rounded-xl border border-white/15 bg-black/15 px-3.5 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold opacity-75 hover:opacity-100"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                বুকমার্ক সেভ করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 animate-fade-up">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-amber-400/35 bg-slate-950/90 px-4 py-2.5 text-xs font-bold text-white shadow-2xl backdrop-blur-xl sm:text-sm">
            <span>{toast.type === "success" ? "🔖" : "📖"}</span>
            <span>{toast.message}</span>
            {toast.type === "resume" && currentPage > 0 && (
              <button
                type="button"
                onClick={() => {
                  jumpToPage(0);
                  setToast(null);
                }}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-white/20"
              >
                পৃষ্ঠা ১-এ যান
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PDFViewer = ({ bookName }) => {
  if (!bookName) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#090b10] p-6 text-white">
        <h1 className="text-2xl font-bold">বই পাওয়া যায়নি</h1>
        <Link href="/" className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950">
          লাইব্রেরিতে ফিরে যান
        </Link>
      </div>
    );
  }
  return <PDFReaderInner bookName={bookName} />;
};

export default PDFViewer;
