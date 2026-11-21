import RefPage from "@/components/RefPage";

export default function DepartmentsPage() {
  return (
    <RefPage
      title="Departments" endpoint="/api/departments" noun="department"
      description="Where people work. Once the ERP is connected, this list fills in by itself."
    />
  );
}