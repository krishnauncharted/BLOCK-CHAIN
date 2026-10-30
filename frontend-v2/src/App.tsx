import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  CircleCheck,
  Clock3,
  ExternalLink,
  Fingerprint,
  LoaderCircle,
  Menu,
  Network,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react'
import { ACTORS, call, type Actor, type AuditEvent, type Commitment, type EvidenceRecord, type Health, type Institution, type Proposal } from './api'

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
  const mouse = useRef<CursorPosition>({ x: -999, y: -999 })
  const smooth = useRef<CursorPosition>({ x: -999, y: -999 })
  const rafRef = useRef<number | null>(null)
  const [cursorPos, setCursorPos] = useState<CursorPosition>({ x: -999, y: -999 })
  const [actorId, setActorId] = useState(() => sessionStorage.getItem('medway.actor') ?? ACTORS[0].id)
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('medway.apiKey') ?? '')
  const [health, setHealth] = useState<Health | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [quantity, setQuantity] = useState(3)
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'critical'>('urgent')
  const [approver, setApprover] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [resolution, setResolution] = useState<'Cancelled' | 'Fulfilled'>('Cancelled')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [inspection, setInspection] = useState<AuditInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const actor: Actor = ACTORS.find((item) => item.id === actorId) ?? ACTORS[0]
  const actorOptions = { actor, key: apiKey || undefined }
  const blockchain = health?.blockchain
  const backendReady = health?.status === 'ok'
  const chainConnected = blockchain?.status === 'connected'

  useEffect(() => {
    sessionStorage.setItem('medway.actor', actor.id)
    if (apiKey) sessionStorage.setItem('medway.apiKey', apiKey)
    else sessionStorage.removeItem('medway.apiKey')
  }, [actor.id, apiKey])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
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

  useEffect(() => {
    void refreshData()
    const intervalId = window.setInterval(() => void refreshData(), 30000)
    return () => window.clearInterval(intervalId)
  }, [])

  function beginAction(label: string) {
    setBusy(true)
    setBusyLabel(label)
    setError('')
    setNotice('')
  }

  function endAction() {
    setBusy(false)
    setBusyLabel('')
  }

  async function discoverCapacity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    beginAction('Finding verified capacity...')
    setProposal(null)
    try {
      const result = await call<Proposal>('/requests', {
        method: 'POST',
        ...actorOptions,
        body: {
          requesting_institution_id: actor.id,
          resource_type: 'diagnostic_slot',
          quantity,
          urgency,
          required_by_hours: urgency === 'critical' ? 4 : urgency === 'urgent' ? 12 : 24,
        },
      })
      setProposal(result)
      setNotice(result.selected_provider_id ? 'A provider match is ready for coordinator approval.' : 'No provider currently meets this request.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Capacity discovery failed.')
    } finally {
      endAction()
    }
  }

  async function authorizeProposal(approved: boolean) {
    if (!proposal?.proposal_id) return
    beginAction(approved ? 'Submitting EIP-712 reservation to Coral...' : 'Declining the provider proposal...')
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
      await refreshData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Proposal authorization failed.')
    } finally {
      endAction()
    }
  }

  async function updateCommitment(commitment: Commitment, action: 'accept' | 'fulfill') {
    const label = action === 'accept' ? 'Accepting reservation on Coral...' : 'Confirming delivery on Coral...'
    beginAction(label)
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
    beginAction('Hashing evidence and submitting dispute...')
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
    beginAction('Publishing arbitration ruling to Coral...')
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
    beginAction('Loading reservation and audit proofs...')
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

  const navigation = [
    { href: '#network', label: 'Network' },
    { href: '#request', label: 'Capacity' },
    { href: '#reservations', label: 'Reservations' },
    { href: '#audit', label: 'Audit' },
  ]

  return (
    <div className="min-h-screen bg-[#070808] tracking-[-0.02em] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <nav className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between p-4 sm:p-5">
        <a href="#" className="flex items-center gap-2.5" aria-label="MEDway home">
          <svg width="26" height="26" viewBox="0 0 256 256" fill="#ffffff" aria-hidden="true">
            <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z M 256 128 L 128 128 L 0 0 L 128 0 Z" />
          </svg>
          <span className="font-playfair text-2xl italic text-white">MEDway</span>
        </a>

        <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-white/25 bg-black/35 px-2 py-2 backdrop-blur-md md:flex">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} className="whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white">
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a href="#request" className="hidden rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 sm:block">
            New request
          </a>
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
              <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center rounded-xl px-4 text-sm font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white">
                {item.label}
              </a>
            ))}
            <a href="#request" onClick={() => setMobileMenuOpen(false)} className="mt-1 flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-gray-900">
              New request
            </a>
          </div>
        )}
      </nav>

      <section className="relative h-screen w-full overflow-hidden bg-black" style={{ height: '100dvh' }}>
        <div className="hero-zoom absolute inset-0 z-10 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url("${BG_IMAGE_1}")` }} aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/50 via-black/10 to-black/85" aria-hidden="true" />
        <RevealLayer image={BG_IMAGE_2} cursorX={cursorPos.x} cursorY={cursorPos.y} />

        <div className="absolute left-0 right-0 top-[22%] z-50 flex flex-col items-center px-5 text-center sm:top-[20%]">
          <p className="hero-anim hero-fade mb-5 flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/85 backdrop-blur-md sm:text-xs">
            <span className={`h-2 w-2 rounded-full ${chainConnected ? 'bg-emerald-400' : 'bg-orange-300'}`} />
            {chainConnected ? `Live ${blockchain?.network} · Chain ${blockchain.chain_id}` : 'Coral Testnet Coordination'}
          </p>
          <h1 className="leading-[0.95] text-white">
            <span className="hero-anim hero-reveal block font-playfair text-5xl font-normal italic sm:text-7xl md:text-8xl" style={{ letterSpacing: '-0.05em', animationDelay: '0.25s' }}>
              Capacity moves
            </span>
            <span className="hero-anim hero-reveal -mt-1 block text-5xl font-normal sm:text-7xl md:text-8xl" style={{ letterSpacing: '-0.08em', animationDelay: '0.42s' }}>
              trust stays on-chain
            </span>
          </h1>
          <p className="hero-anim hero-fade mt-6 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base" style={{ animationDelay: '0.65s' }}>
            Connect healthcare capacity across institutions, authorize every reservation, and track each handoff on the Coral Testnet.
          </p>
          <a href="#request" className="hero-anim hero-fade mt-7 inline-flex items-center gap-2 rounded-full bg-[#e8702a] px-7 py-3 text-sm font-medium text-white transition-all hover:scale-[1.03] hover:bg-[#d2611f] active:scale-95" style={{ animationDelay: '0.85s' }}>
            Request capacity <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>

        <div className="absolute bottom-7 left-5 right-5 z-50 flex items-end justify-between gap-5 sm:bottom-9 sm:left-10 sm:right-10 md:left-14 md:right-14">
          <p className="hero-anim hero-fade hidden max-w-[260px] text-sm leading-relaxed text-white/75 sm:block" style={{ animationDelay: '0.7s' }}>
            Human-approved healthcare resource reservations, recorded with tamper-evident audit trails.
          </p>
          <div className="ml-auto flex items-center gap-3 rounded-full border border-white/20 bg-black/35 px-4 py-2.5 text-xs text-white/80 backdrop-blur-md">
            <Activity size={15} aria-hidden="true" />
            <span>{backendReady ? (chainConnected ? 'Backend + network online' : 'Backend online · chain disconnected') : 'Connecting to backend'}</span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-7 sm:py-14 lg:px-10">
        <section className="grid gap-5 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end" aria-labelledby="session-title">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Institution session</p>
            <h2 id="session-title" className="text-xl font-medium tracking-tight sm:text-2xl">Choose who is coordinating</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">API keys are optional for the local demo. If you enter one, it stays in this browser session and is never bundled into the app.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[460px]">
            <label className="text-xs font-medium text-white/70">
              Active institution
              <select value={actor.id} onChange={(event) => setActorId(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white">
                {ACTORS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-white/70">
              API key <span className="text-white/40">(optional)</span>
              <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" placeholder="Enter your institution key" className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white placeholder:text-white/30" />
            </label>
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

        <section id="network" className="scroll-mt-28 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">01 / Network status</p>
              <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Coral Testnet connection</h2>
            </div>
            <button type="button" onClick={() => void refreshData()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50">
              <RefreshCw size={15} className={busy && busyLabel.includes('Loading') ? 'animate-spin' : ''} /> Refresh status
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<Network size={18} />} label="Network" value={blockchain?.network ?? 'Waiting for API'} detail={chainConnected ? 'RPC connected' : 'Waiting for chain'} />
            <MetricCard icon={<Zap size={18} />} label="Chain ID" value={blockchain?.chain_id?.toString() ?? '—'} detail={blockchain?.latest_block ? `Latest block ${blockchain.latest_block.toLocaleString()}` : 'Block height unavailable'} />
            <MetricCard icon={<ShieldCheck size={18} />} label="Gas sponsor" value={blockchain?.relayer_configured ? 'Configured' : 'Not configured'} detail={blockchain?.relayer_address ? shortHash(blockchain.relayer_address) : 'Relayer credentials stay on backend'} />
            <MetricCard icon={<Fingerprint size={18} />} label="Smart contract" value={blockchain?.contract_address ? shortHash(blockchain.contract_address) : 'Unavailable'} detail={blockchain?.contract_owner ? `Owner ${shortHash(blockchain.contract_owner)}` : 'Contract status from API'} />
          </div>
        </section>

        {chainConnected && !blockchain?.relayer_configured && (
          <aside role="status" className="flex items-start gap-3 rounded-2xl border border-orange-200/20 bg-orange-200/[0.06] p-4 text-sm text-orange-100/85">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-orange-200" aria-hidden="true" />
            <p><strong className="font-medium text-orange-100">Blockchain is connected in read-only mode.</strong> The backend currently has no gas relayer configured, so new on-chain approvals, acceptances, fulfillment, disputes, and arbitration are unavailable until your backend signing credentials are configured.</p>
          </aside>
        )}

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-2.5 text-orange-200"><Network size={19} /></div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Institution directory</p>
                <h2 className="text-xl font-medium">Capacity network</h2>
              </div>
            </div>
            {institutions.length ? (
              <div className="divide-y divide-white/10">
                {institutions.map((institution) => (
                  <div key={institution.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{institution.name}</p>
                      <p className="mt-1 text-xs capitalize text-white/45">{institution.type.replaceAll('_', ' ')}</p>
                      <p className={`mt-2 text-xs ${blockchain?.institutions_registered?.includes(institution.id) ? 'text-emerald-200/80' : 'text-white/40'}`}>
                        {blockchain?.institutions_registered?.includes(institution.id) ? 'Wallet registered on-chain' : 'No registered wallet reported'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75">
                        {institution.resources.diagnostic_slot ?? 0} slots
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-white/45">Institution data appears when the backend connects.</p>}
          </article>

          <article id="request" className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-2.5 text-orange-200"><ArrowUpRight size={19} /></div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">02 / Capacity discovery</p>
                <h2 className="text-xl font-medium">Request diagnostic capacity</h2>
                <p className="mt-1 text-sm text-white/50">Agent matching proposes a provider; a coordinator approves before any on-chain reservation.</p>
              </div>
            </div>
            {actor.role === 'requester' ? (
              <form onSubmit={discoverCapacity} className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium text-white/70">
                  Requesting institution
                  <div className="mt-2 min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/85">{actor.name}</div>
                </label>
                <label className="text-xs font-medium text-white/70">
                  Diagnostic slots
                  <input type="number" min={1} max={100} required value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white" />
                </label>
                <label className="text-xs font-medium text-white/70 sm:col-span-2">
                  Urgency
                  <select value={urgency} onChange={(event) => setUrgency(event.target.value as typeof urgency)} className="mt-1.5 block min-h-11 w-full rounded-xl border border-white/15 bg-[#111313] px-3 text-sm text-white">
                    <option value="routine">Routine · within 24 hours</option>
                    <option value="urgent">Urgent · within 12 hours</option>
                    <option value="critical">Critical · within 4 hours</option>
                  </select>
                </label>
                <button type="submit" disabled={busy || !backendReady} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e8702a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d2611f] disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2">
                  {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Activity size={16} />}
                  {busy ? busyLabel : 'Discover available capacity'}
                </button>
              </form>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/65">
                Capacity requests are submitted by requester institutions. Switch to a hospital requester to create one; provider and arbitrator actions remain available below.
              </div>
            )}
          </article>
        </section>

        {proposal && (
          <section className="rounded-3xl border border-orange-200/20 bg-orange-100/[0.04] p-5 sm:p-7" aria-labelledby="proposal-title">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">03 / Human authorization</p>
                <h2 id="proposal-title" className="text-xl font-medium">Allocation proposal</h2>
                <p className="mt-1 text-sm text-white/55">Review provider availability before signing a gas-sponsored reservation.</p>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-xs ${statusClass(proposal.status)}`}>{proposal.status}</span>
            </div>
            <p className="mb-4 text-sm text-white/80">
              {proposal.selected_provider_id
                ? `Recommended provider: ${institutionName(proposal.selected_provider_id)} · ${proposal.selected_quantity} slots`
                : 'No provider currently satisfies the request.'}
            </p>
            {proposal.offers.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {proposal.offers.map((offer) => (
                  <div key={offer.provider_id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium">{offer.provider_name}</p>
                      <span className="whitespace-nowrap text-xs text-emerald-200">{offer.available_quantity} slots</span>
                    </div>
                    <p className="mt-2 text-xs text-white/50">{offer.estimated_delivery_hours}h estimated</p>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">{offer.rationale}</p>
                  </div>
                ))}
              </div>
            )}
            {proposal.selected_provider_id && proposal.status === 'proposed' && (
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => setModal({ type: 'authorize', approved: true })} disabled={actor.role !== 'requester' || actor.id !== proposal.request.requesting_institution_id || busy || !blockchain?.relayer_configured} className="min-h-11 rounded-full bg-[#e8702a] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d2611f] disabled:cursor-not-allowed disabled:opacity-40">
                  Approve & reserve on-chain
                </button>
                <button type="button" onClick={() => setModal({ type: 'authorize', approved: false })} disabled={actor.role !== 'requester' || actor.id !== proposal.request.requesting_institution_id || busy} className="min-h-11 rounded-full border border-white/15 px-5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                  Decline proposal
                </button>
              </div>
            )}
          </section>
        )}

        <section id="reservations" className="scroll-mt-28 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">04 / Reservation lifecycle</p>
              <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">On-chain commitments</h2>
              <p className="mt-2 text-sm text-white/50">Provider acceptance, fulfillment, disputes, arbitration, and audit proofs.</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55">{commitments.length} reservation{commitments.length === 1 ? '' : 's'}</span>
          </div>

          {commitments.length ? (
            <div className="grid gap-4">
              {commitments.map((commitment) => (
                <CommitmentCard
                  key={commitment.commitment_id}
                  commitment={commitment}
                  actor={actor}
                  busy={busy}
                  writeEnabled={Boolean(blockchain?.relayer_configured)}
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
        </section>

        <footer id="audit" className="flex flex-col gap-4 border-t border-white/10 py-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>MEDway · Human-approved resource coordination · Zero patient data on-chain</p>
          <a href="#network" className="inline-flex min-h-10 items-center gap-2 text-white/70 hover:text-white">Back to network <ArrowUpRight size={14} /></a>
        </footer>
      </main>

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
                <label className="block text-xs font-medium text-white/70">Coordinator name
                  <input autoFocus required minLength={2} maxLength={100} value={approver} onChange={(event) => setApprover(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white" placeholder="Name of approving coordinator" />
                </label>
                <button type="button" disabled={busy || approver.trim().length < 2 || (modal.approved && !blockchain?.relayer_configured)} onClick={() => void authorizeProposal(modal.approved)} className={`min-h-11 w-full rounded-full px-5 text-sm font-medium text-white disabled:opacity-40 ${modal.approved ? 'bg-[#e8702a] hover:bg-[#d2611f]' : 'bg-white/15 hover:bg-white/20'}`}>{busy ? busyLabel : modal.approved ? 'Approve & broadcast reservation' : 'Confirm decline'}</button>
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
  writeEnabled: boolean
  statusClass: (status: string) => string
  institutionName: (id: string) => string
  inspect: () => void
  accept: () => void
  fulfill: () => void
  dispute: () => void
  resolve: () => void
}

function CommitmentCard({ commitment, actor, busy, writeEnabled, statusClass, institutionName, inspect, accept, fulfill, dispute, resolve }: CommitmentCardProps) {
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
        {isProvider && status === 'Proposed' && <ActionButton onClick={accept} disabled={busy || !writeEnabled} label="Accept reservation" />}
        {isProvider && status === 'Committed' && <ActionButton onClick={fulfill} disabled={busy || !writeEnabled} label="Confirm delivery" />}
        {canDispute && <ActionButton onClick={dispute} disabled={busy || !writeEnabled} label="Raise dispute" secondary />}
        {actor.role === 'arbitrator' && status === 'Disputed' && <ActionButton onClick={resolve} disabled={busy || !writeEnabled} label="Rule on dispute" />}
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

export default App
