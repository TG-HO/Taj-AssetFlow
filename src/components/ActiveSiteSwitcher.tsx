'use client';

import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';
import { switchActiveLocation } from '@/app/users/actions';
import { toast } from '@/components/ui/toast';

interface LocationItem {
  id: string;
  name: string;
}

export function ActiveSiteSwitcher({
  currentLocationId,
  assignedLocationIds,
  locations,
}: {
  currentLocationId: string | null;
  assignedLocationIds: string[];
  locations: LocationItem[];
}) {
  const [selectedLoc, setSelectedLoc] = useState(currentLocationId || '');
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter locations to only those assigned
  const assignedLocs = locations.filter(loc => assignedLocationIds.includes(loc.id));

  if (assignedLocs.length <= 1) return null;

  const handleSwitch = async (val: string) => {
    setIsUpdating(true);
    setSelectedLoc(val);
    try {
      const res = await switchActiveLocation(val);
      if (res.success) {
        // Update client-side localStorage
        const stored = localStorage.getItem('tenant_session');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.assigned_location_id = val;
          localStorage.setItem('tenant_session', JSON.stringify(parsed));
        }
        toast('Active branch view updated successfully.', 'success');
        window.location.reload();
      } else {
        toast(res.error || 'Failed to switch active site.', 'error');
        setIsUpdating(false);
      }
    } catch (e: any) {
      toast(e.message || 'An unexpected error occurred.', 'error');
      setIsUpdating(false);
    }
  };

  return (
    <Card className="border border-primary/20 shadow-sm bg-gradient-to-r from-primary/5 via-background to-primary/5">
      <CardContent className="py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <MapPin size={20} className="animate-bounce" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-primary">Multi-Site Manager Access</CardTitle>
            <CardDescription className="text-xs">Switch your current active site to view its scoped inventory, allocations, and requests.</CardDescription>
          </div>
        </div>
        <div className="w-full sm:w-64 flex items-center gap-2">
          {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
          <Select 
            value={selectedLoc} 
            onValueChange={handleSwitch} 
            disabled={isUpdating}
            items={assignedLocs.map(loc => ({ value: loc.id, label: loc.name }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose active site..." />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {assignedLocs.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
