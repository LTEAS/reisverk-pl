'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  Mail,
  FolderPlus,
  Sparkles,
  X,
  ArrowRight,
  MessageSquare,
  Calendar,
  CheckSquare,
} from 'lucide-react'
import { dismissOnboarding } from '@/lib/actions/admin'

interface OnboardingProps {
  displayName: string
  state: {
    msConnected: boolean
    hasProjects: boolean
    hasBriefing: boolean
  }
}

export function Onboarding({ displayName, state }: OnboardingProps) {
  const [dismissed, setDismissed] = useState(false)
  const [, startTransition] = useTransition()

  if (dismissed) return null

  function handleDismiss() {
    setDismissed(true)
    startTransition(() => dismissOnboarding())
  }

  const steps = [
    {
      key: 'ms',
      done: state.msConnected,
      icon: Mail,
      title: 'Koble til Microsoft 365',
      description:
        'Koble til Outlook for å synkronisere e-post og kalender automatisk.',
      action: state.msConnected ? null : (
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C07A4A] hover:text-[#d4a574] transition-colors"
        >
          Gå til innstillinger <ArrowRight className="h-3 w-3" />
        </Link>
      ),
    },
    {
      key: 'project',
      done: state.hasProjects,
      icon: FolderPlus,
      title: 'Opprett ditt første prosjekt',
      description:
        'Lag et prosjekt for å begynne å spore oppgaver og fremdrift.',
      action: state.hasProjects ? null : (
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C07A4A] hover:text-[#d4a574] transition-colors"
        >
          Gå til prosjekter <ArrowRight className="h-3 w-3" />
        </Link>
      ),
    },
  ]

  const completedCount = steps.filter((s) => s.done).length

  return (
    <section className="rounded-xl bg-gradient-to-br from-[#1a1918] to-[#1f1d1b] border border-[#C07A4A]/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-0">
        <div>
          <h2 className="text-lg font-bold text-white">
            Velkommen, {displayName}!
          </h2>
          <p className="text-sm text-stone-400 mt-1">
            Kom i gang med Reisverk på noen få steg.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-stone-600 hover:text-stone-400 transition-colors p-1"
          aria-label="Lukk"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress */}
      <div className="px-5 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-[#2a2827] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#C07A4A] transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-stone-500 shrink-0">
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="p-5 space-y-3">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-start gap-3 rounded-lg px-3 py-3 transition-colors ${
              step.done
                ? 'bg-green-500/5'
                : 'bg-[#0f0e0d]/50 border border-[#2a2827]'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <Circle className="h-5 w-5 text-stone-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  step.done ? 'text-stone-400 line-through' : 'text-white'
                }`}
              >
                {step.title}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {step.description}
              </p>
              {step.action && <div className="mt-2">{step.action}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Feature highlights */}
      <div className="px-5 pb-5">
        <div className="rounded-lg bg-[#0f0e0d]/50 border border-[#2a2827] p-4">
          <p className="text-xs font-medium text-stone-400 mb-3">
            Hva du kan gjøre med Reisverk
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: MessageSquare, label: 'AI-assistent' },
              { icon: CheckSquare, label: 'Oppgavesporing' },
              { icon: Calendar, label: 'Kalendersynk' },
              { icon: Sparkles, label: 'Daglig briefing' },
            ].map((f) => (
              <div
                key={f.label}
                className="flex flex-col items-center gap-1.5 text-center"
              >
                <div className="rounded-lg bg-[#C07A4A]/10 p-2">
                  <f.icon className="h-4 w-4 text-[#C07A4A]" />
                </div>
                <span className="text-[11px] text-stone-400">{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
