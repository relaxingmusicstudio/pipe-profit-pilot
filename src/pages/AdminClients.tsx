import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Search,
  Plus,
  Building2,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  MessageSquare,
  FileText,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AdminLayout from "@/components/AdminLayout";

interface Client {
  id: string;
  name: string;
  business_name: string;
  email: string;
  phone: string;
  status: "active" | "paused" | "churned";
  plan: string;
  mrr: number;
  start_date: string;
  last_contact: string;
  health_score: number;
  notes: string;
}

// Mock data for demonstration - in production this would come from database
const mockClients: Client[] = [
  {
    id: "1",
    name: "John Smith",
    business_name: "Smith HVAC Services",
    email: "john@smithhvac.com",
    phone: "(555) 123-4567",
    status: "active",
    plan: "Growth",
    mrr: 999,
    start_date: "2024-01-15",
    last_contact: "2024-12-10",
    health_score: 92,
    notes: "Happy customer, interested in Scale plan upgrade",
  },
  {
    id: "2",
    name: "Sarah Johnson",
    business_name: "Johnson Heating & Cooling",
    email: "sarah@johnsonhc.com",
    phone: "(555) 234-5678",
    status: "active",
    plan: "Scale",
    mrr: 1999,
    start_date: "2023-08-20",
    last_contact: "2024-12-08",
    health_score: 88,
    notes: "Power user, great testimonial candidate",
  },
  {
    id: "3",
    name: "Mike Williams",
    business_name: "Williams Air Solutions",
    email: "mike@williamsair.com",
    phone: "(555) 345-6789",
    status: "paused",
    plan: "Starter",
    mrr: 499,
    start_date: "2024-06-01",
    last_contact: "2024-11-15",
    health_score: 45,
    notes: "Slow season, paused temporarily",
  },
  {
    id: "4",
    name: "Lisa Brown",
    business_name: "Brown Climate Control",
    email: "lisa@browncc.com",
    phone: "(555) 456-7890",
    status: "active",
    plan: "Growth",
    mrr: 999,
    start_date: "2024-03-10",
    last_contact: "2024-12-12",
    health_score: 95,
    notes: "Referred 2 new clients this month",
  },
  {
    id: "5",
    name: "David Lee",
    business_name: "Lee HVAC Pros",
    email: "david@leehvac.com",
    phone: "(555) 567-8901",
    status: "churned",
    plan: "Starter",
    mrr: 0,
    start_date: "2024-02-01",
    last_contact: "2024-09-20",
    health_score: 0,
    notes: "Went out of business",
  },
];

const AdminClients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeClients = clients.filter((c) => c.status === "active");
  const totalMRR = activeClients.reduce((sum, c) => sum + c.mrr, 0);
  const avgHealthScore =
    activeClients.length > 0
      ? Math.round(
          activeClients.reduce((sum, c) => sum + c.health_score, 0) /
            activeClients.length
        )
      : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "paused":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "churned":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <AdminLayout title="Clients" subtitle="Manage your current customers">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-2xl font-bold">{activeClients.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                <p className="text-2xl font-bold">
                  ${totalMRR.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Health Score</p>
                <p className="text-2xl font-bold">{avgHealthScore}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">At Risk</p>
                <p className="text-2xl font-bold">
                  {clients.filter((c) => c.health_score < 50 && c.status === "active").length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Client List</CardTitle>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Clients are typically converted from leads when they sign up
                    for a paid plan.
                  </p>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="paused">Paused</TabsTrigger>
                <TabsTrigger value="churned">Churned</TabsTrigger>
              </TabsList>
            </Tabs>

            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredClients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedClient?.id === client.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="font-medium text-sm">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.business_name}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={getStatusColor(client.status)}
                      >
                        {client.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{client.plan} Plan</span>
                      <span className={getHealthColor(client.health_score)}>
                        {client.health_score}% health
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Client Details */}
        <Card className="lg:col-span-2">
          {selectedClient ? (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {selectedClient.business_name}
                    </CardTitle>
                    <p className="text-muted-foreground">
                      {selectedClient.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getStatusColor(selectedClient.status)}
                    >
                      {selectedClient.status}
                    </Badge>
                    <Badge variant="secondary">{selectedClient.plan}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm font-medium">
                        {selectedClient.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Phone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium">
                        {selectedClient.phone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">MRR</p>
                      <p className="text-sm font-medium">
                        ${selectedClient.mrr}/mo
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Customer Since
                      </p>
                      <p className="text-sm font-medium">
                        {new Date(selectedClient.start_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Health Score */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Health Score</p>
                    <span
                      className={`text-2xl font-bold ${getHealthColor(
                        selectedClient.health_score
                      )}`}
                    >
                      {selectedClient.health_score}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        selectedClient.health_score >= 80
                          ? "bg-green-500"
                          : selectedClient.health_score >= 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${selectedClient.health_score}%` }}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-sm font-medium mb-2">Notes</p>
                  <p className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
                    {selectedClient.notes}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    View Invoices
                  </Button>
                  <Button variant="outline" size="sm">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Usage Stats
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex items-center justify-center h-[500px]">
              <div className="text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a client to view details</p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminClients;
