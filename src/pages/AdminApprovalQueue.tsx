import { Helmet } from "react-helmet-async";
import AdminLayout from "@/components/AdminLayout";
import ApprovalQueue from "@/components/admin/ApprovalQueue";
import { AdminBackButton } from "@/components/AdminBackButton";

export default function AdminApprovalQueue() {
  return (
    <>
      <Helmet>
        <title>Approval Queue | Admin</title>
        <meta name="description" content="Review and approve AI agent actions" />
      </Helmet>
      <AdminLayout title="Approval Queue" subtitle="Review and approve AI agent actions before execution">
        <div className="mb-4">
          <AdminBackButton to="/admin/hub" showHome />
        </div>
        <ApprovalQueue />
      </AdminLayout>
    </>
  );
}
