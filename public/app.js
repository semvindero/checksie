document.addEventListener('DOMContentLoaded', () => {
    let currentRole = localStorage.getItem('st1nery_role') || 'guest';
    let cachedUsers = [];

    const roleBadge = document.getElementById('roleBadge');
    const adminTabBtn = document.getElementById('adminTabBtn');
    const addPersonCard = document.getElementById('addPersonCard');
    const checkinAccessDenied = document.getElementById('checkinAccessDenied');
    const checkinContent = document.getElementById('checkinContent');

    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const commandForm = document.getElementById('commandForm');
    const commandInput = document.getElementById('commandInput');
    const terminalFeedback = document.getElementById('terminalFeedback');

    const addForm = document.getElementById('addForm');
    const tableBody = document.getElementById('tableBody');
    const searchInput = document.getElementById('searchInput');

    const profileModal = document.getElementById('profileModal');
    const closeModal = document.getElementById('closeModal');

    const visitorsTableBody = document.getElementById('visitorsTableBody');
    const btnRefreshVisitors = document.getElementById('btnRefreshVisitors');

    // Переменная для отслеживания зажатой клавиши Tab
    let isTabPressed = false;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function showBanScreen(message) {
        document.body.innerHTML = `
      <div style="
        height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: #0a1317;
        color: #ef4444;
        font-family: 'JetBrains Mono', monospace;
        text-align: center;
        padding: 20px;
      ">
        <h1 style="font-size: 1.8rem; margin-bottom: 12px; font-weight: 700;">403 FORBIDDEN</h1>
        <p style="font-size: 1rem; color: #f1f5f9; border: 1px solid rgba(239, 68, 68, 0.3); padding: 16px 24px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); margin-bottom: 16px;">
          ${message || 'ОШИБКА ДОСТУПА: ВЫ БЫЛИ ЗАБЛОКИРОВАНЫ'}
        </p>
        <p style="font-size: 0.8rem; color: #64748b;">
          Нажмите сочетание клавиш <kbd style="background:#1e293b; padding:2px 6px; border-radius:4px; color:#38bdf8;">TAB + ↑</kbd> для саморазбана.
        </p>
      </div>
    `;
    }

    // Обработка клавиш: TAB + СТРЕЛКА ВВЕРХ
    window.addEventListener('keydown', async (e) => {
        if (e.key === 'Tab') {
            isTabPressed = true;
        }

        if ((e.key === 'ArrowUp' || e.code === 'ArrowUp') && isTabPressed) {
            e.preventDefault(); // Отменяем стандартное поведение клавиши

            try {
                const res = await fetch('/api/admin/self-unban', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    alert('Секретный код сработал: Ваш IP успешно разбанен!');
                    window.location.reload();
                }
            } catch (err) {
                alert('Ошибка при выполнении запроса на разбан');
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Tab') {
            isTabPressed = false;
        }
    });

    // Перехват 403 ответов сервера
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch(...args);
        if (response.status === 403) {
            const clone = response.clone();
            try {
                const data = await clone.json();
                if (data.error === 'BANNED') {
                    showBanScreen(data.message);
                }
            } catch (e) { }
        }
        return response;
    };

    async function fetchVisitors() {
        if (currentRole !== 'st1nery own') return;

        try {
            const res = await fetch('/api/admin/visitors', {
                headers: { 'x-user-role': currentRole }
            });

            if (res.ok) {
                const visitors = await res.json();
                renderVisitorsTable(visitors);
            } else if (visitorsTableBody) {
                visitorsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: #ef4444;">Ошибка сервера (${res.status})</td></tr>`;
            }
        } catch (err) {
            if (visitorsTableBody) {
                visitorsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: #ef4444;">Не удалось подключиться к серверу</td></tr>`;
            }
        }
    }

    function renderVisitorsTable(visitors) {
        if (!visitorsTableBody) return;

        if (!visitors || !visitors.length) {
            visitorsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">История посещений пуста</td></tr>`;
            return;
        }

        visitorsTableBody.innerHTML = visitors.map(v => {
            const date = v.lastSeen ? new Date(v.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

            let statusHTML = '';
            if (v.isBanned) {
                statusHTML = `<span class="status-badge banned">ЗАБЛОКИРОВАН</span>`;
            } else if (v.isOnline) {
                statusHTML = `<span class="status-badge online">ONLINE</span>`;
            } else {
                statusHTML = `<span class="status-badge offline">OFFLINE</span>`;
            }

            const actionBtn = v.isBanned
                ? `<button class="btn-unban" onclick="toggleBanIP('${v.ip}', false)">Разбанить</button>`
                : `<button class="btn-ban" onclick="toggleBanIP('${v.ip}', true)">Забанить</button>`;

            return `
        <tr>
          <td style="font-family: var(--font-mono);">${escapeHtml(v.ip)}</td>
          <td>${statusHTML}</td>
          <td>${date}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
        }).join('');
    }

    // Переключение банов через админку
    window.toggleBanIP = async function (ip, shouldBan) {
        const endpoint = shouldBan ? '/api/admin/ban' : '/api/admin/unban';
        const actionText = shouldBan ? 'заблокировать навсегда' : 'разблокировать';

        if (!confirm(`Вы действительно хотите ${actionText} IP ${ip}?`)) return;

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': currentRole
                },
                body: JSON.stringify({ ip })
            });

            if (res.ok) {
                fetchVisitors();
            }
        } catch (err) {
            alert('Ошибка выполнения операции');
        }
    };

    function switchTab(targetTabId) {
        navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === targetTabId);
        });

        tabContents.forEach(content => {
            content.classList.toggle('active', content.id === targetTabId);
        });

        if (targetTabId === 'tab-admin') {
            fetchVisitors();
        }
    }

    window.switchTab = switchTab;

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    if (btnRefreshVisitors) {
        btnRefreshVisitors.addEventListener('click', fetchVisitors);
    }

    function applyRolePermissions() {
        roleBadge.textContent = currentRole;
        roleBadge.className = 'role-badge ' + (
            currentRole === 'st1nery own' ? 'own' :
                currentRole === 'member' ? 'member' :
                    currentRole === 'MAGA' ? 'maga' : 'guest'
        );

        if (currentRole === 'st1nery own') {
            adminTabBtn.style.display = 'block';
            if (addPersonCard) addPersonCard.style.display = 'block';
            fetchVisitors();
        } else {
            adminTabBtn.style.display = 'none';
            if (addPersonCard) addPersonCard.style.display = 'none';

            const adminTab = document.getElementById('tab-admin');
            if (adminTab && adminTab.classList.contains('active')) {
                switchTab('tab-main');
            }
        }

        if (currentRole === 'guest') {
            if (checkinAccessDenied) checkinAccessDenied.style.display = 'block';
            if (checkinContent) checkinContent.style.display = 'none';
        } else {
            if (checkinAccessDenied) checkinAccessDenied.style.display = 'none';
            if (checkinContent) checkinContent.style.display = 'block';
            fetchUsers();
        }
    }

    commandForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cmd = commandInput.value.trim();
        if (!cmd) return;

        try {
            const response = await fetch('/api/auth/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                currentRole = result.role;
                localStorage.setItem('st1nery_role', currentRole);
                applyRolePermissions();

                terminalFeedback.style.color = '#38bdf8';
                terminalFeedback.textContent = `[SUCCESS] Активирована роль: ${currentRole}`;
                commandInput.value = '';
            } else {
                terminalFeedback.style.color = '#ef4444';
                terminalFeedback.textContent = '[ERROR] Команда не распознана.';
            }
        } catch (err) {
            terminalFeedback.style.color = '#ef4444';
            terminalFeedback.textContent = '[ERROR] Ошибка соединения с сервером.';
        }
    });

    async function fetchUsers() {
        try {
            const res = await fetch('/api/users', {
                headers: { 'x-user-role': currentRole }
            });
            if (res.ok) {
                cachedUsers = await res.json();
                renderTable(cachedUsers);
            }
        } catch (err) {
            console.error('Ошибка загрузки пользователей:', err);
        }
    }

    function renderTable(users) {
        if (!tableBody) return;

        if (!users.length) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Записи отсутствуют</td></tr>`;
            return;
        }

        const canDelete = ['st1nery own', 'MAGA'].includes(currentRole);

        tableBody.innerHTML = users.map(u => `
      <tr>
        <td><a class="person-link" onclick="openProfile(${u.id})">${escapeHtml(u.fullName)}</a></td>
        <td>${u.age}</td>
        <td>${escapeHtml(u.birthCity)}</td>
        <td>${escapeHtml(u.phone || '—')}</td>
        <td>
          ${canDelete ? `<button class="btn-delete" onclick="deleteUser(${u.id})">Удалить</button>` : '—'}
        </td>
      </tr>
    `).join('');
    }

    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                fullName: document.getElementById('fullName').value.trim(),
                age: parseInt(document.getElementById('age').value, 10),
                birthCity: document.getElementById('birthCity').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                address: document.getElementById('address').value.trim(),
                telegram: document.getElementById('telegram').value.trim().replace(/^@/, ''),
                vk: document.getElementById('vk').value.trim()
            };

            const res = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': currentRole
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                addForm.reset();
                fetchUsers();
            }
        });
    }

    window.deleteUser = async function (id) {
        if (!confirm('Подтверждаете удаление записи?')) return;
        const res = await fetch(`/api/users/${id}`, {
            method: 'DELETE',
            headers: { 'x-user-role': currentRole }
        });
        if (res.ok) fetchUsers();
    };

    window.openProfile = function (id) {
        const user = cachedUsers.find(u => u.id === id);
        if (!user) return;

        document.getElementById('modalFullName').textContent = user.fullName;
        document.getElementById('modalAge').textContent = `${user.age} лет`;
        document.getElementById('modalCity').textContent = user.birthCity;
        document.getElementById('modalAddress').textContent = user.address || '—';

        document.getElementById('modalPhone').innerHTML = user.phone
            ? `<a href="tel:${escapeHtml(user.phone)}">${escapeHtml(user.phone)}</a>` : '—';
        document.getElementById('modalTelegram').innerHTML = user.telegram
            ? `<a href="https://t.me/${escapeHtml(user.telegram)}" target="_blank">@${escapeHtml(user.telegram)}</a>` : '—';
        document.getElementById('modalVk').innerHTML = user.vk
            ? `<a href="https://vk.com/${escapeHtml(user.vk)}" target="_blank">${escapeHtml(user.vk)}</a>` : '—';

        profileModal.classList.add('active');
    };

    if (closeModal) {
        closeModal.addEventListener('click', () => profileModal.classList.remove('active'));
    }
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) profileModal.classList.remove('active');
        });
    }

    const btnDeleteRole = document.getElementById('btnDeleteRole');
    if (btnDeleteRole) {
        btnDeleteRole.addEventListener('click', () => {
            currentRole = 'guest';
            localStorage.removeItem('st1nery_role');
            applyRolePermissions();
            alert('Все роли сброшены до GUEST.');
        });
    }

    const btnDeleteUserAll = document.getElementById('btnDeleteUserAll');
    if (btnDeleteUserAll) {
        btnDeleteUserAll.addEventListener('click', async () => {
            if (!confirm('ВНИМАНИЕ! Это полностью очистит список людей из базы. Продолжить?')) return;
            const res = await fetch('/api/admin/clear-users', {
                method: 'DELETE',
                headers: { 'x-user-role': currentRole }
            });
            if (res.ok) fetchUsers();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            if (!q) {
                renderTable(cachedUsers);
                return;
            }
            const filtered = cachedUsers.filter(u =>
                u.fullName.toLowerCase().includes(q) ||
                u.birthCity.toLowerCase().includes(q) ||
                (u.phone && u.phone.toLowerCase().includes(q)) ||
                (u.address && u.address.toLowerCase().includes(q)) ||
                (u.telegram && u.telegram.toLowerCase().includes(q)) ||
                (u.vk && u.vk.toLowerCase().includes(q))
            );
            renderTable(filtered);
        });
    }

    applyRolePermissions();
});