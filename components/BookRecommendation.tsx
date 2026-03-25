"use client";

import { useState, useEffect } from "react";

const AFFILIATE_TAG = "adind9588-20";

interface Book {
  title: string;
  author: string;
  asin: string;
  oneLiner: string;
}

const BOOKS: Book[] = [
  {
    title: "The Intelligent Investor",
    author: "Benjamin Graham",
    asin: "0060555661",
    oneLiner: "The bible of value investing",
  },
  {
    title: "The Psychology of Money",
    author: "Morgan Housel",
    asin: "0857197681",
    oneLiner: "Why behavior matters more than knowledge",
  },
  {
    title: "A Random Walk Down Wall Street",
    author: "Burton Malkiel",
    asin: "1324002182",
    oneLiner: "The case for index investing",
  },
  {
    title: "One Up On Wall Street",
    author: "Peter Lynch",
    asin: "0743200403",
    oneLiner: "How everyday investors can beat the pros",
  },
  {
    title: "Common Sense Investing",
    author: "John C. Bogle",
    asin: "1119404509",
    oneLiner: "The Vanguard founder on low-cost funds",
  },
  {
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    asin: "0374533555",
    oneLiner: "How cognitive biases affect decisions",
  },
];

/** Shows 2 random book recommendations. Rotates on mount. */
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
          Recommended reads
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
          className="block rounded-lg p-2.5 -mx-0.5 transition-colors"
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
          <p className="text-xs font-medium" style={{ color: "var(--text)" }}>
            {book.title}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {book.author}
          </p>
          <p className="text-[10px] mt-1" style={{ color: "var(--text-2)" }}>
            {book.oneLiner}
          </p>
        </a>
      ))}

      <p className="text-[8px] text-center" style={{ color: "var(--text-3)" }}>
        As an Amazon Associate we earn from qualifying purchases.
      </p>
    </div>
  );
}
