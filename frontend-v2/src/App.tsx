import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Menu,
  Network,
  RefreshCw,
  X,
} from 'lucide-react'
import { ACTORS, call, type Actor, type AuditEvent, type CapacityStatus, type Commitment, type EvidenceRecord, type Health, type Institution, type InstitutionSession, type InventoryUpdateResult, type Proposal, type SystemAuditEvent } from './api'

const BG_IMAGE_1 =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260609_195923_b0ba8ace-1d1d-4f2c-9a28-1ab84b330680.png&w=1280&q=85'
const BG_IMAGE_2 =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260609_201152_bba90a12-bf12-459f-91f0-51f237dbaf3b.png&w=1280&q=85'
const SPOTLIGHT_R = 260

interface CursorPosition {
  x: number
  y: number
}

interface RevealLayerProps {
  image: string
  cursorX: number
  cursorY: number
}

interface AuditInspection {
  commitment: Commitment
  events: AuditEvent[]
  evidence: EvidenceRecord[]
  integrity: { valid: boolean; total_records: number }
  onchain: Record<string, unknown>
}

type ModalState =
  | { type: 'authorize'; approved: boolean }
  | { type: 'dispute'; commitment: Commitment }
  | { type: 'resolve'; commitment: Commitment }
  | null

type AppPage = 'home' | 'network' | 'capacity' | 'reservations' | 'audit'

function pageFromPath(pathname: string): AppPage {
  switch (pathname.replace(/\/+$/, '') || '/') {
    case '/network':
      return 'network'
    case '/capacity':
      return 'capacity'
    case '/reservations':
      return 'reservations'
    case '/audit':
      return 'audit'
    default:
      return 'home'
  }
}

function RevealLayer({ image, cursorX, cursorY }: RevealLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const resizeCanvas = () => setCanvasSize({ width: window.innerWidth, height: window.innerHeight })
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const reveal = revealRef.current
    if (!canvas || !reveal || canvasSize.width === 0 || canvasSize.height === 0) return

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to create the spotlight mask canvas.')

    context.clearRect(0, 0, canvasSize.width, canvasSize.height)
    const gradient = context.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, SPOTLIGHT_R)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.75)')
    gradient.addColorStop(0.75, 'rgba(255,255,255,0.4)')
    gradient.addColorStop(0.88, 'rgba(255,255,255,0.12)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.beginPath()
    context.arc(cursorX, cursorY, SPOTLIGHT_R, 0, Math.PI * 2)
    context.fill()

    const maskImage = `url("${canvas.toDataURL()}")`
    reveal.style.maskImage = maskImage
    reveal.style.webkitMaskImage = maskImage
  }, [canvasSize, cursorX, cursorY])

  return (
    <>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="pointer-events-none absolute inset-0"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <div
        ref={revealRef}
        className="pointer-events-none absolute inset-0 z-30 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url("${image}")`,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
        }}
        aria-hidden="true"
      />
    </>
  )
}

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>(() => pageFromPath(window.location.pathname))
  const mouse = useRef<CursorPosition>({ x: -999, y: -999 })
  const smooth = useRef<CursorPosition>({ x: -999, y: -999 })
  const rafRef = useRef<number | null>(null)
  const [cursorPos, setCursorPos] = useState<CursorPosition>({ x: -999, y: -999 })
  const [actorId, setActorId] = useState(() => sessionStorage.getItem('medway.actor') ?? ACTORS[0].id)
  const [sessionActor, setSessionActor] = useState<Actor | null>(null)
  const [sessionMode, setSessionMode] = useState<InstitutionSession['mode'] | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [sessionError, setSessionError] = useState('')
  const [requesterId, setRequesterId] = useState(() => (
    ACTORS.some((item) => item.id === sessionStorage.getItem('medway.actor') && item.role === 'requester')
      ? sessionStorage.getItem('medway.actor')!
      : ACTORS.find((item) => item.role === 'requester')!.id
  ))
  const [health, setHealth] = useState<Health | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [capacities, setCapacities] = useState<Record<string, CapacityStatus>>({})
  const [capacityErrors, setCapacityErrors] = useState<Record<string, string>>({})
  const [capacityLoadingProvider, setCapacityLoadingProvider] = useState<string | null>(null)
  const [inventoryProviderId, setInventoryProviderId] = useState(() => ACTORS.find((item) => item.role === 'provider')!.id)
  const [inventoryQuantity, setInventoryQuantity] = useState(12)
  const [inventoryActive, setInventoryActive] = useState(true)
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [auditEvents, setAuditEvents] = useState<SystemAuditEvent[]>([])
  const [auditIntegrity, setAuditIntegrity] = useState<{ valid: boolean; total_records: number; message?: string } | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [quantity, setQuantity] = useState(3)
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>('urgent')
  const [approver, setApprover] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [resolution, setResolution] = useState<'Cancelled' | 'Fulfilled'>('Cancelled')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const requestDialogRef = useRef<HTMLDivElement>(null)
  const [inspection, setInspection] = useState<AuditInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const actor: Actor = ACTORS.find((item) => item.id === actorId) ?? ACTORS[0]
  const sessionReady = sessionStatus === 'connected' && sessionActor?.id === actorId
  const actorOptions = { actor: sessionActor ?? actor }
  const blockchain = health?.blockchain
  const activeSigner = blockchain?.institution_signers?.[actor.id]
  const backendReady = health?.status === 'ok'
  const approvalInstitutionId = proposal?.request.requesting_institution_id
  const approvalSigner = approvalInstitutionId ? blockchain?.institution_signers?.[approvalInstitutionId] : undefined
  const approvalBlockers = [
    !blockchain ? 'Waiting for backend blockchain readiness.' : null,
    blockchain && blockchain.status !== 'connected' ? 'The Coral network is not connected.' : null,
    blockchain && !approvalSigner?.hasKey
      ? approvalSigner?.signerError ?? 'The requesting institution signing key is not configured in the backend.'
      : null,
    blockchain && approvalInstitutionId && !blockchain.institutions_registered?.includes(approvalInstitutionId)
      ? 'The requesting institution wallet is not registered with the configured contract.'
      : null,
    blockchain && !blockchain.relayer_configured
      ? blockchain.relayer_error ?? 'The backend Coral relayer is not configured.'
      : null,
  ].filter((blocker): blocker is string => Boolean(blocker))

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(pageFromPath(window.location.pathname))
      setMobileMenuOpen(false)
      setRequestOpen(false)
      window.scrollTo({ top: 0, behavior: 'instant' })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const pageTitle = navigation.find((item) => item.key === currentPage)?.label
    document.title = pageTitle ? `MEDway · ${pageTitle}` : 'MEDway · Healthcare Capacity Coordination'
  }, [currentPage])

  useEffect(() => {
    sessionStorage.setItem('medway.actor', actor.id)
    sessionStorage.removeItem('medway.apiKey')
  }, [actor.id])

  useEffect(() => {
    let active = true
    const selectedActor = ACTORS.find((item) => item.id === actorId)
    if (!selectedActor) {
      setSessionStatus('error')
      setSessionActor(null)
      setSessionError('Select a registered institution.')
      return
    }

    setSessionActor(null)
    setSessionMode(null)
    setSessionStatus('connecting')
    setSessionError('')

    const timeoutId = window.setTimeout(() => {
      void call<InstitutionSession>('/session', {
        actor: selectedActor,
      }).then((session) => {
        if (!active) return
        if (session.actor.id !== selectedActor.id) {
          throw new Error('The backend returned a different institution than the one selected.')
        }
        setSessionActor(session.actor)
        setSessionMode(session.mode)
        setSessionStatus('connected')
      }).catch((reason: unknown) => {
        if (!active) return
        setSessionActor(null)
        setSessionMode(null)
        setSessionStatus('error')
        setSessionError(reason instanceof Error ? reason.message : 'Unable to connect this institution session.')
      })
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [actorId])

  useEffect(() => {
    if (actor.role === 'requester') setRequesterId(actor.id)
  }, [actor.id, actor.role])

  useEffect(() => {
    if (actor.role === 'provider') setInventoryProviderId(actor.id)
  }, [actor.id, actor.role])

  useEffect(() => {
    if (!requestOpen) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestDialogRef.current?.querySelector<HTMLElement>('select, input, button')?.focus()

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRequestOpen(false)
        return
      }

      if (event.key !== 'Tab' || !requestDialogRef.current) return
      const focusable = Array.from(
        requestDialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleDialogKeyDown)
    return () => {
      window.removeEventListener('keydown', handleDialogKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [requestOpen])

  function openRequest() {
    const currentRequester = ACTORS.find((item) => item.id === actor.id && item.role === 'requester')
    if (currentRequester) setRequesterId(currentRequester.id)
    setProposal(null)
    setError('')
    setNotice('')
    setMobileMenuOpen(false)
    setRequestOpen(true)
  }

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      mouse.current = { x: event.clientX, y: event.clientY }
    }

    const animateCursor = () => {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.1
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.1
      setCursorPos({ x: smooth.current.x, y: smooth.current.y })
      rafRef.current = window.requestAnimationFrame(animateCursor)
    }

    window.addEventListener('mousemove', handleMouseMove)
    rafRef.current = window.requestAnimationFrame(animateCursor)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  async function refreshData() {
    try {
      const [healthResult, institutionResults, commitmentResults] = await Promise.all([
        call<Health>('/health'),
        call<Institution[]>('/institutions'),
        call<Commitment[]>('/commitments'),
      ])
      setHealth(healthResult)
      setInstitutions(institutionResults)
      setCommitments(commitmentResults)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to reach the MEDway API.')
    }
  }

  async function refreshCapacity(providerId: string) {
    setCapacityLoadingProvider(providerId)
    setCapacityErrors((current) => {
      const next = { ...current }
      delete next[providerId]
      return next
    })
    try {
      const result = await call<CapacityStatus>(`/capacity/${encodeURIComponent(providerId)}/diagnostic_slot`)
      if (!result.success) throw new Error('The backend did not return a capacity snapshot.')
      setCapacities((current) => ({ ...current, [providerId]: result }))
    } catch (reason) {
      setCapacityErrors((current) => ({
        ...current,
        [providerId]: reason instanceof Error ? reason.message : 'Unable to load on-chain capacity.',
      }))
    } finally {
      setCapacityLoadingProvider((current) => current === providerId ? null : current)
    }
  }

  async function refreshAudit() {
    setAuditLoading(true)
    try {
      const [events, integrity] = await Promise.all([
        call<SystemAuditEvent[]>('/audit?limit=100'),
        call<{ valid: boolean; total_records: number; message?: string }>('/audit/verify'),
      ])
      setAuditEvents(events)
      setAuditIntegrity(integrity)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the audit log.')
    } finally {
      setAuditLoading(false)
    }
  }

  async function updateInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!beginAction('Updating provider inventory on-chain...')) return
    try {
      const result = await call<InventoryUpdateResult>('/inventory', {
        method: 'POST',
        ...actorOptions,
        body: {
          provider_id: inventoryProviderId,
          resource_type: 'diagnostic_slot',
          total_capacity: inventoryQuantity,
          is_active: inventoryActive,
        },
      })
      if (!result.success) throw new Error('The backend did not confirm the inventory update.')
      setNotice(result.blockNumber
        ? `Provider inventory updated in block ${result.blockNumber}.`
        : 'Provider inventory updated.')
      await refreshCapacity(inventoryProviderId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update provider inventory.')
    } finally {
      endAction()
    }
  }

  useEffect(() => {
    void refreshData()
    const intervalId = window.setInterval(() => void refreshData(), 30000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if ((currentPage !== 'capacity' && currentPage !== 'network') || blockchain?.capacity_supported === false) return
    for (const provider of ACTORS.filter((item) => item.role === 'provider')) {
      void refreshCapacity(provider.id)
    }
  }, [currentPage, blockchain?.capacity_supported])

  useEffect(() => {
    if (currentPage === 'audit') void refreshAudit()
  }, [currentPage])

  function beginAction(label: string): boolean {
    if (!sessionReady) {
      setError(sessionStatus === 'error'
        ? sessionError
        : 'Wait for the selected institution to connect to the backend before continuing.')
      return false
    }
    setBusy(true)
    setBusyLabel(label)
    setError('')
    setNotice('')
    return true
  }

  function endAction() {
    setBusy(false)
    setBusyLabel('')
  }

  async function discoverCapacity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!beginAction('Finding verified capacity...')) return
    setProposal(null)
    try {
      const requester = ACTORS.find((item) => item.id === requesterId && item.role === 'requester')
      if (!requester) throw new Error('Choose a valid requesting institution.')
      if (sessionActor?.id !== requester.id) {
        throw new Error('Connect the selected requesting institution in Institution session before submitting.')
      }
      const result = await call<Proposal>('/requests', {
        method: 'POST',
        ...actorOptions,
        body: {
          requesting_institution_id: requester.id,
          resource_type: 'diagnostic_slot',
          quantity,
          urgency,
          required_by_hours: urgency === 'critical' ? 4 : urgency === 'urgent' ? 12 : 24,
        },
      })
      setProposal(result)
      setNotice(result.selected_provider_id ? 'A provider match is ready for coordinator approval.' : 'No provider currently meets this request.')
      if (result.selected_provider_id) await refreshCapacity(result.selected_provider_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Capacity discovery failed.')
    } finally {
      endAction()
    }
  }

  async function authorizeProposal(approved: boolean) {
    if (!proposal?.proposal_id) return
    const providerId = proposal.selected_provider_id
    if (approved && approvalBlockers.length > 0) {
      setError(`On-chain approval is unavailable: ${approvalBlockers.join(' ')}`)
      return
    }
    if (!beginAction(approved ? 'Submitting EIP-712 reservation to Coral...' : 'Declining the provider proposal...')) return
    try {
      const result = await call<{ commitment?: Commitment; message?: string }>(
        `/proposals/${proposal.proposal_id}/authorize`,
        {
          method: 'POST',
          ...actorOptions,
          body: { approved, approved_by: approver.trim() },
        },
      )
      setNotice(result.commitment?.message ?? result.message ?? 'Proposal updated.')
      setProposal(null)
      setModal(null)
      setApprover('')
      setRequestOpen(false)
      if (providerId) await refreshCapacity(providerId)
      await refreshData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Proposal authorization failed.')
    } finally {
      endAction()
    }
  }

  async function updateCommitment(commitment: Commitment, action: 'accept' | 'fulfill') {
    const label = action === 'accept' ? 'Accepting reservation on Coral...' : 'Confirming delivery on Coral...'
    if (!beginAction(label)) return
    try {
      const result = await call<{ blockchain?: { blockNumber?: number }; message?: string }>(
        `/commitments/${commitment.commitment_id}/${action}`,
        { method: 'POST', ...actorOptions },
      )
      const block = result.blockchain?.blockNumber
      setNotice(block ? `${action === 'accept' ? 'Reservation accepted' : 'Delivery confirmed'} in block ${block}.` : result.message ?? 'Reservation updated.')
      await refreshData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Unable to ${action} this reservation.`)
    } finally {
      endAction()
    }
  }

  async function submitDispute() {
    if (modal?.type !== 'dispute' || disputeReason.trim().length < 5) return
    if (!beginAction('Hashing evidence and submitting dispute...')) return
    try {
      const result = await call<{ blockchain?: { blockNumber?: number } }>(
        `/commitments/${modal.commitment.commitment_id}/dispute`,
        {
          method: 'POST',
          ...actorOptions,
          body: { disputed_by: actor.id, reason: disputeReason.trim() },
        },
      )
      setNotice(result.blockchain?.blockNumber ? `Dispute recorded on Coral in block ${result.blockchain.blockNumber}.` : 'Dispute recorded.')
      setDisputeReason('')
      setModal(null)
      await refreshData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dispute submission failed.')
    } finally {
      endAction()
    }
  }

  async function submitResolution() {
    if (modal?.type !== 'resolve' || resolutionNotes.trim().length < 5) return
    if (!beginAction('Publishing arbitration ruling to Coral...')) return
    try {
      const result = await call<{ blockchain?: { blockNumber?: number } }>(
        `/commitments/${modal.commitment.commitment_id}/resolve`,
        {
          method: 'POST',
          ...actorOptions,
          body: { resolution, notes: resolutionNotes.trim() },
        },
      )
      setNotice(result.blockchain?.blockNumber ? `Ruling recorded on Coral in block ${result.blockchain.blockNumber}.` : 'Ruling recorded.')
      setResolutionNotes('')
      setModal(null)
      await refreshData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Arbitration failed.')
    } finally {
      endAction()
    }
  }

  async function inspectCommitment(commitment: Commitment) {
    if (!beginAction('Loading reservation and audit proofs...')) return
    try {
      const [auditResult, verification, evidenceResult, onchainResult] = await Promise.all([
        call<{ audit_trail: AuditEvent[] }>(`/commitments/${commitment.commitment_id}/audit`),
        call<{ valid: boolean; total_records: number }>('/audit/verify'),
        call<{ evidence: EvidenceRecord[] }>(`/commitments/${commitment.commitment_id}/evidence`),
        call<Record<string, unknown>>(`/commitments/${commitment.commitment_id}/onchain`),
      ])
      setInspection({
        commitment,
        events: auditResult.audit_trail,
        evidence: evidenceResult.evidence,
        integrity: verification,
        onchain: onchainResult,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load reservation details.')
    } finally {
      endAction()
    }
  }

  function statusClass(status: string) {
    switch (status.toLowerCase()) {
      case 'committed':
      case 'fulfilled':
        return 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200'
      case 'disputed':
        return 'border-orange-300/30 bg-orange-300/10 text-orange-200'
      case 'cancelled':
      case 'expired':
        return 'border-white/15 bg-white/5 text-white/55'
      default:
        return 'border-sky-300/25 bg-sky-300/10 text-sky-200'
    }
  }

  function institutionName(id: string) {
    return institutions.find((institution) => institution.id === id)?.name ?? id
  }

  const commitmentCounts = commitments.reduce(
    (counts, commitment) => {
      const status = (commitment.onchain_status ?? commitment.status).toLowerCase()
      if (['proposed', 'committed'].includes(status)) counts.active += 1
      if (status === 'fulfilled') counts.fulfilled += 1
      if (status === 'disputed') counts.disputed += 1
      if (['cancelled', 'expired'].includes(status)) counts.closed += 1
      return counts
    },
    { active: 0, fulfilled: 0, disputed: 0, closed: 0 },
  )

  const navigation = [
    { href: '/network', label: 'Network', key: 'network' as const },
    { href: '/capacity', label: 'Capacity', key: 'capacity' as const },
    { href: '/reservations', label: 'Reservations', key: 'reservations' as const },
    { href: '/audit', label: 'Audit', key: 'audit' as const },
  ]

  function navigateToPage(event: ReactMouseEvent<HTMLAnchorElement>, page: AppPage, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (window.location.pathname !== href) window.history.pushState({}, '', href)
    setCurrentPage(page)
    setMobileMenuOpen(false)
    setRequestOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  return (
    <div className="min-h-screen bg-[#070808] tracking-[-0.02em] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <nav aria-label="Main navigation" className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between p-4 sm:p-5">
        <a href="/" onClick={(event) => navigateToPage(event, 'home', '/')} className="flex items-center gap-2.5" aria-label="MEDway home">
          <svg width="26" height="26" viewBox="0 0 256 256" fill="#ffffff" aria-hidden="true">
            <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z M 256 128 L 128 128 L 0 0 L 128 0 Z" />
          </svg>
          <span className="font-playfair text-2xl italic text-white">MEDway</span>
        </a>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/25 bg-black/35 px-2 py-2 backdrop-blur-md md:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => navigateToPage(event, item.key, item.href)}
              aria-current={currentPage === item.key ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 ${currentPage === item.key ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/15 hover:text-white'}`}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={openRequest} className="hidden rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 sm:block">
            New request
          </button>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur-md md:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="absolute left-4 right-4 top-[calc(100%+0.25rem)] flex flex-col gap-1 rounded-2xl border border-white/20 bg-black/85 p-3 shadow-xl backdrop-blur-xl md:hidden">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(event) => navigateToPage(event, item.key, item.href)}
                aria-current={currentPage === item.key ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-xl px-4 text-sm font-medium transition-colors hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 ${currentPage === item.key ? 'bg-white/15 text-white' : 'text-white/75'}`}
              >
                {item.label}
              </a>
            ))}
            <button type="button" onClick={openRequest} className="mt-1 flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-gray-900">
              New request
            </button>
          </div>
        )}
      </nav>

      {currentPage === 'home' && <section className="relative h-screen w-full overflow-hidden bg-black" style={{ height: '100dvh' }}>
        <div className="hero-zoom absolute inset-0 z-10 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${BG_IMAGE_1}")` }} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/50 via-black/10 to-black/85" aria-hidden="true" />
        <RevealLayer image={BG_IMAGE_2} cursorX={cursorPos.x} cursorY={cursorPos.y} />

        <div className="absolute left-0 right-0 top-[22%] z-50 flex flex-col items-center px-5 text-center sm:top-[20%]">
          <h1 className="leading-[0.95] text-white">
            <span className="hero-anim hero-reveal block font-playfair text-5xl font-normal italic sm:text-7xl md:text-8xl" style={{ letterSpacing: '-0.05em', animationDelay: '0.25s' }}>
              Capacity moves
            </span>
            <span className="hero-anim hero-reveal -mt-1 block text-5xl font-normal sm:text-7xl md:text-8xl" style={{ letterSpacing: '-0.08em', animationDelay: '0.42s' }}>
              trust stays on-chain
            </span>
          </h1>
          <p className="hero-anim hero-fade mt-6 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base" style={{ animationDelay: '0.65s' }}>
            Connect healthcare capacity across institutions, authorize every reservation, and track each handoff with confidence.
          </p>
          <button type="button" onClick={openRequest} className="hero-anim hero-fade mt-7 inline-flex items-center gap-2 rounded-full bg-[#e8702a] px-7 py-3 text-sm font-medium text-white transition-all hover:scale-[1.03] hover:bg-[#d2611f] active:scale-95" style={{ animationDelay: '0.85s' }}>
            Request capacity <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="absolute bottom-7 left-5 right-5 z-50 flex items-end justify-between gap-5 sm:bottom-9 sm:left-10 sm:right-10 md:left-14 md:right-14">
          <p className="hero-anim hero-fade hidden max-w-[260px] text-sm leading-relaxed text-white/75 sm:block" style={{ animationDelay: '0.7s' }}>
            Human-approved healthcare resource reservations, recorded with tamper-evident audit trails.
          </p>
        </div>
      </section>}

      {currentPage !== 'home' && (
        <header className="border-b border-white/10 bg-[#0a0c0c] px-4 pb-8 pt-28 sm:px-7 sm:pb-10 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">MEDway · Coordination workspace</p>
            <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">{navigation.find((item) => item.key === currentPage)?.label}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
              {currentPage === 'network' && 'View participating healthcare institutions and registered resource providers.'}
              {currentPage === 'capacity' && 'Find available diagnostic capacity and manage provider inventory.'}
              {currentPage === 'reservations' && 'Track reservation status, provider actions, disputes, and arbitration.'}
              {currentPage === 'audit' && 'Review the hash-chained audit log and verify record integrity.'}
            </p>
          </div>
        </header>
      )}

      <main className={`mx-auto max-w-7xl space-y-8 px-4 sm:px-7 lg:px-10 ${currentPage === 'home' ? 'py-10 sm:py-14' : 'py-8 sm:py-10'}`}>
        <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end" aria-labelledby="session-title">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Institution session</p>
            <h2 id="session-title" className="text-xl font-medium tracking-tight sm:text-2xl">Choose who is coordinating</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">Choose the institution coordinating this workflow. The backend confirms the selected institution automatically.</p>
          </div>
          <div className="grid gap-3 lg:min-w-[300px]">
            <label className="text-xs font-medium text-white/70">
              Active institution
              <select value={actor.id} onChange={(event) => setActorId(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white">
                {ACTORS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
              </select>
            </label>
            <p role="status" aria-live="polite" className={`text-xs sm:col-span-2 ${sessionStatus === 'error' ? 'text-rose-200' : sessionStatus === 'connected' ? 'text-emerald-200' : 'text-white/55'}`}>
              {sessionStatus === 'connecting'
                ? `Connecting ${actor.name} to the backend…`
                : sessionStatus === 'error'
                  ? `Institution session failed: ${sessionError}`
                  : !activeSigner?.hasKey
                    ? `Backend session active for ${sessionActor?.name}. The institution's on-chain signer must be configured by the backend operator.`
                    : !blockchain?.institutions_registered?.includes(actor.id)
                      ? `Session active for ${sessionActor?.name}. Its wallet must be registered with the deployed contract.`
                      : !blockchain.relayer_configured
                        ? `Session active for ${sessionActor?.name}. ${blockchain.relayer_error ?? 'The backend operator must configure the Coral relayer for on-chain actions.'}`
                        : sessionMode === 'api_key'
                          ? `Backend session verified for ${sessionActor?.name}; on-chain signing is ready.`
                          : `Backend session active for ${sessionActor?.name}; on-chain signing is ready.`}
            </p>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-300/25 bg-rose-300/[0.08] p-4 text-sm text-rose-100">
            <CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Backend request failed</p>
              <p className="mt-1 break-words text-rose-100/75">{error}</p>
              {!backendReady && <p className="mt-2 text-rose-100/60">Start the FastAPI server on port 8000, then refresh this page.</p>}
            </div>
            <button type="button" onClick={() => void refreshData()} className="flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-3 text-xs hover:bg-white/10"><RefreshCw size={14} /> Retry</button>
          </div>
        )}

        {notice && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-sm text-emerald-100">
            <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        {(currentPage === 'home' || currentPage === 'network') && <section id="network" className="space-y-6">
          {currentPage === 'network' && (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">01 / Institutional network</p>
                <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Participating institutions</h2>
                <p className="mt-2 text-sm text-white/50">Review institution roles, capacity profiles, and backend transaction readiness.</p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={<Network size={17} />} label="Institutions" value={String(institutions.length)} detail="Profiles available to coordinate" />
            <MetricCard icon={<Check size={17} />} label="Signer keys" value={String(Object.values(blockchain?.institution_signers ?? {}).filter((signer) => signer.hasKey).length)} detail="Valid backend institution signers" />
            <MetricCard icon={<Activity size={17} />} label="Coral network" value={blockchain?.status === 'connected' ? 'Connected' : 'Unavailable'} detail={blockchain?.network ?? 'Waiting for backend status'} />
            <MetricCard icon={<CircleAlert size={17} />} label="Relayer" value={blockchain?.relayer_configured ? 'Ready' : 'Not configured'} detail="Backend gas sponsorship" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {institutions.map((institution) => {
              const signer = blockchain?.institution_signers?.[institution.id]
              const actorForInstitution = ACTORS.find((item) => item.id === institution.id)
              const registered = blockchain?.institutions_registered?.includes(institution.id)
              return (
                <article key={institution.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-white/90">{institution.name}</p>
                      <p className="mt-1 text-xs capitalize text-white/45">{institution.type.replaceAll('_', ' ')}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs capitalize text-white/70">
                      {actorForInstitution?.role ?? 'institution'}
                    </span>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <dt className="text-[10px] uppercase tracking-[0.13em] text-white/40">Diagnostic slots</dt>
                      <dd className="mt-1 text-lg font-medium text-white/85">{institution.resources.diagnostic_slot ?? 0}</dd>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <dt className="text-[10px] uppercase tracking-[0.13em] text-white/40">Wallet registry</dt>
                      <dd className={`mt-1 text-sm font-medium ${registered ? 'text-emerald-200' : 'text-white/60'}`}>
                        {registered ? 'Registered' : 'Unverified'}
                      </dd>
                    </div>
                  </dl>
                  <p className={`mt-4 flex items-center gap-2 text-xs ${signer?.hasKey ? 'text-emerald-200/80' : 'text-amber-100/75'}`}>
                    {signer?.hasKey ? <CircleCheck size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
                    {signer?.hasKey ? 'Backend signer configured' : signer?.signerError ?? 'Backend signer not configured'}
                  </p>
                </article>
              )
            })}
            {!institutions.length && (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-12 text-center md:col-span-2 xl:col-span-3">
                <p className="text-sm font-medium text-white/80">Institution data is loading</p>
                <p className="mt-1 text-sm text-white/45">Connect to the backend to view participating institutions.</p>
              </div>
            )}
          </div>
        </section>}

        {currentPage === 'capacity' && <section id="capacity" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">02 / Capacity discovery</p>
              <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Provider capacity</h2>
              <p className="mt-2 text-sm text-white/50">Capacity snapshots and inventory updates are read from and written to the backend contract integration.</p>
            </div>
            <button type="button" onClick={openRequest} className="min-h-11 rounded-full bg-[#e8702a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d2611f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
              New request
            </button>
          </div>

          {blockchain?.capacity_supported === false && (
            <div role="status" className="rounded-2xl border border-amber-200/20 bg-amber-200/[0.06] p-4 text-sm leading-relaxed text-amber-100/85">
              <p className="font-medium">Capacity inventory is not enabled on the current Coral deployment.</p>
              <p className="mt-1 text-xs text-amber-100/70">
                {blockchain.capacity_error ?? 'Deploy the updated MEDway contract and update CONTRACT_ADDRESS before querying or changing on-chain capacity.'}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {institutions.filter((institution) => ACTORS.some((item) => item.id === institution.id && item.role === 'provider')).map((institution) => {
              const capacity = capacities[institution.id]
              return (
                <article key={institution.id} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{institution.name}</p>
                      <p className="mt-1 text-xs capitalize text-white/45">{institution.type.replaceAll('_', ' ')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshCapacity(institution.id)}
                      disabled={capacityLoadingProvider === institution.id || blockchain?.capacity_supported === false}
                      className="min-h-11 rounded-full border border-white/15 px-4 text-xs text-white/75 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-45"
                    >
                      {capacityLoadingProvider === institution.id ? 'Checking…' : 'Refresh capacity'}
                    </button>
                  </div>
                  {capacity ? (
                    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ['Total', capacity.totalCapacity],
                        ['Available', capacity.availableCapacity],
                        ['Locked', capacity.lockedCapacity],
                        ['Committed', capacity.committedCapacity],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <dt className="text-[10px] uppercase tracking-[0.13em] text-white/40">{label}</dt>
                          <dd className="mt-1 text-lg font-medium text-white/85">{value}</dd>
                        </div>
                      ))}
                      <p className={`col-span-full text-xs ${capacity.isActive ? 'text-emerald-200/80' : 'text-white/45'}`}>
                        {capacity.isActive ? 'Accepting requests' : 'Not accepting requests'}
                      </p>
                    </dl>
                  ) : (
                    <p className="mt-5 text-sm text-white/45">Capacity has not been checked yet.</p>
                  )}
                  {capacityErrors[institution.id] && (
                    <p role="alert" className="mt-4 break-words rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-xs leading-relaxed text-rose-100/80">
                      {capacityErrors[institution.id]}
                    </p>
                  )}
                </article>
              )
            })}
          </div>

          {(actor.role === 'provider' || actor.role === 'arbitrator') ? (
            <form onSubmit={updateInventory} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end sm:p-7">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-orange-300">Provider inventory</p>
                {actor.role === 'arbitrator' ? (
                  <label className="block text-xs font-medium text-white/70">
                    Provider institution
                    <select
                      value={inventoryProviderId}
                      onChange={(event) => setInventoryProviderId(event.target.value)}
                      className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                    >
                      {ACTORS.filter((item) => item.role === 'provider').map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="min-h-11 content-center text-sm text-white/75">{institutionName(inventoryProviderId)}</p>
                )}
              </div>
              <label className="block text-xs font-medium text-white/70">
                Total diagnostic slots
                <input type="number" min={0} max={10000} required value={inventoryQuantity} onChange={(event) => setInventoryQuantity(Number(event.target.value))} className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
                <label className="flex min-h-11 items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" checked={inventoryActive} onChange={(event) => setInventoryActive(event.target.checked)} className="h-4 w-4 accent-orange-500" />
                  Accepting requests
                </label>
                <button type="submit" disabled={busy || blockchain?.capacity_supported === false || (actor.role !== 'arbitrator' && actor.id !== inventoryProviderId)} className="min-h-11 rounded-full bg-[#e8702a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d2611f] disabled:cursor-not-allowed disabled:opacity-45">
                  {busy ? busyLabel : 'Update inventory'}
                </button>
              </div>
            </form>
          ) : (
            <p className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-white/55">Switch to the provider institution or an arbitrator account to update inventory.</p>
          )}
        </section>}

        {(currentPage === 'home' || currentPage === 'reservations') && <section id="reservations" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">04 / Reservation lifecycle</p>
              <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">On-chain commitments</h2>
              <p className="mt-2 text-sm text-white/50">Provider acceptance, fulfillment, disputes, arbitration, and audit proofs.</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55">{commitments.length} reservation{commitments.length === 1 ? '' : 's'}</span>
          </div>

          {currentPage === 'reservations' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={<Activity size={17} />} label="Total reservations" value={String(commitments.length)} detail="Recorded in the coordination system" />
              <MetricCard icon={<Clock3 size={17} />} label="In progress" value={String(commitmentCounts.active)} detail="Awaiting completion or provider action" />
              <MetricCard icon={<CircleCheck size={17} />} label="Fulfilled" value={String(commitmentCounts.fulfilled)} detail="Delivery confirmed by provider" />
              <MetricCard icon={<CircleAlert size={17} />} label="Disputed" value={String(commitmentCounts.disputed)} detail={`${commitmentCounts.closed} closed or expired`} />
            </div>
          )}

          {commitments.length ? (
            <div className="grid gap-4">
              {commitments.map((commitment) => (
                <CommitmentCard
                  key={commitment.commitment_id}
                  commitment={commitment}
                  actor={actor}
                  busy={busy}
                  statusClass={statusClass}
                  institutionName={institutionName}
                  inspect={() => void inspectCommitment(commitment)}
                  accept={() => void updateCommitment(commitment, 'accept')}
                  fulfill={() => void updateCommitment(commitment, 'fulfill')}
                  dispute={() => { setDisputeReason(''); setModal({ type: 'dispute', commitment }) }}
                  resolve={() => { setResolutionNotes(''); setResolution('Cancelled'); setModal({ type: 'resolve', commitment }) }}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-12 text-center">
              <Clock3 size={22} className="mx-auto text-white/45" />
              <p className="mt-4 text-sm font-medium text-white/80">No reservations yet</p>
              <p className="mt-1 text-sm text-white/45">Find capacity and approve a provider proposal to create the first on-chain commitment.</p>
            </div>
          )}
        </section>}

        {(currentPage === 'home' || currentPage === 'audit') && (
          <section id="audit" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">06 / Audit & integrity</p>
                <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">System audit trail</h2>
                <p className="mt-2 text-sm text-white/50">A readable timeline of requests, reservations, and institution actions.</p>
              </div>
              <button
                type="button"
                onClick={() => void refreshAudit()}
                disabled={auditLoading}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/80 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-45"
              >
                <RefreshCw size={15} className={auditLoading ? 'animate-spin' : ''} aria-hidden="true" />
                {auditLoading ? 'Verifying…' : 'Refresh audit'}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={<Activity size={17} />} label="Activity records" value={String(auditEvents.length)} detail="Events in this system timeline" />
              <MetricCard
                icon={auditIntegrity?.valid ? <CircleCheck size={17} /> : <CircleAlert size={17} />}
                label="Record check"
                value={auditIntegrity ? (auditIntegrity.valid ? 'Verified' : 'Needs review') : auditLoading ? 'Checking' : 'Not checked'}
                detail={auditIntegrity ? `${auditIntegrity.total_records} records reviewed` : 'Refresh to check records'}
              />
              <MetricCard
                icon={<Clock3 size={17} />}
                label="Most recent activity"
                value={auditEvents.length ? new Date(auditEvents[0].timestamp * 1000).toLocaleDateString() : 'No activity'}
                detail={auditEvents.length ? new Date(auditEvents[0].timestamp * 1000).toLocaleTimeString() : 'New actions appear here'}
              />
              <MetricCard icon={<Network size={17} />} label="Service status" value={blockchain?.status === 'connected' ? 'Connected' : 'Unavailable'} detail="Secure activity verification" />
            </div>

            {auditIntegrity && (
              <div className={`flex items-start gap-3 rounded-2xl border p-4 ${auditIntegrity.valid ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100' : 'border-rose-300/25 bg-rose-300/[0.07] text-rose-100'}`}>
                {auditIntegrity.valid ? <Check size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
                <div>
                  <p className="text-sm font-medium">{auditIntegrity.valid ? 'Activity records are verified' : 'Some activity records need review'}</p>
                  <p className="mt-1 text-xs opacity-70">
                    {auditIntegrity.total_records} records checked{auditIntegrity.message ? ` · ${auditIntegrity.message}` : ''}
                  </p>
                </div>
              </div>
            )}

            {auditEvents.length > 0 ? (
              <div className="space-y-3">
                {auditEvents.map((event) => (
                  <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white/90">{auditActionTitle(event.action)}</p>
                        <p className="mt-1 text-sm leading-relaxed text-white/65">{auditEventDescription(event, institutionName)}</p>
                        <p className="mt-2 text-xs text-white/45">Recorded by {institutionName(event.actor)} · {event.role.replaceAll('_', ' ')}</p>
                      </div>
                      <time className="text-xs text-white/45">{new Date(event.timestamp * 1000).toLocaleString()}</time>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-12 text-center">
                <p className="text-sm font-medium text-white/80">{auditLoading ? 'Loading audit records…' : 'No audit events recorded yet'}</p>
                {!auditLoading && <p className="mt-1 text-sm text-white/45">Backend activity appears here after requests, reservations, or provider updates.</p>}
              </div>
            )}
          </section>
        )}

        <footer className="flex flex-col gap-4 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>MEDway · Human-approved resource coordination · Zero patient data on-chain</p>
          <a href="/network" onClick={(event) => navigateToPage(event, 'network', '/network')} className="inline-flex min-h-10 items-center gap-2 text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">View network <ArrowUpRight size={14} aria-hidden="true" /></a>
        </footer>
      </main>

      {requestOpen && (
        <div
          className="fixed inset-0 z-[90] overflow-y-auto bg-black/45 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setRequestOpen(false)
          }}
        >
          <div className="pointer-events-none absolute inset-0 z-10 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${BG_IMAGE_1}")` }} aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-black/70 via-black/40 to-black/20" aria-hidden="true" />
          <RevealLayer image={BG_IMAGE_2} cursorX={cursorPos.x} cursorY={cursorPos.y} />

          <div className="relative z-40 flex min-h-[100dvh] items-center px-4 pb-8 pt-24 sm:px-[3.2vw] sm:pb-10">
            <section
              ref={requestDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-dialog-title"
              className="max-h-[calc(100dvh-7rem)] w-full overflow-y-auto rounded-[28px] border border-white/20 bg-[#101111]/90 p-5 shadow-2xl backdrop-blur-xl sm:w-[min(56vw,940px)] sm:p-8 lg:p-9"
            >
              <div className="mb-8 flex items-start justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-orange-200">
                    <ArrowUpRight size={22} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">02 / Capacity discovery</p>
                    <h2 id="request-dialog-title" className="text-xl font-medium tracking-tight sm:text-2xl">Request diagnostic capacity</h2>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65">Agent matching proposes a provider; a coordinator approves before any on-chain reservation.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRequestOpen(false)}
                  disabled={busy}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 disabled:opacity-40"
                  aria-label="Close new request"
                >
                  <X size={19} />
                </button>
              </div>

              <form onSubmit={discoverCapacity} className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
                <label className="text-sm text-white/80">
                  Requesting institution
                  <select
                    value={requesterId}
                    onChange={(event) => {
                      setRequesterId(event.target.value)
                      if (event.target.value !== actor.id) setActorId(event.target.value)
                    }}
                    className="mt-2 block min-h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                  >
                    {ACTORS.filter((item) => item.role === 'requester').map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-white/80">
                  Diagnostic slots
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(Number(event.target.value))}
                    className="mt-2 block min-h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                  />
                </label>

                <label className="text-sm text-white/80 sm:col-span-2">
                  Urgency
                  <select
                    value={urgency}
                    onChange={(event) => setUrgency(event.target.value as typeof urgency)}
                    className="mt-2 block min-h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
                  >
                    <option value="routine">Routine · within 24 hours</option>
                    <option value="urgent">Urgent · within 12 hours</option>
                    <option value="critical">Critical · within 4 hours</option>
                  </select>
                </label>

                <button
                  type="submit"
                  disabled={busy || !backendReady}
                  className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-[#e8702a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d2611f] disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2"
                >
                  {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Activity size={17} />}
                  {busy ? busyLabel : 'Discover available capacity'}
                </button>
              </form>

              {error && (
                <div role="alert" className="mt-5 rounded-2xl border border-rose-300/25 bg-rose-300/[0.08] p-4 text-sm text-rose-100">
                  <p className="font-medium">Request failed</p>
                  <p className="mt-1 break-words text-rose-100/75">{error}</p>
                </div>
              )}
              {notice && <p role="status" className="mt-5 text-sm text-emerald-200">{notice}</p>}

              {proposal && (
                <div className="mt-7 border-t border-white/10 pt-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">03 / Human authorization</p>
                      <h3 className="mt-1 text-lg font-medium">Allocation proposal</h3>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(proposal.status)}`}>{proposal.status}</span>
                  </div>
                  <p className="mb-4 text-sm text-white/75">
                    {proposal.selected_provider_id
                      ? `Recommended: ${institutionName(proposal.selected_provider_id)} · ${proposal.selected_quantity} slots`
                      : 'No provider currently satisfies the request.'}
                  </p>
                  {proposal.lock_id && (
                    <div className="mb-4 rounded-2xl border border-orange-200/15 bg-orange-200/[0.06] p-4 text-xs leading-relaxed text-white/70">
                      <p className="font-medium text-orange-100">Temporary capacity hold · {proposal.lock_status ?? 'Active'}</p>
                      <p className="mt-1 break-all">Lock ID · {proposal.lock_id}</p>
                      {proposal.lock_expires_at && (
                        <p className="mt-1">
                          Expires · {Number.isNaN(Number(proposal.lock_expires_at))
                            ? proposal.lock_expires_at
                            : new Date(Number(proposal.lock_expires_at) * 1000).toLocaleString()}
                        </p>
                      )}
                      {proposal.lock_tx_hash && <p className="mt-1 break-all">Transaction · {proposal.lock_tx_hash}</p>}
                    </div>
                  )}
                  {proposal.offers.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {proposal.offers.map((offer) => (
                        <article key={offer.provider_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium">{offer.provider_name}</p>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="text-xs text-emerald-200">{offer.available_quantity} slots</span>
                              {offer.onchain_verified && <span className="text-[10px] text-emerald-100/65">On-chain verified</span>}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-white/50">{offer.estimated_delivery_hours}h estimated</p>
                          <p className="mt-3 text-sm leading-relaxed text-white/65">{offer.rationale}</p>
                        </article>
                      ))}
                    </div>
                  )}
                  {proposal.selected_provider_id && proposal.status === 'proposed' && (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setModal({ type: 'authorize', approved: true })}
                        disabled={!sessionReady || actor.role !== 'requester' || actor.id !== proposal.request.requesting_institution_id || busy}
                        className="min-h-11 rounded-full bg-[#e8702a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d2611f] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Approve & reserve on-chain
                      </button>
                      <button
                        type="button"
                        onClick={() => setModal({ type: 'authorize', approved: false })}
                        disabled={!sessionReady || actor.role !== 'requester' || actor.id !== proposal.request.requesting_institution_id || busy}
                        className="min-h-11 rounded-full border border-white/15 px-5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Decline proposal
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="action-dialog-title" className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#111313] p-5 shadow-2xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                  {modal.type === 'authorize' ? (modal.approved ? 'Institutional sign-off' : 'Decline provider offer') : modal.type === 'dispute' ? 'On-chain dispute' : 'Arbitration'}
                </p>
                <h2 id="action-dialog-title" className="text-xl font-medium">
                  {modal.type === 'authorize' ? (modal.approved ? 'Approve reservation' : 'Decline proposal') : modal.type === 'dispute' ? 'Raise a dispute' : 'Resolve dispute'}
                </h2>
              </div>
              <button type="button" disabled={busy} onClick={() => setModal(null)} className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Close dialog"><X size={19} /></button>
            </div>

            {modal.type === 'authorize' && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-white/60">{modal.approved ? 'Your approval submits an EIP-712 reservation through the backend relayer.' : 'Declining closes this proposal without submitting an on-chain transaction.'} Confirm the coordinator name to continue.</p>
                {modal.approved && approvalBlockers.length > 0 && (
                  <div role="status" className="space-y-1 rounded-xl border border-amber-200/20 bg-amber-200/[0.07] p-3 text-xs leading-relaxed text-amber-100/85">
                    <p className="font-medium">On-chain approval is unavailable:</p>
                    {approvalBlockers.map((blocker) => <p key={blocker}>- {blocker}</p>)}
                    <p className="pt-1 text-amber-100/65">The backend operator must configure the registered institution signer and Coral relayer in backend/.env. Never enter private keys in this page.</p>
                  </div>
                )}
                <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-relaxed text-white/65">
                  Requester: {institutionName(proposal?.request.requesting_institution_id ?? '')}
                  {proposal?.selected_provider_id && <> · Provider: {institutionName(proposal.selected_provider_id)}</>}
                  {proposal && <> · {proposal.selected_quantity} diagnostic slots</>}
                </p>
                <label className="block text-xs font-medium text-white/70">Coordinator name
                  <input autoFocus required minLength={2} maxLength={100} value={approver} onChange={(event) => setApprover(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white" placeholder="Name of approving coordinator" />
                </label>
                {error && <div role="alert" className="rounded-xl border border-rose-300/25 bg-rose-300/[0.08] p-3 text-sm text-rose-100">{error}</div>}
                <button type="button" disabled={!sessionReady || busy || approver.trim().length < 2 || actor.id !== proposal?.request.requesting_institution_id || (modal.approved && approvalBlockers.length > 0)} onClick={() => void authorizeProposal(modal.approved)} className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${modal.approved ? 'bg-[#e8702a] hover:bg-[#d2611f]' : 'bg-white/15 hover:bg-white/20'}`}>
                  {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                  {busy ? busyLabel : modal.approved ? 'Approve & broadcast reservation' : 'Confirm decline'}
                </button>
              </div>
            )}

            {modal.type === 'dispute' && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-white/60">Describe the operational issue. The backend stores the evidence off-chain and anchors its SHA-256 digest on Coral.</p>
                <label className="block text-xs font-medium text-white/70">Dispute reason
                  <textarea autoFocus minLength={5} maxLength={500} rows={4} value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} className="mt-2 block w-full resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white" placeholder="Describe the issue; do not include patient-identifying information." />
                </label>
                <button type="button" disabled={busy || disputeReason.trim().length < 5} onClick={() => void submitDispute()} className="min-h-11 w-full rounded-full bg-orange-600 px-5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-40">{busy ? busyLabel : 'Submit dispute on-chain'}</button>
              </div>
            )}

            {modal.type === 'resolve' && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-white/60">Enter the consortium ruling and supporting findings. Evidence is hashed before the ruling is recorded.</p>
                <label className="block text-xs font-medium text-white/70">Ruling
                  <select value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)} className="mt-2 block min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white">
                    <option value="Cancelled">Cancel reservation</option>
                    <option value="Fulfilled">Uphold fulfillment</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-white/70">Arbitration notes
                  <textarea autoFocus minLength={5} maxLength={500} rows={4} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} className="mt-2 block w-full resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white" placeholder="Summarize findings and rationale." />
                </label>
                <button type="button" disabled={busy || resolutionNotes.trim().length < 5} onClick={() => void submitResolution()} className="min-h-11 w-full rounded-full bg-violet-600 px-5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40">{busy ? busyLabel : 'Record arbitration ruling'}</button>
              </div>
            )}
            {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
          </div>
        </div>
      )}

      {inspection && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setInspection(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="inspection-title" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/15 bg-[#111313] p-5 shadow-2xl sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Reservation verification</p>
                <h2 id="inspection-title" className="text-xl font-medium">Audit trail & evidence</h2>
                <p className="mt-1 break-all font-mono text-xs text-white/45">{inspection.commitment.commitment_id}</p>
              </div>
              <button type="button" onClick={() => setInspection(null)} className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close audit trail"><X size={19} /></button>
            </div>
            <div className={`mb-6 flex items-center gap-3 rounded-2xl border p-4 ${inspection.integrity.valid ? 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100' : 'border-rose-300/20 bg-rose-300/[0.06] text-rose-100'}`}>
              {inspection.integrity.valid ? <Check size={18} /> : <CircleAlert size={18} />}
              <div>
                <p className="text-sm font-medium">{inspection.integrity.valid ? 'Audit hash chain verified' : 'Audit integrity verification failed'}</p>
                <p className="mt-1 text-xs opacity-70">{inspection.integrity.total_records} events checked</p>
              </div>
            </div>
            <h3 className="mb-3 text-sm font-medium text-white/85">On-chain contract response</h3>
            <pre className="mb-6 max-h-56 overflow-auto rounded-2xl border border-white/10 bg-black/35 p-4 text-xs leading-relaxed text-sky-100/80">{JSON.stringify(inspection.onchain, null, 2)}</pre>
            <h3 className="mb-3 text-sm font-medium text-white/85">Evidence records ({inspection.evidence.length})</h3>
            <div className="mb-6 space-y-3">
              {inspection.evidence.length ? inspection.evidence.map((record) => (
                <article key={record.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-orange-200">{record.evidence_type.replaceAll('_', ' ')}</p>
                    <span className={record.integrity_verified ? 'text-xs text-emerald-200' : 'text-xs text-rose-200'}>{record.integrity_verified ? 'SHA-256 verified' : 'Digest mismatch'}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-white/70">{record.raw_document}</p>
                  <p className="mt-3 break-all font-mono text-[11px] text-white/40">SHA-256 · {record.recomputed_sha256}</p>
                </article>
              )) : <p className="text-sm text-white/45">No evidence has been submitted for this reservation.</p>}
            </div>
            <h3 className="mb-3 text-sm font-medium text-white/85">Hash-chained event timeline ({inspection.events.length})</h3>
            <div className="space-y-3">
              {inspection.events.length ? inspection.events.map((event) => (
                <article key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="text-sm font-medium text-white/85">{event.action.replaceAll('_', ' ')}</p>
                    <time className="text-xs text-white/45">{new Date(event.timestamp * 1000).toLocaleString()}</time>
                  </div>
                  <p className="mt-1 text-xs text-white/50">{event.actor} · {event.role}</p>
                  <p className="mt-2 break-all font-mono text-[10px] text-white/35">Hash · {event.event_hash}</p>
                </article>
              )) : <p className="text-sm text-white/45">No audit events have been recorded.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

interface MetricCardProps {
  icon: ReactNode
  label: string
  value: string
  detail: string
}

function MetricCard({ icon, label, value, detail }: MetricCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex items-center justify-between text-white/55">
        <span className="text-xs uppercase tracking-[0.13em]">{label}</span>
        {icon}
      </div>
      <p className="truncate text-lg font-medium text-white/90">{value}</p>
      <p className="mt-1 truncate text-xs text-white/45">{detail}</p>
    </article>
  )
}

interface CommitmentCardProps {
  commitment: Commitment
  actor: Actor
  busy: boolean
  statusClass: (status: string) => string
  institutionName: (id: string) => string
  inspect: () => void
  accept: () => void
  fulfill: () => void
  dispute: () => void
  resolve: () => void
}

function CommitmentCard({ commitment, actor, busy, statusClass, institutionName, inspect, accept, fulfill, dispute, resolve }: CommitmentCardProps) {
  const status = commitment.onchain_status ?? commitment.status
  const isRequester = actor.id === commitment.requesting_institution_id
  const isProvider = actor.id === commitment.provider_id
  const canDispute = (isRequester || isProvider) && ['Committed', 'Fulfilled'].includes(status)

  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(status)}`}>{status}</span>
            <span className="text-xs text-white/40">{commitment.resource_type.replaceAll('_', ' ')}</span>
          </div>
          <h3 className="text-lg font-medium">{institutionName(commitment.requesting_institution_id)} <span className="text-white/40">to</span> {institutionName(commitment.provider_id)}</h3>
          <p className="mt-1 text-sm text-white/55">{commitment.quantity} diagnostic slots · approved by {commitment.approved_by ?? 'coordinator'}</p>
        </div>
        <button type="button" onClick={inspect} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs text-white/75 transition-colors hover:bg-white/10 disabled:opacity-45">
          Inspect proofs <ExternalLink size={14} />
        </button>
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
        <DataLine label="Reservation ID" value={commitment.onchain_reservation_id} />
        <DataLine label="Transaction" value={commitment.tx_hash} />
        <DataLine label="Block" value={commitment.block_number?.toLocaleString()} />
        <DataLine label="Terms SHA-256" value={commitment.terms_hash} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {isProvider && status === 'Proposed' && <ActionButton onClick={accept} disabled={busy} label="Accept reservation" />}
        {isProvider && status === 'Committed' && <ActionButton onClick={fulfill} disabled={busy} label="Confirm delivery" />}
        {canDispute && <ActionButton onClick={dispute} disabled={busy} label="Raise dispute" secondary />}
        {actor.role === 'arbitrator' && status === 'Disputed' && <ActionButton onClick={resolve} disabled={busy} label="Rule on dispute" />}
        {!isProvider && actor.role !== 'arbitrator' && !canDispute && (
          <p className="flex min-h-10 items-center text-xs text-white/40">Switch to the assigned provider or an involved institution to act on this reservation.</p>
        )}
      </div>
      {commitment.dispute_reason && <p className="mt-4 rounded-xl border border-orange-200/15 bg-orange-200/[0.04] p-3 text-sm text-orange-100/75">Dispute: {commitment.dispute_reason}</p>}
    </article>
  )
}

function DataLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="mt-1 truncate font-mono text-xs text-white/70" title={value}>{value ?? '—'}</p>
    </div>
  )
}

function ActionButton({ onClick, disabled, label, secondary = false }: { onClick: () => void; disabled: boolean; label: string; secondary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`min-h-10 rounded-full px-4 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${secondary ? 'border border-white/15 text-white/80 hover:bg-white/10' : 'bg-white text-gray-900 hover:bg-gray-200'}`}>
      {label}
    </button>
  )
}

function shortHash(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function auditActionTitle(action: string) {
  const titles: Record<string, string> = {
    CAPACITY_LOCKED: 'Capacity temporarily reserved',
    CAPACITY_LOCK_FAILED: 'Capacity could not be reserved',
    REQUEST_CREATED: 'Capacity request submitted',
    CAPACITY_LOCK_RELEASED: 'Temporary capacity hold released',
    PROPOSAL_DECLINED: 'Allocation proposal declined',
    CAPACITY_LOCK_CONVERTED: 'Capacity hold converted to a reservation',
    PROPOSAL_AUTHORIZATION_FAILED: 'Reservation approval could not be completed',
    PROPOSAL_AUTHORIZED: 'Reservation approved',
    COMMITMENT_ACCEPTED: 'Provider accepted the reservation',
    COMMITMENT_FULFILLED: 'Delivery confirmed',
    DISPUTE_RAISED: 'Reservation dispute raised',
    DISPUTE_RESOLVED: 'Reservation dispute resolved',
    INVENTORY_QUOTA_UPDATED: 'Provider capacity updated',
    CAPACITY_LOCK_RELEASED_MANUAL: 'Temporary capacity hold released',
  }
  if (titles[action]) return titles[action]
  return action
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function auditEventDescription(event: SystemAuditEvent, institutionName: (id: string) => string) {
  const details = event.details
  const requesterId = typeof details.requesting_institution_id === 'string'
    ? details.requesting_institution_id
    : typeof details.requester === 'string' ? details.requester : null
  const providerId = typeof details.provider === 'string'
    ? details.provider
    : typeof details.provider_id === 'string' ? details.provider_id : null
  const quantity = typeof details.quantity === 'number' ? details.quantity : null
  const slots = quantity === null ? '' : `${quantity} diagnostic slot${quantity === 1 ? '' : 's'}`

  switch (event.action) {
    case 'CAPACITY_LOCKED':
      return `A temporary hold was placed for ${slots || 'the requested capacity'}${providerId ? ` at ${institutionName(providerId)}` : ''}.`
    case 'CAPACITY_LOCK_FAILED':
      return 'Coral did not confirm a temporary hold, so the allocation proposal was not created.'
    case 'REQUEST_CREATED':
      return `${slots || 'A capacity request'} was submitted${requesterId ? ` by ${institutionName(requesterId)}` : ''}.`
    case 'CAPACITY_LOCK_RELEASED':
    case 'CAPACITY_LOCK_RELEASED_MANUAL':
      return 'Previously held capacity is available for other requests again.'
    case 'PROPOSAL_DECLINED':
      return 'The coordinator declined the proposed allocation.'
    case 'CAPACITY_LOCK_CONVERTED':
      return 'The temporary capacity hold was converted into a confirmed reservation.'
    case 'PROPOSAL_AUTHORIZATION_FAILED':
      return 'The approval did not complete, so no confirmed reservation was created.'
    case 'PROPOSAL_AUTHORIZED':
      return `The allocation was approved${requesterId ? ` by ${institutionName(requesterId)}` : ''}${providerId ? ` for ${institutionName(providerId)}` : ''}.`
    case 'COMMITMENT_ACCEPTED':
      return 'The provider accepted the reservation.'
    case 'COMMITMENT_FULFILLED':
      return 'The provider confirmed that the requested service was delivered.'
    case 'DISPUTE_RAISED':
      return 'An institution opened a review of this reservation.'
    case 'DISPUTE_RESOLVED':
      return 'The arbitration decision was recorded and the review is complete.'
    case 'INVENTORY_QUOTA_UPDATED':
      return typeof details.total_capacity === 'number'
        ? `Provider availability was updated to ${details.total_capacity} diagnostic slots.`
        : 'Provider availability was updated.'
    default:
      return 'A workflow update was recorded.'
  }
}

export default App
