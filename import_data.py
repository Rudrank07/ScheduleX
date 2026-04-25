import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'timetable.db')
DATA_PATH = os.path.join(os.path.dirname(__file__), 'data_dump.json')

def import_data():
    with open(DATA_PATH, 'r') as f:
        data = json.load(f)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Disable foreign keys temporarily
    cursor.execute("PRAGMA foreign_keys = OFF")
    
    for table, rows in data.items():
        if not rows:
            continue
            
        print(f"Importing {len(rows)} rows into {table}...")
        # Clear existing data in table
        cursor.execute(f"DELETE FROM {table}")
        
        for row in rows:
            columns = ', '.join(row.keys())
            placeholders = ', '.join(['?' for _ in row])
            values = tuple(row.values())
            
            try:
                cursor.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})", values)
            except Exception as e:
                print(f"Error inserting into {table}: {e}")
                print(f"Row: {row}")
                
    conn.commit()
    cursor.execute("PRAGMA foreign_keys = ON")
    conn.close()
    print("Import complete!")

if __name__ == '__main__':
    import_data()
