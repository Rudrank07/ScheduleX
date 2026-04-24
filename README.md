# ScheduleX 📅

A smart timetable generator and attendance management system for educational institutions.

## Features

- 🗓️ **Timetable Generation** — Auto-generate conflict-free weekly timetables with lab rotation support
- 👨‍🏫 **Teacher & Subject Management** — Assign teachers to subjects and classes
- 📊 **Attendance Tracking** — Mark and view attendance per division and subject
- 🔐 **Multi-user Support** — Role-based access for teachers and students
- 📤 **Publish Timetables** — Teachers can publish timetables for students to view

## Tech Stack

- **Backend**: Python, Flask, Flask-CORS
- **Database**: MySQL
- **Frontend**: HTML, CSS, JavaScript (Vanilla)

## Setup

### Prerequisites

- Python 3.8+
- MySQL Server

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/CampXhack.git
cd CampXhack
```

### 2. Create a virtual environment and install dependencies

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your MySQL credentials:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=timetable_db
```

### 4. Run the app

```bash
python app.py
```

The server will start on `http://localhost:5000` and automatically set up the database tables.

## Project Structure

```
CampXhack/
├── app.py              # Main Flask application & API routes
├── db_config.py        # Database connection & schema setup
├── database_setup.sql  # SQL schema reference
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
└── ui_demo/            # Frontend HTML/CSS/JS
```

## License

MIT
