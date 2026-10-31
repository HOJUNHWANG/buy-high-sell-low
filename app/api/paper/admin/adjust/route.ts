import { paperActionResponse } from "@/lib/paper-actions";
export function POST(request: Request) { return paperActionResponse("admin_adjust", request, { admin: true }); }
