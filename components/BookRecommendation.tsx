"use client";

import { useState, useEffect } from "react";

const AFFILIATE_TAG = "adind9588-20";

interface Book {
  title: string;
  author: string;
  asin: string;
  oneLiner: string;
  cover: string;
  rating: string;
}

const BOOKS: Book[] = [
  {
    title: "The Intelligent Investor",
    author: "Benjamin Graham",
    asin: "0060555661",
    oneLiner: "The #1 value investing book of all time",
    cover: "https://m.media-amazon.com/images/I/91yj3mbz4JL._SY466_.jpg",
    rating: "4.7",
  },
  {
    title: "The Psychology of Money",
    author: "Morgan Housel",
    asin: "0857197681",
    oneLiner: "Why behavior matters more than knowledge",
    cover: "https://m.media-amazon.com/images/I/81Dky+tD+pL._SY466_.jpg",
    rating: "4.7",
  },
  {
    title: "A Random Walk Down Wall Street",
    author: "Burton Malkiel",
    asin: "1324002182",
    oneLiner: "The best-selling guide to index investing",
    cover: "https://m.media-amazon.com/images/I/81kkIFBuRYL._SY466_.jpg",
    rating: "4.5",
  },
  {
    title: "One Up On Wall Street",
    author: "Peter Lynch",
    asin: "0743200403",
    oneLiner: "How everyday investors can beat the pros",
    cover: "https://m.media-amazon.com/images/I/81nPkMEV2iL._SY466_.jpg",
    rating: "4.6",
  },
  {
    title: "Common Sense Investing",
    author: "John C. Bogle",
    asin: "1119404509",
    oneLiner: "The Vanguard founder on low-cost funds",
    cover: "https://m.media-amazon.com/images/I/71sIE5DpjdL._SY466_.jpg",
    rating: "4.7",
  },
  {
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    asin: "0374533555",
    oneLiner: "How cognitive biases shape your decisions",
    cover: "https://m.media-amazon.com/images/I/71wvKXWfcML._SY466_.jpg",
    rating: "4.6",
  },
];

function Stars({ rating }: { rating: string }) {
  const num = parseFloat(rating);
  const full = Math.floor(num);
  const half = num - full >= 0.3;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 20 20" fill="#fbbf24">
          <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.27l-4.77 2.5.91-5.33L2.27 6.67l5.34-.78z" />
        </svg>
      ))}
      {half && (
        <svg width="10" height="10" viewBox="0 0 20 20">
          <defs>
            <linearGradient id="hg">
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="#4b5563" />
            </linearGradient>
          </defs>
          <path d="M10 1l2.39 4.84 5.34.78-3.87 3.77.91 5.33L10 13.27l-4.77 2.5.91-5.33L2.27 6.67l5.34-.78z" fill="url(#hg)" />
        </svg>
      )}
      <span className="text-[9px] ml-0.5" style={{ color: "var(--text-3)" }}>{rating}</span>
    </span>
  );
}

/** Shows 2 random book recommendations with covers. Rotates on mount. */
export function BookRecommendation() {
  const [picks, setPicks] = useState<Book[]>([]);

  useEffect(() => {
    const shuffled = [...BOOKS].sort(() => Math.random() - 0.5);
    setPicks(shuffled.slice(0, 2));
  }, []);

  if (picks.length === 0) return null;

  return (
    <div className="card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-3)" }}
        >
          Popular investing books
        </p>
        <span
          className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: "var(--surface-3)", color: "var(--text-3)" }}
        >
          Sponsored
        </span>
      </div>

      {picks.map((book) => (
        <a
          key={book.asin}
          href={`https://www.amazon.com/dp/${book.asin}?tag=${AFFILIATE_TAG}`}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          className="flex gap-3 rounded-lg p-2 -mx-0.5 transition-all group"
          style={{ border: "1px solid transparent" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--border-md)";
            e.currentTarget.style.background = "var(--surface-2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "transparent";
            e.currentTarget.style.background = "transparent";
          }}
        >
          {/* Book cover */}
          <img
            src={book.cover}
            alt={book.title}
            width={56}
            height={80}
            loading="lazy"
            className="rounded shrink-0 object-cover shadow-md"
            style={{ width: 56, height: 80 }}
          />

          {/* Info */}
          <div className="flex flex-col justify-center min-w-0">
            <p className="text-xs font-semibold leading-tight group-hover:underline" style={{ color: "var(--text)" }}>
              {book.title}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {book.author}
            </p>
            <div className="mt-1">
              <Stars rating={book.rating} />
            </div>
            <p className="text-[10px] mt-1 leading-snug" style={{ color: "var(--text-2)" }}>
              {book.oneLiner}
            </p>
          </div>
        </a>
      ))}

      <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-[8px]" style={{ color: "var(--text-3)" }}>
          As an Amazon Associate we earn from qualifying purchases.
        </p>
        <span className="text-[9px] font-medium" style={{ color: "var(--accent)" }}>
          View on Amazon →
        </span>
      </div>
    </div>
  );
}
