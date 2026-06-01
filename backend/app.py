import os
from flask import Flask
from flask_cors import CORS
from src.models import db
from src.routes.agent_trainer import agent_trainer_bp

def create_app():
    app = Flask(__name__)

    db_url = os.environ.get('DATABASE_URL', 'sqlite:///proposals.db')
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    CORS(app, origins=os.environ.get('ALLOWED_ORIGINS', '*').split(','))

    db.init_app(app)

    app.register_blueprint(agent_trainer_bp, url_prefix='/api')

    with app.app_context():
        db.create_all()

    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
