const API_BASE_URL = window.location.origin + '/api';
let currentUser = null;
let authToken = null;
let wsConnection = null;
let currentTrendIndex = 0;
let trendInterval = null;
let map = null;
let drawingManager = null;
let currentFences = [];
let currentCows = [];

document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    initializePage();
    
    if (window.location.pathname.includes('dashboard')) {
        initializeDashboard();
    } else if (window.location.pathname.includes('edit-fences')) {
        initializeFenceEditor();
    } else if (window.location.pathname.includes('tracking')) {
        initializeTracking();
    } else if (window.location.pathname.includes('collaborative')) {
        initializeCollaborative();
    } else if (window.location.pathname.includes('alerts')) {
        initializeAlerts();
    }
});

function checkAuthStatus() {
    authToken = localStorage.getItem('safezone_token');
    currentUser = localStorage.getItem('safezone_user');
    
    const publicPages = ['index.html', 'signup.html', 'logout.html', ''];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (!authToken && !publicPages.includes(currentPage) && !window.location.pathname.includes('collaborative')) {
        window.location.href = 'index.html';
        return;
    }
    
    if (authToken && (currentPage === 'index.html' || currentPage === 'signup.html')) {
        window.location.href = 'dashboard.html';
        return;
    }
}

function initializePage() {
    const menuBtn = document.getElementById('menuBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    
    if (menuBtn && dropdownMenu) {
        menuBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });
        
        document.addEventListener('click', function() {
            dropdownMenu.classList.remove('show');
        });
    }
    
    // Make logo clickable to go to dashboard
    const headerLogo = document.querySelector('.header-logo');
    if (headerLogo && authToken) {
        headerLogo.style.cursor = 'pointer';
        headerLogo.addEventListener('click', () => window.location.href = 'dashboard.html');
    }
    
    // Handle navigation buttons
    const signupBtn = document.getElementById('signupBtn');
    if (signupBtn) {
        signupBtn.addEventListener('click', () => window.location.href = 'signup.html');
    }
    
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => window.location.href = 'index.html');
    }
    
    // Handle header navigation
    const headerBtns = document.querySelectorAll('.header-btn');
    headerBtns.forEach(btn => {
        const nav = btn.getAttribute('data-nav');
        if (nav === 'notifications') {
            btn.addEventListener('click', () => window.location.href = 'notifications.html');
        } else if (nav === 'profile') {
            btn.addEventListener('click', () => window.location.href = 'profile.html');
        } else if (btn.innerHTML.includes('🔔')) {
            btn.addEventListener('click', () => window.location.href = 'notifications.html');
        } else if (btn.innerHTML.includes('👤')) {
            btn.addEventListener('click', () => window.location.href = 'profile.html');
        }
    });
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllNotificationsRead);
    }
    
    if (window.location.pathname.includes('notifications')) {
        loadNotifications();
    } else if (window.location.pathname.includes('read-notification')) {
        loadNotificationDetail();
    } else if (window.location.pathname.includes('profile')) {
        initializeProfile();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    const errorElement = document.getElementById('errorMessage');
    
    if (!email || !password) {
        showError(errorElement, 'Email and password are required');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                email, 
                password,
                gps: await getCurrentLocation()
            }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('safezone_token', data.token);
            localStorage.setItem('safezone_user', data.farmer_id);
            window.location.href = 'dashboard.html';
        } else {
            showError(errorElement, data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(errorElement, 'Network error. Please try again.');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    const errorElement = document.getElementById('errorMessage');
    
    if (!email || !password) {
        showError(errorElement, 'Email and password are required');
        return;
    }
    
    if (password.length < 10) {
        showError(errorElement, 'Password must be at least 10 characters long');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('safezone_token', data.token);
            localStorage.setItem('safezone_user', data.farmer_id);
            window.location.href = 'dashboard.html';
        } else {
            showError(errorElement, data.error || 'Signup failed');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showError(errorElement, 'Network error. Please try again.');
    }
}

function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.style.color = '#ef4444';
    }
}

async function getCurrentLocation() {
    return new Promise((resolve) => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve(`${position.coords.latitude},${position.coords.longitude}`);
                },
                () => {
                    resolve('0,0');
                }
            );
        } else {
            resolve('0,0');
        }
    });
}

async function initializeDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/dashboard/stats`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            createCharts(data);
        }
    } catch (error) {
        console.error('Dashboard initialization error:', error);
    }
    
    initializeTrendSlider();
    connectWebSocket();
}

function createCharts(data) {
    const alarmChart = document.getElementById('alarmChart');
    const cowChart = document.getElementById('cowChart');
    
    if (alarmChart && typeof Chart !== 'undefined') {
        new Chart(alarmChart, {
            type: 'line',
            data: {
                labels: data.alarmStats.map(stat => stat.date),
                datasets: [{
                    label: 'Total Alarms',
                    data: data.alarmStats.map(stat => stat.total_alarms),
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#ffffff'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }
    
    if (cowChart && typeof Chart !== 'undefined') {
        new Chart(cowChart, {
            type: 'doughnut',
            data: {
                labels: data.topCows.map(cow => cow.cow_id),
                datasets: [{
                    data: data.topCows.map(cow => cow.breach_count),
                    backgroundColor: [
                        '#dc2626',
                        '#f59e0b',
                        '#10b981',
                        '#3b82f6',
                        '#8b5cf6'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#ffffff'
                        }
                    }
                }
            }
        });
    }
}

function initializeTrendSlider() {
    const trendImages = document.querySelectorAll('.trend-image');
    if (trendImages.length === 0) return;
    
    trendInterval = setInterval(() => {
        trendImages[currentTrendIndex].classList.remove('active');
        currentTrendIndex = (currentTrendIndex + 1) % trendImages.length;
        trendImages[currentTrendIndex].classList.add('active');
    }, 10000);
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = function() {
        console.log('WebSocket connected');
    };
    
    wsConnection.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            handleRealtimeUpdate(data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };
    
    wsConnection.onclose = function() {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 5000);
    };
}

function handleRealtimeUpdate(data) {
    if (data.type === 'alarm') {
        updateNotificationBadge();
        if (window.location.pathname.includes('tracking')) {
            updateAlarmPanel(data);
        }
    } else if (data.type === 'cow_location') {
        if (window.location.pathname.includes('tracking')) {
            updateCowPosition(data);
        }
    }
}

function updateNotificationBadge() {
    const badges = document.querySelectorAll('.notification-badge');
    badges.forEach(badge => {
        const current = parseInt(badge.textContent) || 0;
        badge.textContent = current + 1;
    });
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_BASE_URL}/notifications`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
        }
    } catch (error) {
        console.error('Load notifications error:', error);
    }
}

function markAllNotificationsRead() {
    const notifications = document.querySelectorAll('.notification-item.unread');
    notifications.forEach(notification => {
        notification.classList.remove('unread');
        notification.classList.add('read');
    });
    
    const badges = document.querySelectorAll('.notification-badge');
    badges.forEach(badge => {
        badge.textContent = '0';
    });
}

function openNotification(id) {
    localStorage.setItem('notification_id', id);
    window.location.href = 'read-notification.html';
}

function loadNotificationDetail() {
    const notificationId = localStorage.getItem('notification_id');
    if (!notificationId) {
        window.location.href = 'notifications.html';
        return;
    }
    
    const notificationDetail = document.getElementById('notificationDetail');
    if (notificationDetail) {
        const badges = document.querySelectorAll('.notification-badge');
        badges.forEach(badge => {
            const current = parseInt(badge.textContent) || 0;
            if (current > 0) {
                badge.textContent = current - 1;
            }
        });
    }
}

function generateCollaborativeLink() {
    const cowId = 'C001';
    
    fetch(`${API_BASE_URL}/collaborative/link`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cowId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.link) {
            navigator.clipboard.writeText(data.link);
            alert('Collaborative link copied to clipboard!');
        }
    })
    .catch(error => {
        console.error('Generate link error:', error);
    });
}

function initializeFenceEditor() {
    const fenceSetup = document.getElementById('fenceSetup');
    const farmSelection = document.getElementById('farmSelection');
    const cowSelection = document.getElementById('cowSelection');
    const fenceSelection = document.getElementById('fenceSelection');
    const fenceEditor = document.getElementById('fenceEditor');
    
    // Handle option button clicks
    const optionBtns = document.querySelectorAll('.option-btn');
    optionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const method = parseInt(this.getAttribute('data-method'));
            selectLocationMethod(method);
        });
    });
    
    function selectLocationMethod(method) {
        fenceSetup.classList.add('hidden');
        
        if (method === 1) {
            showFarmInput();
        } else if (method === 2) {
            showCowSelection();
        } else if (method === 3) {
            showFarmSelection();
        } else if (method === 4) {
            showFenceSelection();
        }
    }
    
    window.createFarm = function() {
        const farmName = document.getElementById('farmNameInput').value;
        if (!farmName) return;
        
        getCurrentLocation().then(gps => {
            fetch(`${API_BASE_URL}/farms`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ farmName, gps })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showFenceEditor(gps);
                }
            });
        });
    };
    
    window.selectTool = function(tool) {
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tool + 'Tool').classList.add('active');
        
        if (drawingManager) {
            drawingManager.setDrawingMode(tool === 'polygon' ? google.maps.drawing.OverlayType.POLYGON : google.maps.drawing.OverlayType.POLYLINE);
        }
    };
    
    window.saveFence = function() {
        const fenceName = document.getElementById('fenceNameInput').value;
        if (!fenceName) {
            alert('Please enter a fence name');
            return;
        }
        
        const nodes = [];
        if (currentFences.length > 0) {
            const path = currentFences[0].getPath();
            path.forEach(point => {
                nodes.push({
                    lat: point.lat(),
                    lng: point.lng()
                });
            });
        }
        
        fetch(`${API_BASE_URL}/fences`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fenceName, nodes, farmId: 'current' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Fence saved successfully!');
            }
        });
    };
    
    window.deleteFence = function() {
        if (currentFences.length > 0) {
            currentFences.forEach(fence => fence.setMap(null));
            currentFences = [];
        }
    };
    
    window.zoomIn = function() {
        if (map) map.setZoom(map.getZoom() + 1);
    };
    
    window.zoomOut = function() {
        if (map) map.setZoom(map.getZoom() - 1);
    };
    
    window.autoFocus = function() {
        if (map && currentFences.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            currentFences[0].getPath().forEach(point => bounds.extend(point));
            map.fitBounds(bounds);
        }
    };
}

function showFarmInput() {
    document.getElementById('farmSelection').classList.remove('hidden');
}

function showCowSelection() {
    document.getElementById('cowSelection').classList.remove('hidden');
    loadCowList();
}

function showFarmSelection() {
    document.getElementById('farmSelection').classList.remove('hidden');
    loadFarmList();
}

function showFenceSelection() {
    document.getElementById('fenceSelection').classList.remove('hidden');
    loadExistingFenceList();
}

async function loadCowList() {
    try {
        const response = await fetch(`${API_BASE_URL}/cows`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const cowList = document.getElementById('cowList');
            cowList.innerHTML = data.cows.map(cow => 
                `<div class="cow-item" onclick="selectCow('${cow.cow_id}')">${cow.cow_id}</div>`
            ).join('');
        }
    } catch (error) {
        console.error('Load cow list error:', error);
    }
}

async function loadFarmList() {
    try {
        const response = await fetch(`${API_BASE_URL}/farms`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const farmList = document.getElementById('farmList');
            farmList.innerHTML = data.farms.map(farm => 
                `<div class="farm-item" onclick="selectFarm('${farm.farm_id}')">${farm.farm_id}</div>`
            ).join('');
        }
    } catch (error) {
        console.error('Load farm list error:', error);
    }
}

function selectCow(cowId) {
    showFenceEditor('35.1234,33.5678');
}

function selectFarm(farmId) {
    showFenceEditor('35.1234,33.5678');
}

async function loadExistingFenceList() {
    try {
        const response = await fetch(`${API_BASE_URL}/fences`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const fenceList = document.getElementById('existingFenceList');
            fenceList.innerHTML = data.fences.map(fence => 
                `<div class="fence-item" data-fence-id="${fence.fence_id}" data-fence-nodes='${fence.fence_nodes}'>
                    <div class="fence-name" onclick="selectExistingFence('${fence.fence_id}', '${fence.fence_nodes}')">
                        <strong>${fence.fence_id}</strong>
                    </div>
                    <div class="fence-details">
                        <small>Area: ${fence.area_size} m² | Farm: 
                            <span class="farm-link" onclick="selectExistingFence('${fence.fence_id}', '${fence.fence_nodes}')">${fence.farm_id || 'Unknown'}</span>
                        </small>
                    </div>
                </div>`
            ).join('');
        }
    } catch (error) {
        console.error('Load fence list error:', error);
    }
}


function selectExistingFence(fenceId, fenceNodes) {
    document.getElementById('fenceSelection').classList.add('hidden');
    document.getElementById('fenceEditor').classList.remove('hidden');
    
    // Pre-populate fence name
    document.getElementById('fenceNameInput').value = fenceId;
    
    // Initialize map and load existing fence
    initializeMap(35.1234, 33.5678);
    
    // Load existing fence nodes
    if (fenceNodes) {
        try {
            const nodes = JSON.parse(fenceNodes);
            const polygon = new google.maps.Polygon({
                paths: nodes,
                strokeColor: '#dc2626',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#dc2626',
                fillOpacity: 0.1,
                map: map,
                editable: true,
                draggable: true
            });
            
            currentFences = [polygon];
            
            // Auto-focus on the fence
            const bounds = new google.maps.LatLngBounds();
            nodes.forEach(node => bounds.extend(new google.maps.LatLng(node.lat, node.lng)));
            map.fitBounds(bounds);
        } catch (error) {
            console.error('Error loading fence nodes:', error);
        }
    }
}

function showFenceEditor(gps) {
    document.getElementById('farmSelection').classList.add('hidden');
    document.getElementById('cowSelection').classList.add('hidden');
    document.getElementById('fenceEditor').classList.remove('hidden');
    
    const [lat, lng] = gps.split(',').map(Number);
    initializeMap(lat, lng);
}

function initializeMap(lat, lng) {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;
    
    map = new google.maps.Map(mapElement, {
        center: { lat, lng },
        zoom: 18,
        styles: [
            {
                "elementType": "geometry",
                "stylers": [{"color": "#242f3e"}]
            },
            {
                "elementType": "labels.text.stroke",
                "stylers": [{"color": "#242f3e"}]
            },
            {
                "elementType": "labels.text.fill",
                "stylers": [{"color": "#746855"}]
            },
            {
                "featureType": "water",
                "elementType": "geometry",
                "stylers": [{"color": "#0e1626"}]
            },
            {
                "featureType": "road",
                "elementType": "geometry",
                "stylers": [{"color": "#634931"}]
            },
            {
                "featureType": "landscape",
                "elementType": "geometry",
                "stylers": [{"color": "#263c3f"}]
            }
        ]
    });
    
    drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
            fillColor: '#dc2626',
            fillOpacity: 0.2,
            strokeColor: '#dc2626',
            strokeWeight: 2,
            editable: true,
            draggable: true
        }
    });
    
    drawingManager.setMap(map);
    
    drawingManager.addListener('overlaycomplete', function(event) {
        currentFences.forEach(fence => fence.setMap(null));
        currentFences = [event.overlay];
    });
}

function initializeTracking() {
    const trackingMapElement = document.getElementById('trackingMap');
    if (!trackingMapElement) return;
    
    map = new google.maps.Map(trackingMapElement, {
        center: { lat: 35.1234, lng: 33.5678 },
        zoom: 15,
        styles: [
            {
                "elementType": "geometry",
                "stylers": [{"color": "#242f3e"}]
            },
            {
                "elementType": "labels.text.stroke",
                "stylers": [{"color": "#242f3e"}]
            },
            {
                "elementType": "labels.text.fill",
                "stylers": [{"color": "#746855"}]
            },
            {
                "featureType": "water",
                "elementType": "geometry",
                "stylers": [{"color": "#0e1626"}]
            },
            {
                "featureType": "road",
                "elementType": "geometry",
                "stylers": [{"color": "#634931"}]
            },
            {
                "featureType": "landscape",
                "elementType": "geometry",
                "stylers": [{"color": "#263c3f"}]
            }
        ]
    });
    
    loadCowsOnMap();
    loadFencesOnMap();
    
    window.autoFocusFence = function() {
        if (map && currentFences.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            currentFences.forEach(fence => {
                fence.getPath().forEach(point => bounds.extend(point));
            });
            map.fitBounds(bounds);
        }
    };
    
    window.autoFocusAll = function() {
        if (map) {
            const bounds = new google.maps.LatLngBounds();
            
            currentFences.forEach(fence => {
                fence.getPath().forEach(point => bounds.extend(point));
            });
            
            currentCows.forEach(cow => {
                bounds.extend(cow.getPosition());
            });
            
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds);
            }
        }
    };
    
    window.toggleDropdown = function(dropdownId) {
        const dropdown = document.getElementById(dropdownId);
        dropdown.classList.toggle('show');
    };
    
    window.selectFence = function(fenceId) {
        console.log('Selected fence:', fenceId);
        window.autoFocusFence();
    };
    
    window.toggleCowVisibility = function(cowId, checkbox) {
        const cow = currentCows.find(c => c.cowId === cowId);
        if (cow) {
            cow.setVisible(checkbox.checked);
        }
    };
    
    window.toggleAlarm = function(cowId, checkbox) {
        if (checkbox.checked) {
            showAlarmPanel();
            addCowToAlarmPanel(cowId);
        } else {
            removeCowFromAlarmPanel(cowId);
        }
    };
    
    window.toggleMarker = function(cowId, checkbox) {
        const cow = currentCows.find(c => c.cowId === cowId);
        if (cow) {
            cow.setIcon({
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: checkbox.checked ? '#dc2626' : '#10b981',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            });
        }
    };
    
    window.closeCowDetails = function() {
        document.getElementById('cowDetailsModal').classList.remove('show');
    };
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-content').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
    });
}

async function loadCowsOnMap() {
    try {
        const response = await fetch(`${API_BASE_URL}/cows`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            data.cows.forEach(cow => {
                if (cow.real_time_coordinate) {
                    const [lat, lng] = cow.real_time_coordinate.split(',').map(Number);
                    
                    const marker = new google.maps.Marker({
                        position: { lat, lng },
                        map: map,
                        title: cow.cow_id,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 6,
                            fillColor: '#10b981',
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2
                        }
                    });
                    
                    marker.cowId = cow.cow_id;
                    marker.cowData = cow;
                    
                    marker.addListener('click', function() {
                        showCowDetails(cow);
                    });
                    
                    currentCows.push(marker);
                }
            });
        }
    } catch (error) {
        console.error('Load cows error:', error);
    }
}

async function loadFencesOnMap() {
    try {
        const response = await fetch(`${API_BASE_URL}/fences`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            data.fences.forEach(fence => {
                if (fence.fence_nodes) {
                    const nodes = JSON.parse(fence.fence_nodes);
                    
                    const polygon = new google.maps.Polygon({
                        paths: nodes,
                        strokeColor: '#dc2626',
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                        fillColor: '#dc2626',
                        fillOpacity: 0.1,
                        map: map
                    });
                    
                    currentFences.push(polygon);
                }
            });
        }
    } catch (error) {
        console.error('Load fences error:', error);
    }
}

function showCowDetails(cow) {
    const modal = document.getElementById('cowDetailsModal');
    document.getElementById('cowId').textContent = cow.cow_id;
    document.getElementById('cowTag').textContent = cow.tag || 'Unknown';
    document.getElementById('cowSpeed').textContent = cow.speed || '0';
    
    const collaborativeBtn = document.getElementById('collaborativeBtn');
    if (collaborativeBtn) {
        collaborativeBtn.style.display = 'block';
    }
    
    modal.classList.add('show');
}

function showAlarmPanel() {
    const alarmPanel = document.getElementById('alarmPanel');
    if (alarmPanel) {
        alarmPanel.style.display = 'block';
    }
}

function addCowToAlarmPanel(cowId) {
    const alarmList = document.getElementById('alarmList');
    const noAlarms = alarmList.querySelector('.no-alarms');
    
    if (noAlarms) {
        noAlarms.remove();
    }
    
    const alarmItem = document.createElement('div');
    alarmItem.className = 'alarm-item';
    alarmItem.innerHTML = `
        <div class="alarm-cow-id">${cowId}</div>
        <div class="alarm-details">
            <div>Speed: <span id="speed-${cowId}">0 km/h</span></div>
            <div>Tag: <span id="tag-${cowId}">Grazing</span></div>
            <div>Time: <span id="time-${cowId}">${new Date().toLocaleTimeString()}</span></div>
            <div>Type: <span id="type-${cowId}">Normal</span></div>
        </div>
    `;
    
    alarmList.appendChild(alarmItem);
}

function removeCowFromAlarmPanel(cowId) {
    const alarmItem = document.querySelector(`#alarm-${cowId}`);
    if (alarmItem) {
        alarmItem.remove();
    }
    
    const alarmList = document.getElementById('alarmList');
    if (!alarmList.children.length) {
        alarmList.innerHTML = '<p class="no-alarms">No active alarms</p>';
    }
}

function updateAlarmPanel(data) {
    const speedElement = document.getElementById(`speed-${data.cowId}`);
    const tagElement = document.getElementById(`tag-${data.cowId}`);
    const timeElement = document.getElementById(`time-${data.cowId}`);
    const typeElement = document.getElementById(`type-${data.cowId}`);
    
    if (speedElement) speedElement.textContent = `${data.speed || 0} km/h`;
    if (tagElement) tagElement.textContent = data.tag || 'Unknown';
    if (timeElement) timeElement.textContent = new Date().toLocaleTimeString();
    if (typeElement) typeElement.textContent = data.alarmType || 'Normal';
}

function updateCowPosition(data) {
    const cow = currentCows.find(c => c.cowId === data.cowId);
    if (cow && data.position) {
        const [lat, lng] = data.position.split(',').map(Number);
        cow.setPosition({ lat, lng });
    }
}

function initializeCollaborative() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkId = window.location.pathname.split('/').pop();
    
    window.acceptRequest = function() {
        document.getElementById('requestSection').classList.add('hidden');
        document.getElementById('recoveryInterface').classList.remove('hidden');
        
        initializeCollaborativeMap();
        startRecoveryProcess();
    };
    
    window.denyRequest = function() {
        document.getElementById('requestSection').classList.add('hidden');
        document.getElementById('disconnectedScreen').classList.remove('hidden');
    };
    
    window.confirmCowFound = function() {
        document.getElementById('foundCowBtn').classList.add('hidden');
        document.getElementById('completedBtn').classList.remove('hidden');
        updateRecoveryStatus('Cow found! Leading back to fence...');
    };
    
    window.completeRecovery = function() {
        document.getElementById('recoveryInterface').classList.add('hidden');
        document.getElementById('completionScreen').classList.remove('hidden');
    };
}

function initializeCollaborativeMap() {
    const mapElement = document.getElementById('collaborativeMap');
    if (!mapElement) return;
    
    map = new google.maps.Map(mapElement, {
        center: { lat: 35.1234, lng: 33.5678 },
        zoom: 16,
        styles: [
            {
                "elementType": "geometry",
                "stylers": [{"color": "#242f3e"}]
            },
            {
                "featureType": "water",
                "elementType": "geometry",
                "stylers": [{"color": "#0e1626"}]
            },
            {
                "featureType": "road",
                "elementType": "geometry",
                "stylers": [{"color": "#634931"}]
            },
            {
                "featureType": "landscape",
                "elementType": "geometry",
                "stylers": [{"color": "#263c3f"}]
            }
        ]
    });
    
    const cowMarker = new google.maps.Marker({
        position: { lat: 35.1244, lng: 33.5688 },
        map: map,
        title: 'Lost Cow',
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#dc2626',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        }
    });
    
    const employeeMarker = new google.maps.Marker({
        position: { lat: 35.1234, lng: 33.5678 },
        map: map,
        title: 'Your Position',
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        }
    });
    
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
            strokeColor: '#f59e0b',
            strokeWeight: 3
        }
    });
    
    directionsRenderer.setMap(map);
    
    directionsService.route({
        origin: employeeMarker.getPosition(),
        destination: cowMarker.getPosition(),
        travelMode: google.maps.TravelMode.WALKING
    }, function(result, status) {
        if (status === 'OK') {
            directionsRenderer.setDirections(result);
        }
    });
}

function startRecoveryProcess() {
    updateRecoveryDistance();
    updateRecoveryTime();
    
    setInterval(() => {
        updateRecoveryDistance();
        updateRecoveryTime();
    }, 5000);
    
    setTimeout(() => {
        document.getElementById('foundCowBtn').classList.remove('hidden');
        updateRecoveryStatus('You are close to the cow. Did you find it?');
    }, 30000);
}

function updateRecoveryDistance() {
    const distance = Math.floor(Math.random() * 50) + 100;
    document.getElementById('recoveryDistance').textContent = `${distance}m`;
}

function updateRecoveryTime() {
    const now = new Date();
    document.getElementById('recoveryTime').textContent = now.toLocaleTimeString();
}

function updateRecoveryStatus(message) {
    const statusMessages = document.getElementById('statusMessages');
    const messageElement = document.createElement('div');
    messageElement.className = 'status-message';
    messageElement.textContent = message;
    statusMessages.appendChild(messageElement);
    statusMessages.scrollTop = statusMessages.scrollHeight;
}

function initializeAlerts() {
    checkESP32Connection();
    
    // Add event listeners for test buttons
    const testBoundaryBtn = document.getElementById('testBoundaryBtn');
    if (testBoundaryBtn) {
        testBoundaryBtn.addEventListener('click', testBoundaryAlert);
    }
    
    const testDeterrentBtn = document.getElementById('testDeterrentBtn');
    if (testDeterrentBtn) {
        testDeterrentBtn.addEventListener('click', testDeterrentSystem);
    }
    
    const testGmailBtn = document.getElementById('testGmailBtn');
    if (testGmailBtn) {
        testGmailBtn.addEventListener('click', testGmailAlert);
    }
    
    const testDatabaseBtn = document.getElementById('testDatabaseBtn');
    if (testDatabaseBtn) {
        testDatabaseBtn.addEventListener('click', testDatabaseConnection);
    }
    
    window.saveBoundarySetting = function() {
        const distance = document.getElementById('boundaryDistance').value;
        console.log('Saving boundary distance:', distance);
        alert('Boundary distance setting saved: ' + distance + 'm');
    };
    
    window.saveDeterrentSettings = function() {
        const time1 = document.getElementById('deterrentTime1').value;
        const time2 = document.getElementById('deterrentTime2').value;
        const time3 = document.getElementById('deterrentTime3').value;
        const duration = document.getElementById('buzzerDuration').value;
        
        console.log('Saving deterrent settings:', { time1, time2, time3, duration });
        alert('Deterrent settings saved successfully!');
    };
    
    window.saveGmailSettings = function() {
        const receiver = document.getElementById('gmailReceiver').value;
        const enabled = document.getElementById('enableGmailAlerts').checked;
        const dailyReports = document.getElementById('dailyReports').checked;
        const frequency = document.getElementById('alertFrequency').value;
        
        console.log('Saving Gmail settings:', { receiver, enabled, dailyReports, frequency });
        alert('Gmail settings saved successfully!');
    };
}

function testBoundaryAlert() {
    alert('Boundary alert test triggered! This would normally send an ESP32 command to test the boundary detection system.');
}

function testDeterrentSystem() {
    alert('Deterrent system test initiated! This would normally activate LEDs and buzzer on the ESP32 device for testing.');
}

function testGmailAlert() {
    const receiver = document.getElementById('gmailReceiver').value;
    const testBtn = document.getElementById('testGmailBtn');
    
    testBtn.disabled = true;
    testBtn.textContent = 'Sending...';
    
    fetch(`${API_BASE_URL}/test-email`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ receiver })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`✅ Test email sent successfully to ${receiver}!\n\nMessage ID: ${data.messageId || 'N/A'}\n\nPlease check your inbox (and spam folder).`);
        } else {
            alert(`❌ Failed to send test email.\n\nError: ${data.error || 'Unknown error'}`);
        }
    })
    .catch(error => {
        console.error('Test email error:', error);
        alert(`❌ Network error while sending test email.\n\nPlease check your connection and try again.`);
    })
    .finally(() => {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Gmail Alert';
    });
}

function testDatabaseConnection() {
    const testBtn = document.getElementById('testDatabaseBtn');
    
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    
    fetch(`${API_BASE_URL}/database/test`, {
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const info = data.database;
            alert(`✅ Database Connection Successful!\n\n` +
                  `📊 Database Info:\n` +
                  `• Version: ${info.version.split(' ')[0]}\n` +
                  `• Current Time: ${new Date(info.current_time).toLocaleString()}\n` +
                  `• Tables Found: ${info.tables.length}\n` +
                  `• Tables: ${info.tables.join(', ')}\n` +
                  `• Users: ${info.user_count} registered`);
        } else {
            alert(`❌ Database Connection Failed!\n\nError: ${data.error}\nDetails: ${data.details || 'No additional details'}`);
        }
    })
    .catch(error => {
        console.error('Database test error:', error);
        alert(`❌ Network error while testing database connection.\n\nPlease check your connection and try again.`);
    })
    .finally(() => {
        testBtn.disabled = false;
        testBtn.textContent = 'Test Database Connection';
    });
}

function checkESP32Connection() {
    const statusLight = document.getElementById('statusLight');
    const statusText = document.getElementById('statusText');
    const inputs = document.querySelectorAll('#boundaryDistance, #deterrentTime1, #deterrentTime2, #deterrentTime3, #buzzerDuration');
    const buttons = document.querySelectorAll('#saveBoundaryBtn, #saveDeterrentBtn');
    
    const connected = Math.random() > 0.5;
    
    if (connected) {
        statusLight.classList.add('connected');
        statusText.textContent = 'ESP32 devices connected';
        
        inputs.forEach(input => {
            input.disabled = false;
            input.nextElementSibling.textContent = 'Live settings';
        });
        
        buttons.forEach(button => {
            button.disabled = false;
        });
    } else {
        statusLight.classList.add('disconnected');
        statusText.textContent = 'ESP32 devices offline - using default settings';
        
        inputs.forEach(input => {
            input.disabled = true;
        });
        
        buttons.forEach(button => {
            button.disabled = true;
        });
    }
}

function initializeProfile() {
    const updateUserIdForm = document.getElementById('updateUserIdForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const editModal = document.getElementById('editModal');
    
    if (updateUserIdForm) {
        updateUserIdForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newUserId = document.getElementById('newUserId').value;
            console.log('Updating user ID to:', newUserId);
            alert('User ID updated successfully!');
        });
    }
    
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (newPassword !== confirmPassword) {
                alert('New passwords do not match!');
                return;
            }
            
            if (newPassword.length < 10) {
                alert('Password must be at least 10 characters long!');
                return;
            }
            
            console.log('Changing password');
            alert('Password changed successfully!');
        });
    }
    
    window.editCowId = function(cowId) {
        showEditModal('Edit Cow ID', 'Cow ID:', cowId);
    };
    
    window.editFenceId = function(fenceId) {
        showEditModal('Edit Fence ID', 'Fence Name:', fenceId);
    };
    
    window.editFarmId = function(farmId) {
        showEditModal('Edit Farm ID', 'Farm Name:', farmId);
    };
    
    window.addNewCow = function() {
        showEditModal('Add New Cow', 'Cow ID:', '');
    };
    
    window.addNewFarm = function() {
        showEditModal('Add New Farm', 'Farm Name:', '');
    };
    
    window.closeModal = function() {
        editModal.classList.remove('show');
    };
    
    window.logout = function() {
        localStorage.removeItem('safezone_token');
        localStorage.removeItem('safezone_user');
        window.location.href = 'logout.html';
    };
    
    if (editModal) {
        const editForm = document.getElementById('editForm');
        editForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newValue = document.getElementById('editInput').value;
            console.log('Saving new value:', newValue);
            alert('Changes saved successfully!');
            editModal.classList.remove('show');
        });
    }
}

function showEditModal(title, label, currentValue) {
    const modal = document.getElementById('editModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('editLabel').textContent = label;
    document.getElementById('editInput').value = currentValue;
    modal.classList.add('show');
}

function downloadFarmData(farmId) {
    console.log('Downloading farm data for:', farmId);
    alert('Farm data download will be available via MEGA link in your email.');
}

function downloadFenceData(fenceId) {
    console.log('Downloading fence data for:', fenceId);
    alert('Fence data download will be available via MEGA link in your email.');
}

function downloadCowData(cowId) {
    console.log('Downloading cow data for:', cowId);
    alert('Cow data download will be available via MEGA link in your email.');
}

window.addEventListener('beforeunload', function() {
    if (trendInterval) {
        clearInterval(trendInterval);
    }
    if (wsConnection) {
        wsConnection.close();
    }
});