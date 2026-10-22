
import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

USER = os.getenv("USER")
PASSWORD = os.getenv("PASSWORD")
HOST = os.getenv("HOST")
PORT = os.getenv("DB_PORT")
DBNAME = os.getenv("DBNAME")

if not all([USER, PASSWORD, HOST, PORT, DBNAME]):
    raise RuntimeError("Missing database configuration in .env")

DATABASE_URL = (
    f"postgresql+psycopg2://{USER}:{PASSWORD}"
    f"@{HOST}:{PORT}/{DBNAME}?sslmode=require"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def test_database_connection():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    print("Supabase database connection successful!")


if __name__ == "__main__":
    test_database_connection()
