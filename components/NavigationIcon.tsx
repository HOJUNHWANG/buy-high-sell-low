import type { navigation } from "@/lib/navigation";

type Icon = (typeof navigation)[number]["icon"] | "health";
const paths: Record<Icon, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  markets: <><path d="M4 20h16M7 15V8m5 9V4m5 10V7M5 8h4m1-4h4m1 3h4" /></>,
  fictional: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5" /></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h4m3 0h3M7 16h4m3 0h3" /></>,
  brief: <><path d="M8 3h9l4 4v14H3V3h5Zm8 0v5h5M7 12h10M7 16h7" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m6 0h2" /></>,
  paper: <><path d="M3 7h16a2 2 0 0 1 2 2v10H3V7Zm0 0V4h14v3m0 6h4" /><circle cx="16" cy="13" r=".5" /></>,
  health: <path d="M3 12h4l3-8 4 16 3-8h4" />,
};

export function NavigationIcon({ icon }: { icon: Icon }) {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[icon]}</svg>;
}
