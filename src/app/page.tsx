import Link from "next/link";
import { Laptop, AlertTriangle, CheckCircle, Clock, Plus, List as ListIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { supabase } from "@/lib/supabase";

export const revalidate = 0; // opt out of static caching for real-time dashboard

export default async function Dashboard() {
  const { count: totalAssets } = await supabase.from('assets').select('*', { count: 'exact', head: true });
  const { count: availableAssets } = await supabase.from('assets').select('*', { count: 'exact', head: true }).is('assigned_to', null).neq('status', 'Faulty');
  const { count: assignedAssets } = await supabase.from('assets').select('*', { count: 'exact', head: true }).not('assigned_to', 'is', null);
  const { count: faultyAssets } = await supabase.from('assets').select('*', { count: 'exact', head: true }).eq('status', 'Faulty');

  const { data: recentActivityData } = await supabase.from('assets').select('*').order('created_at', { ascending: false }).limit(5);

  const metrics = {
    totalAssets: totalAssets || 0,
    available: availableAssets || 0,
    assigned: assignedAssets || 0,
    faulty: faultyAssets || 0,
  };

  const recentActivity = (recentActivityData || []).map((item) => {
    const date = new Date(item.created_at);
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    return {
      id: item.id,
      action: 'Logged',
      asset: item.laptop_name || item.serial_number,
      user: item.assigned_to || 'System',
      time: formattedDate,
      status: item.status,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Overview of your IT inventory and recent activities.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Laptop className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalAssets}</div>
            <p className="text-xs text-muted-foreground">Total registered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.available}</div>
            <p className="text-xs text-muted-foreground">Ready for assignment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assigned</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.assigned}</div>
            <p className="text-xs text-muted-foreground">Currently in use</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faulty / Repair</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.faulty}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest changes to the asset inventory.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {recentActivity.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">No recent activity found.</div>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center">
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.action} <span className="font-bold text-primary">{activity.asset}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Assigned to: {activity.user}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-sm text-muted-foreground">{activity.time}</div>
                      <Badge variant={activity.status === 'Faulty' ? 'destructive' : activity.status === 'New' ? 'default' : 'secondary'}>
                        {activity.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common inventory tasks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Link href="/inventory/add" className={buttonVariants({ variant: "default", size: "lg", className: "w-full justify-start h-12" })}>
              <Plus className="mr-2 h-5 w-5" />
              Add New Asset
            </Link>
            <Link href="/inventory" className={buttonVariants({ variant: "outline", size: "lg", className: "w-full justify-start h-12" })}>
              <ListIcon className="mr-2 h-5 w-5" />
              View Full Inventory
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
