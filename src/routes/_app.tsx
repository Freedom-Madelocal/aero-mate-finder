import { createFileRoute, Outlet } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
