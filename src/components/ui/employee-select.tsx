"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, UserMinus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getEmployees } from "@/app/employees/actions"

interface EmployeeSelectProps {
  value: string | null | undefined
  onChange: (value: string | null) => void
}

export function EmployeeSelect({ value, onChange }: EmployeeSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [employees, setEmployees] = React.useState<any[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")

  React.useEffect(() => {
    async function load() {
      const res = await getEmployees()
      if (res.success) {
        setEmployees(res.data)
      }
    }
    load()
  }, [])

  const selectedEmployee = employees.find(
    (emp) => emp.name === value || emp.email === value
  )

  const filtered = employees.filter((emp) => {
    const term = searchQuery.toLowerCase()
    return (
      emp.name.toLowerCase().includes(term) ||
      emp.email.toLowerCase().includes(term)
    )
  })

  return (
    <div className="relative w-full">
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between text-left font-normal bg-background hover:bg-background/80 border-input"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">
          {selectedEmployee
            ? `${selectedEmployee.name} (${selectedEmployee.email})`
            : value && value !== "Unassigned"
            ? value
            : "Unassigned"}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <>
          {/* Backdrop to close list */}
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearchQuery(""); }} />
          <div className="absolute left-0 mt-1 w-full rounded-lg border bg-popover text-popover-foreground shadow-md z-50 p-2 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 focus-visible:ring-primary/50"
                autoFocus
              />
            </div>
            <div className="max-h-52 overflow-y-auto space-y-0.5 text-sm">
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                  setSearchQuery("")
                }}
                className={cn(
                  "w-full text-left px-2 py-2 rounded-md transition-colors flex items-center justify-between font-semibold",
                  !value || value === "Unassigned"
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted text-destructive hover:text-destructive"
                )}
              >
                <span className="flex items-center gap-2">
                  <UserMinus className="h-4 w-4" /> Unassigned
                </span>
                {(!value || value === "Unassigned") && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>

              {filtered.map((emp) => {
                const isSelected = value === emp.name || value === emp.email
                return (
                  <button
                    type="button"
                    key={emp.id}
                    onClick={() => {
                      onChange(emp.name)
                      setOpen(false)
                      setSearchQuery("")
                    }}
                    className={cn(
                      "w-full text-left px-2 py-2 rounded-md transition-colors flex items-center justify-between truncate",
                      isSelected
                        ? "bg-accent text-accent-foreground font-semibold"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="truncate">
                      {emp.name} <span className="text-muted-foreground text-xs font-normal">({emp.email})</span>
                    </span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )
              })}

              {filtered.length === 0 && searchQuery && (
                <div className="text-muted-foreground text-center py-4 text-xs font-normal">
                  No employees found.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
