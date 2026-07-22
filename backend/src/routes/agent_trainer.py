import os
import json
import requests
from datetime import datetime
from functools import wraps

from flask import Blueprint, jsonify, request
from src.models import db, AgentProposal, OutboundCall

agent_trainer_bp = Blueprint('agent_trainer', __name__)

ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY')
DASHBOARD_SECRET   = os.environ.get('DASHBOARD_SECRET')

AGENT_IDS = {
    'restaurant_sales': 'agent_1601ks3j65hze7wv04bwrww3skaz',
    'prospect':         'agent_1901ky3cxj1ffaetgn6dzj10685k',
}


# ── Auth ──────────────────────────────────────────────────────────────────────

def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '').strip()
        if not DASHBOARD_SECRET or token != DASHBOARD_SECRET:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated


# ── Receive proposal from n8n ─────────────────────────────────────────────────

@agent_trainer_bp.route('/agent-trainer/webhook', methods=['POST'])
def receive_proposal():
    data = request.get_json(force=True)

    conversation_id = data.get('conversation_id')
    agent_id        = data.get('agent_id')
    transcript      = data.get('transcript')
    analysis        = data.get('analysis', {})

    if not conversation_id or not transcript:
        return jsonify({'error': 'Missing conversation_id or transcript'}), 400

    kb     = analysis.get('knowledge_base_additions')
    prompt = analysis.get('prompt_changes')

    if not kb and not prompt:
        return jsonify({'received': True, 'actionable': False}), 200

    proposal = AgentProposal(
        conversation_id          = conversation_id,
        agent_id                 = agent_id,
        transcript               = transcript,
        summary                  = analysis.get('summary'),
        issues_found             = json.dumps(analysis.get('issues_found', [])),
        knowledge_base_additions = kb,
        prompt_changes           = prompt,
        confidence               = analysis.get('confidence', 'medium'),
    )
    db.session.add(proposal)
    db.session.commit()

    return jsonify({'received': True, 'actionable': True, 'id': proposal.id}), 201


# ── List proposals ────────────────────────────────────────────────────────────

@agent_trainer_bp.route('/agent-trainer/proposals', methods=['GET'])
@auth_required
def list_proposals():
    status   = request.args.get('status')
    agent_id = request.args.get('agent_id')
    query    = AgentProposal.query.order_by(AgentProposal.created_at.desc())
    if status:
        query = query.filter_by(status=status)
    if agent_id:
        query = query.filter_by(agent_id=agent_id)
    return jsonify({'proposals': [p.to_dict() for p in query.all()]})


@agent_trainer_bp.route('/agent-trainer/proposals/reject-all', methods=['POST'])
@auth_required
def reject_all_proposals():
    data          = request.get_json(force=True)
    status_filter = data.get('status')
    agent_id      = data.get('agent_id')

    query = AgentProposal.query.filter(AgentProposal.status != 'applied')
    if status_filter and status_filter != 'all':
        query = query.filter_by(status=status_filter)
    if agent_id:
        query = query.filter_by(agent_id=agent_id)

    proposals = query.all()
    for p in proposals:
        p.status      = 'rejected'
        p.reviewed_at = datetime.utcnow()

    db.session.commit()
    return jsonify({'rejected': len(proposals)})


# ── Approve / reject + save edits ─────────────────────────────────────────────

@agent_trainer_bp.route('/agent-trainer/proposals/<int:proposal_id>/review', methods=['POST'])
@auth_required
def review_proposal(proposal_id):
    proposal = AgentProposal.query.get_or_404(proposal_id)
    data     = request.get_json(force=True)

    status = data.get('status')
    if status not in ('approved', 'rejected'):
        return jsonify({'error': 'status must be approved or rejected'}), 400

    proposal.status      = status
    proposal.reviewed_at = datetime.utcnow()

    if 'knowledge_base_additions' in data:
        proposal.knowledge_base_additions = data['knowledge_base_additions']
    if 'prompt_changes' in data:
        proposal.prompt_changes = data['prompt_changes'] or None

    db.session.commit()
    return jsonify(proposal.to_dict())


# ── Apply to ElevenLabs ───────────────────────────────────────────────────────

@agent_trainer_bp.route('/agent-trainer/proposals/<int:proposal_id>/apply', methods=['POST'])
@auth_required
def apply_proposal(proposal_id):
    proposal = AgentProposal.query.get_or_404(proposal_id)

    if proposal.status != 'approved':
        return jsonify({'error': 'Proposal must be approved before applying'}), 400

    results = {'kb': None, 'prompt': None}

    try:
        if proposal.knowledge_base_additions:
            doc_id = _add_to_knowledge_base(
                proposal.agent_id,
                proposal.knowledge_base_additions,
                f'Learned from call {proposal.conversation_id}'
            )
            results['kb'] = doc_id

        if proposal.prompt_changes:
            _update_agent_prompt(proposal.agent_id, proposal.prompt_changes)
            results['prompt'] = 'updated'

        proposal.status     = 'applied'
        proposal.applied_at = datetime.utcnow()
        db.session.commit()

        return jsonify({'success': True, 'results': results})

    except Exception as e:
        proposal.status        = 'error'
        proposal.error_message = str(e)
        db.session.commit()
        return jsonify({'error': str(e)}), 500


# ── Outbound Call Tracking ────────────────────────────────────────────────────

@agent_trainer_bp.route('/outbound/check-called', methods=['POST'])
@auth_required
def check_called():
    data         = request.get_json(force=True)
    phone        = data.get('phone')
    reorder_days = int(data.get('avg_reorder_cycle_days', 90))

    last_call = OutboundCall.query.filter_by(phone=phone).order_by(OutboundCall.called_at.desc()).first()

    if not last_call:
        return jsonify({'should_call': True, 'reason': 'never called'})

    days_since_call = (datetime.utcnow() - last_call.called_at).days

    if days_since_call < 60:
        return jsonify({
            'should_call': False,
            'days_since_last_call': days_since_call,
            'avg_reorder_cycle_days': reorder_days,
            'reason': 'minimum 60 day cooldown'
        })

    should_call = days_since_call >= reorder_days

    return jsonify({
        'should_call': should_call,
        'days_since_last_call': days_since_call,
        'avg_reorder_cycle_days': reorder_days,
        'reason': 'reorder cycle reached' if should_call else 'too soon to call again'
    })


@agent_trainer_bp.route('/outbound/mark-called', methods=['POST'])
@auth_required
def mark_called():
    data = request.get_json(force=True)
    call = OutboundCall(
        phone   = data.get('phone'),
        company = data.get('company'),
        call_id = data.get('call_id'),
        outcome = data.get('outcome', 'initiated')
    )
    db.session.add(call)
    db.session.commit()
    return jsonify({'success': True, 'id': call.id})


@agent_trainer_bp.route('/outbound/called-list', methods=['GET'])
@auth_required
def called_list():
    from datetime import timedelta
    cutoff       = datetime.utcnow() - timedelta(days=60)
    recent_calls = OutboundCall.query.filter(OutboundCall.called_at >= cutoff).all()
    phones       = list(set([c.phone for c in recent_calls]))
    return jsonify({'called_phones': phones})


@agent_trainer_bp.route('/outbound/clear-calls', methods=['DELETE'])
@auth_required
def clear_calls():
    OutboundCall.query.delete()
    db.session.commit()
    return jsonify({'success': True, 'message': 'All call records cleared'})


# ── ElevenLabs helpers ────────────────────────────────────────────────────────

def _add_to_knowledge_base(agent_id, text, label):
    resp = requests.post(
        'https://api.elevenlabs.io/v1/convai/knowledge-base/text',
        headers={'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
        json={'text': text, 'name': label},
        timeout=15
    )
    if not resp.ok:
        raise Exception(f'KB create failed: {resp.text}')
    doc_id = resp.json()['id']

    agent_resp = requests.get(
        f'https://api.elevenlabs.io/v1/convai/agents/{agent_id}',
        headers={'xi-api-key': ELEVENLABS_API_KEY},
        timeout=10
    )
    existing = (agent_resp.json()
                .get('conversation_config', {})
                .get('agent', {})
                .get('prompt', {})
                .get('knowledge_base', []))

    patch_resp = requests.patch(
        f'https://api.elevenlabs.io/v1/convai/agents/{agent_id}',
        headers={'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
        json={
            'conversation_config': {
                'agent': {
                    'prompt': {
                        'knowledge_base': existing + [{'type': 'file', 'id': doc_id, 'name': label}]
                    }
                }
            }
        },
        timeout=15
    )
    if not patch_resp.ok:
        raise Exception(f'Agent KB patch failed: {patch_resp.text}')
    return doc_id


def _update_agent_prompt(agent_id, prompt_addition):
    agent_resp = requests.get(
        f'https://api.elevenlabs.io/v1/convai/agents/{agent_id}',
        headers={'xi-api-key': ELEVENLABS_API_KEY},
        timeout=10
    )
    current = (agent_resp.json()
               .get('conversation_config', {})
               .get('agent', {})
               .get('prompt', {})
               .get('prompt', ''))

    updated = f"{current}\n\n// Updated {datetime.utcnow().isoformat()}\n{prompt_addition}"

    patch_resp = requests.patch(
        f'https://api.elevenlabs.io/v1/convai/agents/{agent_id}',
        headers={'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json'},
        json={'conversation_config': {'agent': {'prompt': {'prompt': updated}}}},
        timeout=15
    )
    if not patch_resp.ok:
        raise Exception(f'Prompt patch failed: {patch_resp.text}')
