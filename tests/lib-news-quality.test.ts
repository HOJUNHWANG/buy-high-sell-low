import { describe,it,expect } from "vitest";
import { diversifyNews,isRecentNews } from "@/lib/news-quality";
describe("news evidence selection",()=>{
  it("counts Yahoo syndication groups by the actual publisher domain",()=>{
    const rows=Array.from({length:12},(_,i)=>({title:`Story ${i}`,url:`https://www.fool.com/story-${i}`,source:`Yahoo Finance group ${i}`,published_at:"2026-10-31T11:00:00Z"}));
    expect(diversifyNews(rows,12,new Date("2026-10-31T12:00:00Z"))).toHaveLength(3);
  });
  const now=new Date("2026-10-31T12:00:00Z");
  it("does not use old or future headlines as current drivers",()=>{
    expect(isRecentNews("2026-09-02",now)).toBe(false);
    expect(isRecentNews("2026-10-30T23:00:00Z",now)).toBe(true);
    expect(isRecentNews("2026-11-01",now)).toBe(false);
  });
  it("collapses repeated event coverage and limits a single publisher",()=>{
    const rows=Array.from({length:16},(_,i)=>({title:`Binance update ${i}`,event_key:"same-event",source:"Crypto feed",published_at:"2026-10-31T11:00:00Z"}));
    rows.push({title:"Apple earnings",event_key:"earnings",source:"Stock feed",published_at:"2026-10-31T10:00:00Z"});
    expect(diversifyNews(rows,10,now)).toHaveLength(2);
  });
});
