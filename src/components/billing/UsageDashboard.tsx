import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Phone, MessageSquare, Mail, Bot, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface UsageRecord {
  id: string;
  client_id: string;
  usage_type: string;
  quantity: number;
  unit_price: number;
  total_cost: number;
  source: string;
  recorded_at: string;
  clients?: { name: string };
}

interface UsageSummary {
  voice_minutes: number;
  ai_agent_minutes: number;
  sms: number;
  email: number;
  total_cost: number;
}

export default function UsageDashboard() {
  const now = new Date();
  const periodStart = startOfMonth(now).toISOString();
  const periodEnd = endOfMonth(now).toISOString();

  const { data: usageRecords, isLoading } = useQuery({
    queryKey: ['usage-records', periodStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_records')
        .select('*, clients(name)')
        .gte('recorded_at', periodStart)
        .lte('recorded_at', periodEnd)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return data as UsageRecord[];
    }
  });

  // Calculate summary
  const summary: UsageSummary = usageRecords?.reduce((acc, record) => {
    const quantity = Number(record.quantity);
    const cost = Number(record.total_cost);
    
    switch (record.usage_type) {
      case 'voice_minutes':
        acc.voice_minutes += quantity;
        break;
      case 'ai_agent_minutes':
        acc.ai_agent_minutes += quantity;
        break;
      case 'sms':
        acc.sms += quantity;
        break;
      case 'email':
        acc.email += quantity;
        break;
    }
    acc.total_cost += cost;
    return acc;
  }, { voice_minutes: 0, ai_agent_minutes: 0, sms: 0, email: 0, total_cost: 0 }) || 
  { voice_minutes: 0, ai_agent_minutes: 0, sms: 0, email: 0, total_cost: 0 };

  const usageCards = [
    {
      title: "Voice Minutes",
      value: summary.voice_minutes.toFixed(1),
      icon: Phone,
      color: "text-blue-500",
      unit: "min"
    },
    {
      title: "AI Agent Minutes",
      value: summary.ai_agent_minutes.toFixed(1),
      icon: Bot,
      color: "text-purple-500",
      unit: "min"
    },
    {
      title: "SMS Sent",
      value: summary.sms.toString(),
      icon: MessageSquare,
      color: "text-green-500",
      unit: "msgs"
    },
    {
      title: "Emails Sent",
      value: summary.email.toString(),
      icon: Mail,
      color: "text-orange-500",
      unit: "emails"
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Usage This Period
        </h3>
        <span className="text-sm text-muted-foreground">
          {format(startOfMonth(now), 'MMM d')} - {format(endOfMonth(now), 'MMM d, yyyy')}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {usageCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold">
                    {isLoading ? '...' : card.value}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{card.unit}</span>
                  </p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Total Billable Amount
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-primary">
            ${isLoading ? '...' : summary.total_cost.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {usageRecords?.length || 0} usage records
          </p>
        </CardContent>
      </Card>

      {/* Recent Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : usageRecords?.length === 0 ? (
              <p className="text-muted-foreground text-sm">No usage recorded this period</p>
            ) : (
              usageRecords?.slice(0, 10).map((record) => (
                <div key={record.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{record.clients?.name || 'Unknown'}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{record.usage_type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span>{Number(record.quantity).toFixed(1)} units</span>
                    <span className="font-medium">${Number(record.total_cost).toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
