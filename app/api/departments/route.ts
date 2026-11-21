import { listAndCreate } from "@/lib/ref";

export const dynamic = "force-dynamic";
const h = listAndCreate("departments");
export const GET = h.GET;
export const POST = h.POST;