export const BASE: string = import.meta.env.VITE_API_URL ?? '/api'

export type Role = 'requester' | 'provider' | 'arbitrator'
export interface Actor { id: string; name: string; role: Role }
export const ACTORS: Actor[] = [
  { id: 'hospital-a', name: 'City Hospital A', role: 'requester' },
  { id: 'hospital-b', name: 'Community Hospital B', role: 'requester' },
  { id: 'lab-c', name: 'Central Diagnostic Lab C', role: 'provider' },
  { id: 'consortium-arbitrator', name: 'Arbitration Board', role: 'arbitrator' },
]

export interface Institution { id: string; name: string; type: string; resources: Record<string, number> }
export interface Offer { provider_id: string; provider_name: string; resource_type: string; available_quantity: number; estimated_delivery_hours: number; rationale: string }
export interface Proposal {
  proposal_id?: string
  request: { requesting_institution_id: string; resource_type: string; quantity: number; urgency: string; required_by_hours: number }
  offers: Offer[]
  selected_provider_id: string | null
  selected_quantity: number
  status: string
}
export interface Commitment {
  commitment_id: string
  requesting_institution_id: string
  provider_id: string
  resource_type: string
  quantity: number
  status: string
  onchain_status?: string
  approved_by?: string
  tx_hash?: string
  block_number?: number
  onchain_reservation_id?: string
  dispute_reason?: string
  resolution_notes?: string
  message?: string
  terms_hash?: string
}
export interface AuditEvent { id: number; timestamp: number; action: string; actor: string; role: string; event_hash: string; prev_hash: string; details: Record<string, unknown> }
export interface EvidenceRecord { id: number; evidence_type: string; raw_document: string; stored_sha256: string; recomputed_sha256: string; integrity_verified: boolean; submitted_by: string; timestamp: number }
export interface Health {
  status: string
  mode: string
  database: string
  blockchain: {
    status: string
    network: string
    chain_id: number
    latest_block?: number
    contract_address?: string
    contract_owner?: string
    relayer_configured: boolean
    relayer_address?: string
    institutions_registered?: string[]
  }
}

export async function call<T>(path: string, opts: { method?: string; actor?: Actor; key?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.actor) { headers['X-Actor-Id'] = opts.actor.id; if (opts.key) headers['X-Api-Key'] = opts.key }
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET', headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const text = await res.text()
  let data: unknown = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      if (!res.ok) throw new Error(`Request failed (${res.status}): ${text}`)
      throw new Error('The backend returned an invalid JSON response.')
    }
  }
  if (!res.ok) {
    const d = (data as { detail?: unknown }).detail
    throw new Error(typeof d === 'string' ? d : d ? JSON.stringify(d) : `Request failed (${res.status})`)
  }
  return data as T
}
