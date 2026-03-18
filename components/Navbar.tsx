"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="text-lg font-bold text-white shrink-0">
          GlobalStock
        </Link>
        <div className="flex-1 max-w-md">
          <SearchBar />
        </div>
        <nav className="flex items-center gap-4 ml-auto text-sm">
          <Link href="/news" className="text-gray-400 hover:text-white transition-colors">
            News
          </Link>
          <Link
            href="/auth/login"
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
