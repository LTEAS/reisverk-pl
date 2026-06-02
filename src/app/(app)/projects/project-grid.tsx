'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  FolderKanban,
  CheckSquare,
  X,
  Building2,
} from 'lucide-react'
import { createProject } from '@/lib/actions/projects'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectData {
  id: string
  name: string
  shortCode: string | null
  description: string | null
  byggherre: string | null
  createdAt: Date
  _count: {
    tasks: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function projectColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 55%, 55%)`
}

// ---------------------------------------------------------------------------
// ProjectGrid
// ---------------------------------------------------------------------------

export function ProjectGrid({ projects }: { projects: ProjectData[] }) {
  const [showNew, setShowNew] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Prosjekter</h1>
          <p className="text-sm text-stone-400 mt-1">
            {projects.length} prosjekt{projects.length !== 1 ? 'er' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 rounded-lg bg-[#C07A4A]/10 px-3 py-2 text-sm font-medium text-[#C07A4A] hover:bg-[#C07A4A]/20 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nytt prosjekt
        </button>
      </div>

      {showNew && <NewProjectForm onClose={() => setShowNew(false)} />}

      {projects.length > 0 ? (
        <div className="space-y-1.5">
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center mb-4">
            <FolderKanban className="h-6 w-6 text-stone-500" />
          </div>
          <h3 className="text-sm font-medium text-white mb-1">
            Ingen prosjekter ennå
          </h3>
          <p className="text-xs text-stone-500">
            Opprett ditt første prosjekt for å komme i gang.
          </p>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ProjectRow — compact list view
// ---------------------------------------------------------------------------

function ProjectRow({ project }: { project: ProjectData }) {
  const color = projectColor(project.name)

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex items-center gap-3 rounded-lg bg-[#1a1918] border border-[#2a2827] px-4 py-3 hover:bg-[#2a2827] transition-colors"
    >
      {/* Color dot */}
      <div
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Code */}
      <span className="text-xs font-mono w-10 shrink-0 text-stone-500">
        {project.shortCode || '—'}
      </span>

      {/* Name */}
      <span className="text-sm font-medium text-white truncate flex-1 group-hover:text-[#C07A4A] transition-colors">
        {project.name}
      </span>

      {/* Byggherre */}
      <span className="text-xs text-stone-500 truncate max-w-[200px] hidden sm:block">
        {project.byggherre || ''}
      </span>

      {/* Task count */}
      <span className="text-xs text-stone-500 shrink-0 flex items-center gap-1">
        <CheckSquare className="h-3 w-3" />
        {project._count.tasks}
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// NewProjectForm
// ---------------------------------------------------------------------------

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createProject(formData)
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="rounded-xl bg-[#1a1918] border border-[#C07A4A]/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Nytt prosjekt</h3>
        <button
          onClick={onClose}
          className="text-stone-500 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form action={handleSubmit} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Prosjektnavn *
            </label>
            <input
              name="name"
              required
              placeholder="F.eks. Fjordgata 12"
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1">
              Kortkode
            </label>
            <input
              name="shortCode"
              placeholder="F.eks. FG12"
              className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">
            Byggherre
          </label>
          <input
            name="byggherre"
            placeholder="Byggherre / oppdragsgiver"
            className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-400 mb-1">
            Beskrivelse
          </label>
          <textarea
            name="description"
            rows={2}
            placeholder="Kort beskrivelse av prosjektet"
            className="w-full rounded-lg bg-[#0f0e0d] border border-[#2a2827] px-3 py-2 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-[#C07A4A]/50 resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-white transition-colors"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#C07A4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#d4a574] disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Oppretter...' : 'Opprett prosjekt'}
          </button>
        </div>
      </form>
    </div>
  )
}
