// ==================== IMPORTS ====================
import { CuentaPM } from '/clases/cuentaPM.js';
import { CLOUD_FUNCTION_BASE_URL, ACTIONS } from '/config/urlCloudFunction.js';

// ==================== CONSTANTES ====================
const POWER_MANAGE_FUNCTION = 'proxyPowerManage';
const AUTO_REFRESH_INTERVAL = 10000; // 10 segundos

// ==================== VARIABLES GLOBALES ====================
let cuentaAppId = null;
let panelSerial = null;
let panelAlias = null;
let panelTipo = null;
let powerManageUserToken = null;
let sessionToken = null;
let autoRefreshTimer = null;
let ultimoEventoId = null;
let eventosCache = [];

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Swal === 'undefined') {
        console.error('❌ SweetAlert2 no está cargado.');
        return;
    }
    
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
        console.log('📢 Permiso de notificaciones:', Notification.permission);
    }
    
    await initGestionPanel();
});

async function initGestionPanel() {
    const urlParams = new URLSearchParams(window.location.search);
    cuentaAppId = urlParams.get('appId');
    panelSerial = urlParams.get('panelSerial');
    
    if (!cuentaAppId || !panelSerial) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se especificó la cuenta o el panel',
            confirmButtonText: 'VOLVER'
        }).then(() => {
            window.location.href = '../listarPaneles/listarPaneles.html';
        });
        return;
    }
    
    try {
        const powerManageStr = localStorage.getItem('powerManageToken');
        if (!powerManageStr) {
            throw new Error('No hay sesión activa de Power Manage');
        }
        
        const powerManageData = JSON.parse(powerManageStr);
        powerManageUserToken = powerManageData.user_token;
        
        const panelStr = localStorage.getItem('panelSeleccionado');
        if (panelStr) {
            const panel = JSON.parse(panelStr);
            panelAlias = panel.alias || 'Panel sin nombre';
            panelTipo = panel.tipo || 'PowerMaster';
            document.getElementById('panelAlias').textContent = panelAlias;
            document.getElementById('panelSerial').textContent = `Serial: ${panelSerial} | Tipo: ${panelTipo}`;
        } else {
            panelTipo = 'PowerMaster';
            document.getElementById('panelAlias').textContent = `Panel ${panelSerial}`;
            document.getElementById('panelSerial').textContent = `Serial: ${panelSerial}`;
        }
        
        await obtenerSessionToken();
        await cargarDatosPanel();
        
        iniciarAutoRefresh();
        configurarEventos();
        configurarTabs();
        
    } catch (error) {
        console.error('❌ Error inicializando:', error);
        
        if (error.message === 'Wrong user token') {
            redirectToLogin();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message,
                confirmButtonText: 'VOLVER'
            }).then(() => {
                window.location.href = '../listarPaneles/listarPaneles.html';
            });
        }
    }
}

async function obtenerSessionToken() {
    mostrarProgreso('Conectando al panel...', 20);
    
    const savedSession = localStorage.getItem(`session_${panelSerial}`);
    if (savedSession) {
        sessionToken = savedSession;
        
        try {
            const testResponse = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: ACTIONS.VERIFICAR_SESION,
                    user_token: powerManageUserToken,
                    session_token: sessionToken,
                    panel_serial: panelSerial
                })
            });
            
            if (testResponse.ok) {
                mostrarProgreso('Conexión establecida', 100);
                setTimeout(() => ocultarProgreso(), 500);
                return;
            }
        } catch (e) {
            localStorage.removeItem(`session_${panelSerial}`);
        }
    }
    
    try {
        const appType = panelTipo === 'Neo' ? 'com.visonic.neogo' : 'com.visonic.PowerMaxApp';
        
        const { value: userCode } = await Swal.fire({
            title: 'Código de usuario del panel',
            html: `
                <div style="text-align: left;">
                    <p>Para conectar con el panel <strong>${escapeHTML(panelAlias)}</strong></p>
                    <p>Ingresa el código de usuario (código maestro o de usuario con permisos)</p>
                </div>
            `,
            input: 'password',
            inputLabel: 'Código de usuario',
            inputPlaceholder: 'Ej: 1234',
            inputAttributes: {
                maxlength: '8',
                pattern: '[0-9]*',
                inputmode: 'numeric'
            },
            showCancelButton: true,
            confirmButtonText: 'CONECTAR',
            cancelButtonText: 'CANCELAR',
            inputValidator: (value) => {
                if (!value) return 'El código es requerido';
                if (!/^\d{4,8}$/.test(value)) return 'El código debe tener entre 4 y 8 dígitos';
                return null;
            }
        });
        
        if (!userCode) {
            throw new Error('Código de usuario no proporcionado');
        }
        
        mostrarProgreso(`Iniciando sesión en el panel (${panelTipo})...`, 40);
        
        const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: ACTIONS.LOGIN_PANEL,
                user_token: powerManageUserToken,
                panel_data: {
                    panel_serial: panelSerial,
                    user_code: userCode,
                    app_id: cuentaAppId,
                    app_type: appType
                }
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        const result = await response.json();
        
        if (!response.ok) {
            if (result.error_reason_code === 'WrongUserCode') {
                throw new Error('Código de usuario incorrecto');
            } else {
                throw new Error(result.error_message || 'Error al conectar con el panel');
            }
        }
        
        sessionToken = result.session_token;
        
        localStorage.setItem(`session_${panelSerial}`, sessionToken);
        
        mostrarProgreso('Conexión establecida', 100);
        setTimeout(() => ocultarProgreso(), 500);
        
    } catch (error) {
        console.error('❌ Error obteniendo session token:', error);
        ocultarProgreso();
        throw error;
    }
}

async function cargarDatosPanel() {
    if (!sessionToken) {
        throw new Error('No hay sesión activa en el panel');
    }
    
    mostrarProgreso('Cargando información del panel...', 10);
    
    await Promise.all([
        cargarEstadoPanel(),
        cargarZonas(),
        cargarEventos(),
        cargarDispositivos()
    ]);
    
    ocultarProgreso();
}

async function cargarEstadoPanel() {
    try {
        const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: ACTIONS.OBTENER_ESTADO_PANEL,
                user_token: powerManageUserToken,
                session_token: sessionToken,
                panel_serial: panelSerial
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error_message);
        
        const partition = result.partitions?.[0] || {};
        const estado = partition.state || 'UNKNOWN';
        
        const stateDisplay = document.getElementById('systemState');
        const currentStateSpan = document.getElementById('currentState');
        
        stateDisplay.classList.remove('state-disarm', 'state-home', 'state-away');
        
        switch(estado) {
            case 'DISARM':
                stateDisplay.classList.add('state-disarm');
                currentStateSpan.textContent = 'Desarmado';
                break;
            case 'HOME':
                stateDisplay.classList.add('state-home');
                currentStateSpan.textContent = 'Modo Casa';
                break;
            case 'AWAY':
                stateDisplay.classList.add('state-away');
                currentStateSpan.textContent = 'Modo Ausente';
                break;
            default:
                currentStateSpan.textContent = estado || 'Desconocido';
        }
        
        const statusIndicator = document.querySelector('.status-indicator');
        const isOnline = result.connected_status?.gprs?.connected || result.connected_status?.bba?.connected;
        
        if (isOnline) {
            statusIndicator.className = 'status-indicator online';
            statusIndicator.innerHTML = '<i class="fas fa-circle"></i><span>En línea</span>';
        } else {
            statusIndicator.className = 'status-indicator offline';
            statusIndicator.innerHTML = '<i class="fas fa-circle"></i><span>Sin conexión</span>';
        }
        
        const signalLevel = document.getElementById('signalLevel');
        const lastConnection = document.getElementById('lastConnection');
        
        if (result.rssi?.level) {
            signalLevel.innerHTML = `<i class="fas fa-signal"></i> <span>${result.rssi.level}</span>`;
        }
        
        lastConnection.textContent = new Date().toLocaleString();
        
    } catch (error) {
        console.error('❌ Error cargando estado:', error);
    }
}

async function cargarZonas() {
    try {
        const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: ACTIONS.LISTAR_ZONAS,
                user_token: powerManageUserToken,
                session_token: sessionToken,
                panel_serial: panelSerial
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        const zonas = await response.json();
        
        if (!response.ok) throw new Error(zonas.error_message);
        
        const zonasGrid = document.getElementById('zonasGrid');
        const zonasCount = document.getElementById('zonasCount');
        
        if (!zonas || zonas.length === 0) {
            zonasGrid.innerHTML = '<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No hay zonas configuradas</p></div>';
            if (zonasCount) zonasCount.textContent = '0';
            return;
        }
        
        if (zonasCount) zonasCount.textContent = zonas.length;
        
        zonasGrid.innerHTML = zonas.map(zona => `
            <div class="zona-card">
                <div class="zona-header">
                    <i class="fas fa-map-marker-alt"></i>
                    <strong>Zona ${zona.id || zona.zone || zona.device_number}</strong>
                    <span class="zona-estado">${zona.status || 'Normal'}</span>
                </div>
                <div class="zona-info">
                    ${zona.name || 'Sin nombre'} - Tipo: ${zona.zone_type || zona.device_type || 'Desconocido'}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error cargando zonas:', error);
        document.getElementById('zonasGrid').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando zonas</p></div>';
    }
}

async function cargarEventos() {
    try {
        const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: ACTIONS.LISTAR_EVENTOS,
                user_token: powerManageUserToken,
                session_token: sessionToken,
                panel_serial: panelSerial,
                limit: 100
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        let eventos = await response.json();
        
        if (!response.ok) throw new Error(eventos.error_message);
        
        console.log(`📊 Eventos obtenidos: ${eventos.length}`);
        
        // Ordenar de más reciente a más antiguo
        eventos = eventos.sort((a, b) => {
            return new Date(b.datetime) - new Date(a.datetime);
        });
        
        // Detectar nuevos eventos
        if (eventosCache.length > 0) {
            const nuevosEventos = eventos.filter(evento => {
                const eventoId = `${evento.datetime}_${evento.event}_${evento.description}`;
                const existe = eventosCache.some(e => `${e.datetime}_${e.event}_${e.description}` === eventoId);
                return !existe;
            });
            
            if (nuevosEventos.length > 0) {
                console.log(`🆕 Nuevos eventos detectados: ${nuevosEventos.length}`);
                for (const evento of nuevosEventos) {
                    mostrarNotificacionEvento(evento);
                }
            }
        }
        
        // Guardar en caché
        eventosCache = [...eventos];
        
        const eventosList = document.getElementById('eventosList');
        const eventosCount = document.getElementById('eventosCount');
        
        if (eventosCount) eventosCount.textContent = eventos.length;
        
        if (!eventos || eventos.length === 0) {
            eventosList.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No hay eventos recientes</p></div>';
            return;
        }
        
        // Renderizar eventos
        eventosList.innerHTML = eventos.map(evento => {
            const fecha = new Date(evento.datetime);
            const fechaFormateada = fecha.toLocaleString();
            const esNuevo = (new Date() - fecha) < 5 * 60 * 1000;
            
            // Determinar icono según tipo
            let iconoEvento = 'fa-info-circle';
            
            switch(evento.label) {
                case 'ARM':
                case 'DISARM':
                    iconoEvento = 'fa-shield-alt';
                    break;
                case 'BURGLER':
                    iconoEvento = 'fa-bell';
                    break;
                case 'FIRE':
                    iconoEvento = 'fa-fire';
                    break;
                case 'PANIC':
                    iconoEvento = 'fa-exclamation-triangle';
                    break;
                case 'ONLINE':
                    iconoEvento = 'fa-wifi';
                    break;
                case 'OFFLINE':
                    iconoEvento = 'fa-plug';
                    break;
                default:
                    iconoEvento = 'fa-info-circle';
            }
            
            return `
                <div class="evento-card ${esNuevo ? 'evento-nuevo' : ''}">
                    <div class="evento-header">
                        <i class="fas ${iconoEvento}"></i>
                        <span class="evento-tipo">${escapeHTML(evento.description)}</span>
                        ${esNuevo ? '<span class="nuevo-badge">NUEVO</span>' : ''}
                    </div>
                    <div class="evento-fecha">${fechaFormateada}</div>
                    <div class="evento-detalle">
                        ${evento.appointment ? `<span><i class="fas fa-user"></i> ${escapeHTML(evento.appointment)}</span>` : ''}
                        ${evento.zone ? `<span><i class="fas fa-map-marker-alt"></i> Zona ${evento.zone}</span>` : ''}
                        ${evento.name ? `<span><i class="fas fa-microchip"></i> ${escapeHTML(evento.name)}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('❌ Error cargando eventos:', error);
        const eventosList = document.getElementById('eventosList');
        eventosList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando eventos</p></div>';
    }
}

function mostrarNotificacionEvento(evento) {
    console.log(`🔔 Mostrando notificación: ${evento.description}`);
    
    let titulo = '';
    let cuerpo = '';
    let esImportante = false;
    
    switch(evento.label) {
        case 'ARM':
            titulo = '🔒 Panel Armado';
            cuerpo = `El panel ha sido armado${evento.appointment ? ` por ${evento.appointment}` : ''}`;
            break;
        case 'DISARM':
            titulo = '🔓 Panel Desarmado';
            cuerpo = `El panel ha sido desarmado${evento.appointment ? ` por ${evento.appointment}` : ''}`;
            break;
        case 'BURGLER':
            titulo = '🚨 ALARMA DE INTRUSIÓN';
            cuerpo = `¡Alarma activada!${evento.zone ? ` Zona ${evento.zone}` : ''}`;
            esImportante = true;
            break;
        case 'FIRE':
            titulo = '🔥 ALARMA DE INCENDIO';
            cuerpo = `¡Detectado fuego!${evento.zone ? ` Zona ${evento.zone}` : ''}`;
            esImportante = true;
            break;
        case 'PANIC':
            titulo = '⚠️ ALARMA DE PÁNICO';
            cuerpo = `Alarma de pánico activada${evento.appointment ? ` por ${evento.appointment}` : ''}`;
            esImportante = true;
            break;
        case 'ONLINE':
            titulo = '📡 Panel en línea';
            cuerpo = 'El panel se ha conectado correctamente';
            break;
        case 'OFFLINE':
            titulo = '⚠️ Panel desconectado';
            cuerpo = 'El panel ha perdido conexión';
            esImportante = true;
            break;
        default:
            titulo = '📢 Nuevo evento';
            cuerpo = evento.description;
    }
    
    if (esImportante) {
        Swal.fire({
            icon: 'error',
            title: titulo,
            text: cuerpo,
            toast: false,
            confirmButtonText: 'ENTENDIDO',
            background: '#ff4444',
            color: '#fff',
            iconColor: '#fff',
            timer: 10000,
            timerProgressBar: true
        });
    } else {
        Swal.fire({
            icon: 'info',
            title: titulo,
            text: cuerpo,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });
    }
    
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(titulo, {
            body: cuerpo,
            icon: '/assets/images/logo.png',
            silent: false
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        
        setTimeout(() => notification.close(), 8000);
    }
}

async function cargarDispositivos() {
    try {
        const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: ACTIONS.LISTAR_DISPOSITIVOS,
                user_token: powerManageUserToken,
                session_token: sessionToken,
                panel_serial: panelSerial
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        const dispositivos = await response.json();
        
        if (!response.ok) throw new Error(dispositivos.error_message);
        
        console.log(`📊 Dispositivos obtenidos: ${dispositivos.length}`);
        
        const dispositivosList = document.getElementById('dispositivosList');
        const dispositivosCount = document.getElementById('dispositivosCount');
        
        if (!dispositivos || dispositivos.length === 0) {
            dispositivosList.innerHTML = '<div class="empty-state"><i class="fas fa-microchip"></i><p>No hay dispositivos adicionales</p></div>';
            if (dispositivosCount) dispositivosCount.textContent = '0';
            return;
        }
        
        if (dispositivosCount) dispositivosCount.textContent = dispositivos.length;
        
        dispositivosList.innerHTML = dispositivos.map(disp => `
            <div class="dispositivo-card">
                <div class="dispositivo-header">
                    <i class="fas ${disp.device_type === 'KEYFOB' ? 'fa-key' : 'fa-microchip'}"></i>
                    <strong>${escapeHTML(disp.name || disp.device_type)}</strong>
                    <span class="dispositivo-id">ID: ${disp.device_number}</span>
                </div>
                <div class="dispositivo-info">
                    <span>Tipo: ${disp.device_type}</span>
                    ${disp.subtype ? `<span>Subtipo: ${disp.subtype}</span>` : ''}
                    ${disp.zone ? `<span>Zona: ${disp.zone}</span>` : ''}
                </div>
                <div class="dispositivo-bateria">
                    <i class="fas fa-battery-${disp.battery?.status === 'low' ? 'quarter' : 'full'}"></i>
                    Batería: ${disp.battery?.level || disp.battery?.status || 'Normal'}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Error cargando dispositivos:', error);
        document.getElementById('dispositivosList').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error cargando dispositivos</p></div>';
    }
}

async function cambiarEstadoPanel(estado) {
    if (!sessionToken) {
        Swal.fire({
            icon: 'warning',
            title: 'Sesión expirada',
            text: 'Reconectando...',
            confirmButtonText: 'RECONECTAR'
        }).then(() => {
            obtenerSessionToken().then(() => {
                cambiarEstadoPanel(estado);
            });
        });
        return;
    }
    
    mostrarProgreso(`Cambiando estado...`, 30);
    
    try {
        const response = await fetch(`${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: ACTIONS.SET_ESTADO_PANEL,
                user_token: powerManageUserToken,
                session_token: sessionToken,
                panel_serial: panelSerial,
                state: estado,
                partition: 1,
                options: []
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        mostrarProgreso('Comando enviado', 70);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_message);
        }
        
        ocultarProgreso();
        
        Swal.fire({
            icon: 'success',
            title: 'Comando enviado',
            text: `Cambiando a ${estado === 'DISARM' ? 'Desarmado' : estado === 'HOME' ? 'Modo Casa' : 'Modo Ausente'}`,
            timer: 2000,
            showConfirmButton: false
        });
        
        setTimeout(() => {
            cargarEstadoPanel();
            cargarEventos();
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error cambiando estado:', error);
        ocultarProgreso();
        
        if (error.message === 'Wrong user token') {
            redirectToLogin();
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message
            });
        }
    }
}

function redirectToLogin() {
    localStorage.removeItem('powerManageToken');
    Swal.fire({
        icon: 'warning',
        title: 'Sesión expirada',
        text: 'Debes autenticarte nuevamente',
        confirmButtonText: 'IR A AUTENTICACIÓN'
    }).then(() => {
        window.location.href = `/usuarios/administrador/loginMonitoreo/loginMonitoreo.html?redirect=gestionarPanel&appId=${cuentaAppId}&panelSerial=${panelSerial}`;
    });
}

function iniciarAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => {
        if (sessionToken) {
            console.log('🔄 Auto-refresh eventos');
            cargarEventos();
        }
    }, AUTO_REFRESH_INTERVAL);
    
    console.log(`🔄 Auto-refresh cada ${AUTO_REFRESH_INTERVAL / 1000} segundos`);
}

function configurarEventos() {
    const btnDisarm = document.getElementById('btnDisarm');
    const btnHome = document.getElementById('btnHome');
    const btnAway = document.getElementById('btnAway');
    
    if (btnDisarm) btnDisarm.addEventListener('click', () => cambiarEstadoPanel('DISARM'));
    if (btnHome) btnHome.addEventListener('click', () => cambiarEstadoPanel('HOME'));
    if (btnAway) btnAway.addEventListener('click', () => cambiarEstadoPanel('AWAY'));
}

function configurarTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    console.log('🔧 Configurando tabs...');
    console.log('Botones encontrados:', tabBtns.length);
    console.log('Contenidos encontrados:', tabContents.length);
    
    // Asegurar que todos los tabs estén ocultos inicialmente
    tabContents.forEach(content => {
        content.style.display = 'none';
    });
    
    // Mostrar el primer tab (zonas)
    const zonasTab = document.getElementById('tab-zonas');
    if (zonasTab) {
        zonasTab.style.display = 'block';
        console.log('✅ Mostrando tab: zonas');
    }
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            console.log('📌 Click en tab:', tabId);
            
            // Cambiar clase activa en botones
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Ocultar todos los tabs
            tabContents.forEach(content => {
                content.style.display = 'none';
            });
            
            // Mostrar el tab seleccionado
            const targetTab = document.getElementById(`tab-${tabId}`);
            if (targetTab) {
                targetTab.style.display = 'block';
                console.log('✅ Mostrando tab:', tabId);
                
                // Si es el tab de eventos, recargar para asegurar que se vean
                if (tabId === 'eventos') {
                    cargarEventos();
                }
                // Si es el tab de dispositivos, recargar
                if (tabId === 'dispositivos') {
                    cargarDispositivos();
                }
            } else {
                console.error('❌ No se encontró el tab:', `tab-${tabId}`);
            }
        });
    });
}

function mostrarProgreso(mensaje, porcentaje) {
    const container = document.getElementById('progressContainer');
    const message = document.getElementById('progressMessage');
    const bar = document.getElementById('progressBar');
    
    if (!container) return;
    
    container.style.display = 'block';
    if (message) message.textContent = mensaje;
    if (bar) bar.style.width = `${porcentaje}%`;
}

function ocultarProgreso() {
    const container = document.getElementById('progressContainer');
    const bar = document.getElementById('progressBar');
    
    if (!container) return;
    
    setTimeout(() => {
        container.style.display = 'none';
        if (bar) bar.style.width = '0%';
    }, 500);
}

function escapeHTML(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}