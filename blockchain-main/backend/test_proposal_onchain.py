import sys
from pathlib import Path

from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app import main
from app.models import AllocationOffer


client = TestClient(main.app)
HOSPITAL_A = {"X-Actor-Id": "hospital-a"}
REQUEST_BODY = {
    "requesting_institution_id": "hospital-a",
    "resource_type": "diagnostic_slot",
    "quantity": 2,
    "urgency": "urgent",
    "required_by_hours": 12,
}
VERIFIED_OFFER = AllocationOffer(
    provider_id="lab-c",
    provider_name="Central Diagnostic Lab C",
    resource_type="diagnostic_slot",
    available_quantity=5,
    estimated_delivery_hours=2,
    rationale="Capacity verified on Coral.",
    onchain_verified=True,
)


def test_request_fails_closed_when_relayer_cannot_create_capacity_lock(monkeypatch):
    monkeypatch.setattr(main, "discover_and_verify", lambda _request: [VERIFIED_OFFER])
    monkeypatch.setattr(
        main,
        "lock_onchain_capacity",
        lambda **_kwargs: {
            "success": False,
            "error": "Relayer private key is not configured.",
        },
    )
    monkeypatch.setattr(main, "record_audit_event", lambda **_kwargs: None)

    def unexpected_save(_proposal):
        raise AssertionError("A proposal without an on-chain lock must not be persisted.")

    monkeypatch.setattr(main, "save_proposal", unexpected_save)

    response = client.post("/requests", headers=HOSPITAL_A, json=REQUEST_BODY)

    assert response.status_code == 503
    assert "relayer private key" in response.json()["detail"].lower()


def test_request_ignores_unverified_catalog_capacity(monkeypatch):
    unverified_offer = VERIFIED_OFFER.model_copy(update={"onchain_verified": False})
    monkeypatch.setattr(main, "discover_and_verify", lambda _request: [unverified_offer])

    response = client.post("/requests", headers=HOSPITAL_A, json=REQUEST_BODY)

    assert response.status_code == 503
    assert "verified on coral" in response.json()["detail"].lower()


def test_approval_converts_the_matching_active_lock(monkeypatch):
    proposal = {
        "proposal_id": "proposal-test",
        "request": {
            "requesting_institution_id": "hospital-a",
            "resource_type": "diagnostic_slot",
            "quantity": 2,
            "urgency": "urgent",
        },
        "selected_provider_id": "lab-c",
        "selected_quantity": 2,
        "status": "proposed",
        "lock_id": "0x" + "11" * 32,
    }
    saved_proposals = []
    saved_commitments = []
    audits = []
    conversion_calls = []
    monkeypatch.setattr(main, "get_proposal", lambda _proposal_id: proposal)
    monkeypatch.setattr(
        main,
        "get_onchain_lock",
        lambda _lock_id: {
            "success": True,
            "exists": True,
            "lock": {
                "status": "Active",
                "quantity": 2,
                "requester": main.REGISTERED_ACTORS["hospital-a"].address,
                "provider": main.REGISTERED_ACTORS["lab-c"].address,
            },
        },
    )
    monkeypatch.setattr(
        main,
        "create_reservation_with_lock",
        lambda **kwargs: (
            conversion_calls.append(kwargs)
            or {
                "success": True,
                "reservationId": "0x" + "22" * 32,
                "txHash": "0x" + "33" * 32,
                "blockNumber": 123,
            }
        ),
    )
    monkeypatch.setattr(main, "save_proposal", lambda value: saved_proposals.append(value.copy()))
    monkeypatch.setattr(main, "save_commitment", lambda value: saved_commitments.append(value.copy()))
    monkeypatch.setattr(main, "_sync_commitment_from_chain", lambda _commitment: None)
    monkeypatch.setattr(main, "record_audit_event", lambda **kwargs: audits.append(kwargs))

    response = client.post(
        "/proposals/proposal-test/authorize",
        headers=HOSPITAL_A,
        json={"approved": True, "approved_by": "Coordinator"},
    )

    assert response.status_code == 200, response.text
    assert len(conversion_calls) == 1
    assert response.json()["commitment"]["tx_hash"] == "0x" + "33" * 32
    assert response.json()["commitment"]["lock_id"] == proposal["lock_id"]
    assert saved_commitments[0]["onchain_reservation_id"] == "0x" + "22" * 32
    assert proposal["status"] == "authorized"
    assert proposal["lock_status"] == "Converted"
    assert any(event["action"] == "CAPACITY_LOCK_CONVERTED" for event in audits)


def test_authorized_proposal_cannot_be_submitted_twice(monkeypatch):
    monkeypatch.setattr(
        main,
        "get_proposal",
        lambda _proposal_id: {
            "request": {"requesting_institution_id": "hospital-a"},
            "status": "authorized",
        },
    )

    def unexpected_chain_call(**_kwargs):
        raise AssertionError("An already-authorized proposal must not trigger another transaction.")

    monkeypatch.setattr(main, "create_reservation_with_lock", unexpected_chain_call)

    response = client.post(
        "/proposals/proposal-test/authorize",
        headers=HOSPITAL_A,
        json={"approved": True, "approved_by": "Coordinator"},
    )

    assert response.status_code == 409
    assert "already authorized" in response.json()["detail"].lower()


def test_failed_lock_release_keeps_proposal_pending(monkeypatch):
    proposal = {
        "request": {"requesting_institution_id": "hospital-a"},
        "status": "proposed",
        "lock_id": "0x" + "44" * 32,
    }
    saved_proposals = []
    monkeypatch.setattr(main, "get_proposal", lambda _proposal_id: proposal)
    monkeypatch.setattr(
        main,
        "get_onchain_lock",
        lambda _lock_id: {
            "success": True,
            "exists": True,
            "lock": {"status": "Active"},
        },
    )
    monkeypatch.setattr(
        main,
        "release_onchain_lock",
        lambda **_kwargs: {"success": False, "error": "Relayer unavailable."},
    )
    monkeypatch.setattr(main, "save_proposal", lambda value: saved_proposals.append(value.copy()))

    response = client.post(
        "/proposals/proposal-test/authorize",
        headers=HOSPITAL_A,
        json={"approved": False, "approved_by": "Coordinator"},
    )

    assert response.status_code == 502
    assert proposal["status"] == "proposed"
    assert saved_proposals == []
