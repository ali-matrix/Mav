import { updateAndRemove } from "@/lib/ref";

export const dynamic = "force-dynamic";
const h = updateAndRemove("departments");
export const PUT = h.PUT;
export const DELETE = h.DELETE;