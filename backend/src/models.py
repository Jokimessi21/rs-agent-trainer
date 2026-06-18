from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()


class AgentProposal(db.Model):
    __tablename__ = 'agent_proposals'

    id                       = db.Column(db.Integer, primary_key=True)
    created_at               = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    reviewed_at              = db.Column(db.DateTime)
    applied_at               = db.Column(db.DateTime)

    # ElevenLabs identifiers
    conversation_id          = db.Column(db.String(128), index=True)
    agent_id                 = db.Column(db.String(128))

    # Status: pending | approved | rejected | applied | error
    status                   = db.Column(db.String(32), default='pending', index=True)

    # Raw transcript
    transcript               = db.Column(db.Text)

    # Claude analysis
    summary                  = db.Column(db.Text)
    issues_found             = db.Column(db.Text)           # JSON array as string
    knowledge_base_additions = db.Column(db.Text)           # editable before apply
    prompt_changes           = db.Column(db.Text)           # editable before apply
    confidence               = db.Column(db.String(16))     # high | medium | low

    # Error message if apply failed
    error_message            = db.Column(db.Text)

    def to_dict(self):
        return {
            'id':                       self.id,
            'created_at':               self.created_at.isoformat() if self.created_at else None,
            'reviewed_at':              self.reviewed_at.isoformat() if self.reviewed_at else None,
            'applied_at':               self.applied_at.isoformat() if self.applied_at else None,
            'conversation_id':          self.conversation_id,
            'agent_id':                 self.agent_id,
            'status':                   self.status,
            'transcript':               self.transcript,
            'summary':                  self.summary,
            'issues_found':             json.loads(self.issues_found) if self.issues_found else [],
            'knowledge_base_additions': self.knowledge_base_additions,
            'prompt_changes':           self.prompt_changes,
            'confidence':               self.confidence,
            'error_message':            self.error_message,
        }

    def __repr__(self):
        return f'<AgentProposal {self.id} {self.status}>'
class OutboundCall(db.Model):
    __tablename__ = 'outbound_calls'
    id         = db.Column(db.Integer, primary_key=True)
    phone      = db.Column(db.String(20), nullable=False, index=True)
    company    = db.Column(db.String(200))
    call_id    = db.Column(db.String(100))
    outcome    = db.Column(db.String(50), default='initiated')
    called_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':        self.id,
            'phone':     self.phone,
            'company':   self.company,
            'call_id':   self.call_id,
            'outcome':   self.outcome,
            'called_at': self.called_at.isoformat()
        }

    def __repr__(self):
        return f'<OutboundCall {self.id} {self.phone}>'
