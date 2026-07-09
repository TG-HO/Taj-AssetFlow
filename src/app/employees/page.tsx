'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Users, Plus, Search, Edit, Trash2, Loader2, AlertCircle, Mail, MapPin, Briefcase
} from 'lucide-react';
import { getEmployees, addEmployee, updateEmployee, deleteEmployee } from './actions';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { toast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function EmployeesPage() {
  const { profile } = useTenantSession();
  const userRole = profile?.role || 'moderator';

  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modal forms
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any | null>(null);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formLocationId, setFormLocationId] = useState('none');
  const [filterLocationId, setFilterLocationId] = useState('all');
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    const [empRes, locRes] = await Promise.all([
      getEmployees(),
      supabase.from('locations').select('*').order('name')
    ]);

    if (empRes.success) {
      setEmployees(empRes.data);
    } else {
      toast(empRes.error || 'Failed to fetch employees.', 'error');
    }
    if (locRes.data) {
      setLocations(locRes.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleOpenAdd = () => {
    setFormName('');
    setFormEmail('');
    setFormDesignation('');
    setFormDepartment('');
    setFormLocationId('none');
    setFormError('');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (emp: any) => {
    setSelectedId(emp.id);
    setFormName(emp.name);
    setFormEmail(emp.email);
    setFormDesignation(emp.designation || '');
    setFormDepartment(emp.department || '');
    setFormLocationId(emp.location_id || 'none');
    setFormError('');
    setIsEditOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    const locVal = formLocationId === 'none' ? null : formLocationId;
    const res = await addEmployee(formName.trim(), formEmail.trim(), formDesignation.trim(), formDepartment.trim(), locVal);
    setIsSubmitting(false);
    if (res.success) {
      setIsAddOpen(false);
      fetchEmployees();
      toast('Employee added successfully.', 'success');
    } else {
      setFormError(res.error || 'Failed to add employee.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    const locVal = formLocationId === 'none' ? null : formLocationId;
    const res = await updateEmployee(selectedId, formName.trim(), formEmail.trim(), formDesignation.trim(), formDepartment.trim(), locVal);
    setIsSubmitting(false);
    if (res.success) {
      setIsEditOpen(false);
      fetchEmployees();
      toast('Employee updated successfully.', 'success');
    } else {
      setFormError(res.error || 'Failed to update employee.');
    }
  };

  const confirmDelete = async () => {
    if (!employeeToDelete) return;
    setIsLoading(true);
    const res = await deleteEmployee(employeeToDelete.id);
    setEmployeeToDelete(null);
    if (res.success) {
      fetchEmployees();
      toast('Employee removed successfully.', 'success');
    } else {
      toast(res.error || 'Failed to delete employee.', 'error');
      setIsLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const term = search.toLowerCase();
    const matchesSearch = emp.name.toLowerCase().includes(term) ||
           emp.email.toLowerCase().includes(term) ||
           (emp.designation && emp.designation.toLowerCase().includes(term)) ||
           (emp.department && emp.department.toLowerCase().includes(term));
           
    const matchesLocation = filterLocationId === 'all' || emp.location_id === filterLocationId;
    return matchesSearch && matchesLocation;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" /> Unified Employee Directory
          </h2>
          <p className="text-muted-foreground mt-1">Manage staff directory and access controls for asset assignments.</p>
        </div>
        {userRole === 'admin' && (
          <Button onClick={handleOpenAdd} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Employee
          </Button>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, designation..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {/* Super Admin View Global Location Filter */}
        {userRole !== 'site_manager' && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Label className="text-sm font-semibold shrink-0 text-muted-foreground">Location filter:</Label>
            <Select value={filterLocationId} onValueChange={setFilterLocationId}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations (Global)</SelectItem>
                {locations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/10">
              <TableHead className="font-semibold text-foreground py-3">Employee Name</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Email Address</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Designation</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Department</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Location</TableHead>
              {userRole === 'admin' && <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                  <span className="text-sm text-muted-foreground">Loading employee directory...</span>
                </TableCell>
              </TableRow>
            ) : filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto text-muted/30 mb-2" />
                  <p className="font-semibold text-base">No employees found</p>
                  <p className="text-xs">Add employees to start assigning laptops and hardware.</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map(emp => (
                <TableRow key={emp.id} className="hover:bg-muted/5">
                  <TableCell className="font-semibold py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span>{emp.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                      <Mail size={13} />
                      <span>{emp.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 text-sm font-medium">
                    {emp.designation ? (
                      <span className="flex items-center gap-1 text-foreground">
                        <Briefcase size={13} className="text-muted-foreground" />
                        {emp.designation}
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-normal italic">None</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-sm">
                    {emp.department ? (
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">{emp.department}</Badge>
                    ) : (
                      <span className="text-muted-foreground font-normal italic">None</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-sm font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin size={13} className="text-primary shrink-0" />
                      {locations.find(l => l.id === emp.location_id)?.name || <span className="text-muted-foreground font-normal italic">None</span>}
                    </span>
                  </TableCell>
                  {userRole === 'admin' && (
                    <TableCell className="py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(emp)} className="h-8 w-8 hover:bg-primary/10 hover:text-primary">
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEmployeeToDelete(emp)} className="h-8 w-8 hover:bg-destructive/10 text-destructive">
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Add Employee</h3>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Ali Raza" required />
              </div>
              <div className="space-y-1.5">
                <Label>Email Address <span className="text-destructive">*</span></Label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="e.g. ali.raza@tajgasoline.com" required />
              </div>
              <div className="space-y-1.5">
                <Label>Designation (Optional)</Label>
                <Input value={formDesignation} onChange={e => setFormDesignation(e.target.value)} placeholder="e.g. Senior Developer" />
              </div>
              <div className="space-y-1.5">
                <Label>Department (Optional)</Label>
                <Input value={formDepartment} onChange={e => setFormDepartment(e.target.value)} placeholder="e.g. IT Department" />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned Location (Branch Mapping)</Label>
                <Select value={formLocationId} onValueChange={setFormLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Unassigned)</SelectItem>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formError && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle size={13} /> {formError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Employee'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Edit Employee Details</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Email Address <span className="text-destructive">*</span></Label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input value={formDesignation} onChange={e => setFormDesignation(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={formDepartment} onChange={e => setFormDepartment(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned Location (Branch Mapping)</Label>
                <Select value={formLocationId} onValueChange={setFormLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Unassigned)</SelectItem>
                    {locations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formError && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle size={13} /> {formError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={employeeToDelete !== null} onOpenChange={open => { if (!open) setEmployeeToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Remove Employee?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{employeeToDelete?.name}</strong> from the directory? This does not alter existing historical asset logs but removes them from future assignment selectors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Remove Employee
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
