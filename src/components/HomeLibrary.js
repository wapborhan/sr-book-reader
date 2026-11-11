"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BOOKS, BOOK_CATEGORIES } from "@/data/books";
import {
  STORAGE_SYNC_EVENT,
  clearPrimaryBookmark,
  getAllReadingProgress,
  getReaderPrefs,
  getResumePageIndex,
  saveReaderPrefs,
} from "@/lib/reading-storage";

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "এইমাত্র";
  if (minutes < 60) return `${minutes} মিনিট আগে`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  return `${days} দিন আগে`;
}

function getProgressPercent(progress) {
  if (!progress) return 0;
  const pageIndex = getResumePageIndex(progress);
  const total = progress.totalPages || 0;
  if (!total) return pageIndex > 0 ? 5 : 0;
  return Math.min(100, Math.max(1, Math.round(((pageIndex + 1) / total) * 100)));
}

export default function HomeLibrary() {
  const [progressMap, setProgressMap] = useState({});
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("সব বই");
  const [sortBy, setSortBy] = useState("default");
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setMounted(true);
    const syncState = () => {
      setProgressMap(getAllReadingProgress());
      const prefs = getReaderPrefs();
      if (prefs.libraryTheme) setTheme(prefs.libraryTheme);
    };

    syncState();
    window.addEventListener(STORAGE_SYNC_EVENT, syncState);
    window.addEventListener("storage", syncState);
    return () => {
      window.removeEventListener(STORAGE_SYNC_EVENT, syncState);
      window.removeEventListener("storage", syncState);
    };
  }, []);

  const isDark = theme === "dark";

  const toggleTheme = () => {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    saveReaderPrefs({ libraryTheme: next });
  };

  // Books with saved bookmarks or reading history, sorted by most recent
  const activeBooks = useMemo(() => {
    return BOOKS.map((book) => ({
      book,
      progress: progressMap[book.slug] || null,
    }))
      .filter(({ progress }) => {
        if (!progress) return false;
        const hasBookmark = Boolean(progress.bookmark);
        const hasProgress = typeof progress.lastPage === "number" && progress.lastPage > 0;
        const hasAnyBookmarks = Array.isArray(progress.bookmarks) && progress.bookmarks.length > 0;
        return hasBookmark || hasProgress || hasAnyBookmarks || Boolean(progress.lastReadAt);
      })
      .sort((a, b) => {
        const timeA = new Date(a.progress?.bookmark?.updatedAt || a.progress?.lastReadAt || 0).getTime();
        const timeB = new Date(b.progress?.bookmark?.updatedAt || b.progress?.lastReadAt || 0).getTime();
        return timeB - timeA;
      });
  }, [progressMap]);

  const latestContinue = activeBooks[0] || null;

  const stats = useMemo(() => {
    let bookmarkedCount = 0;
    let startedCount = 0;
    BOOKS.forEach((b) => {
      const p = progressMap[b.slug];
      if (!p) return;
      if (p.bookmark || (p.bookmarks && p.bookmarks.length > 0)) bookmarkedCount += 1;
      if (p.lastReadAt || p.lastPage > 0) startedCount += 1;
    });
    return {
      totalBooks: BOOKS.length,
      bookmarkedCount,
      startedCount,
    };
  }, [progressMap]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = BOOKS.filter((book) => {
      const p = progressMap[book.slug];
      const isBookmarked = Boolean(p?.bookmark || (p?.bookmarks && p.bookmarks.length > 0));

      if (activeCategory === "বুকমার্ক করা" && !isBookmarked) return false;
      if (
        activeCategory !== "সব বই" &&
        activeCategory !== "বুকমার্ক করা" &&
        book.category !== activeCategory
      ) {
        return false;
      }

      if (!q) return true;
      return (
        book.title.toLowerCase().includes(q) ||
        book.englishTitle.toLowerCase().includes(q) ||
        book.author.toLowerCase().includes(q) ||
        book.category.toLowerCase().includes(q)
      );
    });

    if (sortBy === "recent") {
      return [...list].sort((a, b) => {
        const tA = new Date(progressMap[a.slug]?.lastReadAt || 0).getTime();
        const tB = new Date(progressMap[b.slug]?.lastReadAt || 0).getTime();
        return tB - tA;
      });
    }
    if (sortBy === "progress") {
      return [...list].sort((a, b) => {
        return getProgressPercent(progressMap[b.slug]) - getProgressPercent(progressMap[a.slug]);
      });
    }
    if (sortBy === "title") {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, "bn"));
    }
    return list;
  }, [activeCategory, progressMap, searchQuery, sortBy]);

  return (
    <div
      className={`min-h-screen transition-colors duration-500 ${
        isDark
          ? "bg-[#090b10] text-slate-100"
          : "bg-[#faf7f2] text-slate-900"
      }`}
    >
      {/* Ambient Animated Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className={`animate-float-slow absolute -top-32 -left-24 h-96 w-96 rounded-full blur-[120px] ${
            isDark ? "bg-amber-500/15" : "bg-amber-400/25"
          }`}
        />
        <div
          className={`animate-float-reverse absolute top-1/3 -right-28 h-[28rem] w-[28rem] rounded-full blur-[130px] ${
            isDark ? "bg-emerald-500/12" : "bg-emerald-400/20"
          }`}
        />
        <div
          className={`animate-pulse-glow absolute -bottom-36 left-1/3 h-96 w-96 rounded-full blur-[130px] ${
            isDark ? "bg-indigo-500/12" : "bg-indigo-300/20"
          }`}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: isDark
              ? "radial-gradient(#ffffff 1px, transparent 1px)"
              : "radial-gradient(#0f172a 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
      </div>

      {/* Sticky Top Navbar */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors duration-300 ${
          isDark
            ? "border-white/10 bg-[#090b10]/75"
            : "border-slate-900/10 bg-[#faf7f2]/80"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white shadow-lg shadow-amber-500/25">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <div>
              <span className="text-base font-bold tracking-tight sm:text-lg">
                SR Book Reader
              </span>
              <p
                className={`text-xs ${
                  isDark ? "text-slate-400" : "text-slate-500"
                }`}
              >
                স্মার্ট বুকমার্ক ডিজিটাল লাইব্রেরি
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {mounted && latestContinue && (
              <Link
                href={`/book/${latestContinue.book.slug}`}
                className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:scale-[1.03] hover:shadow-amber-500/35 sm:inline-flex"
              >
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-950" />
                চালিয়ে যান: {latestContinue.book.title} (পৃ.{" "}
                {getResumePageIndex(latestContinue.progress) + 1})
              </Link>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="থিম পরিবর্তন করুন"
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all hover:scale-105 ${
                isDark
                  ? "border-white/10 bg-white/5 text-amber-300 hover:bg-white/10"
                  : "border-slate-900/10 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              }`}
            >
              {isDark ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="relative mb-12 grid items-center gap-10 lg:grid-cols-12">
          <div className="animate-fade-up lg:col-span-7">
            <div
              className={`mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-md ${
                isDark
                  ? "border-amber-400/25 bg-amber-500/10 text-amber-300"
                  : "border-amber-600/25 bg-amber-500/10 text-amber-800"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              অটো-সেভ ও স্মার্ট বুকমার্কিং — যেখানে থামবেন, সেখান থেকেই শুরু
            </div>

            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              বই পড়ুন{" "}
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-emerald-400 bg-clip-text text-transparent">
                মন সুস্থ রাখতে।
              </span>
            </h1>

            <p
              className={`mt-4 max-w-2xl text-base leading-relaxed sm:text-lg ${
                isDark ? "text-slate-300" : "text-slate-600"
              }`}
            >
              আপনার প্রিয় বাংলা ও আত্মউন্নয়নমূলক বইগুলো পড়ুন আধুনিক, চোখের আরামদায়ক PDF রিডারে।
              পছন্দের পৃষ্ঠায়{" "}
              <span className="font-semibold text-amber-400">বুকমার্ক সেভ</span>{" "}
              করে রাখুন এবং পরের বার এক ক্লিকেই ঠিক সেই পৃষ্ঠা থেকে পড়া চালিয়ে যান।
            </p>

            {/* Hero Action Buttons + Live Stats */}
            <div className="mt-7 flex flex-wrap items-center gap-3.5">
              {mounted && latestContinue ? (
                <Link
                  href={`/book/${latestContinue.book.slug}`}
                  className="group inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-amber-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-amber-500/40"
                >
                  <svg
                    className="h-5 w-5 transition-transform group-hover:scale-110"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M6 3a2 2 0 0 0-2 2v16l8-3.5L20 21V5a2 2 0 0 0-2-2H6z" />
                  </svg>
                  <span>
                    পড়া চালিয়ে যান: {latestContinue.book.title} (পৃ.{" "}
                    {getResumePageIndex(latestContinue.progress) + 1})
                  </span>
                </Link>
              ) : (
                <a
                  href="#library-shelf"
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-amber-500/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-amber-500/40"
                >
                  লাইব্রেরি ঘুরে দেখুন
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </a>
              )}

              <a
                href="#library-shelf"
                className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                  isDark
                    ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                    : "border-slate-900/15 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                }`}
              >
                সবগুলো বই ({BOOKS.length})
              </a>
            </div>

            {/* Stats Row */}
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              {[
                { label: "মোট বই", value: stats.totalBooks, icon: "📚" },
                { label: "পড়া শুরু হয়েছে", value: mounted ? stats.startedCount : 0, icon: "📖" },
                { label: "সেভ করা বুকমার্ক", value: mounted ? stats.bookmarkedCount : 0, icon: "🔖" },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl border p-3.5 backdrop-blur-md transition-transform hover:-translate-y-0.5 ${
                    isDark
                      ? "border-white/10 bg-white/[0.04]"
                      : "border-slate-900/10 bg-white/80 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs opacity-80">
                    <span>{item.label}</span>
                    <span>{item.icon}</span>
                  </div>
                  <div className="mt-1 text-2xl font-extrabold tracking-tight">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Animated 3D Floating Book Showcase */}
          <div className="animate-fade-up lg:col-span-5" style={{ animationDelay: "120ms" }}>
            <div className="relative mx-auto flex h-[320px] max-w-md items-center justify-center sm:h-[360px]">
              {/* Glow Ring */}
              <div className="animate-pulse-glow absolute h-64 w-64 rounded-full bg-gradient-to-tr from-amber-500/30 via-orange-500/20 to-emerald-500/30 blur-2xl" />

              {/* Back Left Floating Book */}
              <Link
                href="/book/Paradoxical-Sajid"
                className="animate-float-reverse absolute left-3 top-10 z-10 w-36 -rotate-12 rounded-xl bg-gradient-to-br from-teal-500 via-emerald-800 to-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/20 transition-transform duration-300 hover:z-30 hover:scale-105 sm:left-6 sm:w-40"
              >
                <div className="mb-8 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                  Series 1
                </div>
                <div className="text-sm font-bold leading-snug">প্যারাডক্সিক্যাল সাজিদ</div>
                <div className="mt-1 text-[11px] text-white/70">আরিফ আজাদ</div>
              </Link>

              {/* Back Right Floating Book */}
              <Link
                href="/book/ATHB"
                className="animate-float-slow absolute right-3 bottom-8 z-10 w-36 rotate-12 rounded-xl bg-gradient-to-br from-emerald-400 via-green-700 to-zinc-950 p-4 text-white shadow-2xl ring-1 ring-white/20 transition-transform duration-300 hover:z-30 hover:scale-105 sm:right-6 sm:w-40"
              >
                <div className="mb-8 text-[10px] font-semibold uppercase tracking-wider text-green-100">
                  Self-Growth
                </div>
                <div className="text-sm font-bold leading-snug">এটমিক হ্যাবিটস</div>
                <div className="mt-1 text-[11px] text-white/70">Atomic Habits</div>
              </Link>

              {/* Center Hero Spotlight Book */}
              <Link
                href={latestContinue ? `/book/${latestContinue.book.slug}` : "/book/Himu-Mama"}
                className="animate-float-slow group relative z-20 w-48 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-900 p-5 text-white shadow-[0_25px_60px_-15px_rgba(245,158,11,0.5)] ring-1 ring-white/30 transition-all duration-300 hover:scale-105 sm:w-52"
                style={{ animationDelay: "0.4s" }}
              >
                {/* Animated Bookmark Ribbon */}
                <div className="animate-ribbon-drop absolute -top-2 right-5 flex h-12 w-7 items-end justify-center rounded-b-md bg-gradient-to-b from-yellow-300 to-amber-500 pb-1.5 text-slate-950 shadow-md">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 3a2 2 0 0 0-2 2v16l8-3.5L20 21V5a2 2 0 0 0-2-2H6z" />
                  </svg>
                </div>

                <div className="absolute inset-y-0 left-0 w-3 rounded-l-2xl bg-black/25" />
                <div className="pl-2">
                  <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
                    {latestContinue ? "সর্বশেষ পঠিত" : "জনপ্রিয়"}
                  </span>
                  <h3 className="mt-10 text-xl font-extrabold leading-snug">
                    {latestContinue ? latestContinue.book.title : "হিমু মামা"}
                  </h3>
                  <p className="mt-1 text-xs text-white/80">
                    {latestContinue ? latestContinue.book.author : "হুমায়ূন আহমেদ"}
                  </p>
                  <div className="mt-6 flex items-center justify-between border-t border-white/20 pt-3 text-xs font-semibold">
                    <span>
                      {latestContinue
                        ? `পৃষ্ঠা ${getResumePageIndex(latestContinue.progress) + 1}`
                        : "এখনই পড়ুন"}
                    </span>
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* Continue Reading & Bookmarked Books Strip */}
        {mounted && activeBooks.length > 0 && (
          <section
            className="animate-fade-up mb-12"
            style={{ animationDelay: "160ms" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 3a2 2 0 0 0-2 2v16l8-3.5L20 21V5a2 2 0 0 0-2-2H6z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-lg font-bold sm:text-xl">
                    যেখান থেকে থেমেছিলেন (সেভ করা বুকমার্ক)
                  </h2>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    পরের বার সরাসরি আপনার সেভ করা পৃষ্ঠা থেকে পড়া শুরু করুন
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeBooks.slice(0, 3).map(({ book, progress }) => {
                const resumePage = getResumePageIndex(progress) + 1;
                const percent = getProgressPercent(progress);
                const isPinnedBookmark = Boolean(progress?.bookmark);
                const totalBookmarks = progress?.bookmarks?.length || 0;

                return (
                  <div
                    key={book.id}
                    className={`group relative overflow-hidden rounded-2xl border p-4 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${
                      isDark
                        ? "border-white/10 bg-white/[0.04] hover:border-amber-400/40 hover:bg-white/[0.07]"
                        : "border-slate-900/10 bg-white shadow-sm hover:border-amber-500/50 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`relative flex h-24 w-16 shrink-0 flex-col justify-between rounded-lg bg-gradient-to-br ${book.gradient} p-2 text-white shadow-md`}
                      >
                        <div className="text-[9px] font-bold opacity-80">PDF</div>
                        <div className="line-clamp-2 text-[10px] font-bold leading-tight">
                          {book.title}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate text-base font-bold">{book.title}</h3>
                          {isPinnedBookmark && (
                            <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                              🔖 বুকমার্ক
                            </span>
                          )}
                        </div>
                        <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {book.author}
                        </p>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-amber-400">
                            পৃষ্ঠা {resumePage}
                            {progress?.totalPages ? ` / ${progress.totalPages}` : ""}
                          </span>
                          {totalBookmarks > 1 && (
                            <span className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              • {totalBookmarks}টি বুকমার্ক
                            </span>
                          )}
                          {progress?.lastReadAt && (
                            <span className={`text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                              • {formatRelativeTime(progress?.bookmark?.updatedAt || progress.lastReadAt)}
                            </span>
                          )}
                        </div>

                        {progress?.bookmark?.note && (
                          <p
                            className={`mt-1 truncate text-[11px] italic ${
                              isDark ? "text-slate-300" : "text-slate-600"
                            }`}
                          >
                            “{progress.bookmark.note}”
                          </p>
                        )}

                        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/30">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                      <Link
                        href={`/book/${book.slug}?page=${resumePage}`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-500 hover:text-slate-950"
                      >
                        <span>পৃষ্ঠা {resumePage} থেকে চালিয়ে যান</span>
                        <span>→</span>
                      </Link>
                      {isPinnedBookmark && (
                        <button
                          type="button"
                          onClick={() => clearPrimaryBookmark(book.slug)}
                          title="বুকমার্ক সরান"
                          className={`rounded-xl px-2.5 py-2 text-xs transition-colors ${
                            isDark
                              ? "text-slate-400 hover:bg-white/10 hover:text-rose-400"
                              : "text-slate-500 hover:bg-slate-100 hover:text-rose-600"
                          }`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Filter, Search & Sort Toolbar */}
        <section id="library-shelf" className="mb-8 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                আপনার বুক লাইব্রেরি
              </h2>
              <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                যেকোনো বইয়ে ক্লিক করে রিডার খুলুন — পড়ার অগ্রগতি স্বয়ংক্রিয়ভাবে সংরক্ষিত হবে
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Search Box */}
              <div className="relative flex-1 sm:w-72">
                <svg
                  className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="বই বা লেখক খুঁজুন..."
                  className={`w-full rounded-xl border py-2.5 pl-10 pr-9 text-sm outline-none transition-all ${
                    isDark
                      ? "border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-amber-400/60 focus:bg-white/10"
                      : "border-slate-900/10 bg-white text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-amber-500"
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="সাজানোর ধরন"
                className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium outline-none transition-colors ${
                  isDark
                    ? "border-white/10 bg-[#121622] text-slate-200 focus:border-amber-400/60"
                    : "border-slate-900/10 bg-white text-slate-800 shadow-sm focus:border-amber-500"
                }`}
              >
                <option value="default">সাজান: ডিফল্ট</option>
                <option value="recent">সর্বশেষ পড়া</option>
                <option value="progress">পড়ার অগ্রগতি</option>
                <option value="title">বইয়ের নাম</option>
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2">
            {BOOK_CATEGORIES.map((category) => {
              const active = activeCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 sm:text-sm ${
                    active
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/20"
                      : isDark
                      ? "border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10"
                      : "border border-slate-900/10 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {category}
                  {category === "বুকমার্ক করা" && mounted && stats.bookmarkedCount > 0
                    ? ` (${stats.bookmarkedCount})`
                    : ""}
                </button>
              );
            })}
          </div>
        </section>

        {/* Books Grid */}
        {filteredBooks.length === 0 ? (
          <div
            className={`rounded-3xl border p-12 text-center ${
              isDark
                ? "border-white/10 bg-white/[0.03]"
                : "border-slate-900/10 bg-white shadow-sm"
            }`}
          >
            <div className="text-4xl">📚</div>
            <h3 className="mt-3 text-lg font-bold">কোনো বই পাওয়া যায়নি</h3>
            <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              অন্য ক্যাটাগরি নির্বাচন করুন বা সার্চ টেক্সট পরিবর্তন করে দেখুন।
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("সব বই");
              }}
              className="mt-5 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 transition-transform hover:scale-105"
            >
              সব বই দেখান
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBooks.map((book, idx) => {
              const progress = mounted ? progressMap[book.slug] : null;
              const resumePage = getResumePageIndex(progress) + 1;
              const hasProgress = Boolean(progress && (progress.bookmark || progress.lastPage > 0));
              const hasBookmark = Boolean(progress?.bookmark);
              const percent = getProgressPercent(progress);

              return (
                <Link
                  key={book.id}
                  href={
                    hasProgress
                      ? `/book/${book.slug}?page=${resumePage}`
                      : `/book/${book.slug}`
                  }
                  className={`animate-fade-up group relative flex flex-col overflow-hidden rounded-3xl border p-4 transition-all duration-300 hover:-translate-y-1.5 ${
                    isDark
                      ? "border-white/10 bg-white/[0.035] hover:border-amber-400/40 hover:bg-white/[0.06] hover:shadow-[0_20px_50px_-15px_rgba(245,158,11,0.22)]"
                      : "border-slate-900/10 bg-white shadow-sm hover:border-amber-500/50 hover:shadow-xl"
                  }`}
                  style={{ animationDelay: `${Math.min(idx * 55, 450)}ms` }}
                >
                  {/* 3D Book Cover Visual */}
                  <div
                    className={`book-cover-3d book-shimmer relative flex h-56 flex-col justify-between rounded-2xl bg-gradient-to-br ${book.gradient} p-5 text-white shadow-xl`}
                  >
                    {/* Left Book Spine Crease */}
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-3.5 rounded-l-2xl bg-gradient-to-r from-black/35 via-white/10 to-transparent" />

                    {/* Top Row: Category Badge & Bookmark Ribbon */}
                    <div className="relative z-10 flex items-start justify-between pl-2">
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold tracking-wide backdrop-blur-md">
                        {book.badge}
                      </span>

                      {hasBookmark && (
                        <div className="animate-ribbon-drop -mt-5 flex flex-col items-center rounded-b-lg bg-gradient-to-b from-amber-300 to-amber-500 px-2 pb-1.5 pt-2 text-[10px] font-extrabold text-slate-950 shadow-lg">
                          <span>🔖</span>
                          <span>পৃ.{resumePage}</span>
                        </div>
                      )}
                    </div>

                    {/* Cover Center Title */}
                    <div className="relative z-10 pl-2">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-white/75">
                        {book.englishTitle}
                      </div>
                      <h3 className="mt-1 text-2xl font-extrabold leading-snug drop-shadow-sm">
                        {book.title}
                      </h3>
                    </div>

                    {/* Cover Bottom Author */}
                    <div className="relative z-10 flex items-center justify-between border-t border-white/20 pl-2 pt-2.5 text-xs text-white/90">
                      <span className="font-medium">{book.author}</span>
                      <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px]">
                        PDF
                      </span>
                    </div>
                  </div>

                  {/* Card Details & Progress */}
                  <div className="mt-4 flex flex-1 flex-col justify-between px-1">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-semibold ${
                            isDark ? "text-amber-400" : "text-amber-700"
                          }`}
                        >
                          {book.category}
                        </span>
                        {hasProgress && (
                          <span
                            className={`text-[11px] font-semibold ${
                              isDark ? "text-emerald-400" : "text-emerald-700"
                            }`}
                          >
                            {percent}% পড়া হয়েছে
                          </span>
                        )}
                      </div>

                      <p
                        className={`mt-1.5 line-clamp-2 text-xs leading-relaxed ${
                          isDark ? "text-slate-400" : "text-slate-600"
                        }`}
                      >
                        {book.description}
                      </p>
                    </div>

                    <div className="mt-4">
                      {hasProgress && (
                        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/25">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}

                      <div
                        className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-colors ${
                          hasProgress
                            ? "bg-amber-500/15 text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950"
                            : isDark
                            ? "bg-white/5 text-slate-200 group-hover:bg-white/15"
                            : "bg-slate-100 text-slate-800 group-hover:bg-slate-900 group-hover:text-white"
                        }`}
                      >
                        <span>
                          {hasProgress
                            ? `চালিয়ে যান • পৃষ্ঠা ${resumePage}`
                            : "বইটি পড়ুন"}
                        </span>
                        <span className="transition-transform duration-300 group-hover:translate-x-1">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <footer
        className={`relative z-10 border-t py-6 text-center text-xs ${
          isDark
            ? "border-white/10 text-slate-500"
            : "border-slate-900/10 text-slate-500"
        }`}
      >
        SR Book Reader • আপনার পড়ার অগ্রগতি ও বুকমার্ক ব্রাউজারে নিরাপদে সংরক্ষিত থাকে
      </footer>
    </div>
  );
}

