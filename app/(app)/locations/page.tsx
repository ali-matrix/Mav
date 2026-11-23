import RefPage from "@/components/RefPage";

export default function LocationsPage() {
  return (
    <RefPage
      title="Locations" endpoint="/api/locations" noun="location"
      description="Units, floors and stores where assets are kept"
    />
  );
}