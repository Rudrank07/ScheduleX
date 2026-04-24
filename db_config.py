import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

# Render provides DATABASE_URL automatically
DATABASE_URL = os.getenv("DATABASE_URL", "")


def get_db_connection():
    """Returns a PostgreSQL connection using DATABASE_URL."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Error connecting to PostgreSQL: {e}")
        return None


def dict_cursor(conn):
    """Returns a cursor that returns rows as dicts."""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def _close(conn, cursor):
    try: cursor.close()
    except: pass
    try: conn.close()
    except: pass


def setup_database():
    """Creates all tables if they don't exist."""
    print("Initializing database setup...")
    conn = get_db_connection()
    if not conn:
        print("Failed to connect to PostgreSQL. Check DATABASE_URL.")
        return
    cursor = conn.cursor()
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'teacher' CHECK (role IN ('teacher', 'student'))
            )
        """)
        cursor.execute("INSERT INTO admins (username, password) VALUES ('admin', 'password123') ON CONFLICT DO NOTHING")

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS teachers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                UNIQUE(name, user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subjects (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                weekly_hours INT NOT NULL,
                is_lab BOOLEAN NOT NULL DEFAULT FALSE,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                UNIQUE(name, user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS classes (
                id SERIAL PRIMARY KEY,
                class_name VARCHAR(255) NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                UNIQUE(class_name, user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS teacher_subject (
                id SERIAL PRIMARY KEY,
                teacher_id INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
                subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                class_id INT REFERENCES classes(id) ON DELETE CASCADE,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                UNIQUE(teacher_id, subject_id, class_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS time_slots (
                id SERIAL PRIMARY KEY,
                start_time VARCHAR(10) NOT NULL,
                end_time VARCHAR(10) NOT NULL,
                is_break BOOLEAN NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS generated_timetables (
                id SERIAL PRIMARY KEY,
                class_name VARCHAR(100) NOT NULL,
                grid_data TEXT NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                UNIQUE(class_name, user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS timetable_history (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data TEXT NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS published_timetables (
                id SERIAL PRIMARY KEY,
                teacher_id INT NOT NULL UNIQUE REFERENCES admins(id) ON DELETE CASCADE,
                timetable_data TEXT NOT NULL,
                published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_sessions (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                class_id INT REFERENCES classes(id) ON DELETE CASCADE,
                subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,
                att_div_id INT,
                att_subject_id INT,
                total_students INT NOT NULL DEFAULT 0,
                is_published BOOLEAN NOT NULL DEFAULT FALSE,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance_records (
                id SERIAL PRIMARY KEY,
                session_id INT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
                student_name VARCHAR(100) NOT NULL,
                student_roll VARCHAR(20) DEFAULT '',
                status VARCHAR(10) DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'late'))
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS class_students (
                id SERIAL PRIMARY KEY,
                class_id INT,
                att_div_id INT,
                student_name VARCHAR(100) NOT NULL,
                student_roll VARCHAR(20) DEFAULT '',
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS att_divisions (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS att_div_subjects (
                id SERIAL PRIMARY KEY,
                div_id INT NOT NULL REFERENCES att_divisions(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                user_id INT NOT NULL REFERENCES admins(id) ON DELETE CASCADE
            )
        """)

        conn.commit()
        print("All tables verified/created successfully.")
    except Exception as e:
        print(f"Error creating tables: {e}")
        conn.rollback()
    finally:
        _close(conn, cursor)


if __name__ == '__main__':
    setup_database()
