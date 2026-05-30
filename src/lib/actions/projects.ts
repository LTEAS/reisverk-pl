'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyProjectRole(
  userId: string,
  projectId: string,
  allowedRoles: string[] = ['owner', 'pl']
) {
  const member = await prisma.projectMember.findFirst({
    where: {
      projectId,
      userId,
      role: { in: allowedRoles as any },
    },
  })
  if (!member) {
    throw new Error('Du har ikke rettigheter til denne handlingen')
  }
  return member
}

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

export async function createProject(formData: FormData) {
  const user = await requireUser()
  const userId = user.id

  const name = formData.get('name') as string
  const shortCode = (formData.get('shortCode') as string) || undefined
  const description = (formData.get('description') as string) || undefined
  const byggherre = (formData.get('byggherre') as string) || undefined

  if (!name) {
    throw new Error('Prosjektnavn er påkrevd')
  }

  const project = await prisma.project.create({
    data: {
      name,
      shortCode,
      description,
      byggherre,
      createdBy: userId,
      members: {
        create: {
          userId,
          role: 'owner',
        },
      },
    },
  })

  revalidatePath('/projects')
  revalidatePath('/')

  return project.id
}

// ---------------------------------------------------------------------------
// updateProject
// ---------------------------------------------------------------------------

export async function updateProject(
  projectId: string,
  data: {
    name?: string
    shortCode?: string
    description?: string
    byggherre?: string
    searchTerms?: string[]
    excludeTerms?: string[]
  }
) {
  const user = await requireUser()
  await verifyProjectRole(user.id, projectId)

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.shortCode !== undefined && { shortCode: data.shortCode }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.byggherre !== undefined && { byggherre: data.byggherre }),
      ...(data.searchTerms !== undefined && { searchTerms: data.searchTerms }),
      ...(data.excludeTerms !== undefined && {
        excludeTerms: data.excludeTerms,
      }),
    },
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
}

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------

export async function deleteProject(projectId: string) {
  const user = await requireUser()
  await verifyProjectRole(user.id, projectId, ['owner'])

  await prisma.project.delete({
    where: { id: projectId },
  })

  revalidatePath('/projects')
  revalidatePath('/')
}

// ---------------------------------------------------------------------------
// addContact
// ---------------------------------------------------------------------------

export async function addContact(
  projectId: string,
  data: {
    name: string
    email?: string
    phone?: string
    company?: string
    roleDescription?: string
  }
) {
  const user = await requireUser()
  await verifyProjectRole(user.id, projectId)

  if (!data.name) {
    throw new Error('Kontaktnavn er påkrevd')
  }

  await prisma.contact.create({
    data: {
      projectId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      roleDescription: data.roleDescription,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

// ---------------------------------------------------------------------------
// addSearchTerm
// ---------------------------------------------------------------------------

export async function addSearchTerm(projectId: string, term: string) {
  const user = await requireUser()
  await verifyProjectRole(user.id, projectId)

  if (!term.trim()) {
    throw new Error('Søkeord kan ikke være tomt')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { searchTerms: true },
  })

  if (!project) throw new Error('Prosjekt ikke funnet')

  const existing = project.searchTerms || []
  if (existing.includes(term.trim())) {
    return // Already exists
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      searchTerms: [...existing, term.trim()],
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

// ---------------------------------------------------------------------------
// removeSearchTerm
// ---------------------------------------------------------------------------

export async function removeSearchTerm(projectId: string, term: string) {
  const user = await requireUser()
  await verifyProjectRole(user.id, projectId)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { searchTerms: true },
  })

  if (!project) throw new Error('Prosjekt ikke funnet')

  await prisma.project.update({
    where: { id: projectId },
    data: {
      searchTerms: (project.searchTerms || []).filter((t) => t !== term),
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

// ---------------------------------------------------------------------------
// addEmailMonitor
// ---------------------------------------------------------------------------

export async function addEmailMonitor(
  projectId: string,
  data: { emailAddress: string; displayName?: string; description?: string }
) {
  const user = await requireUser()
  await verifyProjectRole(user.id, projectId)

  if (!data.emailAddress) {
    throw new Error('E-postadresse er påkrevd')
  }

  await prisma.emailMonitor.create({
    data: {
      projectId,
      emailAddress: data.emailAddress,
      displayName: data.displayName,
      description: data.description,
    },
  })

  revalidatePath(`/projects/${projectId}`)
}

// ---------------------------------------------------------------------------
// removeEmailMonitor
// ---------------------------------------------------------------------------

export async function removeEmailMonitor(monitorId: string) {
  const user = await requireUser()

  const monitor = await prisma.emailMonitor.findUnique({
    where: { id: monitorId },
    select: { projectId: true },
  })

  if (!monitor) throw new Error('E-postovervåking ikke funnet')

  await verifyProjectRole(user.id, monitor.projectId)

  await prisma.emailMonitor.delete({
    where: { id: monitorId },
  })

  revalidatePath(`/projects/${monitor.projectId}`)
}
