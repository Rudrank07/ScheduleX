"""Convert app.py from psycopg2 (PostgreSQL) to sqlite3."""
import re

with open('app.py', 'r') as f:
    code = f.read()

# 1. Fix imports
code = code.replace(
    'from db_config import get_db_connection, setup_database, dict_cursor, _close\nimport json\nimport os\nimport psycopg2\nimport psycopg2.extras',
    'from db_config import get_db_connection, setup_database, _close\nimport json\nimport os\nimport sqlite3\nfrom flask.json.provider import DefaultJSONProvider\n\nclass _SQLiteJSON(DefaultJSONProvider):\n    def default(self, o):\n        if isinstance(o, __import__("sqlite3").Row): return dict(o)\n        return super().default(o)'
)

# 2. After app = Flask(__name__), add JSON provider
code = code.replace(
    'app = Flask(__name__)\n# Enable CORS',
    'app = Flask(__name__)\napp.json_provider_class = _SQLiteJSON\napp.json = _SQLiteJSON(app)\n# Enable CORS'
)

# 3. dict_cursor -> regular cursor (row_factory already set on connection)
code = code.replace('cursor = dict_cursor(conn)', 'cursor = conn.cursor()')

# 4. psycopg2.IntegrityError -> sqlite3.IntegrityError
code = code.replace('psycopg2.IntegrityError', 'sqlite3.IntegrityError')

# 5. %s -> ? (SQL placeholders)
code = code.replace('%s', '?')

# 6. Remove RETURNING id, use lastrowid instead
code = code.replace(' RETURNING id"', '"')
code = re.sub(r'new_id = cursor\.fetchone\(\)\[0\]', 'new_id = cursor.lastrowid', code)
code = re.sub(r'sid = cursor\.fetchone\(\)\[0\]', 'sid = cursor.lastrowid', code)

# 7. ON CONFLICT PostgreSQL -> SQLite syntax
code = code.replace(
    'ON CONFLICT (class_name, user_id) DO UPDATE SET grid_data = EXCLUDED.grid_data',
    'ON CONFLICT(class_name, user_id) DO UPDATE SET grid_data = excluded.grid_data'
)
code = code.replace(
    'ON CONFLICT (teacher_id) DO UPDATE SET timetable_data = EXCLUDED.timetable_data, published_at = CURRENT_TIMESTAMP',
    'ON CONFLICT(teacher_id) DO UPDATE SET timetable_data = excluded.timetable_data, published_at = CURRENT_TIMESTAMP'
)

# 8. Fix date formatting (SQLite returns strings, not datetime objects)
code = code.replace("r['date'].strftime('%Y-%m-%d')", "str(r['date'])[:10]")
code = code.replace("r['created_at'].strftime('%Y-%m-%d %H:%M:%S')", "str(r['created_at'])[:19]")
code = code.replace("r['published_at'].strftime('%Y-%m-%d %H:%M:%S')", "str(r['published_at'])[:19]")
code = code.replace("session['date'].strftime('%Y-%m-%d')", "str(session['date'])[:10]")
code = code.replace("session['date'] = session['date'].strftime('%Y-%m-%d')", "session['date'] = str(session['date'])[:10]")
code = code.replace("r['date']       = r['date'].strftime('%Y-%m-%d')", "r['date']       = str(r['date'])[:10]")
code = code.replace("r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M:%S')", "r['created_at'] = str(r['created_at'])[:19]")
code = code.replace("if row['last_date']: row['last_date'] = row['last_date'].strftime('%Y-%m-%d')", "if row['last_date']: row['last_date'] = str(row['last_date'])[:10]")

# 9. is_published=TRUE -> is_published=1
code = code.replace('is_published=TRUE', 'is_published=1')
code = code.replace('a.is_published=TRUE', 'a.is_published=1')

# 10. SQLite SUM boolean fix (already using CASE WHEN from pg migration, keep as is)

# 11. Fix rollback (sqlite3 uses conn.rollback())
# Already using conn.rollback() from psycopg2 migration - sqlite3 supports this too

# 12. Fix app.run for PythonAnywhere (keep host/port flexible)
code = code.replace(
    "    port = int(os.environ.get('PORT', 5001))\n    app.run(debug=False, host='0.0.0.0', port=port)",
    "    app.run(debug=True, host='127.0.0.1', port=5001)"
)

# 13. Update requirements note
with open('app.py', 'w') as f:
    f.write(code)

print("SQLite migration done!")
import subprocess
r = subprocess.run(['python3', '-c', 'import ast; ast.parse(open("app.py").read()); print("Syntax OK!")'],
                  capture_output=True, text=True)
print(r.stdout or r.stderr)

# Check for remaining psycopg2/mysql references
r2 = subprocess.run(['grep', '-n', 'psycopg2\|mysql\|dict_cursor\|RETURNING\|%s', 'app.py'],
                   capture_output=True, text=True)
print("Remaining issues:", r2.stdout or "None!")
