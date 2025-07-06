
from models import Base, engine, create_tables

def update_database():
    create_tables()

if __name__ == "__main__":
    update_database()