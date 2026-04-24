from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from db_config import get_db_connection, setup_database, _close
import json
import os
import sqlite3
from flask.json.provider import DefaultJSONProvider

class _SQLiteJSON(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, __import__("sqlite3").Row): return dict(o)
        return super().default(o)

app = Flask(__name__)
app.json_provider_class = _SQLiteJSON
app.json = _SQLiteJSON(app)
# Enable CORS for all routes so the frontend can connect
CORS(app)

# Path to the frontend folder
UI_DIR = os.path.join(os.path.dirname(__file__), 'ui_demo')

# Ensure the database and tables exist when the server starts
setup_database()

# ── Serve the frontend ──────────────────────────────────────────────
@app.route('/')
def serve_index():
    return send_from_directory(UI_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(UI_DIR, filename)

# ──────────────────────────────────────────────────────────────────
# Auth helper — reads the X-User-Id header sent by the frontend.
# Returns the integer user ID, or None if the header is missing/bad.
# ──────────────────────────────────────────────────────────────────
def get_current_user_id():
    uid = request.headers.get('X-User-Id')
    if uid is None:
        return None
    try:
        return int(uid)
    except (ValueError, TypeError):
        return None

def require_user_id():
    """Returns (user_id, None) on success, (None, error_response) on failure."""
    uid = get_current_user_id()
    if uid is None:
        return None, (jsonify({'error': 'Authentication required. Please log in again.'}), 401)
    return uid, None

# ----------------- TEACHER ENDPOINTS -----------------

@app.route('/add_teacher', methods=['POST'])
def add_teacher():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'Teacher name is required'}), 400
    
    name = data['name'].strip()
    if not name:
        return jsonify({'error': 'Teacher name cannot be empty'}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO teachers (name, user_id) VALUES (?, ?)", (name, user_id))
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({'success': True, 'message': 'Teacher added successfully', 'id': new_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Teacher already exists'}), 409
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/teachers', methods=['GET'])
def get_teachers():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM teachers WHERE user_id = ?", (user_id,))
        teachers = cursor.fetchall()
        return jsonify(teachers), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/delete_teacher/<int:id>', methods=['DELETE'])
def delete_teacher(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM teachers WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- SUBJECT ENDPOINTS -----------------

@app.route('/add_subject', methods=['POST'])
def add_subject():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'name' not in data or 'weekly_hours' not in data:
        return jsonify({'error': 'Subject name and weekly_hours are required'}), 400
        
    name = data['name'].strip()
    weekly_hours = data['weekly_hours']
    is_lab = 1 if data.get('is_lab', False) else 0
    
    if not name:
        return jsonify({'error': 'Subject name cannot be empty'}), 400
        
    try:
        weekly_hours = int(weekly_hours)
    except ValueError:
        return jsonify({'error': 'weekly_hours must be a valid number'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO subjects (name, weekly_hours, is_lab, user_id) VALUES (?, ?, ?, ?)",
            (name, weekly_hours, is_lab, user_id)
        )
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({'success': True, 'message': 'Subject added successfully', 'id': new_id, 'is_lab': is_lab}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Subject already exists'}), 409
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/subjects', methods=['GET'])
def get_subjects():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM subjects WHERE user_id = ?", (user_id,))
        subjects = cursor.fetchall()
        return jsonify(subjects), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/delete_subject/<int:id>', methods=['DELETE'])
def delete_subject(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subjects WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/update_subject/<int:id>', methods=['PUT'])
def update_subject(id):
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    weekly_hours = data.get('weekly_hours')
    if weekly_hours is None or not str(weekly_hours).isdigit() or int(weekly_hours) < 1:
        return jsonify({'error': 'weekly_hours must be a positive integer'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE subjects SET weekly_hours = ? WHERE id = ? AND user_id = ?",
            (int(weekly_hours), id, user_id)
        )
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Subject not found'}), 404
        return jsonify({'success': True, 'message': 'Subject updated'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- CLASS ENDPOINTS -----------------

@app.route('/add_class', methods=['POST'])
def add_class():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'class_name' not in data:
        return jsonify({'error': 'Class name is required'}), 400
    
    class_name = data['class_name'].strip()
    if not class_name:
        return jsonify({'error': 'Class name cannot be empty'}), 400
        
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO classes (class_name, user_id) VALUES (?, ?)", (class_name, user_id))
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({'success': True, 'message': 'Class added successfully', 'id': new_id}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Class already exists'}), 409
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/classes', methods=['GET'])
def get_classes():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM classes WHERE user_id = ?", (user_id,))
        classes = cursor.fetchall()
        return jsonify(classes), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/delete_class/<int:id>', methods=['DELETE'])
def delete_class(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM classes WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- ASSIGNMENT ENDPOINTS -----------------

@app.route('/assign_teacher', methods=['POST'])
def assign_teacher():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'teacher_id' not in data or 'subject_id' not in data:
        return jsonify({'error': 'teacher_id and subject_id are required (class_id is optional but recommended)'}), 400
        
    try:
        teacher_id = int(data['teacher_id'])
        subject_id = int(data['subject_id'])
        class_id = int(data['class_id']) if 'class_id' in data else None
    except ValueError:
        return jsonify({'error': 'IDs must be valid numbers'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO teacher_subject (teacher_id, subject_id, class_id, user_id) 
            VALUES (?, ?, ?, ?)
        """, (teacher_id, subject_id, class_id, user_id))
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({'success': True, 'message': 'Assigned successfully', 'id': new_id}), 201
    except sqlite3.IntegrityError as e:
        if "foreign key constraint fails" in str(e).lower():
            return jsonify({'error': 'Invalid teacher_id, subject_id, or class_id - record does not exist'}), 400
        return jsonify({'error': 'Assignment already exists or constraints violated', 'details': str(e)}), 409
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/teacher_subject', methods=['GET'])
def get_teacher_subject():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        query = """
            SELECT ts.id, ts.teacher_id, t.name as teacher_name, 
                   ts.subject_id, s.name as subject_name,
                   ts.class_id, c.class_name
            FROM teacher_subject ts
            JOIN teachers t ON ts.teacher_id = t.id
            JOIN subjects s ON ts.subject_id = s.id
            LEFT JOIN classes c ON ts.class_id = c.id
            WHERE ts.user_id = ?
        """
        cursor.execute(query, (user_id,))
        assignments = [dict(r) for r in cursor.fetchall()]
        return jsonify(assignments), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/delete_assignment/<int:id>', methods=['DELETE'])
def delete_assignment(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM teacher_subject WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- TIME SLOTS ENDPOINTS -----------------

@app.route('/add_time_slot', methods=['POST'])
def add_time_slot():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'start_time' not in data or 'end_time' not in data:
        return jsonify({'error': 'start_time and end_time are required'}), 400
    
    start_time = data['start_time'].strip()
    end_time = data['end_time'].strip()
    is_break = bool(data.get('is_break', False))
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO time_slots (start_time, end_time, is_break, user_id) VALUES (?, ?, ?, ?)",
            (start_time, end_time, is_break, user_id)
        )
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({'success': True, 'message': 'Time slot added', 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/time_slots', methods=['GET'])
def get_time_slots():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM time_slots WHERE user_id = ? ORDER BY start_time ASC", (user_id,))
        slots = cursor.fetchall()
        return jsonify(slots), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/delete_time_slot/<int:id>', methods=['DELETE'])
def delete_time_slot(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM time_slots WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- GENERATED TIMETABLES ENDPOINTS -----------------

@app.route('/get_timetables', methods=['GET'])
def get_timetables():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM generated_timetables WHERE user_id = ?", (user_id,))
        records = cursor.fetchall()
        timetables = {}
        for r in records:
            timetables[r['class_name']] = json.loads(r['grid_data'])
        return jsonify(timetables), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/save_timetable', methods=['POST'])
def save_timetable():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'class_name' not in data or 'grid_data' not in data:
        return jsonify({'error': 'class_name and grid_data are required'}), 400
        
    class_name = data['class_name']
    grid_data_json = json.dumps(data['grid_data'])
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO generated_timetables (class_name, grid_data, user_id) 
            VALUES (?, ?, ?)
            ON CONFLICT(class_name, user_id) DO UPDATE SET grid_data = excluded.grid_data
        """, (class_name, grid_data_json, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Timetable saved successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/reset_timetables', methods=['DELETE'])
def reset_timetables():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM generated_timetables WHERE user_id = ?", (user_id,))
        conn.commit()
        return jsonify({'success': True, 'message': 'All timetables reset successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- TIMETABLE HISTORY ENDPOINTS -----------------

@app.route('/history', methods=['GET'])
def get_history():
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, created_at FROM timetable_history WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        )
        records = cursor.fetchall()
        for r in records:
            r['created_at'] = str(r['created_at'])[:19]
        return jsonify(records), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/history/<int:id>', methods=['GET'])
def get_history_by_id(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM timetable_history WHERE id = ? AND user_id = ?", (id, user_id))
        record = cursor.fetchone()
        if record:
            return jsonify(json.loads(record['data'])), 200
        return jsonify({'error': 'Not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/save_history', methods=['POST'])
def save_history():
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'name' not in data or 'data' not in data:
        return jsonify({'error': 'name and data are required'}), 400
        
    name = data['name']
    json_data = json.dumps(data['data'])
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO timetable_history (name, data, user_id) VALUES (?, ?, ?)",
            (name, json_data, user_id)
        )
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({'success': True, 'message': 'History saved successfully', 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/delete_history/<int:id>', methods=['DELETE'])
def delete_history(id):
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM timetable_history WHERE id = ? AND user_id = ?", (id, user_id))
        conn.commit()
        return jsonify({'success': True, 'message': 'Deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

# ----------------- AUTHENTICATION ENDPOINTS -----------------

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Username and password required'}), 400
        
    username = data['username']
    password = data['password']
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, role FROM admins WHERE username = ? AND password = ?",
            (username, password)
        )
        admin = cursor.fetchone()
        if admin:
            # Return id so the frontend can store it as loggedInUserId
            return jsonify({'success': True, 'message': 'Authenticated', 'role': admin['role'], 'id': admin['id']}), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Username and password required'}), 400
        
    username = data['username']
    password = data['password']
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
        
    try:
        cursor = conn.cursor()
        # Check if username exists
        cursor.execute("SELECT id FROM admins WHERE username = ?", (username,))
        if cursor.fetchone():
            return jsonify({'error': 'Username already exists!'}), 400
            
        role = data.get('role', 'student')
        if role not in ['teacher', 'student']:
            role = 'student'

        cursor.close()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO admins (username, password, role) VALUES (?, ?, ?)",
            (username, password, role)
        )
        new_id = cursor.lastrowid
        conn.commit()
        # Return id so the frontend can store it as loggedInUserId
        return jsonify({'success': True, 'message': 'Registered successfully', 'role': role, 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)


# ----------------- PUBLISH TIMETABLE (Teacher → Students) -----------------

@app.route('/publish_timetable', methods=['POST'])
def publish_timetable():
    """Teacher publishes their current timetable so students can view it."""
    user_id, err = require_user_id()
    if err: return err

    data = request.get_json()
    if not data or 'timetable_data' not in data:
        return jsonify({'error': 'timetable_data is required'}), 400

    timetable_json = json.dumps(data['timetable_data'])

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO published_timetables (teacher_id, timetable_data)
            VALUES (?, ?)
            ON CONFLICT(teacher_id) DO UPDATE SET timetable_data = excluded.timetable_data, published_at = CURRENT_TIMESTAMP
        """, (user_id, timetable_json))
        conn.commit()
        return jsonify({'success': True, 'message': 'Timetable published successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/published_timetables', methods=['GET'])
def get_published_timetables():
    """Returns all teachers' published timetables. Any authenticated user can read."""
    user_id, err = require_user_id()
    if err: return err

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT teacher_id, timetable_data, published_at FROM published_timetables")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            result.append({
                'teacher_id': r['teacher_id'],
                'timetable_data': json.loads(r['timetable_data']),
                'published_at': str(r['published_at'])[:19]
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)



# ----------------- ATTENDANCE ENDPOINTS -----------------

@app.route('/attendance/sessions', methods=['GET'])
def get_attendance_sessions():
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.date, a.total_students, a.created_at, a.is_published,
                   a.att_div_id, a.att_subject_id,
                   COALESCE(d.name, c.class_name, 'N/A') AS class_name,
                   COALESCE(ds.name, s.name, 'N/A')      AS subject_name,
                   COALESCE(SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END),0) AS present_count,
                   COALESCE(SUM(CASE WHEN r.status='absent' THEN 1 ELSE 0 END),0)  AS absent_count,
                   COALESCE(SUM(CASE WHEN r.status='late' THEN 1 ELSE 0 END),0)    AS late_count
            FROM attendance_sessions a
            LEFT JOIN att_divisions    d  ON a.att_div_id     = d.id
            LEFT JOIN att_div_subjects ds ON a.att_subject_id = ds.id
            LEFT JOIN classes          c  ON a.class_id       = c.id
            LEFT JOIN subjects         s  ON a.subject_id     = s.id
            LEFT JOIN attendance_records r ON r.session_id = a.id
            WHERE a.user_id = ?
            GROUP BY a.id
            ORDER BY a.date DESC, a.created_at DESC
        """, (user_id,))
        rows = cursor.fetchall()
        for r in rows:
            r['date']       = str(r['date'])[:10]
            r['created_at'] = str(r['created_at'])[:19]
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/session', methods=['POST'])
def create_attendance_session():
    user_id, err = require_user_id()
    if err: return err
    data = request.get_json()
    if not data or 'date' not in data or 'students' not in data:
        return jsonify({'error': 'date and students required'}), 400
    # Support both new (att_div_id/att_subject_id) and old (class_id/subject_id) format
    att_div_id     = data.get('att_div_id')
    att_subject_id = data.get('att_subject_id')
    class_id       = data.get('class_id')   # legacy, can be None
    subject_id     = data.get('subject_id') # legacy, can be None
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO attendance_sessions
                (date, class_id, subject_id, att_div_id, att_subject_id, total_students, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data['date'], class_id, subject_id, att_div_id, att_subject_id, len(data['students']), user_id))
        sid = cursor.lastrowid
        for st in data['students']:
            cursor.execute("""
                INSERT INTO attendance_records (session_id, student_name, student_roll, status)
                VALUES (?, ?, ?, ?)
            """, (sid, st['name'], st.get('roll',''), st.get('status','absent')))
        conn.commit()
        return jsonify({'success': True, 'id': sid}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/session/<int:id>', methods=['GET'])
def get_attendance_session(id):
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.date, a.total_students, a.att_div_id, a.att_subject_id,
                   COALESCE(d.name, c.class_name, 'N/A') AS class_name,
                   COALESCE(ds.name, s.name, 'N/A')      AS subject_name
            FROM attendance_sessions a
            LEFT JOIN att_divisions    d  ON a.att_div_id=d.id
            LEFT JOIN att_div_subjects ds ON a.att_subject_id=ds.id
            LEFT JOIN classes c ON a.class_id=c.id
            LEFT JOIN subjects s ON a.subject_id=s.id
            WHERE a.id=? AND a.user_id=?
        """, (id, user_id))
        session = cursor.fetchone()
        if not session: return jsonify({'error': 'Not found'}), 404
        session['date'] = str(session['date'])[:10]
        cursor.execute("SELECT * FROM attendance_records WHERE session_id=? ORDER BY id", (id,))
        session['records'] = cursor.fetchall()
        return jsonify(session), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/session/<int:id>', methods=['PUT'])
def update_attendance_session(id):
    user_id, err = require_user_id()
    if err: return err
    data = request.get_json()
    if not data or 'students' not in data:
        return jsonify({'error': 'students required'}), 400
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM attendance_sessions WHERE id=? AND user_id=?", (id, user_id))
        if not cursor.fetchone(): return jsonify({'error': 'Not found'}), 404
        for st in data['students']:
            if 'id' in st:
                cursor.execute("UPDATE attendance_records SET status=?, student_name=? WHERE id=? AND session_id=?",
                               (st['status'], st['name'], st['id'], id))
            else:
                cursor.execute("INSERT INTO attendance_records (session_id,student_name,student_roll,status) VALUES(?,?,?,?)",
                               (id, st['name'], st.get('roll',''), st.get('status','absent')))
        cursor.execute("UPDATE attendance_sessions SET total_students=? WHERE id=?", (len(data['students']), id))
        conn.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/session/<int:id>', methods=['DELETE'])
def delete_attendance_session(id):
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM attendance_sessions WHERE id=? AND user_id=?", (id, user_id))
        conn.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/report', methods=['GET'])
def get_attendance_report():
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        filters, params = ["a.user_id=?"], [user_id]
        if request.args.get('class_id'):   filters.append("a.class_id=?");   params.append(request.args['class_id'])
        if request.args.get('subject_id'): filters.append("a.subject_id=?"); params.append(request.args['subject_id'])
        where = " AND ".join(filters)
        cursor.execute(f"""
            SELECT r.student_name, c.class_name, s.name AS subject_name,
                   COUNT(*) AS total, SUM(r.status='present') AS present_count,
                   SUM(r.status='absent') AS absent_count, SUM(r.status='late') AS late_count,
                   ROUND(SUM(r.status='present')/COUNT(*)*100,1) AS pct
            FROM attendance_records r
            JOIN attendance_sessions a ON r.session_id=a.id
            JOIN classes c ON a.class_id=c.id JOIN subjects s ON a.subject_id=s.id
            WHERE {where}
            GROUP BY r.student_name, a.subject_id, a.class_id
            ORDER BY c.class_name, s.name, r.student_name
        """, tuple(params))
        return jsonify(cursor.fetchall()), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/sessions/public', methods=['GET'])
def get_public_attendance():
    """Students can view published attendance sessions (read-only)."""
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.date, c.class_name, s.name AS subject_name, a.total_students,
                   adm.username AS teacher_name,
                   COALESCE(SUM(r.status='present'),0) AS present_count,
                   COALESCE(SUM(r.status='absent'),0)  AS absent_count
            FROM attendance_sessions a
            JOIN classes c ON a.class_id=c.id
            JOIN subjects s ON a.subject_id=s.id
            JOIN admins adm ON a.user_id=adm.id
            LEFT JOIN attendance_records r ON r.session_id=a.id
            WHERE a.is_published=1
            GROUP BY a.id
            ORDER BY a.date DESC LIMIT 100
        """)
        rows = cursor.fetchall()
        for r in rows: r['date'] = str(r['date'])[:10]
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)


# ----------------- ATTENDANCE DIVISION ENDPOINTS -----------------

@app.route('/attendance/divisions', methods=['GET'])
def get_att_divisions():
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error':'DB failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM att_divisions WHERE user_id=? ORDER BY name", (user_id,))
        return jsonify(cursor.fetchall()), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/divisions', methods=['POST'])
def add_att_division():
    user_id, err = require_user_id()
    if err: return err
    data = request.get_json()
    if not data or not data.get('name','').strip():
        return jsonify({'error':'name required'}), 400
    conn = get_db_connection()
    if not conn: return jsonify({'error':'DB failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO att_divisions (name, user_id) VALUES (?,?)", (data['name'].strip(), user_id))
        conn.commit()
        new_id = cursor.lastrowid
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/division/<int:div_id>', methods=['DELETE'])
def delete_att_division(div_id):
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error':'DB failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM att_divisions WHERE id=? AND user_id=?", (div_id, user_id))
        conn.commit()
        return jsonify({'success': True}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/division/<int:div_id>/subjects', methods=['GET'])
def get_div_subjects(div_id):
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error':'DB failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM att_div_subjects WHERE div_id=? AND user_id=? ORDER BY name", (div_id, user_id))
        return jsonify(cursor.fetchall()), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/division/<int:div_id>/subjects', methods=['POST'])
def add_div_subject(div_id):
    user_id, err = require_user_id()
    if err: return err
    data = request.get_json()
    if not data or not data.get('name','').strip():
        return jsonify({'error':'name required'}), 400
    conn = get_db_connection()
    if not conn: return jsonify({'error':'DB failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO att_div_subjects (div_id, name, user_id) VALUES (?,?,?)",
                       (div_id, data['name'].strip(), user_id))
        conn.commit()
        new_id = cursor.lastrowid
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/division/<int:div_id>/subject/<int:sub_id>', methods=['DELETE'])
def delete_div_subject(div_id, sub_id):
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error':'DB failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM att_div_subjects WHERE id=? AND div_id=? AND user_id=?", (sub_id, div_id, user_id))
        conn.commit()
        return jsonify({'success': True}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)


# ----------------- ROSTER ENDPOINTS -----------------

@app.route('/attendance/roster/<int:class_id>', methods=['GET'])
def get_class_roster(class_id):
    """Get roster by att_div_id (class_id param is now att_div_id)."""
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, student_name, student_roll FROM class_students WHERE att_div_id=? AND user_id=? ORDER BY CASE WHEN student_roll ~ '^[0-9]+$' THEN student_roll::int ELSE 999999 END, id",
                       (class_id, user_id))
        return jsonify(cursor.fetchall()), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/roster/<int:class_id>', methods=['POST'])
def save_class_roster(class_id):
    """Save roster by att_div_id (class_id param is now att_div_id)."""
    user_id, err = require_user_id()
    if err: return err
    data = request.get_json()
    if not data or 'students' not in data: return jsonify({'error':'students required'}), 400
    conn = get_db_connection()
    if not conn: return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM class_students WHERE att_div_id=? AND user_id=?", (class_id, user_id))
        for st in data['students']:
            cursor.execute("INSERT INTO class_students (att_div_id,student_name,student_roll,user_id) VALUES(?,?,?,?)",
                           (class_id, st['name'], st.get('roll',''), user_id))
        conn.commit()
        return jsonify({'success': True, 'count': len(data['students'])}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/roster/<int:class_id>/student/<int:sid>', methods=['DELETE'])
def delete_roster_student(class_id, sid):
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM class_students WHERE id=? AND att_div_id=? AND user_id=?", (sid, class_id, user_id))
        conn.commit()
        return jsonify({'success': True}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)

@app.route('/attendance/student-report', methods=['GET'])
def student_attendance_report():
    """Return attendance % per subject for a named student (published sessions only)."""
    user_id, err = require_user_id()
    if err: return err
    name = request.args.get('name','').strip()
    if not name: return jsonify({'error':'name required'}), 400
    conn = get_db_connection()
    if not conn: return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.name AS subject_name, c.class_name,
                   COUNT(*) AS total,
                   SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END) AS present_count,
                   SUM(CASE WHEN r.status='absent' THEN 1 ELSE 0 END) AS absent_count,
                   SUM(CASE WHEN r.status='late' THEN 1 ELSE 0 END) AS late_count,
                   ROUND(SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END)::numeric/COUNT(*)*100,1) AS pct,
                   MAX(a.date) AS last_date
            FROM attendance_records r
            JOIN attendance_sessions a ON r.session_id=a.id
            JOIN subjects s ON a.subject_id=s.id
            JOIN classes  c ON a.class_id=c.id
            WHERE r.student_name=? AND a.is_published=1
            GROUP BY a.subject_id, a.class_id ORDER BY c.class_name, s.name
        """, (name,))
        rows = cursor.fetchall()
        for row in rows:
            if row['last_date']: row['last_date'] = str(row['last_date'])[:10]
        return jsonify({'name': name, 'report': rows}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)


@app.route('/attendance/session/<int:id>/public', methods=['GET'])
def get_public_session_detail(id):
    """Public detail of a published session — accessible by students."""
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.id, a.date, a.total_students, a.class_id, a.subject_id,
                   c.class_name, s.name AS subject_name, adm.username AS teacher_name
            FROM attendance_sessions a
            JOIN classes c ON a.class_id=c.id
            JOIN subjects s ON a.subject_id=s.id
            JOIN admins adm ON a.user_id=adm.id
            WHERE a.id=? AND a.is_published=1
        """, (id,))
        session = cursor.fetchone()
        if not session: return jsonify({'error': 'Not found or not published'}), 404
        session['date'] = str(session['date'])[:10]
        cursor.execute("SELECT * FROM attendance_records WHERE session_id=? ORDER BY CASE WHEN student_roll ~ '^[0-9]+$' THEN student_roll::int ELSE 999999 END, id", (id,))
        session['records'] = cursor.fetchall()
        return jsonify(session), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)


@app.route('/attendance/session/<int:id>/publish', methods=['POST'])
def toggle_publish_session(id):
    """Toggle published state of an attendance session."""
    user_id, err = require_user_id()
    if err: return err
    conn = get_db_connection()
    if not conn: return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, is_published FROM attendance_sessions WHERE id=? AND user_id=?", (id, user_id))
        row = cursor.fetchone()
        if not row: return jsonify({'error': 'Not found or unauthorized'}), 404
        new_state = 0 if row['is_published'] else 1
        cursor.execute("UPDATE attendance_sessions SET is_published=? WHERE id=?", (new_state, id))
        conn.commit()
        return jsonify({'success': True, 'is_published': bool(new_state)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        _close(conn, cursor)


if __name__ == '__main__':
    # Run the server on port 5001, accessible locally.
    app.run(debug=True, host='127.0.0.1', port=5001)
