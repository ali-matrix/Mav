import { notFound } from "next/navigation";
import { Card, PageHeader, StateView } from "@metis/ui";
import { PAGE_INFO } from "@/lib/nav";

// Placeholder for every rail page that is not built yet.
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const info = PAGE_INFO[section];
  if (!info) notFound();
  return (
    <>
      <PageHeader title={info.title} description={info.description} />
      <div className="mx-section">
        <Card>
          <StateView kind="empty" title={`${info.title} is coming soon`}>
            This page is part of the plan and will be built in a later step.
          </StateView>
        </Card>
      </div>
    </>
  );
}