// ── State ──────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentView   = 'inbox';
let currentMsgId  = null;
let friends       = [];
let pollTimer     = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth();
    if (!auth) return;
    currentUser = auth;

    renderHeaderUser();
    setupNav();
    setupSidebarToggle();
    setupCompose();
    setupAddFriend();
    setupSearch();

    await Promise.all([loadView('inbox'), loadFriends()]);
    startPolling();
});

async function checkAuth() {
    try {
        const res  = await fetch('/api/auth/me');
        const data = await res.json();
        if (!data.loggedIn) { window.location.href = '/login'; return null; }
        return data;
    } catch { window.location.href = '/login'; return null; }
}

// ── Header ─────────────────────────────────────────────────────────────────
function renderHeaderUser() {
    const el = document.getElementById('mailHeaderUser');
    el.innerHTML = `
        <span class="header-username">${currentUser.username}</span>
        <button class="header-logout-btn" id="logoutBtn">Logout</button>`;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    });
}

// ── Sidebar toggle ─────────────────────────────────────────────────────────
function setupSidebarToggle() {
    const sidebar = document.getElementById('mailSidebar');
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        sidebar.classList.toggle('open'); // mobile
    });
}

// ── Navigation ─────────────────────────────────────────────────────────────
function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            setActiveNav(view);
            loadView(view);
        });
    });
}

function setActiveNav(view) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const target = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (target) target.classList.add('active');
    currentView = view;
    currentMsgId = null;
}

// ── Load message list views ────────────────────────────────────────────────
async function loadView(view) {
    setActiveNav(view);
    showLoading();
    try {
        if (view === 'inbox') {
            const [msgRes, grpRes] = await Promise.all([
                fetch('/api/messages/inbox'),
                fetch('/api/groups')
            ]);
            const msgData = await msgRes.json();
            const grpData = await grpRes.json();
            renderInbox(msgData.messages || [], grpData.groups || []);
        } else {
            const res  = await fetch(`/api/messages/${view}`);
            const data = await res.json();
            renderMessageList(data.messages || [], view);
        }
    } catch {
        showError('Could not load messages.');
    }
}

function renderMessageList(messages, view) {
    const main = document.getElementById('mailMain');
    if (messages.length === 0) {
        main.innerHTML = `
            <div class="mail-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" stroke-width="1.5">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
                </svg>
                <p>No messages in ${view}</p>
            </div>`;
        return;
    }

    const isSent = view === 'sent';
    main.innerHTML = `
        <div class="msg-list-toolbar">
            <span class="toolbar-title">${view}</span>
            <span class="toolbar-count">(${messages.length})</span>
        </div>
        <ul class="msg-list">
            ${messages.map(m => renderMsgRow(m, isSent, view)).join('')}
        </ul>`;

    // Star button clicks
    main.querySelectorAll('.msg-star').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            await fetch(`/api/messages/${id}/star`, { method: 'PUT' });
            btn.classList.toggle('starred');
            btn.title = btn.classList.contains('starred') ? 'Unstar' : 'Star';
        });
    });

    // Row click → open conversation thread
    main.querySelectorAll('.msg-row').forEach(row => {
        row.addEventListener('click', () => loadMessage(parseInt(row.dataset.id), view));
    });
}

function renderInbox(messages, groups) {
    const main = document.getElementById('mailMain');

    // Merge messages + groups sorted by most-recent activity
    const items = [
        ...messages.map(m => ({ type: 'msg',   data: m, ts: new Date(m.created_at || 0) })),
        ...groups.map(g  => ({ type: 'group', data: g, ts: new Date(g.last_message_at || g.created_at || 0) }))
    ].sort((a, b) => b.ts - a.ts);

    const unreadDm    = messages.filter(m => !m.read).length;
    const unreadGroup = groups.reduce((n, g) => n + (g.unread_count || 0), 0);
    setInboxBadge(unreadDm + unreadGroup);
    _badgeCount = unreadDm + unreadGroup;

    if (items.length === 0) {
        main.innerHTML = `
            <div class="mail-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e0" stroke-width="1.5">
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
                    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>
                </svg>
                <p>No messages in inbox</p>
            </div>`;
        return;
    }

    main.innerHTML = `
        <div class="msg-list-toolbar">
            <span class="toolbar-title">inbox</span>
            <span class="toolbar-count">(${items.length})</span>
        </div>
        <ul class="msg-list">
            ${items.map(item =>
                item.type === 'group'
                    ? renderGroupRow(item.data)
                    : renderMsgRow(item.data, false, 'inbox')
            ).join('')}
        </ul>`;

    main.querySelectorAll('.msg-star').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            await fetch(`/api/messages/${id}/star`, { method: 'PUT' });
            btn.classList.toggle('starred');
            btn.title = btn.classList.contains('starred') ? 'Unstar' : 'Star';
        });
    });

    main.querySelectorAll('.msg-row[data-type="msg"]').forEach(row => {
        row.addEventListener('click', () => loadMessage(parseInt(row.dataset.id), 'inbox'));
    });

    main.querySelectorAll('.msg-row[data-type="group"]').forEach(row => {
        row.addEventListener('click', () => loadGroupThread(parseInt(row.dataset.id)));
    });
}

function renderGroupRow(g) {
    const hasUnread  = g.unread_count > 0;
    const preview    = (g.last_body || '').replace(/\n/g, ' ').substring(0, 80);
    const senderPart = g.last_sender_name ? `${escHtml(g.last_sender_name)}: ` : '';
    const names      = g.other_names || 'Group';

    return `
        <li class="msg-row${hasUnread ? ' unread' : ''} is-group" data-type="group" data-id="${g.id}">
            <span class="group-icon-cell">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            </span>
            <span class="msg-sender">${escHtml(names)}</span>
            <span class="msg-preview">
                <span class="msg-subject">${escHtml(g.name || 'Group conversation')}</span>
                ${preview ? `&mdash; ${senderPart}${escHtml(preview)}` : ''}
            </span>
            ${hasUnread ? `<span class="group-unread-badge">${g.unread_count}</span>` : ''}
            <span class="msg-date">${formatDate(g.last_message_at || g.created_at)}</span>
        </li>`;
}

function renderMsgRow(m, isSent, view) {
    const isUnread   = !isSent && !m.read;
    const isStarred  = isSent ? m.starred_sender : m.starred_receiver;
    const displayName = isSent
        ? (m.receiver_name || m.receiver_email)
        : (m.sender_name   || m.sender_email);

    const bodyPreview = (m.body || '').replace(/\n/g, ' ').substring(0, 80);
    const attachIcon  = m.attached_file_id
        ? `<svg class="msg-attach-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`
        : '';

    return `
        <li class="msg-row${isUnread ? ' unread' : ''}" data-type="msg" data-id="${m.id}">
            <button class="msg-star${isStarred ? ' starred' : ''}" data-id="${m.id}"
                    title="${isStarred ? 'Unstar' : 'Star'}">&#9733;</button>
            <span class="msg-sender">${escHtml(displayName)}</span>
            <span class="msg-preview">
                <span class="msg-subject">${escHtml(m.subject || '(no subject)')}</span>
                &mdash; ${escHtml(bodyPreview)}
            </span>
            ${attachIcon}
            <span class="msg-date">${formatDate(m.created_at)}</span>
        </li>`;
}

// ── Load message as conversation thread ────────────────────────────────────
async function loadMessage(id, view) {
    currentMsgId = id;
    showLoading();
    try {
        const [msgRes, threadRes] = await Promise.all([
            fetch(`/api/messages/${id}`),
            fetch(`/api/messages/${id}/thread`)
        ]);
        const msgData    = await msgRes.json();
        const threadData = await threadRes.json();
        if (!msgData.message) { showError('Message not found.'); return; }
        renderThread(msgData.message, threadData.messages || [], view);
        if (view === 'inbox') updateInboxBadgeByCount(-1, true);
    } catch (err) {
        console.error('loadMessage error:', err);
        showError('Could not load message.');
    }
}

function renderThread(m, thread, view) {
    const main    = document.getElementById('mailMain');
    const isTrash = (view === 'trash');
    const isMine  = (m.sender_id === currentUser.userId);

    const otherName  = isMine
        ? (m.receiver_name  || m.receiver_email)
        : (m.sender_name    || m.sender_email);
    const otherEmail = isMine ? m.receiver_email : m.sender_email;

    const trashBtn = !isTrash
        ? `<button class="btn-action danger" id="trashBtn">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                   <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
               </svg>Trash</button>`
        : `<button class="btn-action restore" id="restoreBtn">Restore</button>
           <button class="btn-action danger" id="deleteBtn">Delete forever</button>`;

    const messagesHtml = thread.map(msg => {
        const mine       = (msg.sender_id === currentUser.userId);
        const hasAttach  = msg.attached_file_id || msg.attachment_path;
        const attachChip = hasAttach ? `
            <a class="thread-attach-chip" href="/api/messages/${msg.id}/attachment" download>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                ${escHtml(msg.attached_file_name || 'Attached file')}
            </a>` : '';

        return `
            <div class="thread-msg${mine ? ' thread-msg-mine' : ' thread-msg-theirs'}">
                <div class="thread-bubble">
                    <div class="thread-bubble-body">${escHtml(msg.body || '')}</div>
                    ${attachChip}
                    <div class="thread-bubble-time">${formatDate(msg.created_at)}</div>
                </div>
            </div>`;
    }).join('');

    main.innerHTML = `
        <div class="msg-detail thread-view">
            <div class="msg-detail-toolbar">
                <button class="btn-back" id="backBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    Back
                </button>
                ${trashBtn}
            </div>

            <div class="thread-header">
                <div class="thread-avatar">${(otherName[0] || '?').toUpperCase()}</div>
                <div>
                    <div class="thread-other-name">${escHtml(otherName)}</div>
                    <div class="thread-msg-count">${thread.length} message${thread.length !== 1 ? 's' : ''}</div>
                </div>
            </div>

            <div class="thread-messages" id="threadMessages">
                ${messagesHtml}
            </div>

            ${!isTrash ? `
            <div class="reply-area thread-reply">
                <textarea id="replyBody" placeholder="Reply to ${escHtml(otherName)}..."></textarea>
                <div class="reply-footer">
                    <label class="reply-file-btn" for="replyFile" title="Attach a file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                        </svg>
                    </label>
                    <input type="file" id="replyFile" style="display:none">
                    <span class="reply-file-name" id="replyFileName"></span>
                    <button class="reply-send-btn" id="replyBtn">Send</button>
                </div>
            </div>` : ''}
        </div>`;

    // Scroll thread to bottom so latest message is visible
    const threadEl = document.getElementById('threadMessages');
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

    document.getElementById('backBtn').addEventListener('click', () => loadView(view));

    if (!isTrash) {
        document.getElementById('trashBtn').addEventListener('click', async () => {
            await fetch(`/api/messages/${m.id}/trash`, { method: 'PUT' });
            loadView(view);
        });
    } else {
        document.getElementById('restoreBtn').addEventListener('click', async () => {
            await fetch(`/api/messages/${m.id}/restore`, { method: 'PUT' });
            loadView('trash');
        });
        document.getElementById('deleteBtn').addEventListener('click', async () => {
            if (!confirm('Permanently delete this message?')) return;
            await fetch(`/api/messages/${m.id}`, { method: 'DELETE' });
            loadView('trash');
        });
    }

    const fileInput = document.getElementById('replyFile');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const nameEl = document.getElementById('replyFileName');
            nameEl.textContent = fileInput.files[0] ? fileInput.files[0].name : '';
        });
    }

    const replyBtn = document.getElementById('replyBtn');
    if (replyBtn) {
        replyBtn.addEventListener('click', async () => {
            const body = document.getElementById('replyBody').value.trim();
            if (!body) return;
            replyBtn.disabled = true; replyBtn.textContent = 'Sending...';

            const file = fileInput && fileInput.files[0];
            let res;
            if (file) {
                const form = new FormData();
                form.append('toEmail', otherEmail);
                form.append('subject', `Re: ${m.subject || ''}`);
                form.append('body', body);
                form.append('attachment', file);
                res = await fetch('/api/messages/send-file', { method: 'POST', body: form });
            } else {
                res = await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toEmail: otherEmail, subject: `Re: ${m.subject || ''}`, body })
                });
            }

            const data = await res.json();
            replyBtn.disabled = false; replyBtn.textContent = 'Send';
            if (data.success) {
                document.getElementById('replyBody').value = '';
                if (fileInput) { fileInput.value = ''; document.getElementById('replyFileName').textContent = ''; }
                loadMessage(m.id, view);
            }
        });
    }
}

// ── Group thread ───────────────────────────────────────────────────────────
async function loadGroupThread(groupId) {
    currentMsgId = null;
    showLoading();
    try {
        const [infoRes, msgsRes] = await Promise.all([
            fetch(`/api/groups/${groupId}`),
            fetch(`/api/groups/${groupId}/messages`)
        ]);
        const infoData = await infoRes.json();
        const msgsData = await msgsRes.json();
        if (!infoData.group) { showError('Group not found.'); return; }
        renderGroupThread(groupId, infoData.group, infoData.members || [], msgsData.messages || []);
    } catch (err) {
        console.error('loadGroupThread error:', err);
        showError('Could not load group conversation.');
    }
}

function renderGroupThread(groupId, group, members, messages) {
    const main = document.getElementById('mailMain');

    const memberNames = members.map(m => escHtml(m.username)).join(', ');
    const memberCount = members.length;

    const messagesHtml = messages.map(msg => {
        const mine       = (msg.sender_id === currentUser.userId);
        const hasAttach  = msg.attached_file_name || msg.attachment_path;
        const attachChip = hasAttach ? `
            <a class="thread-attach-chip" href="/api/groups/${groupId}/attachment/${msg.id}" download>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                ${escHtml(msg.attached_file_name || 'Attached file')}
            </a>` : '';

        // In group threads show sender name above messages from others
        const senderLabel = !mine
            ? `<div class="thread-bubble-sender">${escHtml(msg.sender_name || msg.sender_email || '')}</div>`
            : '';

        return `
            <div class="thread-msg${mine ? ' thread-msg-mine' : ' thread-msg-theirs'}">
                <div class="thread-bubble">
                    ${senderLabel}
                    <div class="thread-bubble-body">${escHtml(msg.body || '')}</div>
                    ${attachChip}
                    <div class="thread-bubble-time">${formatDate(msg.created_at)}</div>
                </div>
            </div>`;
    }).join('');

    main.innerHTML = `
        <div class="msg-detail thread-view">
            <div class="msg-detail-toolbar">
                <button class="btn-back" id="backBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                    </svg>
                    Back
                </button>
            </div>

            <div class="thread-header">
                <div class="thread-avatar group-avatar">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                </div>
                <div class="group-header-info">
                    <div class="thread-other-name">${escHtml(group.name || 'Group conversation')}</div>
                    <button class="group-members-toggle" id="groupMembersToggle">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        ${members.filter(m => m.id !== currentUser.userId).length} member${members.filter(m => m.id !== currentUser.userId).length !== 1 ? 's' : ''}
                        <svg class="group-members-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </button>
                    <div class="group-members-dropdown" id="groupMembersDropdown" style="display:none;">
                        ${members.filter(m => m.id !== currentUser.userId).map(m => `
                        <div class="group-member-row">
                            <span class="group-member-email">${escHtml(m.email)}</span>
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="thread-messages" id="threadMessages">
                ${messagesHtml || '<div class="group-empty-msg">No messages yet. Say hello!</div>'}
            </div>

            <div class="reply-area thread-reply">
                <textarea id="replyBody" placeholder="Message the group…"></textarea>
                <div class="reply-footer">
                    <label class="reply-file-btn" for="replyFile" title="Attach a file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                        </svg>
                    </label>
                    <input type="file" id="replyFile" style="display:none">
                    <span class="reply-file-name" id="replyFileName"></span>
                    <button class="reply-send-btn" id="replyBtn">Send</button>
                </div>
            </div>
        </div>`;

    const threadEl = document.getElementById('threadMessages');
    if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

    document.getElementById('backBtn').addEventListener('click', () => loadView('inbox'));

    // Members dropdown toggle
    const membersToggle   = document.getElementById('groupMembersToggle');
    const membersDropdown = document.getElementById('groupMembersDropdown');
    const membersChevron  = membersToggle && membersToggle.querySelector('.group-members-chevron');
    if (membersToggle) {
        membersToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = membersDropdown.style.display !== 'none';
            membersDropdown.style.display = open ? 'none' : 'block';
            if (membersChevron) membersChevron.style.transform = open ? '' : 'rotate(180deg)';
        });
        document.addEventListener('click', function closeMembers(e) {
            if (!membersToggle.closest('.group-header-info').contains(e.target)) {
                membersDropdown.style.display = 'none';
                if (membersChevron) membersChevron.style.transform = '';
                document.removeEventListener('click', closeMembers);
            }
        });
    }

    const fileInput = document.getElementById('replyFile');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            document.getElementById('replyFileName').textContent =
                fileInput.files[0] ? fileInput.files[0].name : '';
        });
    }

    document.getElementById('replyBtn').addEventListener('click', async () => {
        const body    = document.getElementById('replyBody').value.trim();
        const file    = fileInput && fileInput.files[0];
        const replyBtn = document.getElementById('replyBtn');
        if (!body && !file) return;

        replyBtn.disabled = true;
        replyBtn.textContent = 'Sending...';

        let res;
        if (file) {
            const form = new FormData();
            if (body) form.append('body', body);
            form.append('attachment', file);
            res = await fetch(`/api/groups/${groupId}/messages`, { method: 'POST', body: form });
        } else {
            res = await fetch(`/api/groups/${groupId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body })
            });
        }

        const data = await res.json();
        replyBtn.disabled = false;
        replyBtn.textContent = 'Send';
        if (data.success) {
            document.getElementById('replyBody').value = '';
            if (fileInput) { fileInput.value = ''; document.getElementById('replyFileName').textContent = ''; }
            loadGroupThread(groupId);
        }
    });
}

// ── Friends ────────────────────────────────────────────────────────────────
async function loadFriends() {
    try {
        const res  = await fetch('/api/friends');
        const data = await res.json();
        friends = data.friends || [];
        renderFriends(friends, data.pending || []);
    } catch {}
}

function renderFriends(friendList, pending) {
    const pendingEl = document.getElementById('pendingList');
    const friendsEl = document.getElementById('friendsList');

    pendingEl.innerHTML = pending.map(p => `
        <div class="pending-item" data-id="${p.id}">
            <span class="pending-name" title="${escHtml(p.requester_email)}">${escHtml(p.requester_name)}</span>
            <div class="pending-actions">
                <button class="btn-accept" data-id="${p.id}">&#10003;</button>
                <button class="btn-reject" data-id="${p.id}">&#10007;</button>
            </div>
        </div>`).join('');

    friendsEl.innerHTML = friendList.map(f => `
        <div class="friend-item" data-email="${escHtml(f.friend_email)}" title="Message ${escHtml(f.friend_name)}">
            <div class="friend-avatar">${f.friend_name[0].toUpperCase()}</div>
            <span class="friend-name">${escHtml(f.friend_name)}</span>
        </div>`).join('');

    // Accept / Reject
    pendingEl.querySelectorAll('.btn-accept').forEach(btn => {
        btn.addEventListener('click', async () => {
            await fetch(`/api/friends/${btn.dataset.id}/accept`, { method: 'PUT' });
            loadFriends();
        });
    });
    pendingEl.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
            await fetch(`/api/friends/${btn.dataset.id}/reject`, { method: 'PUT' });
            loadFriends();
        });
    });

    // Click friend → compose pre-filled
    friendsEl.querySelectorAll('.friend-item').forEach(item => {
        item.addEventListener('click', () => openCompose(item.dataset.email));
    });
}

// ── Compose ────────────────────────────────────────────────────────────────
function setupCompose() {
    document.getElementById('fabCompose').addEventListener('click', () => openCompose());
    document.getElementById('composeClose').addEventListener('click', closeCompose);
    document.getElementById('composeSend').addEventListener('click', sendMessage);

    // Friend autocomplete on "To" field
    const toInput = document.getElementById('composeTo');
    const suggestions = document.getElementById('friendSuggestions');

    toInput.addEventListener('input', () => {
        const q = toInput.value.toLowerCase();
        const matches = friends.filter(f =>
            f.friend_name.toLowerCase().includes(q) || f.friend_email.toLowerCase().includes(q)
        );
        if (!q || matches.length === 0) { suggestions.style.display = 'none'; return; }
        suggestions.style.display = 'block';
        suggestions.innerHTML = matches.slice(0, 5).map(f => `
            <div class="suggestion-item" data-email="${escHtml(f.friend_email)}">
                <div class="suggestion-name">${escHtml(f.friend_name)}</div>
                <div class="suggestion-email">${escHtml(f.friend_email)}</div>
            </div>`).join('');
        suggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                toInput.value = item.dataset.email;
                suggestions.style.display = 'none';
            });
        });
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.compose-to-wrap')) suggestions.style.display = 'none';
    });
}

async function openCompose(prefillTo = '', prefillSubject = '') {
    document.getElementById('composeTo').value      = prefillTo;
    document.getElementById('composeSubject').value = prefillSubject;
    document.getElementById('composeBody').value    = '';
    document.getElementById('composeError').style.display = 'none';
    document.getElementById('composeOverlay').style.display = 'flex';
    await loadAttachableFiles();
    document.getElementById(prefillTo ? 'composeSubject' : 'composeTo').focus();
}

function closeCompose() {
    document.getElementById('composeOverlay').style.display = 'none';
}

async function populateAttachSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const userPos = localStorage.getItem('userPosition');
    if (!userPos) return;
    try {
        const res  = await fetch(`/api/files/${userPos}`);
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            data.files.filter(f => f.output_file_name).slice(0, 10).forEach(f => {
                const opt = document.createElement('option');
                opt.value       = `${f.id}::${f.output_file_name}`;
                opt.textContent = f.file_name;
                select.appendChild(opt);
            });
        }
    } catch {}
}

async function loadAttachableFiles() {
    await populateAttachSelect('composeAttach');
}

async function sendMessage() {
    const toEmail  = document.getElementById('composeTo').value.trim();
    const subject  = document.getElementById('composeSubject').value.trim();
    const body     = document.getElementById('composeBody').value.trim();
    const attachVal = document.getElementById('composeAttach').value;
    const errorEl  = document.getElementById('composeError');
    const btn      = document.getElementById('composeSend');
    const btnText  = document.getElementById('composeSendText');
    const spinner  = document.getElementById('composeSendSpinner');

    if (!toEmail || !body) {
        errorEl.textContent = 'Recipient and message body are required.';
        errorEl.style.display = 'block';
        return;
    }

    let attachedFileId = null, attachedFileName = null;
    if (attachVal) {
        const [id, name] = attachVal.split('::');
        attachedFileId   = parseInt(id);
        attachedFileName = name;
    }

    btn.disabled = true; btnText.textContent = 'Sending...';
    spinner.style.display = 'inline-block';
    errorEl.style.display = 'none';

    try {
        const res  = await fetch('/api/messages/send', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ toEmail, subject, body, attachedFileId, attachedFileName })
        });
        const data = await res.json();
        if (data.success) {
            closeCompose();
            if (currentView === 'sent') loadView('sent');
        } else {
            errorEl.textContent = data.error || 'Failed to send.';
            errorEl.style.display = 'block';
        }
    } catch {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
    } finally {
        btn.disabled = false; btnText.textContent = 'Send';
        spinner.style.display = 'none';
    }
}

// ── Add friend ─────────────────────────────────────────────────────────────
function setupAddFriend() {
    document.getElementById('addFriendBtn').addEventListener('click', () => {
        document.getElementById('friendSearchInput').value = '';
        document.getElementById('userSearchResults').innerHTML = '';
        document.getElementById('addFriendMsg').style.display = 'none';
        document.getElementById('addFriendOverlay').style.display = 'flex';
        document.getElementById('friendSearchInput').focus();
    });
    document.getElementById('addFriendClose').addEventListener('click', () => {
        document.getElementById('addFriendOverlay').style.display = 'none';
    });
    document.getElementById('addFriendOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('addFriendOverlay'))
            document.getElementById('addFriendOverlay').style.display = 'none';
    });

    let searchTimeout;
    document.getElementById('friendSearchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();
        if (q.length < 2) { document.getElementById('userSearchResults').innerHTML = ''; return; }
        searchTimeout = setTimeout(() => searchUsers(q), 300);
    });
}

async function searchUsers(query) {
    try {
        const res  = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const el   = document.getElementById('userSearchResults');
        if (!data.users || data.users.length === 0) {
            el.innerHTML = '<p style="color:#a0aec0;font-size:.88em;padding:8px 0;">No users found.</p>';
            return;
        }
        el.innerHTML = data.users.map(u => `
            <div class="user-result-item">
                <div class="friend-avatar">${u.username[0].toUpperCase()}</div>
                <div class="user-result-info">
                    <div class="user-result-name">${escHtml(u.username)}</div>
                    <div class="user-result-email">${escHtml(u.email)}</div>
                </div>
                <button class="btn-send-request" data-email="${escHtml(u.email)}">Add</button>
            </div>`).join('');

        el.querySelectorAll('.btn-send-request').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true; btn.textContent = '...';
                const res2 = await fetch('/api/friends/request', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ email: btn.dataset.email })
                });
                const d = await res2.json();
                const msg = document.getElementById('addFriendMsg');
                if (d.success) {
                    btn.textContent = 'Sent';
                    msg.textContent = 'Friend request sent!';
                    msg.className   = 'add-friend-msg success';
                } else {
                    btn.disabled    = false; btn.textContent = 'Add';
                    msg.textContent = d.error || 'Could not send request.';
                    msg.className   = 'add-friend-msg error';
                }
                msg.style.display = 'block';
            });
        });
    } catch {}
}

// ── Search ─────────────────────────────────────────────────────────────────
function setupSearch() {
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();
        if (!q) { loadView(currentView); return; }
        searchTimeout = setTimeout(() => searchMessages(q), 350);
    });
}

async function searchMessages(query) {
    showLoading();
    try {
        const res  = await fetch(`/api/messages/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderMessageList(data.messages || [], 'search results');
    } catch { showError('Search failed.'); }
}

// ── Polling ────────────────────────────────────────────────────────────────
function startPolling() {
    pollTimer = setInterval(async () => {
        if (currentMsgId) return; // don't reload while reading
        const res  = await fetch('/api/messages/unread');
        const data = await res.json();
        setInboxBadge(data.count || 0);
        if (currentView === 'inbox' && data.count > 0) loadView('inbox');
    }, 30000);
}

// ── Badge helpers ──────────────────────────────────────────────────────────
function updateInboxBadge(messages) {
    if (!messages) return;
    const unread = messages.filter(m => !m.read).length;
    setInboxBadge(unread);
}

let _badgeCount = 0;
function updateInboxBadgeByCount(delta, clamp) {
    _badgeCount = clamp ? Math.max(0, _badgeCount + delta) : _badgeCount;
    setInboxBadge(_badgeCount);
}

function setInboxBadge(count) {
    _badgeCount = count;
    const el = document.getElementById('navBadgeInbox');
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = 'inline'; }
    else           { el.style.display = 'none'; }
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showLoading() {
    document.getElementById('mailMain').innerHTML = `
        <div class="mail-empty"><p>Loading...</p></div>`;
}
function showError(msg) {
    document.getElementById('mailMain').innerHTML = `
        <div class="mail-empty"><p style="color:#e53e3e">${msg}</p></div>`;
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000 && d.getDate() === now.getDate())
        return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString([], { month:'short', day:'numeric' });
}

function formatDateFull(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleString([], {
        month:'short', day:'numeric', year:'numeric',
        hour:'2-digit', minute:'2-digit'
    });
}
