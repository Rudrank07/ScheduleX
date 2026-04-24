import os
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv

# Load credentials from .env file (never commit .env to Git)
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "timetable_db")

def get_db_connection(use_database=True):
    """
    Returns a connection to the MySQL database.
    If use_database is False, it connects to the server without selecting a DB.
    """
    try:
        connection = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME if use_database else None
        )
        return connection
    except Error as e:
        print(f"Error connecting to MySQL: {e}")
        return None

def _add_column_if_missing(cursor, table, column_def):
    """
    Safely adds a column to a table only if it does not already exist.
    column_def example: "user_id INT, ADD CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE"
    This helper only handles a simple ALTER TABLE ADD COLUMN statement.
    """
    try:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column_def}")
    except Error as e:
        # Error 1060: Duplicate column name — column already exists, that's fine
        if e.errno == 1060:
            pass
        else:
            raise

def setup_database():
    """
    Initializes the database and creates tables if they do not exist.
    Also runs idempotent migrations to add user_id columns for data isolation.
    """
    print("Initializing database setup...")
    
    # 1. Connect without database to ensure DB exists
    conn = get_db_connection(use_database=False)
    if not conn:
        print("Failed to connect to MySQL server. Please check DB credentials and ensure MySQL is running.")
        return
        
    try:
        cursor = conn.cursor()
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
        print(f"Database `{DB_NAME}` ready.")
    except Error as e:
        print(f"Error creating database: {e}")
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()

    # 2. Connect to the specific database and create tables
    conn = get_db_connection()
    if conn:
        try:
            cursor = conn.cursor()

            # ── Admins table (no user_id — this IS the user table) ──────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS admins (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    role ENUM('teacher', 'student') DEFAULT 'teacher'
                )
            """)

            # Insert default admin (only if not present)
            cursor.execute("INSERT IGNORE INTO admins (username, password) VALUES ('admin', 'password123')")

            # ── Teachers ────────────────────────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS teachers (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    user_id INT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE,
                    UNIQUE(name, user_id)
                )
            """)

            # ── Subjects ────────────────────────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS subjects (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    weekly_hours INT NOT NULL,
                    is_lab TINYINT(1) NOT NULL DEFAULT 0,
                    user_id INT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE,
                    UNIQUE(name, user_id)
                )
            """)

            # ── Classes ─────────────────────────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS classes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    class_name VARCHAR(255) NOT NULL,
                    user_id INT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE,
                    UNIQUE(class_name, user_id)
                )
            """)

            # ── Teacher–Subject assignments ──────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS teacher_subject (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    teacher_id INT NOT NULL,
                    subject_id INT NOT NULL,
                    class_id INT,
                    user_id INT NOT NULL,
                    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
                    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE,
                    UNIQUE(teacher_id, subject_id, class_id)
                )
            """)

            # ── Time Slots ───────────────────────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS time_slots (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    start_time VARCHAR(10) NOT NULL,
                    end_time VARCHAR(10) NOT NULL,
                    is_break BOOLEAN NOT NULL,
                    user_id INT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            # ── Generated Timetables ─────────────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS generated_timetables (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    class_name VARCHAR(100) NOT NULL,
                    grid_data JSON NOT NULL,
                    user_id INT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE,
                    UNIQUE(class_name, user_id)
                )
            """)

            # ── Timetable History ────────────────────────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS timetable_history (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    data JSON NOT NULL,
                    user_id INT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            # ── Published Timetables (teacher → students) ────────────────────────
            # One row per teacher. Students read all rows (no user_id filter).
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS published_timetables (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    teacher_id INT NOT NULL UNIQUE,
                    timetable_data JSON NOT NULL,
                    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (teacher_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            # ── Attendance Sessions ───────────────────────────────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS attendance_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    date DATE NOT NULL,
                    class_id INT NOT NULL,
                    subject_id INT NOT NULL,
                    total_students INT NOT NULL DEFAULT 0,
                    user_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
                    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            # ── Attendance Records (one row per student per session) ────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS attendance_records (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    session_id INT NOT NULL,
                    student_name VARCHAR(100) NOT NULL,
                    student_roll VARCHAR(20) DEFAULT '',
                    status ENUM('present','absent','late') DEFAULT 'absent',
                    FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE
                )
            """)

            # ── Class Roster (permanent student list per division) ──────
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS class_students (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    class_id INT NULL,
                    att_div_id INT NULL,
                    student_name VARCHAR(100) NOT NULL,
                    student_roll VARCHAR(20) DEFAULT '',
                    user_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            # ── Attendance Divisions (independent from timetable classes) ─
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS att_divisions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    user_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            # ── Attendance Subjects (independent from timetable subjects) ─
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS att_div_subjects (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    div_id INT NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    user_id INT NOT NULL,
                    FOREIGN KEY (div_id) REFERENCES att_divisions(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES admins(id) ON DELETE CASCADE
                )
            """)

            conn.commit()
            print("All required tables verified/created successfully.")

            # ── Idempotent migration: add user_id to tables that pre-existed ────
            # These ALTER TABLE calls are safe to run on fresh or existing DBs.
            # Error 1060 (duplicate column) is silently ignored.
            migrations = [
                ("teachers",            "user_id INT NOT NULL DEFAULT 1"),
                ("subjects",            "user_id INT NOT NULL DEFAULT 1"),
                ("subjects",            "is_lab TINYINT(1) NOT NULL DEFAULT 0"),
                ("classes",             "user_id INT NOT NULL DEFAULT 1"),
                ("teacher_subject",     "user_id INT NOT NULL DEFAULT 1"),
                ("time_slots",          "user_id INT NOT NULL DEFAULT 1"),
                ("timetable_history",   "user_id INT NOT NULL DEFAULT 1"),
                ("attendance_sessions", "is_published TINYINT(1) NOT NULL DEFAULT 0"),
                ("attendance_sessions", "att_div_id INT NULL"),
                ("attendance_sessions", "att_subject_id INT NULL"),
                ("class_students",      "att_div_id INT NULL"),
            ]
            for table, col_def in migrations:
                _add_column_if_missing(cursor, table, col_def)

            # Make class_id and subject_id nullable in attendance_sessions
            # so new attendance records don't need timetable data.
            # Also make class_students.class_id nullable (attendance now uses att_div_id)
            for stmt in [
                "ALTER TABLE attendance_sessions MODIFY COLUMN class_id INT NULL",
                "ALTER TABLE attendance_sessions MODIFY COLUMN subject_id INT NULL",
                "ALTER TABLE attendance_sessions MODIFY COLUMN total_students INT NOT NULL DEFAULT 0",
                "ALTER TABLE class_students MODIFY COLUMN class_id INT NULL",
            ]:
                try: cursor.execute(stmt)
                except Error: pass

            # Drop the old FK on class_students.class_id (references classes table)
            # so that NULL is allowed in that column for new attendance-only records
            try:
                cursor.execute("""SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='class_students'
                    AND COLUMN_NAME='class_id' AND REFERENCED_TABLE_NAME IS NOT NULL""")
                row = cursor.fetchone()
                if row:
                    cursor.execute(f"ALTER TABLE class_students DROP FOREIGN KEY `{row[0]}`")
            except Error: pass

            # generated_timetables changed PK structure; handle separately
            # Drop old PRIMARY KEY on class_name if it exists (idempotent via try/except)
            try:
                cursor.execute("ALTER TABLE generated_timetables DROP PRIMARY KEY")
                cursor.execute("ALTER TABLE generated_timetables ADD COLUMN id INT AUTO_INCREMENT PRIMARY KEY FIRST")
            except Error:
                pass  # Already migrated or never had old schema
            _add_column_if_missing(cursor, "generated_timetables", "user_id INT NOT NULL DEFAULT 1")

            conn.commit()
            print("Migration complete.")

        except Error as e:
            print(f"Error creating tables: {e}")
        finally:
            if conn.is_connected():
                cursor.close()
                conn.close()

if __name__ == '__main__':
    setup_database()
