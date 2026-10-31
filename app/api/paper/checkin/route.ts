import { paperActionResponse } from "@/lib/paper-actions";
export function POST(request?: Request) { return paperActionResponse("checkin", request, { emptyBody: true }); }
