'use client'

import { useEffect, useState } from 'react'
import {
  fetchMyProjects,
  getAuthToken,
  type MyProject,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const PROJECT_KEY = 'polkaudit_project_id'

export function getStoredProjectId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(PROJECT_KEY)
}

export function setStoredProjectId(id: number | string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PROJECT_KEY, String(id))
  window.dispatchEvent(new Event('polkaudit-project-changed'))
}

export function ProjectSwitcher({ className }: { className?: string }) {
  const [projects, setProjects] = useState<MyProject[]>([])
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    if (!getAuthToken()) return
    ;(async () => {
      try {
        const list = await fetchMyProjects()
        setProjects(list)
        const stored = getStoredProjectId()
        const initial =
          stored && list.some((p) => String(p.project_id) === stored)
            ? stored
            : list[0]
              ? String(list[0].project_id)
              : ''
        if (initial) {
          setSelected(initial)
          setStoredProjectId(initial)
        }
      } catch {
        setProjects([])
      }
    })()
  }, [])

  if (projects.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/50 px-1">
        Workspace
      </p>
      <select
        className="w-full h-9 rounded-md border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground text-xs px-2"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          setStoredProjectId(e.target.value)
        }}
        aria-label="Switch project workspace"
      >
        {projects.map((p) => (
          <option key={p.project_id} value={p.project_id}>
            {p.name || p.slug || `Project ${p.project_id}`}
          </option>
        ))}
      </select>
    </div>
  )
}
