import dynamic from "next/dynamic";
import { getBookBySlug } from "@/data/books";

const PDFViewer = dynamic(() => import("../../../components/pdf-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-[#090b10] text-slate-100">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500/25 border-t-amber-500" />
      <p className="text-sm font-semibold text-slate-300">রিডার প্রস্তুত হচ্ছে...</p>
    </div>
  ),
});

export function generateMetadata({ params }) {
  const book = getBookBySlug(params.book);
  return {
    title: book ? `${book.title} — SR Book Reader` : "SR Book Reader",
    description: book ? book.description : "Digital PDF Book Reader",
  };
}

const BookReaderPage = ({ params }) => {
  return <PDFViewer bookName={params.book} />;
};

export default BookReaderPage;
