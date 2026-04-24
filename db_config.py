import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'timetable.db')


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _close(conn, cursor):
    try: cursor.close()
    except: pass
    try: conn.close()
    except: pass


def setup_database():
    print("Initializing SQLite database...")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'teacher' CHECK (role IN ('teacher', 'student'))
            );
            INSERT OR IGNORE INTO admins (username, password) VALUES ('admin', 'password123');
            CREATE TABLE IF NOT EXISTS teachers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                UNIQUE(name, user_id)
            );
            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                weekly_hours INTEGER NOT NULL,
                is_lab INTEGER NOT NULL DEFAULT 0,
                user_id INTEGER NOT NULL,
                UNIQUE(name, user_id)
            );
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_name TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                UNIQUE(class_name, user_id)
            );
            CREATE TABLE IF NOT EXISTS teacher_subject (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL,
                subject_id INTEGER NOT NULL,
                class_id INTEGER,
                user_id INTEGER NOT NULL,
                UNIQUE(teacher_id, subject_id, class_id)
            );
            CREATE TABLE IF NOT EXISTS time_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                is_break INTEGER NOT NULL,
                user_id INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS generated_timetables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_name TEXT NOT NULL,
                grid_data TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                UNIQUE(class_name, user_id)
            );
            CREATE TABLE IF NOT EXISTS timetable_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                data TEXT NOT NULL,
                user_id INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS published_timetables (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id INTEGER NOT NULL UNIQUE,
                timetable_data TEXT NOT NULL,
                published_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS attendance_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                class_id INTEGER,
                subject_id INTEGER,
                att_div_id INTEGER,
                att_subject_id INTEGER,
                total_students INTEGER NOT NULL DEFAULT 0,
                is_published INTEGER NOT NULL DEFAULT 0,
                user_id INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS attendance_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                student_name TEXT NOT NULL,
                student_roll TEXT DEFAULT '',
                status TEXT DEFAULT 'absent' CHECK (status IN ('present','absent','late'))
            );
            CREATE TABLE IF NOT EXISTS class_students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER,
                att_div_id INTEGER,
                student_name TEXT NOT NULL,
                student_roll TEXT DEFAULT '',
                user_id INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS att_divisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS att_div_subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                div_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                user_id INTEGER NOT NULL
            );
        """)
        conn.commit()
        print("All tables ready.")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        _close(conn, cursor)


if __name__ == '__main__':
    setup_database()
