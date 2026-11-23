import { redirect } from "next/navigation";

// The first screen is the dashboard (no sign-in for now).
export default function Home() {
  redirect("/dashboard");
}
