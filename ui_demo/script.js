// State Management
const state = {
    teachers: [],
    subjects: [],
    classes: [],
    timeSlots: [],
    assignments: [],
    timetableGenerated: false,
    timetableCache: {},
    savedHistories: [],
    classBatches: {},     // className -> true/false (localStorage)
    labBlockSizes: {}     // subjectName -> block size in slots (default 2)
};

// ── Sub-Batch Preferences (localStorage, no DB needed) ───────────────
function loadBatchPrefs() {
    try { state.classBatches = JSON.parse(localStorage.getItem('schedulex_batches') || '{}'); }
    catch(e) { state.classBatches = {}; }
}
function saveBatchPrefs() {
    localStorage.setItem('schedulex_batches', JSON.stringify(state.classBatches));
}
window.toggleClassBatch = function(className) {
    state.classBatches[className] = !state.classBatches[className];
    saveBatchPrefs();
    updateLists();
    if (state.timetableGenerated && typeof currentEditClassName !== 'undefined' && currentEditClassName === className) {
        renderTimetable(className);
    }
};

// ── Lab Block Size Preferences (localStorage) ─────────────────────
// Each lab subject can have a custom block size (1, 2, or 3 consecutive slots).
// Default is 2 (2-hour lab). Stored by subject name.
function loadLabBlockSizes() {
    try { state.labBlockSizes = JSON.parse(localStorage.getItem('schedulex_lab_blocks') || '{}'); }
    catch(e) { state.labBlockSizes = {}; }
}
function saveLabBlockSizes() {
    localStorage.setItem('schedulex_lab_blocks', JSON.stringify(state.labBlockSizes));
}
window.setLabBlockSize = function(subjectName, size) {
    state.labBlockSizes[subjectName] = parseInt(size) || 2;
    saveLabBlockSizes();
    // No need to re-render lists; the select already shows the chosen value
};

// ── Helper: valid start indices for a lab window of blockSize consecutive non-break slots
function getLabWindows(slots, blockSize) {
    const windows = [];
    for (let day = 0; day < 6; day++) {
        for (let s = 0; s <= slots.length - blockSize; s++) {
            let valid = true;
            for (let b = 0; b < blockSize; b++) {
                if (slots[s + b].isBreak) { valid = false; break; }
            }
            if (valid) windows.push([day, s]);
        }
    }
    return windows;
}


const API_BASE = 'https://schedulex.onrender.com'; // UPDATE: replace with your actual Render URL after deployment

// Wrapper that automatically attaches the X-User-Id header to every request.
// Login/register endpoints don't need it (userId will be null at that point).
function apiFetch(url, options = {}) {
    const userId = localStorage.getItem('loggedInUserId');
    const headers = {
        ...(options.headers || {}),
        ...(userId ? { 'X-User-Id': userId } : {})
    };
    return fetch(url, { ...options, headers });
}

async function loadInitialData() {
    loadBatchPrefs();
    loadLabBlockSizes();
    try {
        const [tRes, sRes, cRes, aRes, tsRes, ttRes, hRes] = await Promise.all([
            apiFetch(`${API_BASE}/teachers`),
            apiFetch(`${API_BASE}/subjects`),
            apiFetch(`${API_BASE}/classes`),
            apiFetch(`${API_BASE}/teacher_subject`),
            apiFetch(`${API_BASE}/time_slots`),
            apiFetch(`${API_BASE}/get_timetables`),
            apiFetch(`${API_BASE}/history`)
        ]);
        
        state.teachers = await tRes.json();
        
        const subjects = await sRes.json();
        state.subjects = subjects.map(s => ({...s, hours: s.weekly_hours, isLab: !!s.is_lab}));
        
        const classes = await cRes.json();
        state.classes = classes.map(c => ({...c, name: c.class_name}));
        
        const assignments = await aRes.json();
        state.assignments = assignments.map(a => ({
            id: a.id,
            teacher: { id: a.teacher_id, name: a.teacher_name },
            subject: { id: a.subject_id, name: a.subject_name },
            class: { id: a.class_id, name: a.class_name }
        }));
        
        const rawTimeSlots = await tsRes.json();
        state.timeSlots = rawTimeSlots.map(t => ({
            id: t.id,
            start: t.start_time,
            end: t.end_time,
            isBreak: !!t.is_break,
            display: `${formatTime(t.start_time)} - ${formatTime(t.end_time)}`
        }));
        
        const timetables = await ttRes.json();
        if (timetables && Object.keys(timetables).length > 0) {
            state.timetableCache = timetables;
            state.timetableGenerated = true;
            document.getElementById('generate-btn').innerHTML = '<i class="fa-solid fa-check"></i> Regenerate Timetable';
        } else {
            state.timetableCache = {};
            state.timetableGenerated = false;
        }
        
        state.savedHistories = await hRes.json();
        
        updateStats();
        updateLists();
        renderHistory();
    } catch(err) {
        console.error("Error loading DB data:", err);
    }
}

// Authentication interceptor
document.addEventListener('DOMContentLoaded', () => {
    if(!localStorage.getItem('adminLoggedIn')) {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('main-app-container').classList.add('hidden');
    } else {
        const user = localStorage.getItem('loggedInUser');
        if(user) document.getElementById('display-username').innerText = user;
        
        applyRoleRestrictions();
        
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app-container').classList.remove('hidden');
        const savedRole = localStorage.getItem('loggedInRole');
        if (savedRole === 'student') {
            loadPublishedTimetables();
        } else {
            loadInitialData();
        }
    }
});

function applyRoleRestrictions() {
    const role = localStorage.getItem('loggedInRole');
    if(role === 'student') {
        const addDataTab = document.querySelector('[data-target="add-data-page"]');
        const genTab = document.querySelector('[data-target="generate-page"]');
        const historyTab = document.querySelector('[data-target="history-page"]');
        const dashboardTab = document.querySelector('[data-target="dashboard-page"]');
        
        if(addDataTab) addDataTab.style.display = 'none';
        if(genTab) genTab.style.display = 'none';
        if(historyTab) historyTab.style.display = 'none';
        if(dashboardTab) dashboardTab.style.display = 'none';
        
        const resetBtn = document.getElementById('reset-btn');
        if(resetBtn) resetBtn.style.display = 'none';
        
        const saveHistBtn = document.getElementById('save-history-btn');
        if(saveHistBtn) saveHistBtn.style.display = 'none';

        const publishBtn = document.getElementById('publish-timetable-btn');
        if(publishBtn) publishBtn.style.display = 'none';

        const editBtn = document.getElementById('edit-timetable-btn');
        if(editBtn) editBtn.style.display = 'none';
        
        const navLinksArr = document.querySelectorAll('.nav-links li');
        navLinksArr.forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        
        const vtTab = document.querySelector('[data-target="view-timetable-page"]');
        if(vtTab) vtTab.classList.add('active');
        
        const vtPage = document.getElementById('view-timetable-page');
        if(vtPage) vtPage.classList.remove('hidden');
    }
}

let currentLoginTab = 'teacher';

const teacherTabBtn = document.getElementById('tab-teacher-login');
const studentTabBtn = document.getElementById('tab-student-login');
const loginTitle = document.getElementById('login-title');
const loginUsername = document.getElementById('login-username');
const loginError = document.getElementById('login-error');

if (teacherTabBtn && studentTabBtn) {
    teacherTabBtn.addEventListener('click', () => {
        currentLoginTab = 'teacher';
        teacherTabBtn.classList.add('active');
        studentTabBtn.classList.remove('active');
        if (loginTitle) loginTitle.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i> Teacher Gateway';
        if (loginUsername) loginUsername.placeholder = 'Teacher Username';
        if (loginError) loginError.style.display = 'none';
    });

    studentTabBtn.addEventListener('click', () => {
        currentLoginTab = 'student';
        studentTabBtn.classList.add('active');
        teacherTabBtn.classList.remove('active');
        if (loginTitle) loginTitle.innerHTML = '<i class="fa-solid fa-user-graduate"></i> Student Gateway';
        if (loginUsername) loginUsername.placeholder = 'Student Username';
        if (loginError) loginError.style.display = 'none';
    });
}

document.getElementById('submit-login-btn').addEventListener('click', async () => {
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;
    const errObj = document.getElementById('login-error');
    
    if(!user || !pass) {
        errObj.innerText = "Please fill in all blanks!";
        errObj.style.display = 'block';
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        const data = await res.json();
        
        if (data.success) {
            const returnedRole = data.role || 'teacher';
            if (returnedRole !== currentLoginTab) {
                errObj.innerText = `You are registered as a ${returnedRole}, not a ${currentLoginTab}!`;
                errObj.style.display = 'block';
                return;
            }

            localStorage.setItem('adminLoggedIn', 'true');
            localStorage.setItem('loggedInUser', user);
            localStorage.setItem('loggedInRole', returnedRole);
            localStorage.setItem('loggedInUserId', data.id);  // store user id for data isolation
            document.getElementById('display-username').innerText = user;
            
            applyRoleRestrictions();
            
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('main-app-container').classList.remove('hidden');
            errObj.style.display = 'none';
            if (returnedRole === 'student') {
                loadPublishedTimetables();
            } else {
                loadInitialData();
            }
        } else {
            errObj.innerText = data.error;
            errObj.style.display = 'block';
        }
    } catch (e) {
        errObj.innerText = "API Backend Disconnected!";
        errObj.style.display = 'block';
    }
});

// UI View Toggles
document.getElementById('show-register-btn').addEventListener('click', () => {
    document.getElementById('login-form-box').style.display = 'none';
    document.getElementById('register-form-box').style.display = 'block';
});
document.getElementById('show-login-btn').addEventListener('click', () => {
    document.getElementById('register-form-box').style.display = 'none';
    document.getElementById('login-form-box').style.display = 'block';
});

// Register User
document.getElementById('submit-reg-btn').addEventListener('click', async () => {
    const user = document.getElementById('reg-username').value;
    const pass = document.getElementById('reg-password').value;
    const conf = document.getElementById('reg-password-confirm').value;
    const roleOpt = document.getElementById('reg-role').value;
    const errObj = document.getElementById('reg-error');
    
    if(!user || !pass || !conf) {
        errObj.innerText = "Please fill in all blanks!";
        errObj.style.display = 'block';
        return;
    }
    
    if(pass !== conf) {
        errObj.innerText = "Passwords do not match!";
        errObj.style.display = 'block';
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass, role: roleOpt })
        });
        const data = await res.json();
        
        if (data.success) {
            // Once registered securely, automatically log them in natively!
            localStorage.setItem('adminLoggedIn', 'true');
            localStorage.setItem('loggedInUser', user);
            localStorage.setItem('loggedInRole', data.role || roleOpt);
            localStorage.setItem('loggedInUserId', data.id);  // store user id for data isolation
            document.getElementById('display-username').innerText = user;
            
            applyRoleRestrictions();
            
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('main-app-container').classList.remove('hidden');
            errObj.style.display = 'none';
            const regRole = data.role || roleOpt;
            if (regRole === 'student') {
                loadPublishedTimetables();
            } else {
                loadInitialData();
            }
        } else {
            errObj.innerText = data.error;
            errObj.style.display = 'block';
        }
    } catch (e) {
        errObj.innerText = "API Backend Disconnected!";
        errObj.style.display = 'block';
    }
});

document.getElementById('admin-logout-btn').addEventListener('click', () => {
    localStorage.removeItem('adminLoggedIn');
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('loggedInRole');
    localStorage.removeItem('loggedInUserId');
    window.location.reload();
});

// DOM Elements
const navLinks = document.querySelectorAll('.nav-links li');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('page-title');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.form-container');

// Navigation Logic
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        // Remove active class from all nav links
        navLinks.forEach(l => l.classList.remove('active'));
        // Add active class to clicked link
        link.classList.add('active');

        // Hide all pages
        pages.forEach(page => page.classList.add('hidden'));
        
        // Show target page
        const targetId = link.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden');
        
        // Update Title
        pageTitle.innerText = link.innerText.trim();
        
        // Special logic when opening View Timetable
        if(targetId === 'view-timetable-page') {
            const navRole = localStorage.getItem('loggedInRole');
            if (navRole === 'student') {
                loadPublishedTimetables();
            } else {
                updateViewTimetableClassDropdown();
                if(state.timetableGenerated && state.classes.length > 0) {
                    renderTimetable(state.classes[0].name);
                }
            }
        }
    });
});

// Tabs Logic in Add Data Page
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        tabContents.forEach(content => content.classList.add('hidden'));
        const targetTab = document.getElementById(btn.getAttribute('data-tab'));
        targetTab.classList.remove('hidden');
    });
});

// Stats updaters
function updateStats() {
    document.getElementById('stat-teachers').innerText = state.teachers.length;
    document.getElementById('stat-subjects').innerText = state.subjects.length;
    document.getElementById('stat-classes').innerText = state.classes.length;
    updateDropdowns();
}

// Render Lists
function renderList(listId, items, displayProp, deleteCallback, editCallback) {
    const container = document.getElementById(listId);
    container.innerHTML = '';
    
    items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        
        let text = typeof displayProp === 'function' ? displayProp(item) : item[displayProp];
        
        const editIcon = editCallback
            ? `<i class="fa-solid fa-pen-to-square edit-btn" data-index="${index}" title="Edit weekly hours" style="margin-right:8px;color:var(--primary);cursor:pointer;font-size:0.85rem;"></i>`
            : '';

        div.innerHTML = `
            <span>${text}</span>
            <span style="display:flex;align-items:center;gap:4px;">${editIcon}<i class="fa-solid fa-trash-can delete-btn" data-index="${index}"></i></span>
        `;
        
        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCallback(index, item);
        });

        if (editCallback) {
            div.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                editCallback(index, item);
            });
        }
        
        container.appendChild(div);
    });
}

// ── Subject Edit ──────────────────────────────────────────────────────────────
window.openEditSubject = function(item) {
    // Remove any existing popover
    const old = document.getElementById('subject-edit-popover');
    if (old) old.remove();

    const popover = document.createElement('div');
    popover.id = 'subject-edit-popover';
    popover.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%',
        'transform:translate(-50%,-50%)',
        'background:var(--card-bg,#1e1e2e)',
        'border:1px solid rgba(255,255,255,0.12)',
        'border-radius:14px', 'padding:28px 32px',
        'z-index:9999', 'box-shadow:0 8px 40px rgba(0,0,0,0.5)',
        'min-width:320px', 'font-family:inherit'
    ].join(';');

    popover.innerHTML = `
        <h3 style="margin:0 0 6px;font-size:1rem;color:var(--primary)">
            <i class="fa-solid fa-pen-to-square"></i> Edit Subject
        </h3>
        <p style="margin:0 0 18px;font-size:0.85rem;opacity:0.65">${item.name}</p>
        <label style="display:block;margin-bottom:6px;font-size:0.82rem;opacity:0.8">Weekly Hours</label>
        <input id="edit-subject-hours" type="number" min="1" max="40" value="${item.hours}"
            style="width:100%;padding:9px 12px;border-radius:8px;
                   border:1px solid rgba(255,255,255,0.15);
                   background:rgba(255,255,255,0.06);color:inherit;
                   font-size:1rem;box-sizing:border-box;margin-bottom:20px;outline:none">
        <div style="display:flex;gap:10px;justify-content:flex-end">
            <button id="edit-subject-cancel"
                style="padding:8px 18px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
                       background:transparent;color:inherit;cursor:pointer;font-size:0.9rem">
                Cancel
            </button>
            <button id="edit-subject-save"
                style="padding:8px 20px;border-radius:8px;border:none;
                       background:var(--primary,#6c63ff);color:#fff;
                       cursor:pointer;font-size:0.9rem;font-weight:600">
                Save
            </button>
        </div>
    `;

    document.body.appendChild(popover);
    document.getElementById('edit-subject-hours').focus();

    document.getElementById('edit-subject-cancel').onclick = () => popover.remove();

    document.getElementById('edit-subject-save').onclick = async () => {
        const newHours = parseInt(document.getElementById('edit-subject-hours').value);
        if (!newHours || newHours < 1) {
            alert('Please enter a valid number of hours (≥ 1).');
            return;
        }
        try {
            const res = await apiFetch(`${API_BASE}/update_subject/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weekly_hours: newHours })
            });
            const data = await res.json();
            if (data.success) {
                popover.remove();
                await loadInitialData();
            } else {
                alert('Error: ' + (data.error || 'Could not update subject'));
            }
        } catch (err) {
            alert('Request failed: ' + err);
        }
    };

    // Close on Escape or backdrop click
    const onKey = (e) => { if (e.key === 'Escape') { popover.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
};

// Form Submit Handlers
document.getElementById('teacher-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('teacher-name');
    if(input.value.trim()) {
        try {
            const res = await apiFetch(`${API_BASE}/add_teacher`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: input.value.trim() })
            });
            const data = await res.json();
            if(data.success) {
                input.value = '';
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch(err) {
            alert("API Error: " + err);
        }
    }
});

document.getElementById('subject-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('subject-name');
    const hoursInput = document.getElementById('weekly-hours');
    if(nameInput.value.trim() && hoursInput.value) {
        try {
            const res = await apiFetch(`${API_BASE}/add_subject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: nameInput.value.trim(), 
                    weekly_hours: parseInt(hoursInput.value),
                    is_lab: document.getElementById('is-lab').checked
                })
            });
            const data = await res.json();
            if(data.success) {
                nameInput.value = '';
                hoursInput.value = '';
                document.getElementById('is-lab').checked = false;
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch(err) {
            alert("API Error: " + err);
        }
    }
});

document.getElementById('class-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('class-name');
    if(input.value.trim()) {
        try {
            const res = await apiFetch(`${API_BASE}/add_class`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ class_name: input.value.trim() })
            });
            const data = await res.json();
            if(data.success) {
                input.value = '';
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch(err) {
            alert("API Error: " + err);
        }
    }
});

// Time Slot helper
function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(h);
    d.setMinutes(m);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}


// ── Custom Time Picker Init ─────────────────────────────────────────────
(function initTimePickers() {
    function populateTimeSel(prefix) {
        const hSel = document.getElementById(`${prefix}-hour`);
        const mSel = document.getElementById(`${prefix}-min`);
        if (!hSel || !mSel) return;
        hSel.innerHTML = '<option value="">HH</option>';
        for (let h = 1; h <= 12; h++) {
            const o = document.createElement('option');
            o.value = h; o.textContent = String(h).padStart(2,'0');
            hSel.appendChild(o);
        }
        mSel.innerHTML = '<option value="">MM</option>';
        ['00','05','10','15','20','25','30','35','40','45','50','55'].forEach(m => {
            const o = document.createElement('option');
            o.value = m; o.textContent = m;
            mSel.appendChild(o);
        });
    }
    populateTimeSel('start');
    populateTimeSel('end');
})();

document.getElementById('time-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Build 24h time string from custom selects (works on all platforms)
    function getTimeVal(prefix) {
        const h    = document.getElementById(`${prefix}-hour`).value;
        const m    = document.getElementById(`${prefix}-min`).value;
        const ampm = document.getElementById(`${prefix}-ampm`).value;
        if (!h || !m) return '';
        let hour24 = parseInt(h);
        if (ampm === 'AM' && hour24 === 12) hour24 = 0;
        if (ampm === 'PM' && hour24 !== 12) hour24 += 12;
        return `${String(hour24).padStart(2,'0')}:${m}`;
    }
    const start = getTimeVal('start');
    const end   = getTimeVal('end');
    const isBreak = document.getElementById('is-break').checked;
    
    if(start && end) {
        try {
            const res = await apiFetch(`${API_BASE}/add_time_slot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_time: start, end_time: end, is_break: isBreak })
            });
            const data = await res.json();
            if(data.success) {
                ['start-hour','start-min','end-hour','end-min'].forEach(id => {
                    const el = document.getElementById(id);
                    if(el) el.selectedIndex = 0;
                });
                document.getElementById('is-break').checked = false;
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch(err) {
            alert("API Error: " + err);
        }
    }
});

document.getElementById('assign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tSelect = document.getElementById('assign-teacher');
    const sSelect = document.getElementById('assign-subject');
    const cSelect = document.getElementById('assign-class');
    
    if(tSelect.value && sSelect.value && cSelect.value) {
        try {
            const res = await apiFetch(`${API_BASE}/assign_teacher`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    teacher_id: tSelect.value, 
                    subject_id: sSelect.value, 
                    class_id: cSelect.value 
                })
            });
            const data = await res.json();
            if(data.success) {
                tSelect.value = "";
                sSelect.value = "";
                cSelect.value = "";
                await loadInitialData();
            } else {
                alert(data.error);
            }
        } catch(err) {
            alert("API Error: " + err);
        }
    }
});

// Update standard dropdowns
function updateDropdowns() {
    const tSelect = document.getElementById('assign-teacher');
    const sSelect = document.getElementById('assign-subject');
    const cSelect = document.getElementById('assign-class');
    
    // Keep first option
    tSelect.innerHTML = '<option value="" disabled selected>Select a teacher...</option>';
    sSelect.innerHTML = '<option value="" disabled selected>Select a subject...</option>';
    cSelect.innerHTML = '<option value="" disabled selected>Select a class...</option>';
    
    state.teachers.forEach(t => tSelect.innerHTML += `<option value="${t.id}">${t.name}</option>`);
    state.subjects.forEach(s => sSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`);
    state.classes.forEach(c => cSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
}

function updateLists() {
    renderList('teacher-list', state.teachers, 'name', async (idx, item) => { 
        if(confirm(`Delete teacher: ${item.name}?`)) {
            await apiFetch(`${API_BASE}/delete_teacher/${item.id}`, { method: 'DELETE' });
            await loadInitialData();
        }
    });
    renderList('subject-list', state.subjects, (s) => {
        let label = `${s.name} (${s.hours} hrs/wk)`;
        if (s.isLab) {
            const bs = state.labBlockSizes[s.name] || 2;
            label += ` <span class="lab-badge"><i class="fa-solid fa-flask"></i> Lab</span>`;
            label += ` <select onchange="setLabBlockSize('${s.name}', this.value)" onclick="event.stopPropagation()" style="margin-left:6px;padding:2px 5px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:var(--dark);font-size:0.75rem;cursor:pointer;"`;
            label += ` title="Lab block duration per session">`;
            [1,2,3].forEach(n => { label += `<option value="${n}"${bs===n?' selected':''}>${n}hr</option>`; });
            label += `</select>`;
        }
        return label;
    }, async (idx, item) => { 
        if(confirm(`Delete subject: ${item.name}?`)) {
            await apiFetch(`${API_BASE}/delete_subject/${item.id}`, { method: 'DELETE' });
            await loadInitialData();
        }
    }, (idx, item) => {
        // Edit callback — opens the weekly-hours editor
        openEditSubject(item);
    });
    renderList('class-list', state.classes, (c) => {
        const on = !!state.classBatches[c.name];
        return `${c.name} <span class="batch-toggle-badge${on ? ' active' : ''}" onclick="event.stopPropagation();toggleClassBatch('${c.name}')"><i class="fa-solid fa-users-viewfinder"></i> ${on ? '3 Batches ON' : 'Batches OFF'}</span>`;
    }, async (idx, item) => {
        if(confirm(`Delete class: ${item.name}?`)) {
            await apiFetch(`${API_BASE}/delete_class/${item.id}`, { method: 'DELETE' });
            await loadInitialData();
        }
    });
    renderList('time-list', state.timeSlots, (t) => `${t.display}${t.isBreak ? ' (Break)' : ''}`, async (idx, item) => { 
        if(confirm(`Delete time slot: ${item.display}?`)) {
            await apiFetch(`${API_BASE}/delete_time_slot/${item.id}`, { method: 'DELETE' });
            await loadInitialData();
        }
    });
    renderList('assignment-list', state.assignments, (a) => `${a.subject.name} &rarr; ${a.class.name} (${a.teacher.name})`, async (idx, item) => { 
        if(confirm(`Delete assignment?`)) {
            await apiFetch(`${API_BASE}/delete_assignment/${item.id}`, { method: 'DELETE' });
            await loadInitialData();
        }
    });
}

function generateGlobalTimetable() {
    let slots = state.timeSlots;
    if(slots.length === 0) {
        slots = [
            { display: "09:00 AM - 10:00 AM", isBreak: false },
            { display: "10:00 AM - 11:00 AM", isBreak: false },
            { display: "11:00 AM - 12:00 PM", isBreak: false },
            { display: "12:00 PM - 01:00 PM", isBreak: true },
            { display: "01:00 PM - 02:00 PM", isBreak: false },
            { display: "02:00 PM - 03:00 PM", isBreak: false },
            { display: "03:00 PM - 04:00 PM", isBreak: false }
        ];
    }


    let bestScore = Infinity;
    let bestTimetable = null;
    const MAX_RETRIES = 80;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        let attemptTimetable = {};
        // teacherBusy[day][slotIdx] = Set of teacher IDs busy at that moment
        let teacherBusy = Array(6).fill(null).map(() =>
            Array(slots.length).fill(null).map(() => new Set())
        );

        let classNeeds = {};
        state.classes.forEach(c => {
            classNeeds[c.name] = state.assignments
                .filter(a => a.class.name === c.name)
                .map(a => {
                    const sub = state.subjects.find(s => s.id === a.subject.id);
                    const isLab = sub ? !!sub.isLab : false;
                    // blockSize: how many consecutive slots per lab session (default 2)
                    const blockSize = isLab ? (state.labBlockSizes[sub.name] || 2) : 1;
                    return {
                        assignment: a,
                        remaining: sub ? sub.hours : 0,
                        isLab,
                        blockSize
                    };
                });
            attemptTimetable[c.name] = slots.map(() => Array(6).fill(null));
        });

        // ── PHASE 1: Schedule ALL lab subjects first ───────────────────────────
        state.classes.forEach(c => {
            const className = c.name;
            const hasBatches = !!state.classBatches[className];
            const labNeeds = classNeeds[className].filter(n => n.isLab);

            // Window cache: blockSize -> array of [day, slotIdx] valid windows
            const windowCache = {};
            const getWindows = bs =>
                windowCache[bs] || (windowCache[bs] = getLabWindows(slots, bs));

            // ── BATCH MODE: N-session rotation so every batch does every lab ─────
            // Session k: B1=labs[k % N], B2=labs[(k+1) % N], B3=labs[(k+2) % N]
            // With N sessions, each batch visits every lab exactly once.
            if (hasBatches && labNeeds.length > 0) {
                // Sort labs consistently so rotation is stable across retries
                const sortedLabs = [...labNeeds].sort(
                    (a, b) => a.assignment.subject.id - b.assignment.subject.id
                );
                const N = sortedLabs.length;
                // N sessions ensures every batch visits every lab
                const numSessions = N;

                // Track which days this class already has a lab session (spread sessions)
                const sessionDaysUsed = new Set();

                for (let session = 0; session < numSessions; session++) {
                    // Step-1 circular rotation: each session shifts by 1
                    const l0 = sortedLabs[(session + 0) % N];
                    const l1 = sortedLabs[(session + 1) % N];
                    const l2 = sortedLabs[(session + 2) % N];

                    // Use the blockSize of the lead lab (l0) for this session
                    const blockSize = l0.blockSize;
                    const windows = getWindows(blockSize);

                    // Shuffle windows, prefer unused days
                    const shuffled = [...windows].sort(() => Math.random() - 0.5);
                    shuffled.sort((a, b) =>
                        (sessionDaysUsed.has(a[0]) ? 1 : 0) - (sessionDaysUsed.has(b[0]) ? 1 : 0)
                    );

                    for (const [day, s] of shuffled) {
                        // Class slots must all be free for blockSize consecutive slots
                        let classOk = true;
                        for (let b = 0; b < blockSize; b++) {
                            if (attemptTimetable[className][s + b][day] !== null) { classOk = false; break; }
                        }
                        if (!classOk) continue;

                        // All 3 teachers must be free (skip if same teacher appears twice in wrap-around)
                        const teachers = [l0, l1, l2].map(l => l.assignment.teacher.id);
                        const uniqueTeachers = new Set(teachers);
                        let teachersOk = true;
                        for (const tid of uniqueTeachers) {
                            for (let b = 0; b < blockSize; b++) {
                                if (teacherBusy[day][s + b].has(tid)) { teachersOk = false; break; }
                            }
                            if (!teachersOk) break;
                        }
                        if (!teachersOk) continue;

                        // Place the batch-lab cell
                        for (const tid of uniqueTeachers) {
                            for (let b = 0; b < blockSize; b++) {
                                teacherBusy[day][s + b].add(tid);
                            }
                        }
                        // Deduct from remaining for each lab in this session
                        // (same lab may appear in multiple sessions due to wrap-around — only deduct once per session)
                        [l0, l1, l2].forEach(l => { l.remaining -= l.blockSize; });

                        const batchCell = {
                            type: 'batch-lab',
                            batches: [l0.assignment, l1.assignment, l2.assignment]
                        };
                        for (let b = 0; b < blockSize; b++) {
                            attemptTimetable[className][s + b][day] = batchCell;
                        }
                        sessionDaysUsed.add(day);
                        break; // session placed — move to next session
                    }
                }

                // After all rotation sessions, mark any unplaced labs as fully done
                // (remaining may still be > 0 for wrap-around repeats — ignore penalty for those)
                labNeeds.forEach(n => { if (n.remaining < 0) n.remaining = 0; });
                return; // done with this class's labs
            }

            // ── NON-BATCH MODE: MRV + day-spread single-lab placement ──────────
            const labSessions = [];
            labNeeds.forEach(labNeed => {
                const sessions = Math.floor(labNeed.remaining / labNeed.blockSize);
                for (let i = 0; i < sessions; i++) labSessions.push(labNeed);
            });

            labSessions.sort((a, b) =>
                getWindows(a.blockSize).length - getWindows(b.blockSize).length
            );

            const labDaysUsed = {};

            labSessions.forEach(labNeed => {
                if (labNeed.remaining < labNeed.blockSize) return;

                const blockSize = labNeed.blockSize;
                const windows = getWindows(blockSize);
                const sid = labNeed.assignment.subject.id;
                if (!labDaysUsed[sid]) labDaysUsed[sid] = new Set();
                const usedDays = labDaysUsed[sid];

                const shuffled = [...windows].sort(() => Math.random() - 0.5);
                shuffled.sort((a, b) =>
                    (usedDays.has(a[0]) ? 1 : 0) - (usedDays.has(b[0]) ? 1 : 0)
                );

                for (const [day, s] of shuffled) {
                    let ok = true;
                    for (let b = 0; b < blockSize; b++) {
                        if (attemptTimetable[className][s + b][day] !== null) { ok = false; break; }
                        if (teacherBusy[day][s + b].has(labNeed.assignment.teacher.id)) { ok = false; break; }
                    }
                    if (!ok) continue;

                    labNeed.remaining -= blockSize;
                    for (let b = 0; b < blockSize; b++) {
                        teacherBusy[day][s + b].add(labNeed.assignment.teacher.id);
                        attemptTimetable[className][s + b][day] = { type: 'class', assignment: labNeed.assignment };
                    }
                    usedDays.add(day);
                    break;
                }
            });
        });



        // ── PHASE 2: Fill remaining slots with lectures ──────────────────────
        let freeCount = 0;

        for (let day = 0; day < 6; day++) {
            for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
                const slot = slots[slotIdx];

                let shuffledClasses = [...state.classes].sort(() => Math.random() - 0.5);

                shuffledClasses.forEach(c => {
                    const className = c.name;

                    // Already filled (by Phase 1 lab or a break)
                    if (attemptTimetable[className][slotIdx][day] !== null) return;

                    if (slot.isBreak) {
                        attemptTimetable[className][slotIdx][day] = { type: 'break' };
                        return;
                    }

                    const needs = classNeeds[className];

                    // Track subjects already taught today (prevent repeat of same subject same day)
                    const subjectsToday = new Set();
                    for (let s = 0; s < slotIdx; s++) {
                        const pastCell = attemptTimetable[className][s][day];
                        if (!pastCell) continue;
                        if (pastCell.type === 'class') {
                            subjectsToday.add(pastCell.assignment.subject.id);
                        } else if (pastCell.type === 'batch-lab') {
                            pastCell.batches.forEach(a => subjectsToday.add(a.subject.id));
                        }
                    }

                    // Only consider non-lab subjects in Phase 2
                    // (labs with remaining > 0 couldn't be placed; skip them here)
                    let validAssigns = needs.filter(n => {
                        if (n.isLab) return false;           // labs handled in Phase 1
                        if (n.remaining <= 0) return false;
                        if (teacherBusy[day][slotIdx].has(n.assignment.teacher.id)) return false;
                        if (subjectsToday.has(n.assignment.subject.id)) return false;
                        return true;
                    });

                    // Relax repeat-subject constraint if nothing else fits
                    if (validAssigns.length === 0) {
                        validAssigns = needs.filter(n => {
                            if (n.isLab) return false;
                            if (n.remaining <= 0) return false;
                            if (teacherBusy[day][slotIdx].has(n.assignment.teacher.id)) return false;
                            return true;
                        });
                    }

                    if (validAssigns.length > 0) {
                        const choice = validAssigns[Math.floor(Math.random() * validAssigns.length)];
                        choice.remaining -= 1;
                        teacherBusy[day][slotIdx].add(choice.assignment.teacher.id);
                        attemptTimetable[className][slotIdx][day] = { type: 'class', assignment: choice.assignment };
                    } else {
                        attemptTimetable[className][slotIdx][day] = { type: 'free' };
                        freeCount++;
                    }
                });
            }
        }

        // Score: penalise unfulfilled hours heavily
        let unfulfilledPenalty = 0;
        state.classes.forEach(c => {
            classNeeds[c.name].forEach(n => {
                if (n.remaining > 0) unfulfilledPenalty += n.remaining * 10;
            });
        });

        const totalScore = freeCount + unfulfilledPenalty;

        if (totalScore < bestScore) {
            bestScore = totalScore;
            bestTimetable = attemptTimetable;
            if (bestScore === 0) break; // Perfect — stop early
        }
    }

    // If all attempts failed to produce any timetable, build an empty fallback
    if (!bestTimetable) {
        bestTimetable = {};
        state.classes.forEach(c => {
            bestTimetable[c.name] = slots.map(() => Array(6).fill({ type: 'free' }));
        });
    }

    state.timetableCache = bestTimetable;

    state.classes.forEach(c => {
        apiFetch(`${API_BASE}/save_timetable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ class_name: c.name, grid_data: state.timetableCache[c.name] })
        }).catch(err => console.error("Error saving timetable:", err));
    });
}

// Generate Timetable Animation
document.getElementById('generate-btn').addEventListener('click', function(e) {
    if(state.classes.length === 0 || state.assignments.length === 0) {
        alert("Please add some classes and assign subjects to teachers first!");
        return;
    }

    // ── Ripple effect on the button ──────────────────────────────────────
    const btn = this;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'gen-ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);

    // ── Show cinematic overlay ────────────────────────────────────────────
    const overlay = document.getElementById('gen-overlay');
    overlay.classList.remove('hidden', 'gen-ov-exit');
    overlay.classList.add('gen-ov-active');

    // Clear cache from MySQL explicitly
    apiFetch(`${API_BASE}/reset_timetables`, { method: 'DELETE' }).catch(err => console.error(err));

    btn.classList.add('hidden');
    document.getElementById('loading-container').classList.remove('hidden');

    // Run generation after a brief moment so the overlay renders
    setTimeout(() => {
        generateGlobalTimetable();
        state.timetableGenerated = true;
        document.getElementById('loading-container').classList.add('hidden');
        btn.classList.remove('hidden');
        btn.innerHTML = '<i class="fa-solid fa-check"></i><span>Regenerate Timetable</span>';

        // ── Fade out overlay then navigate ──────────────────────────────
        overlay.classList.remove('gen-ov-active');
        overlay.classList.add('gen-ov-exit');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('gen-ov-exit');
            // Auto navigate to View Timetable
            navLinks[3].click();
        }, 500);
    }, 900);
});

// Setup View dropdown and table
function updateViewTimetableClassDropdown() {
    const select = document.getElementById('view-class-select');
    select.innerHTML = '<option value="all" disabled selected>Select a class</option>';
    
    state.classes.forEach(c => {
        select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
    
    if(state.classes.length > 0 && state.timetableGenerated) {
        select.value = state.classes[0].name;
    }
}

document.getElementById('view-class-select').addEventListener('change', (e) => {
    const selectRole = localStorage.getItem('loggedInRole');
    if (selectRole === 'student') {
        renderPublishedTimetable(e.target.value);
    } else if(state.timetableGenerated) {
        renderTimetable(e.target.value);
    }
});

// ── Edit Mode State ────────────────────────────────────────────────
let editMode = false;
let currentEditClassName = '';
let currentEditCell = { rowIndex: -1, dayIndex: -1 };

// Pure Renderer (edit-mode aware)
function renderTimetable(className) {
    currentEditClassName = className;
    const tbody = document.getElementById('timetable-body');
    tbody.innerHTML = '';
    
    let slots = state.timeSlots;
    if(slots.length === 0) {
        slots = [
            { display: "09:00 AM - 10:00 AM", isBreak: false },
            { display: "10:00 AM - 11:00 AM", isBreak: false },
            { display: "11:00 AM - 12:00 PM", isBreak: false },
            { display: "12:00 PM - 01:00 PM", isBreak: true },
            { display: "01:00 PM - 02:00 PM", isBreak: false },
            { display: "02:00 PM - 03:00 PM", isBreak: false },
            { display: "03:00 PM - 04:00 PM", isBreak: false }
        ];
    }
    
    const grid = state.timetableCache[className];
    if(!grid) {
        tbody.innerHTML = '<tr><td colspan="7">No timetable generated for this class.</td></tr>';
        return;
    }
    
    const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    
    slots.forEach((slot, rowIndex) => {
        const tr = document.createElement('tr');
        
        const timeCell = document.createElement('td');
        timeCell.innerHTML = `<strong>${slot.display}</strong>`;
        if(slot.isBreak) timeCell.innerHTML += "<br><small>Break</small>";
        tr.appendChild(timeCell);
        
        const rowData = grid[rowIndex];
        for(let i = 0; i < 6; i++) {
            const td = document.createElement('td');
            const cellData = rowData ? rowData[i] : null;
            
            if(!cellData || cellData.type === 'break') {
                td.innerHTML = `<div class="cell-empty">Break</div>`;
            } else if(cellData.type === 'batch-lab') {
                td.innerHTML = `<div class="batch-cell">${cellData.batches.map((a, i) =>
                    `<div class="batch-row batch-row-${i+1}">
                        <span class="batch-label">B${i+1}</span>
                        <span class="batch-subject">${a.subject.name}</span>
                        <span class="batch-teacher">${a.teacher.name}</span>
                    </div>`).join('')}</div>`;
            } else if(cellData.type === 'class') {
                td.innerHTML = `
                    <div class="cell-content">
                        <span class="subject-tag">${cellData.assignment.subject.name}</span>
                        <span class="teacher-tag">${cellData.assignment.teacher.name}</span>
                    </div>`;
            } else if(cellData.type === 'free') {
                td.innerHTML = `<div class="cell-empty">Free Period</div>`;
            } else {
                td.innerHTML = `<div class="cell-empty">No Subjects Assigned</div>`;
            }
            
            // Edit mode: make non-break cells clickable
            if(editMode && cellData && cellData.type !== 'break') {
                td.classList.add('edit-mode-cell');
                td.title = `Click to edit ${DAYS[i]}, ${slot.display}`;
                td.addEventListener('click', () => openEditModal(className, rowIndex, i, slot, DAYS[i]));
            }
            
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });

    // Show the batch legend if any batch-lab cell exists in this class's grid
    const hasBatchLab = grid.some(row => row.some(cell => cell && cell.type === 'batch-lab'));
    const legend = document.getElementById('batch-legend');
    if (legend) legend.style.display = hasBatchLab ? 'flex' : 'none';
}

// ── Edit Mode: Toggle ───────────────────────────────────────────────
document.getElementById('edit-timetable-btn').addEventListener('click', () => {
    if(!state.timetableGenerated) {
        alert('Please generate a timetable first!');
        return;
    }
    editMode = !editMode;
    const btn = document.getElementById('edit-timetable-btn');
    if(editMode) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Exit Edit';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
    }
    if(currentEditClassName) renderTimetable(currentEditClassName);
});

// ── Edit Mode: Open Modal ───────────────────────────────────────────
function openEditModal(className, rowIndex, dayIndex, slot, dayName) {
    currentEditCell = { className, rowIndex, dayIndex };
    
    document.getElementById('edit-cell-info').textContent =
        `📅 ${dayName}  ·  🕐 ${slot.display}`;
    
    const select = document.getElementById('edit-cell-select');
    select.innerHTML = '<option value="free">— Free Period —</option>';
    state.assignments.forEach((a, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${a.subject.name}  →  ${a.teacher.name}`;
        select.appendChild(opt);
    });
    
    // Pre-select current cell value
    const current = state.timetableCache[className][rowIndex][dayIndex];
    if(current && current.type === 'class') {
        const match = state.assignments.findIndex(
            a => a.teacher.id === current.assignment.teacher.id &&
                 a.subject.id === current.assignment.subject.id
        );
        if(match >= 0) select.value = match;
    }
    
    const modal = document.getElementById('edit-cell-modal');
    modal.style.display = 'flex';
}

// ── Edit Mode: Apply / Cancel ───────────────────────────────────────
document.getElementById('edit-cell-apply').addEventListener('click', async () => {
    const { className, rowIndex, dayIndex } = currentEditCell;
    const select = document.getElementById('edit-cell-select');
    
    if(select.value === 'free') {
        state.timetableCache[className][rowIndex][dayIndex] = { type: 'free' };
    } else {
        const assignment = state.assignments[parseInt(select.value)];
        state.timetableCache[className][rowIndex][dayIndex] = { type: 'class', assignment };
    }
    
    // Save to DB
    try {
        await apiFetch(`${API_BASE}/save_timetable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ class_name: className, grid_data: state.timetableCache[className] })
        });
    } catch(e) { console.error('Error saving edited cell:', e); }
    
    document.getElementById('edit-cell-modal').style.display = 'none';
    renderTimetable(className);
});

document.getElementById('edit-cell-cancel').addEventListener('click', () => {
    document.getElementById('edit-cell-modal').style.display = 'none';
});

// Close modal on backdrop click
document.getElementById('edit-cell-modal').addEventListener('click', (e) => {
    if(e.target === document.getElementById('edit-cell-modal')) {
        document.getElementById('edit-cell-modal').style.display = 'none';
    }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
    if(confirm("Are you sure you want to reset all generated timetables? (Data will not be deleted)")) {
        state.timetableGenerated = false;
        state.timetableCache = {};
        
        await apiFetch(`${API_BASE}/reset_timetables`, { method: 'DELETE' });
        
        updateStats();
        updateLists();
        
        document.getElementById('generate-btn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Timetable';
        document.getElementById('timetable-body').innerHTML = '';
        
        navLinks[0].click(); // go to dashboard
    }
});

// Exports
document.getElementById('export-pdf').addEventListener('click', () => {
    const isStudent = localStorage.getItem('loggedInRole') === 'student';
    const hasContent = state.timetableGenerated || (isStudent && publishedTimetablesData.length > 0);
    if(!hasContent) {
        alert("No timetable available to download!");
        return;
    }
    const element = document.getElementById('timetable');
    
    const opt = {
        margin:       0.5,
        filename:     'timetable.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
    };
    
    html2pdf().set(opt).from(element).save();
});

document.getElementById('export-excel').addEventListener('click', () => {
    const isStudent = localStorage.getItem('loggedInRole') === 'student';
    const hasContent = state.timetableGenerated || (isStudent && publishedTimetablesData.length > 0);
    if(!hasContent) {
        alert("No timetable available to download!");
        return;
    }
    const table = document.getElementById('timetable');
    const wb = XLSX.utils.table_to_book(table, {sheet: "Timetable"});
    XLSX.writeFile(wb, 'timetable.xlsx');
});

// History Controls
function renderHistory() {
    const tbody = document.getElementById('history-list-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if(state.savedHistories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No history snapshots saved yet.</td></tr>';
        return;
    }
    
    state.savedHistories.forEach((item) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>${item.created_at}</td>
            <td style="text-align: center;">
                <button class="btn-primary" style="padding: 5px 10px; margin-right: 5px;" onclick="restoreHistory(${item.id})">Restore</button>
                <i class="fa-solid fa-trash-can delete-btn" style="color: #ff4d4d; cursor: pointer;" onclick="deleteHistory(${item.id})"></i>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.restoreHistory = async function(id) {
    if(!confirm("Restore this snapshot? This will overwrite your currently viewed timetable layout!")) return;
    try {
        const res = await apiFetch(`${API_BASE}/history/${id}`);
        const data = await res.json();
        if(data && Object.keys(data).length > 0) {
            state.timetableCache = data;
            state.timetableGenerated = true;
            document.getElementById('generate-btn').innerHTML = '<i class="fa-solid fa-check"></i> Regenerate Timetable';
            
            navLinks.forEach(l => l.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
            document.querySelector('[data-target="view-timetable-page"]').classList.add('active');
            document.getElementById('view-timetable-page').classList.remove('hidden');
            
            updateViewTimetableClassDropdown();
            if (state.classes.length > 0) {
                renderTimetable(state.classes[0].name);
            }
            state.classes.forEach(c => {
                apiFetch(`${API_BASE}/save_timetable`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ class_name: c.name, grid_data: state.timetableCache[c.name] })
                });
            });
        }
    } catch(err) {
        alert("API Error restoring: " + err);
    }
};

window.deleteHistory = async function(id) {
    if(!confirm("Erase this snapshot permanently?")) return;
    try {
        await apiFetch(`${API_BASE}/delete_history/${id}`, { method: 'DELETE' });
        await loadInitialData(); 
    } catch(err) {
        alert("API Error: " + err);
    }
};

document.getElementById('save-history-btn').addEventListener('click', async () => {
    if(!state.timetableGenerated || Object.keys(state.timetableCache).length === 0) {
        alert("You must generate a timetable first before saving it to history!");
        return;
    }
    const name = prompt("Enter a name for this Timetable Snapshot:");
    if(!name || !name.trim()) return;
    
    try {
        const res = await apiFetch(`${API_BASE}/save_history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), data: state.timetableCache })
        });
        const d = await res.json();
        if(d.success) {
            alert("Snapshot saved successfully!");
            await loadInitialData(); 
        } else {
            alert("Error: " + d.error);
        }
    } catch(err) {
        alert("API Error: " + err);
    }
});

// ── PUBLISH FOR STUDENTS ─────────────────────────────────────────────────────

document.getElementById('publish-timetable-btn').addEventListener('click', async () => {
    if(!state.timetableGenerated || Object.keys(state.timetableCache).length === 0) {
        alert("Please generate a timetable first before publishing!");
        return;
    }
    try {
        const res = await apiFetch(`${API_BASE}/publish_timetable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timetable_data: {
                    classes: state.timetableCache,
                    timeSlots: state.timeSlots
                }
            })
        });
        const data = await res.json();
        if(data.success) {
            alert("✅ Timetable published! Students can now view it.");
        } else {
            alert("Error: " + data.error);
        }
    } catch(err) {
        alert("API Error: " + err);
    }
});

// ── STUDENT: Load & Render Published Timetables ──────────────────────────────

let publishedTimetablesData = [];

async function loadPublishedTimetables() {
    try {
        const res = await apiFetch(`${API_BASE}/published_timetables`);
        const data = await res.json();
        publishedTimetablesData = Array.isArray(data) ? data : [];

        const select = document.getElementById('view-class-select');
        select.innerHTML = '';

        // Flatten all classes from all teachers into the dropdown
        const entries = [];
        publishedTimetablesData.forEach(pub => {
            const classes = pub.timetable_data ? Object.keys(pub.timetable_data.classes || {}) : [];
            classes.forEach(cls => entries.push({ teacherId: pub.teacher_id, className: cls }));
        });

        if (entries.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No timetables published yet</option>';
            document.getElementById('timetable-body').innerHTML =
                '<tr><td colspan="7" style="text-align:center;color:#888;padding:30px;">No timetables published by teachers yet.</td></tr>';
            return;
        }

        entries.forEach(e => {
            const opt = document.createElement('option');
            opt.value = `${e.teacherId}__${e.className}`;
            opt.textContent = e.className;
            select.appendChild(opt);
        });

        // Auto-render first entry
        select.selectedIndex = 0;
        renderPublishedTimetable(select.value);

    } catch(err) {
        console.error("Error loading published timetables:", err);
    }
}

function renderPublishedTimetable(key) {
    if(!key || !key.includes('__')) return;
    const [teacherIdStr, className] = key.split('__');
    const teacherId = parseInt(teacherIdStr);

    const pub = publishedTimetablesData.find(p => p.teacher_id === teacherId);
    if(!pub) return;

    const grid = pub.timetable_data.classes[className];
    const rawSlots = pub.timetable_data.timeSlots || [];
    const slots = rawSlots.map(t => ({
        ...t,
        display: t.display || `${formatTime(t.start)} - ${formatTime(t.end)}`
    }));

    const tbody = document.getElementById('timetable-body');
    tbody.innerHTML = '';

    if(!grid || slots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No data available.</td></tr>';
        return;
    }

    slots.forEach((slot, rowIndex) => {
        const tr = document.createElement('tr');
        const timeCell = document.createElement('td');
        timeCell.innerHTML = `<strong>${slot.display}</strong>`;
        if(slot.isBreak) timeCell.innerHTML += '<br><small>Break</small>';
        tr.appendChild(timeCell);

        const rowData = grid[rowIndex] || [];
        for(let i = 0; i < 6; i++) {
            const td = document.createElement('td');
            const cell = rowData[i];
            if(!cell || cell.type === 'break') {
                td.innerHTML = `<div class="cell-empty">Break</div>`;
            } else if(cell.type === 'batch-lab') {
                td.innerHTML = `<div class="batch-cell">${cell.batches.map((a, i) =>
                    `<div class="batch-row batch-row-${i+1}">
                        <span class="batch-label">B${i+1}</span>
                        <span class="batch-subject">${a.subject.name}</span>
                        <span class="batch-teacher">${a.teacher.name}</span>
                    </div>`).join('')}</div>`;
            } else if(cell.type === 'class') {
                td.innerHTML = `
                    <div class="cell-content">
                        <span class="subject-tag">${cell.assignment.subject.name}</span>
                        <span class="teacher-tag">${cell.assignment.teacher.name}</span>
                    </div>`;
            } else {
                td.innerHTML = `<div class="cell-empty">Free Period</div>`;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });
}

// ══════════════════════════════════════════════════════════════
// ATTENDANCE MODULE
// ══════════════════════════════════════════════════════════════

const att = {
    step: 1, date: '', classId: null, subjectId: null,
    students: [],          // [{name, roll, status}]
    sessions: [],          // cached from server
    editSessionId: null,   // for edit modal
    editRecords: []        // records being edited
};

// ── Attendance division state ─────────────────────────────────────────
let attDivisions   = [];  // [{id, name}]
let attDivSubjects = [];  // [{id, name}] for currently selected division

// ── Load divisions for dropdowns ─────────────────────────────────────
async function loadAttDivisions() {
    try {
        const res = await apiFetch('/attendance/divisions');
        attDivisions = await res.json();
        // Populate all division dropdowns
        ['att-class-sel','att-flt-class','att-rpt-class'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const first = el.options[0];
            el.innerHTML = '';
            el.appendChild(first);
            attDivisions.forEach(d => {
                const o = document.createElement('option');
                o.value = d.id; o.textContent = d.name;
                el.appendChild(o);
            });
        });
    } catch(e) { console.error('Division load failed', e); }
}

async function attPopulateDropdowns() {
    await loadAttDivisions();
    // Subject dropdowns will be populated when a division is selected
}

// ── When division is selected in Take Attendance, load its subjects ───
document.getElementById('att-class-sel').addEventListener('change', async function() {
    const divId = this.value;
    if (!divId) return;
    try {
        const res = await apiFetch(`/attendance/division/${divId}/subjects`);
        attDivSubjects = await res.json();
        const sel = document.getElementById('att-subj-sel');
        sel.innerHTML = '<option value="" disabled selected>Select subject...</option>';
        attDivSubjects.forEach(s => {
            const o = document.createElement('option');
            o.value = s.id; o.textContent = s.name;
            sel.appendChild(o);
        });
    } catch(e) { console.error(e); }
});

// ── Manage Tab: Division CRUD ─────────────────────────────────────────
async function loadDivisionList() {
    try {
        const res  = await apiFetch('/attendance/divisions');
        const divs = await res.json();
        attDivisions = divs;
        const container = document.getElementById('att-div-list');
        container.innerHTML = '';
        if (!divs.length) {
            container.innerHTML = '<p style="color:rgba(220,220,235,0.35);font-size:0.9rem;">No divisions yet. Add one above.</p>';
            return;
        }
        for (const div of divs) {
            const card = document.createElement('div');
            card.className = 'glass-card';
            card.style.cssText = 'margin-bottom:14px;padding:18px 20px;';
            card.id = `att-div-card-${div.id}`;
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                    <h4 style="color:var(--dark);font-size:1rem;"><i class="fa-solid fa-layer-group" style="color:var(--primary);margin-right:8px;"></i>${div.name}</h4>
                    <i class="fa-solid fa-trash-can delete-btn" style="cursor:pointer;" onclick="deleteDivision(${div.id})"></i>
                </div>
                <div style="font-size:0.78rem;color:rgba(220,220,235,0.45);font-weight:700;letter-spacing:0.8px;margin-bottom:8px;">SUBJECTS</div>
                <div id="att-subj-list-${div.id}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:18px;">
                    <input type="text" id="att-new-subj-${div.id}" placeholder="Add subject (e.g. Math, Physics)" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--dark);font-size:0.85rem;">
                    <button class="btn-primary" style="padding:8px 14px;font-size:0.82rem;" onclick="addSubject(${div.id})"><i class="fa-solid fa-plus"></i> Subject</button>
                </div>
                <hr style="border:none;border-top:1px solid rgba(255,255,255,0.07);margin-bottom:14px;">
                <div style="font-size:0.78rem;color:rgba(220,220,235,0.45);font-weight:700;letter-spacing:0.8px;margin-bottom:8px;">STUDENTS</div>
                <div id="att-roster-display-${div.id}" style="margin-bottom:10px;"></div>
                <div id="att-roster-input-${div.id}"></div>`;
            container.appendChild(card);
            loadSubjectList(div.id);
            loadRosterSection(div.id);
        }
    } catch(e) { console.error(e); }
}

async function loadRosterSection(divId) {
    try {
        const res     = await apiFetch(`/attendance/roster/${divId}`);
        const roster  = await res.json();
        const display = document.getElementById(`att-roster-display-${divId}`);
        const inputEl = document.getElementById(`att-roster-input-${divId}`);
        if (!display || !inputEl) return;
        if (roster.length > 0) {
            const tags = roster.map(s =>
                `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,206,201,0.1);color:var(--secondary);border-radius:20px;padding:3px 10px;font-size:0.8rem;border:1px solid rgba(0,206,201,0.25);margin:2px;">
                    <b>${s.student_roll}.</b> ${s.student_name}
                </span>`
            ).join('');
            display.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${tags}</div>`;
            inputEl.innerHTML = `<button class="btn-secondary" style="padding:6px 14px;font-size:0.82rem;" onclick="clearRoster(${divId})"><i class="fa-solid fa-users-slash"></i> Clear &amp; Re-enter (${roster.length} students)</button>`;
        } else {
            display.innerHTML = '<p style="color:rgba(220,220,235,0.35);font-size:0.82rem;margin-bottom:10px;">No students added yet.</p>';
            inputEl.innerHTML = `
                <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
                    <div><label style="font-size:0.8rem;color:rgba(220,220,235,0.5);">How many students?</label>
                        <input type="number" id="att-stu-count-${divId}" min="1" max="300" placeholder="e.g. 40"
                            style="display:block;margin-top:4px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--dark);font-size:0.88rem;width:110px;"></div>
                    <button class="btn-primary" style="padding:8px 14px;font-size:0.82rem;" onclick="generateStudentInputs(${divId})"><i class="fa-solid fa-list"></i> Enter Names</button>
                </div>
                <div id="att-stu-names-${divId}" class="att-names-grid" style="margin-top:12px;display:none;"></div>
                <button id="att-stu-save-${divId}" class="btn-success" style="display:none;margin-top:10px;padding:8px 18px;font-size:0.85rem;" onclick="saveRosterFromSetup(${divId})"><i class="fa-solid fa-floppy-disk"></i> Save Students</button>`;
        }
    } catch(e) { console.error(e); }
}

window.generateStudentInputs = function(divId) {
    const n = parseInt(document.getElementById(`att-stu-count-${divId}`).value);
    if (!n || n < 1) { alert('Enter number of students.'); return; }
    const grid    = document.getElementById(`att-stu-names-${divId}`);
    const saveBtn = document.getElementById(`att-stu-save-${divId}`);
    grid.style.display = 'grid'; saveBtn.style.display = 'block';
    grid.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const row = document.createElement('div');
        row.className = 'att-name-row';
        row.innerHTML = `<span class="att-roll">${i+1}</span><input type="text" value="Student ${i+1}" placeholder="Student ${i+1}" data-roll="${i+1}">`;
        grid.appendChild(row);
    }
};

window.saveRosterFromSetup = async function(divId) {
    const grid = document.getElementById(`att-stu-names-${divId}`);
    if (!grid || grid.style.display === 'none') {
        alert('Please click "Enter Names" first to generate the student name inputs.');
        return;
    }
    const inputs = grid.querySelectorAll('input[type="text"]');
    if (inputs.length === 0) {
        alert('No student inputs found. Please click "Enter Names" again.');
        return;
    }
    const students = Array.from(inputs).map((inp, i) => ({
        name: inp.value.trim() || `Student ${i+1}`,
        roll: inp.getAttribute('data-roll') || `${i+1}`
    }));
    console.log('Saving students:', students);
    try {
        const res = await apiFetch(`/attendance/roster/${divId}`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ students })
        });
        const d = await res.json();
        if (d.success) {
            alert(`✅ ${students.length} students saved for this division!`);
            loadRosterSection(divId);
        } else {
            alert('Error saving: ' + (d.error || 'Unknown error'));
        }
    } catch(e) { alert('Error: ' + e); }
};

window.clearRoster = async function(divId) {
    if (!confirm('Clear all students for this division?')) return;
    try {
        await apiFetch(`/attendance/roster/${divId}`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ students: [] })
        });
        loadRosterSection(divId);
    } catch(e) { alert('Error: ' + e); }
};

async function loadSubjectList(divId) {
    try {
        const res  = await apiFetch(`/attendance/division/${divId}/subjects`);
        const subs = await res.json();
        const el   = document.getElementById(`att-subj-list-${divId}`);
        if (!el) return;
        el.innerHTML = '';
        if (!subs.length) {
            el.innerHTML = '<span style="color:rgba(220,220,235,0.35);font-size:0.82rem;">No subjects added yet.</span>';
            return;
        }
        subs.forEach(s => {
            const tag = document.createElement('span');
            tag.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:rgba(124,110,245,0.15);color:var(--primary);border-radius:20px;padding:4px 12px;font-size:0.82rem;border:1px solid rgba(124,110,245,0.3);';
            tag.innerHTML = `${s.name} <i class="fa-solid fa-xmark" style="cursor:pointer;opacity:0.6;" onclick="deleteSubject(${divId},${s.id},this)"></i>`;
            el.appendChild(tag);
        });
    } catch(e) { console.error(e); }
}

window.addSubject = async function(divId) {
    const inp = document.getElementById(`att-new-subj-${divId}`);
    if (!inp.value.trim()) { inp.focus(); return; }
    try {
        await apiFetch(`/attendance/division/${divId}/subjects`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name: inp.value.trim() })
        });
        inp.value = '';
        loadSubjectList(divId);
        await loadAttDivisions(); // refresh dropdowns too
    } catch(e) { alert('Error: ' + e); }
};

window.deleteSubject = async function(divId, subId, icon) {
    try {
        await apiFetch(`/attendance/division/${divId}/subject/${subId}`, { method: 'DELETE' });
        icon.closest('span').remove();
        await loadAttDivisions();
    } catch(e) { alert('Error: ' + e); }
};

window.deleteDivision = async function(divId) {
    if (!confirm('Delete this division and all its subjects?')) return;
    try {
        await apiFetch(`/attendance/division/${divId}`, { method: 'DELETE' });
        document.getElementById(`att-div-card-${divId}`)?.remove();
        await loadAttDivisions();
    } catch(e) { alert('Error: ' + e); }
};

document.getElementById('att-add-div-btn').addEventListener('click', async () => {
    const inp = document.getElementById('att-new-div');
    if (!inp.value.trim()) { inp.focus(); return; }
    try {
        await apiFetch('/attendance/divisions', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name: inp.value.trim() })
        });
        inp.value = '';
        loadDivisionList();
        await loadAttDivisions();
    } catch(e) { alert('Error: ' + e); }
});

// Load manage tab when clicked
document.querySelectorAll('#att-main-tabs .tab-btn').forEach(btn => {
    if (btn.getAttribute('data-atab') === 'att-manage-tab') {
        btn.addEventListener('click', loadDivisionList);
    }
});


// ── Attendance tab switching ──────────────────────────────────────────
document.querySelectorAll('#att-main-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#att-main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.att-tab-panel').forEach(p => p.classList.add('hidden'));
        const target = btn.getAttribute('data-atab');
        document.getElementById(target).classList.remove('hidden');
        if (target === 'att-records-tab') loadAttSessions();
        if (target === 'att-report-tab') attPopulateDropdowns();
    });
});

// ── Start Attendance (replaces old 3-step wizard) ─────────────────────
document.getElementById('att-start-btn').addEventListener('click', async () => {
    const cid  = document.getElementById('att-class-sel').value;
    const sid  = document.getElementById('att-subj-sel').value;
    const date = document.getElementById('att-date').value;
    if (!cid || !sid || !date) { alert('Please select class, subject and date.'); return; }
    att.date = date; att.classId = cid; att.subjectId = sid;
    document.getElementById('att-setup-card').style.display = 'none';
    document.getElementById('att-mark-card').style.display  = 'none';
    try {
        const res   = await apiFetch(`/attendance/roster/${cid}`);
        const roster = await res.json();
        if (roster.length > 0) {
            att.students = roster.map(r => ({ id:r.id, name:r.student_name, roll:r.student_roll, status:'absent' }));
            attShowMarkCard();
        } else {
            // No students in roster — redirect to Setup tab
            document.getElementById('att-setup-card').style.display = 'block';
            document.getElementById('att-setup-card').innerHTML = `
                <div style="text-align:center;padding:24px;">
                    <i class="fa-solid fa-users-gear" style="font-size:2.2rem;color:var(--secondary);margin-bottom:14px;display:block;"></i>
                    <h3 style="color:var(--dark);margin-bottom:8px;">No students in this division</h3>
                    <p style="color:rgba(220,220,235,0.5);font-size:0.9rem;margin-bottom:18px;">Add students in the <b>⚙️ Setup</b> tab first. They are saved once for all subjects.</p>
                    <button class="btn-primary" onclick="switchToSetupTab()"><i class="fa-solid fa-arrow-right"></i> Go to Setup</button>
                </div>`;
        }
    } catch(e) { alert('Error: ' + e); }
});

function attShowMarkCard() {
    document.getElementById('att-setup-card').style.display = 'none';
    document.getElementById('att-mark-card').style.display  = 'block';
    const div  = attDivisions.find(d => String(d.id) === String(att.classId));
    const subj = attDivSubjects.find(s => String(s.id) === String(att.subjectId));
    document.getElementById('att-mark-subtitle').textContent =
        `${div?.name || 'Division'} · ${subj?.name || 'Subject'} · ${att.date} · ${att.students.length} students`;
    attRenderMarkGrid('att-mark-grid', att.students, false);
    attUpdateCounters();
}

// ── One-time setup handlers ───────────────────────────────────────────
document.getElementById('att-setup-next').addEventListener('click', () => {
    const n = parseInt(document.getElementById('att-setup-count').value);
    if (!n || n < 1) { alert('Please enter number of students.'); return; }
    att.students = Array.from({length: n}, (_, i) => ({ name:`Student ${i+1}`, roll:`${i+1}`, status:'absent' }));
    attRenderSetupNames(att.students);
    document.getElementById('att-setup-s1').classList.add('hidden');
    document.getElementById('att-setup-s2').classList.remove('hidden');
});

document.getElementById('att-setup-back').addEventListener('click', () => {
    document.getElementById('att-setup-s1').classList.remove('hidden');
    document.getElementById('att-setup-s2').classList.add('hidden');
});

document.getElementById('att-setup-save').addEventListener('click', async () => {
    try {
        await apiFetch(`/attendance/roster/${att.classId}`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ students: att.students.map(s => ({ name:s.name, roll:s.roll })) })
        });
        attShowMarkCard();
    } catch(e) { alert('Error saving students: ' + e); }
});

document.getElementById('att-mark-back').addEventListener('click', () => {
    document.getElementById('att-mark-card').style.display  = 'none';
    document.getElementById('att-setup-card').style.display = 'none';
});

function attRenderSetupNames(students) {
    const grid = document.getElementById('att-setup-names-grid');
    grid.innerHTML = '';
    students.forEach((st, i) => {
        const div = document.createElement('div');
        div.className = 'att-name-row';
        div.innerHTML = `<span class="att-roll">${st.roll}</span><input type="text" value="${st.name}" placeholder="Student ${i+1}">`;
        div.querySelector('input').addEventListener('input', e => { att.students[i].name = e.target.value || `Student ${i+1}`; });
        grid.appendChild(div);
    });
}

// ── Render mark grid (shared by take & edit) ──────────────────────────
function attRenderMarkGrid(gridId, students, isEdit) {
    const grid = document.getElementById(gridId);
    grid.innerHTML = '';
    students.forEach((st, i) => {
        const card = document.createElement('div');
        card.className = `att-card att-${st.status}`;
        card.dataset.idx = i;
        card.innerHTML = `
            <div class="att-card-name"><b>${st.roll ? st.roll + '. ' : ''}${st.name}</b></div>
            <div class="att-card-btns">
                <button class="att-btn att-btn-p ${st.status==='present'?'active':''}" data-status="present">P</button>
                <button class="att-btn att-btn-a ${st.status==='absent'?'active':''}" data-status="absent">A</button>
                <button class="att-btn att-btn-l ${st.status==='late'?'active':''}" data-status="late">L</button>
            </div>`;
        card.querySelectorAll('.att-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                students[i].status = btn.dataset.status;
                card.className = `att-card att-${btn.dataset.status}`;
                card.querySelectorAll('.att-btn').forEach(b => b.classList.toggle('active', b === btn));
                if (!isEdit) attUpdateCounters();
                else attUpdateEditCounters(students, gridId);
            });
        });
        grid.appendChild(card);
    });
}

// ── Live counters ─────────────────────────────────────────────────────
function attUpdateCounters() {
    document.getElementById('att-p-cnt').textContent = att.students.filter(s => s.status==='present').length;
    document.getElementById('att-a-cnt').textContent = att.students.filter(s => s.status==='absent').length;
    document.getElementById('att-l-cnt').textContent = att.students.filter(s => s.status==='late').length;
}
function attUpdateEditCounters(students) { /* counters shown in modal title only */ }

// ── Bulk actions ──────────────────────────────────────────────────────
document.getElementById('att-all-present').addEventListener('click', () => {
    att.students.forEach(s => s.status = 'present');
    attRenderMarkGrid('att-mark-grid', att.students, false);
    attUpdateCounters();
});
document.getElementById('att-all-absent').addEventListener('click', () => {
    att.students.forEach(s => s.status = 'absent');
    attRenderMarkGrid('att-mark-grid', att.students, false);
    attUpdateCounters();
});

// ── Save new session ──────────────────────────────────────────────────
document.getElementById('att-save-btn').addEventListener('click', async () => {
    try {
        const res = await apiFetch('/attendance/session', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                date: att.date,
                att_div_id: att.classId,
                att_subject_id: att.subjectId,
                students: att.students
            })
        });
        const d = await res.json();
        if (d.success) {
            alert('✅ Attendance saved!');
            // Reset for next session
            att.students = []; att.date=''; att.classId=null; att.subjectId=null;
            document.getElementById('att-mark-card').style.display  = 'none';
            document.getElementById('att-setup-card').style.display = 'none';
            document.getElementById('att-date').value = new Date().toISOString().split('T')[0];
        } else { alert('Error: ' + d.error); }
    } catch(e) { alert('API Error: ' + e); }
});

// ── Load sessions (Records tab) ───────────────────────────────────────
async function loadAttSessions() {
    try {
        const res = await apiFetch('/attendance/sessions');
        att.sessions = await res.json();
        attRenderSessions(att.sessions);
        attPopulateDropdowns();
    } catch(e) { console.error(e); }
}

function attRenderSessions(sessions) {
    const tbody = document.getElementById('att-sessions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!sessions.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:rgba(220,220,235,0.4);">No sessions yet. Take attendance first.</td></tr>';
        return;
    }
    sessions.forEach(s => {
        const pct = s.total_students ? Math.round(s.present_count / s.total_students * 100) : 0;
        const color = pct >= 75 ? '#00b894' : pct >= 50 ? '#fdcb6e' : '#e05252';
        const published = s.is_published;
        const pubLabel = published
            ? `<button class="btn-success att-pub-btn" style="padding:4px 9px;font-size:0.75rem;" onclick="attTogglePublish(${s.id}, this)"><i class="fa-solid fa-eye"></i> Published</button>`
            : `<button class="btn-secondary att-pub-btn" style="padding:4px 9px;font-size:0.75rem;" onclick="attTogglePublish(${s.id}, this)"><i class="fa-solid fa-eye-slash"></i> Publish</button>`;
        const tr = document.createElement('tr');
        tr.id = `att-row-${s.id}`;
        tr.innerHTML = `
            <td><b>${s.date}</b></td>
            <td>${s.class_name}</td>
            <td>${s.subject_name}</td>
            <td style="text-align:center;">${s.total_students}</td>
            <td style="text-align:center;color:#00b894;"><b>${s.present_count}</b></td>
            <td style="text-align:center;color:#e05252;">${s.absent_count}</td>
            <td style="text-align:center;"><b style="color:${color}">${pct}%</b></td>
            <td style="text-align:center;">${pubLabel}</td>
            <td style="text-align:center;">
                <button class="btn-warning" style="padding:5px 10px;font-size:0.8rem;margin-right:4px;" onclick="attOpenEdit(${s.id})"><i class="fa-solid fa-pen"></i></button>
                <i class="fa-solid fa-trash-can delete-btn" style="cursor:pointer;" onclick="attDeleteSession(${s.id})"></i>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ── Filter sessions ───────────────────────────────────────────────────
document.getElementById('att-flt-btn').addEventListener('click', () => {
    const cls  = document.getElementById('att-flt-class').value;
    const subj = document.getElementById('att-flt-subj').value;
    const date = document.getElementById('att-flt-date').value;
    const filtered = att.sessions.filter(s =>
        (!cls  || s.class_id == cls) &&
        (!subj || s.subject_id == subj) &&
        (!date || s.date === date)
    );
    attRenderSessions(filtered);
});

// ── Delete session ────────────────────────────────────────────────────
window.attDeleteSession = async function(id) {
    if (!confirm('Delete this attendance session permanently?')) return;
    try {
        await apiFetch(`/attendance/session/${id}`, {method:'DELETE'});
        await loadAttSessions();
    } catch(e) { alert('Error: ' + e); }
};

// ── Edit session modal ────────────────────────────────────────────────
window.attOpenEdit = async function(id) {
    try {
        const res = await apiFetch(`/attendance/session/${id}`);
        const data = await res.json();
        if (data.error) { alert(data.error); return; }
        att.editSessionId = id;
        att.editRecords = data.records.map(r => ({id:r.id, name:r.student_name, roll:r.student_roll, status:r.status}));
        document.getElementById('att-edit-info').textContent = `${data.date}  ·  ${data.class_name}  ·  ${data.subject_name}`;
        attRenderMarkGrid('att-edit-grid', att.editRecords, true);
        const modal = document.getElementById('att-edit-modal');
        modal.style.display = 'flex';
    } catch(e) { alert('Error: ' + e); }
};

document.getElementById('att-edit-all-p').addEventListener('click', () => {
    att.editRecords.forEach(r => r.status = 'present');
    attRenderMarkGrid('att-edit-grid', att.editRecords, true);
});
document.getElementById('att-edit-all-a').addEventListener('click', () => {
    att.editRecords.forEach(r => r.status = 'absent');
    attRenderMarkGrid('att-edit-grid', att.editRecords, true);
});

document.getElementById('att-edit-save').addEventListener('click', async () => {
    try {
        const res = await apiFetch(`/attendance/session/${att.editSessionId}`, {
            method: 'PUT',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({students: att.editRecords})
        });
        const d = await res.json();
        if (d.success) {
            document.getElementById('att-edit-modal').style.display = 'none';
            alert('✅ Attendance updated!');
            await loadAttSessions();
        } else { alert('Error: ' + d.error); }
    } catch(e) { alert('Error: ' + e); }
});

document.getElementById('att-edit-cancel').addEventListener('click', () => {
    document.getElementById('att-edit-modal').style.display = 'none';
});
document.getElementById('att-edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('att-edit-modal'))
        document.getElementById('att-edit-modal').style.display = 'none';
});

// ── Report tab ────────────────────────────────────────────────────────
document.getElementById('att-rpt-btn').addEventListener('click', async () => {
    const cls  = document.getElementById('att-rpt-class').value;
    const subj = document.getElementById('att-rpt-subj').value;
    let url = '/attendance/report';
    const p = [];
    if (cls)  p.push(`class_id=${cls}`);
    if (subj) p.push(`subject_id=${subj}`);
    if (p.length) url += '?' + p.join('&');
    try {
        const res = await apiFetch(url);
        const rows = await res.json();
        const tbody = document.getElementById('att-report-tbody');
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:rgba(220,220,235,0.4);">No data found.</td></tr>';
            return;
        }
        rows.forEach(r => {
            const pct = parseFloat(r.pct) || 0;
            const color = pct >= 75 ? '#00b894' : pct >= 50 ? '#fdcb6e' : '#e05252';
            const bar = `<div style="background:rgba(255,255,255,0.08);border-radius:4px;height:6px;margin-top:4px;"><div style="background:${color};width:${pct}%;height:6px;border-radius:4px;"></div></div>`;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><b>${r.student_name}</b></td><td>${r.class_name}</td><td>${r.subject_name}</td>
                <td style="text-align:center;">${r.total}</td>
                <td style="text-align:center;color:#00b894;">${r.present_count}</td>
                <td style="text-align:center;color:#e05252;">${r.absent_count}</td>
                <td style="text-align:center;color:#fdcb6e;">${r.late_count}</td>
                <td style="text-align:center;"><b style="color:${color}">${pct}%</b>${bar}</td>`;
            tbody.appendChild(tr);
        });
    } catch(e) { alert('Error: ' + e); }
});

// ── Student view ──────────────────────────────────────────────────────
async function loadStudentAttendance() {
    try {
        const res = await apiFetch('/attendance/sessions/public');
        const rows = await res.json();
        const tbody = document.getElementById('att-student-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:rgba(220,220,235,0.4);">No published sessions yet.</td></tr>';
            return;
        }
        rows.forEach(s => {
            const pct = s.total_students ? Math.round(s.present_count / s.total_students * 100) : 0;
            const color = pct >= 75 ? '#00b894' : pct >= 50 ? '#fdcb6e' : '#e05252';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><b>${s.date}</b></td><td>${s.class_name}</td><td>${s.subject_name}</td>
                <td>${s.teacher_name || '—'}</td>
                <td style="text-align:center;color:#00b894;"><b>${s.present_count}</b></td>
                <td style="text-align:center;">${s.total_students}</td>
                <td style="text-align:center;"><button class="btn-primary" style="padding:5px 12px;font-size:0.8rem;" onclick="attViewSession(${s.id})"><i class="fa-solid fa-eye"></i> View</button></td>`;
            tbody.appendChild(tr);
        });
    } catch(e) { console.error(e); }
}

// ── Student sub-tabs ──────────────────────────────────────────────────
document.querySelectorAll('#att-student-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#att-student-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#att-student-view .att-tab-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById(btn.getAttribute('data-stab')).classList.remove('hidden');
    });
});

// ── My Report ─────────────────────────────────────────────────────────
document.getElementById('att-my-report-btn').addEventListener('click', async () => {
    const name = document.getElementById('att-my-name').value.trim();
    if (!name) { alert('Please enter your name.'); return; }
    const result = document.getElementById('att-my-report-result');
    result.innerHTML = '<p style="color:rgba(220,220,235,0.4);">Loading...</p>';
    try {
        const res = await apiFetch(`/attendance/student-report?name=${encodeURIComponent(name)}`);
        const d = await res.json();
        if (d.error) { result.innerHTML = `<p style="color:#e05252;">${d.error}</p>`; return; }
        if (!d.report.length) {
            result.innerHTML = `<div class="glass-card"><p style="color:rgba(220,220,235,0.4);text-align:center;padding:20px;">No attendance records found for "${name}".<br>Make sure your name matches exactly as entered by the teacher.</p></div>`;
            return;
        }
        // Overall stats
        const totalSessions = d.report.reduce((s, r) => s + r.total, 0);
        const totalPresent  = d.report.reduce((s, r) => s + Number(r.present_count), 0);
        const overallPct    = totalSessions ? Math.round(totalPresent / totalSessions * 100) : 0;
        const overallColor  = overallPct >= 75 ? '#00b894' : overallPct >= 50 ? '#fdcb6e' : '#e05252';
        let html = `
        <div class="glass-card" style="margin-bottom:16px;">
            <h3 style="color:var(--primary);margin-bottom:12px;"><i class="fa-solid fa-user-graduate"></i> ${d.name}</h3>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
                <span class="att-ctr" style="background:rgba(124,110,245,0.15);color:var(--primary);">&#128203; ${totalSessions} Total Sessions</span>
                <span class="att-ctr att-ctr-p">&#9989; ${totalPresent} Present</span>
                <span class="att-ctr" style="background:rgba(255,255,255,0.08);color:var(--dark);">Overall: <b style="color:${overallColor}">${overallPct}%</b></span>
            </div>
            <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:10px;">
                <div style="background:${overallColor};width:${overallPct}%;height:10px;border-radius:6px;transition:width 0.8s ease;"></div>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">`;
        d.report.forEach(r => {
            const pct = parseFloat(r.pct) || 0;
            const color = pct >= 75 ? '#00b894' : pct >= 50 ? '#fdcb6e' : '#e05252';
            const status = pct >= 75 ? '✅ Good' : pct >= 50 ? '⚠️ Low' : '❌ Critical';
            html += `
            <div class="glass-card" style="padding:18px;">
                <div style="font-weight:700;color:var(--dark);margin-bottom:4px;">${r.subject_name}</div>
                <div style="font-size:0.8rem;color:rgba(220,220,235,0.45);margin-bottom:14px;">${r.class_name} &nbsp;·&nbsp; Last: ${r.last_date}</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <span style="font-size:0.85rem;color:rgba(220,220,235,0.6);">P: <b style="color:#00b894">${r.present_count}</b> &nbsp; A: <b style="color:#e05252">${r.absent_count}</b> &nbsp; L: <b style="color:#fdcb6e">${r.late_count}</b></span>
                    <b style="color:${color};font-size:1rem;">${pct}%</b>
                </div>
                <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;margin-bottom:8px;">
                    <div style="background:${color};width:${pct}%;height:8px;border-radius:6px;transition:width 0.8s ease;"></div>
                </div>
                <div style="font-size:0.78rem;color:${color};">${status}</div>
            </div>`;
        });
        html += '</div>';
        result.innerHTML = html;
    } catch(e) { result.innerHTML = `<p style="color:#e05252;">Error: ${e}</p>`; }
});

window.attViewSession = async function(id) {
    try {
        const res = await apiFetch(`/attendance/session/${id}/public`);
        const d = await res.json();
        if (d.error) { alert('Error: ' + d.error); return; }
        // Populate modal
        document.getElementById('att-view-meta').textContent =
            `📅 ${d.date}  ·  🏫 ${d.class_name}  ·  📚 ${d.subject_name}  ·  👨‍🏫 ${d.teacher_name}`;
        const present = d.records.filter(r => r.status === 'present').length;
        const absent  = d.records.filter(r => r.status === 'absent').length;
        const late    = d.records.filter(r => r.status === 'late').length;
        const pct = d.total_students ? Math.round(present / d.total_students * 100) : 0;
        const color = pct >= 75 ? '#00b894' : pct >= 50 ? '#fdcb6e' : '#e05252';
        document.getElementById('att-view-counters').innerHTML = `
            <span class="att-ctr att-ctr-p"><i class="fa-solid fa-circle-check"></i> ${present} Present</span>
            <span class="att-ctr att-ctr-a"><i class="fa-solid fa-circle-xmark"></i> ${absent} Absent</span>
            <span class="att-ctr att-ctr-l"><i class="fa-solid fa-clock"></i> ${late} Late</span>
            <span class="att-ctr" style="background:rgba(124,110,245,0.15);color:var(--primary);"><i class="fa-solid fa-percent"></i> <b style="color:${color}">${pct}%</b> Attendance</span>`;
        const list = document.getElementById('att-view-list');
        list.innerHTML = '';
        d.records.forEach(r => {
            const statusColor = r.status==='present' ? '#00b894' : r.status==='late' ? '#fdcb6e' : '#e05252';
            const statusBg    = r.status==='present' ? 'rgba(0,184,148,0.12)' : r.status==='late' ? 'rgba(253,203,110,0.12)' : 'rgba(224,82,82,0.12)';
            const row = document.createElement('div');
            row.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-radius:10px;background:${statusBg};border:1px solid ${statusColor}33;`;
            row.innerHTML = `
                <span><b style="color:var(--primary);margin-right:8px;">${r.student_roll || ''}${r.student_roll ? '.' : ''}</b>${r.student_name}</span>
                <span style="font-weight:700;font-size:0.85rem;color:${statusColor};text-transform:uppercase;">${r.status}</span>`;
            list.appendChild(row);
        });
        document.getElementById('att-view-modal').style.display = 'flex';
    } catch(e) { alert('Error loading session: ' + e); }
};

// Close student view modal
document.getElementById('att-view-close').addEventListener('click', () => {
    document.getElementById('att-view-modal').style.display = 'none';
});
document.getElementById('att-view-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('att-view-modal'))
        document.getElementById('att-view-modal').style.display = 'none';
});

// Publish / unpublish toggle
window.attTogglePublish = async function(id, btn) {
    try {
        const res = await apiFetch(`/attendance/session/${id}/publish`, { method: 'POST' });
        const d = await res.json();
        if (d.success) {
            if (d.is_published) {
                btn.className = 'btn-success att-pub-btn';
                btn.style = 'padding:4px 9px;font-size:0.75rem;';
                btn.innerHTML = '<i class="fa-solid fa-eye"></i> Published';
            } else {
                btn.className = 'btn-secondary att-pub-btn';
                btn.style = 'padding:4px 9px;font-size:0.75rem;';
                btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Publish';
            }
            // Update local cache
            const s = att.sessions.find(x => x.id === id);
            if (s) s.is_published = d.is_published ? 1 : 0;
        } else { alert('Error: ' + d.error); }
    } catch(e) { alert('Error: ' + e); }
};

// ── Wire up: when Attendance nav is clicked ───────────────────────────
document.getElementById('attendance-nav-item').addEventListener('click', () => {
    const role = localStorage.getItem('loggedInRole');
    if (role === 'student') {
        document.getElementById('att-teacher-view').classList.add('hidden');
        document.getElementById('att-student-view').classList.remove('hidden');
        loadStudentAttendance();
    } else {
        document.getElementById('att-teacher-view').classList.remove('hidden');
        document.getElementById('att-student-view').classList.add('hidden');
        attPopulateDropdowns();
        // Set today's date as default and reset cards
        document.getElementById('att-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('att-mark-card').style.display  = 'none';
        document.getElementById('att-setup-card').style.display = 'none';
    }
});

// ── Hide attendance tab for students via applyRoleRestrictions ────────
const _origApplyRole = applyRoleRestrictions;
// Re-patch after page load
document.addEventListener('DOMContentLoaded', () => {
    const role = localStorage.getItem('loggedInRole');
    if (role === 'student') {
        const attNav = document.getElementById('attendance-nav-item');
        // Students can still see attendance but in read-only mode
        // (handled inside the click handler above)
    }
});
