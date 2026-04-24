"""
Transforms app.py from MySQL (mysql-connector) to PostgreSQL (psycopg2).
Run once on the production branch: python migrate_app.py
"""
import re

with open('app.py', 'r') as f:
    code = f.read()

# 1. Replace imports
code = code.replace(
    'from db_config import get_db_connection, setup_database\nimport json\nimport os\nimport mysql.connector',
    'from db_config import get_db_connection, setup_database, dict_cursor, _close\nimport json\nimport os\nimport psycopg2\nimport psycopg2.extras'
)

# 2. Add _close helper usage - replace is_connected patterns
# Pattern: if conn.is_connected():\n            cursor.close()\n            conn.close()
code = re.sub(
    r'if conn\.is_connected\(\):\s*cursor\.close\(\)\s*conn\.close\(\)',
    '_close(conn, cursor)',
    code
)
# Single-line variant
code = re.sub(
    r'if conn\.is_connected\(\): cursor\.close\(\); conn\.close\(\)',
    '_close(conn, cursor)',
    code
)

# 3. Replace dictionary=True cursor calls
code = code.replace(
    'cursor = conn.cursor(dictionary=True)',
    'cursor = dict_cursor(conn)'
)

# 4. Replace mysql IntegrityError
code = code.replace('mysql.connector.IntegrityError', 'psycopg2.IntegrityError')

# 5. Fix INSERT ... RETURNING id for lastrowid cases
# add_teacher
code = code.replace(
    'cursor.execute("INSERT INTO teachers (name, user_id) VALUES (%s, %s)", (name, user_id))\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Teacher added successfully\', \'id\': cursor.lastrowid}), 201',
    'cursor.execute("INSERT INTO teachers (name, user_id) VALUES (%s, %s) RETURNING id", (name, user_id))\n        new_id = cursor.fetchone()[0]\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Teacher added successfully\', \'id\': new_id}), 201'
)

# add_subject
code = code.replace(
    '(name, weekly_hours, is_lab, user_id)\n        )\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Subject added successfully\', \'id\': cursor.lastrowid, \'is_lab\': is_lab}), 201',
    '(name, weekly_hours, is_lab, user_id)\n        )\n        new_id = cursor.fetchone()[0]\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Subject added successfully\', \'id\': new_id, \'is_lab\': is_lab}), 201'
)
code = code.replace(
    '"INSERT INTO subjects (name, weekly_hours, is_lab, user_id) VALUES (%s, %s, %s, %s)"',
    '"INSERT INTO subjects (name, weekly_hours, is_lab, user_id) VALUES (%s, %s, %s, %s) RETURNING id"'
)

# add_class
code = code.replace(
    'cursor.execute("INSERT INTO classes (class_name, user_id) VALUES (%s, %s)", (class_name, user_id))\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Class added successfully\', \'id\': cursor.lastrowid}), 201',
    'cursor.execute("INSERT INTO classes (class_name, user_id) VALUES (%s, %s) RETURNING id", (class_name, user_id))\n        new_id = cursor.fetchone()[0]\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Class added successfully\', \'id\': new_id}), 201'
)

# assign_teacher
code = code.replace(
    '        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Assigned successfully\', \'id\': cursor.lastrowid}), 201',
    '        new_id = cursor.fetchone()[0]\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Assigned successfully\', \'id\': new_id}), 201'
)
code = code.replace(
    '"INSERT INTO teacher_subject (teacher_id, subject_id, class_id, user_id) \n            VALUES (%s, %s, %s, %s)\n        "',
    '"INSERT INTO teacher_subject (teacher_id, subject_id, class_id, user_id) \n            VALUES (%s, %s, %s, %s) RETURNING id\n        "'
)

# add_time_slot
code = code.replace(
    '        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Time slot added\', \'id\': cursor.lastrowid}), 201',
    '        new_id = cursor.fetchone()[0]\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'Time slot added\', \'id\': new_id}), 201'
)
code = code.replace(
    '"INSERT INTO time_slots (start_time, end_time, is_break, user_id) VALUES (%s, %s, %s, %s)"',
    '"INSERT INTO time_slots (start_time, end_time, is_break, user_id) VALUES (%s, %s, %s, %s) RETURNING id"'
)

# save_history lastrowid
code = code.replace(
    '        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'History saved successfully\', \'id\': cursor.lastrowid}), 201',
    '        new_id = cursor.fetchone()[0]\n        conn.commit()\n        return jsonify({\'success\': True, \'message\': \'History saved successfully\', \'id\': new_id}), 201'
)
code = code.replace(
    '"INSERT INTO timetable_history (name, data, user_id) VALUES (%s, %s, %s)"',
    '"INSERT INTO timetable_history (name, data, user_id) VALUES (%s, %s, %s) RETURNING id"'
)

# register lastrowid
code = code.replace(
    '        conn.commit()\n        new_id = cursor.lastrowid',
    '        new_id = cursor.fetchone()[0]\n        conn.commit()'
)
code = code.replace(
    '"INSERT INTO admins (username, password, role) VALUES (%s, %s, %s)"',
    '"INSERT INTO admins (username, password, role) VALUES (%s, %s, %s) RETURNING id"'
)

# create_attendance_session lastrowid
code = code.replace(
    '        sid = cursor.lastrowid',
    '        sid = cursor.fetchone()[0]'
)
code = code.replace(
    'INSERT INTO attendance_sessions\n                (date, class_id, subject_id, att_div_id, att_subject_id, total_students, user_id)\n            VALUES (%s, %s, %s, %s, %s, %s, %s)',
    'INSERT INTO attendance_sessions\n                (date, class_id, subject_id, att_div_id, att_subject_id, total_students, user_id)\n            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id'
)

# add_att_division lastrowid
code = code.replace(
    '        return jsonify({\'success\': True, \'id\': cursor.lastrowid}), 201\n    except Exception as e: return jsonify({\'error\': str(e)}), 500\n    finally:\n        _close(conn, cursor)\n\n@app.route(\'/attendance/division/<int:div_id>\'',
    '        new_id = cursor.fetchone()[0]\n        return jsonify({\'success\': True, \'id\': new_id}), 201\n    except Exception as e: return jsonify({\'error\': str(e)}), 500\n    finally:\n        _close(conn, cursor)\n\n@app.route(\'/attendance/division/<int:div_id>\''
)
code = code.replace(
    '"INSERT INTO att_divisions (name, user_id) VALUES (%s,%s)"',
    '"INSERT INTO att_divisions (name, user_id) VALUES (%s,%s) RETURNING id"'
)

# add_div_subject lastrowid
code = code.replace(
    '        return jsonify({\'success\': True, \'id\': cursor.lastrowid}), 201\n    except Exception as e: return jsonify({\'error\': str(e)}), 500\n    finally:\n        _close(conn, cursor)\n\n@app.route(\'/attendance/division/<int:div_id>/subject',
    '        new_id = cursor.fetchone()[0]\n        return jsonify({\'success\': True, \'id\': new_id}), 201\n    except Exception as e: return jsonify({\'error\': str(e)}), 500\n    finally:\n        _close(conn, cursor)\n\n@app.route(\'/attendance/division/<int:div_id>/subject'
)
code = code.replace(
    '"INSERT INTO att_div_subjects (div_id, name, user_id) VALUES (%s,%s,%s)"',
    '"INSERT INTO att_div_subjects (div_id, name, user_id) VALUES (%s,%s,%s) RETURNING id"'
)

# 6. Fix ON DUPLICATE KEY UPDATE -> ON CONFLICT
code = code.replace(
    """            ON DUPLICATE KEY UPDATE grid_data = %s
        \"\"\", (class_name, grid_data_json, user_id, grid_data_json))""",
    """            ON CONFLICT (class_name, user_id) DO UPDATE SET grid_data = EXCLUDED.grid_data
        \"\"\", (class_name, grid_data_json, user_id))"""
)

code = code.replace(
    """            ON DUPLICATE KEY UPDATE timetable_data = %s, published_at = CURRENT_TIMESTAMP
        \"\"\", (user_id, timetable_json, timetable_json))""",
    """            ON CONFLICT (teacher_id) DO UPDATE SET timetable_data = EXCLUDED.timetable_data, published_at = CURRENT_TIMESTAMP
        \"\"\", (user_id, timetable_json))"""
)

# 7. Fix MySQL boolean SUM -> CASE WHEN
code = code.replace(
    "COALESCE(SUM(r.status='present'),0) AS present_count,\n                   COALESCE(SUM(r.status='absent'),0)  AS absent_count,\n                   COALESCE(SUM(r.status='late'),0)    AS late_count",
    "COALESCE(SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END),0) AS present_count,\n                   COALESCE(SUM(CASE WHEN r.status='absent' THEN 1 ELSE 0 END),0)  AS absent_count,\n                   COALESCE(SUM(CASE WHEN r.status='late' THEN 1 ELSE 0 END),0)    AS late_count"
)

code = code.replace(
    "COALESCE(SUM(r.status='present'),0) AS present_count,\n                    COALESCE(SUM(r.status='absent'),0)  AS absent_count",
    "COALESCE(SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END),0) AS present_count,\n                    COALESCE(SUM(CASE WHEN r.status='absent' THEN 1 ELSE 0 END),0)  AS absent_count"
)

code = code.replace(
    "SUM(r.status='present') AS present_count,\n                    SUM(r.status='absent') AS absent_count, SUM(r.status='late') AS late_count,\n                    ROUND(SUM(r.status='present')/COUNT(*)*100,1) AS pct",
    "SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END) AS present_count,\n                    SUM(CASE WHEN r.status='absent' THEN 1 ELSE 0 END) AS absent_count,\n                    SUM(CASE WHEN r.status='late' THEN 1 ELSE 0 END) AS late_count,\n                    ROUND(SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END)::numeric/COUNT(*)*100,1) AS pct"
)

code = code.replace(
    "SUM(r.status='present') AS present_count,\n                   SUM(r.status='absent')  AS absent_count,\n                   SUM(r.status='late')    AS late_count,\n                   ROUND(SUM(r.status='present')/COUNT(*)*100,1) AS pct",
    "SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END) AS present_count,\n                   SUM(CASE WHEN r.status='absent' THEN 1 ELSE 0 END) AS absent_count,\n                   SUM(CASE WHEN r.status='late' THEN 1 ELSE 0 END) AS late_count,\n                   ROUND(SUM(CASE WHEN r.status='present' THEN 1 ELSE 0 END)::numeric/COUNT(*)*100,1) AS pct"
)

# 8. Fix is_published=1 -> is_published=TRUE
code = code.replace("a.is_published=1", "a.is_published=TRUE")
code = code.replace("WHERE a.is_published=1", "WHERE a.is_published=TRUE")

# 9. Fix student_roll+0 ordering (MySQL trick, not valid in PostgreSQL)
code = code.replace(
    'ORDER BY student_roll+0, id"',
    'ORDER BY CASE WHEN student_roll ~ \'^[0-9]+$\' THEN student_roll::int ELSE 999999 END, id"'
)
code = code.replace(
    '"SELECT * FROM attendance_records WHERE session_id=%s ORDER BY student_roll+0, id"',
    '"SELECT * FROM attendance_records WHERE session_id=%s ORDER BY CASE WHEN student_roll ~ \'^\\ [0-9]+$\' THEN student_roll::int ELSE 999999 END, id"'
)

# 10. Fix register function - cursor switch for INSERT
code = code.replace(
    '        # Switch to regular cursor for INSERT so lastrowid works\n        cursor.close()\n        cursor = conn.cursor()',
    '        cursor.close()\n        cursor = conn.cursor()'
)

# 11. Fix fetchall to convert RealDictRow to plain dict in list returns
code = code.replace(
    'assignments = cursor.fetchall()\n        return jsonify(assignments), 200',
    'assignments = [dict(r) for r in cursor.fetchall()]\n        return jsonify(assignments), 200'
)

# 12. Fix app.run for Render (use PORT env var, bind 0.0.0.0)
code = code.replace(
    "    app.run(debug=True, host='127.0.0.1', port=5001)",
    "    port = int(os.environ.get('PORT', 5001))\n    app.run(debug=False, host='0.0.0.0', port=port)"
)

with open('app.py', 'w') as f:
    f.write(code)

print("Migration complete! app.py updated for PostgreSQL.")
print("Check for any remaining 'lastrowid' or 'is_connected' references:")
import subprocess
result = subprocess.run(['grep', '-n', 'lastrowid\|is_connected\|mysql.connector\|dictionary=True', 'app.py'], capture_output=True, text=True)
print(result.stdout or "None found — all clear!")
