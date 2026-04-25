"""
migrate.py — Run this ONCE on PythonAnywhere after pulling the new code.

Usage (in PythonAnywhere Bash console):
    cd ~/ScheduleX   (or wherever your app lives)
    python3 migrate.py

What it does:
  1. Removes the old CHECK constraint on admins.role (which blocked 'admin' role)
  2. Creates the signup_requests table
  3. Ensures the admin user exists with role='admin' and password='admin123'
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'timetable.db')

def run():
    print(f"Connecting to: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    print("Step 1: Recreating admins table without CHECK constraint...")
    conn.executescript("""
        PRAGMA foreign_keys = OFF;

        CREATE TABLE IF NOT EXISTS admins_new (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role     TEXT DEFAULT 'teacher'
        );

        INSERT OR IGNORE INTO admins_new (id, username, password, role)
            SELECT id, username, password, role FROM admins;

        DROP TABLE admins;
        ALTER TABLE admins_new RENAME TO admins;

        PRAGMA foreign_keys = ON;
    """)
    print("  ✓ admins table updated")

    print("Step 2: Creating signup_requests table...")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS signup_requests (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            username     TEXT UNIQUE NOT NULL,
            password     TEXT NOT NULL,
            role         TEXT DEFAULT 'teacher',
            requested_at TEXT DEFAULT (datetime('now'))
        )
    """)
    print("  ✓ signup_requests table ready")

    print("Step 3: Ensuring admin user exists with role='admin'...")
    existing = conn.execute(
        "SELECT id, role FROM admins WHERE username = 'admin'"
    ).fetchone()

    if existing:
        conn.execute(
            "UPDATE admins SET role='admin', password='admin123' WHERE username='admin'"
        )
        print(f"  ✓ Updated existing admin user (id={existing['id']}) → role=admin")
    else:
        conn.execute(
            "INSERT INTO admins (username, password, role) VALUES ('admin', 'admin123', 'admin')"
        )
        print("  ✓ Created admin user (username=admin, password=admin123)")

    conn.commit()
    conn.close()

    print("\n✅ Migration complete! Reload your PythonAnywhere web app now.")
    print("   Admin login: username=admin  password=admin123")

if __name__ == '__main__':
    run()
