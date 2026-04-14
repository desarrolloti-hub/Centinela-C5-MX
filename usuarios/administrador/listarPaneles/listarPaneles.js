// ==================== IMPORTS ====================
import { CuentaPM } from '/clases/cuentaPM.js';
import { CLOUD_FUNCTION_BASE_URL } from '/config/urlCloudFunction.js';

// ==================== CONSTANTES ====================
const POWER_MANAGE_FUNCTION = 'proxyPowerManage';

// ==================== VARIABLES GLOBALES ====================
let cuentaAppId = null;
let cuentaData = null;
let powerManageUserToken = null;
let paneles = [];
let panelesSeleccionados = new Set(); // Set para almacenar serials seleccionados

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Swal === 'undefined') {
        console.error('❌ SweetAlert2 no está cargado.');
        return;
    }
    
    await initListaPaneles();
});

async function initListaPaneles() {
    const urlParams = new URLSearchParams(window.location.search);
    cuentaAppId = urlParams.get('appId') || urlParams.get('id');
    
    if (!cuentaAppId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se especificó la cuenta de monitoreo',
            confirmButtonText: 'VOLVER'
        }).then(() => {
            window.location.href = '/usuarios/administrador/cuentasPM/cuentasPM.html';
        });
        return;
    }
    
    try {
        await cargarCuenta();
        
        const powerManageStr = localStorage.getItem('powerManageToken');
        
        if (!powerManageStr) {
            console.warn('⚠️ No hay token de Power Manage en localStorage');
            redirectToLogin('No hay sesión activa de Power Manage');
            return;
        }
        
        const powerManageData = JSON.parse(powerManageStr);
        powerManageUserToken = powerManageData.user_token;
        
        console.log('✅ Token Power Manage cargado');
        
        if (!powerManageUserToken || powerManageUserToken === 'undefined') {
            console.warn('⚠️ Token inválido');
            redirectToLogin('Token de autenticación inválido');
            return;
        }
        
        await cargarPanelesPowerManage();
        
        configurarEventos();
        
    } catch (error) {
        console.error('❌ Error inicializando:', error);
        
        if (error.message === 'Wrong user token' || error.message.includes('401') || error.message.includes('token')) {
            redirectToLogin('La sesión de monitoreo ha expirado');
        } else {
            mostrarError(error.message);
        }
    }
}

function redirectToLogin(mensaje) {
    localStorage.removeItem('powerManageToken');
    
    Swal.fire({
        icon: 'warning',
        title: 'Sesión expirada',
        text: mensaje || 'Debes autenticarte nuevamente con tu cuenta de monitoreo',
        confirmButtonText: 'IR A AUTENTICACIÓN'
    }).then(() => {
        window.location.href = `/usuarios/administrador/loginMonitoreo/loginMonitoreo.html?redirect=listarPaneles&appId=${cuentaAppId}`;
    });
}

async function cargarCuenta() {
    const cuenta = await CuentaPM.obtenerPorAppId(cuentaAppId);
    if (!cuenta) throw new Error('Cuenta no encontrada');
    
    cuentaData = cuenta.toJSON();
    
    document.getElementById('cuentaEmail').textContent = cuentaData.email;
    document.getElementById('cuentaAppId').textContent = cuentaData.appId;
    document.getElementById('cuentaEmailInfo').textContent = cuentaData.email;
    document.getElementById('cuentaAppIdInfo').textContent = cuentaData.appId;
    document.getElementById('cuentaOrganizacion').textContent = cuentaData.organizacion || 'No asignada';
}

async function cargarPanelesPowerManage() {
    const panelesGrid = document.getElementById('panelesGrid');
    
    panelesGrid.innerHTML = `
        <div class="loading-paneles">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Cargando paneles...</span>
        </div>
    `;
    
    try {
        const url = `${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'listarPaneles',
                user_token: powerManageUserToken
            })
        });
        
        if (response.status === 401) {
            throw new Error('Wrong user token');
        }
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_message || 'Error al obtener paneles');
        }
        
        paneles = await response.json();
        
        console.log('📊 Paneles obtenidos:', paneles.length);
        
        document.getElementById('totalPaneles').textContent = paneles.length;
        
        renderizarListaPaneles();
        
    } catch (error) {
        console.error('❌ Error cargando paneles:', error);
        
        if (error.message === 'Wrong user token') {
            redirectToLogin('La sesión de monitoreo ha expirado');
            return;
        }
        
        panelesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error al cargar paneles</p>
                <small>${error.message}</small>
                <button class="btn-refresh" id="btnRetry" style="margin-top: 1rem;">
                    <i class="fas fa-sync-alt"></i> Reintentar
                </button>
            </div>
        `;
        
        const btnRetry = document.getElementById('btnRetry');
        if (btnRetry) {
            btnRetry.addEventListener('click', () => {
                cargarPanelesPowerManage();
            });
        }
    }
}

function renderizarListaPaneles() {
    const panelesGrid = document.getElementById('panelesGrid');
    
    if (!paneles || paneles.length === 0) {
        panelesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tachometer-alt"></i>
                <p>No hay paneles vinculados en Power Manage</p>
                <small>Usa el botón "Vincular Nuevo Panel" para agregar uno</small>
            </div>
        `;
        return;
    }
    
    panelesGrid.innerHTML = paneles.map(panel => {
        let nombreMostrar = panel.alias;
        if (!nombreMostrar || nombreMostrar === '') {
            nombreMostrar = panel.panel_model || panel.type || `Panel ${panel.panel_serial.substring(0, 8)}`;
        }
        
        const isSelected = panelesSeleccionados.has(panel.panel_serial);
        
        return `
            <div class="panel-card ${isSelected ? 'selected' : ''}" data-serial="${panel.panel_serial}">
                <div class="panel-checkbox">
                    <input type="checkbox" class="panel-select" data-serial="${panel.panel_serial}" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="panel-content">
                    <div class="panel-card-header">
                        <i class="fas fa-microchip"></i>
                        <h4>${escapeHTML(nombreMostrar)}</h4>
                        <span class="status-badge">Activo</span>
                    </div>
                    <div class="panel-details">
                        <div class="panel-detail">
                            <span class="label">Serial:</span>
                            <span class="value">${escapeHTML(panel.panel_serial)}</span>
                        </div>
                        <div class="panel-detail">
                            <span class="label">Modelo:</span>
                            <span class="value">${escapeHTML(panel.panel_model || 'Desconocido')}</span>
                        </div>
                        <div class="panel-detail">
                            <span class="label">Tipo:</span>
                            <span class="value">${escapeHTML(panel.type || 'No especificado')}</span>
                        </div>
                        <div class="panel-detail">
                            <span class="label">Rol:</span>
                            <span class="value">${escapeHTML(panel.role || 'USER')}</span>
                        </div>
                    </div>
                    <div class="panel-actions">
                        <button class="btn-edit-alias" data-serial="${panel.panel_serial}" data-alias="${escapeHTML(panel.alias || '')}">
                            <i class="fas fa-edit"></i> Editar alias
                        </button>
                        <button class="btn-gestionar" data-serial="${panel.panel_serial}">
                            <i class="fas fa-chart-line"></i> Gestionar
                        </button>
                        <button class="btn-eliminar" data-serial="${panel.panel_serial}">
                            <i class="fas fa-trash"></i> Desvincular
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Eventos para checkboxes
    document.querySelectorAll('.panel-select').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            const serial = checkbox.getAttribute('data-serial');
            if (checkbox.checked) {
                panelesSeleccionados.add(serial);
                const card = document.querySelector(`.panel-card[data-serial="${serial}"]`);
                if (card) card.classList.add('selected');
            } else {
                panelesSeleccionados.delete(serial);
                const card = document.querySelector(`.panel-card[data-serial="${serial}"]`);
                if (card) card.classList.remove('selected');
            }
            actualizarContadorSeleccionados();
            mostrarOcultarBotonMonitorear();
        });
    });
    
    // Evento para seleccionar tarjeta completa
    document.querySelectorAll('.panel-card').forEach(card => {
        const checkbox = card.querySelector('.panel-select');
        card.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                const event = new Event('change');
                checkbox.dispatchEvent(event);
            }
        });
    });
    
    // Eventos para botones (se mantienen igual)
    document.querySelectorAll('.btn-edit-alias').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const serial = btn.getAttribute('data-serial');
            const alias = btn.getAttribute('data-alias');
            editarAliasPanel(serial, alias);
        });
    });
    
    document.querySelectorAll('.btn-gestionar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const serial = btn.getAttribute('data-serial');
            gestionarPanelUnico(serial); // Función original para un solo panel
        });
    });
    
    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const serial = btn.getAttribute('data-serial');
            eliminarPanel(serial);
        });
    });
    
    actualizarContadorSeleccionados();
    mostrarOcultarBotonMonitorear();
}

function actualizarContadorSeleccionados() {
    const count = panelesSeleccionados.size;
    const selectedCountElement = document.getElementById('selectedCount');
    if (selectedCountElement) {
        selectedCountElement.textContent = count;
    }
}

function mostrarOcultarBotonMonitorear() {
    const btnMonitorear = document.getElementById('btnMonitorSelected');
    if (btnMonitorear) {
        if (panelesSeleccionados.size > 0) {
            btnMonitorear.style.display = 'flex';
        } else {
            btnMonitorear.style.display = 'none';
        }
    }
}

// ==================== GESTIONAR PANEL ÚNICO (Original - se mantiene igual) ====================
async function gestionarPanelUnico(serial) {
    const panel = paneles.find(p => p.panel_serial === serial);
    
    if (!panel) {
        mostrarError('Panel no encontrado');
        return;
    }
    
    let nombreMostrar = panel.alias;
    if (!nombreMostrar || nombreMostrar === '') {
        nombreMostrar = panel.panel_model || panel.type || `Panel ${serial.substring(0, 8)}`;
    }
    
    const panelSeleccionado = {
        serial: panel.panel_serial,
        alias: panel.alias || '',
        modelo: panel.panel_model || 'Desconocido',
        tipo: panel.type || 'No especificado',
        role: panel.role || 'USER',
        nombreMostrar: nombreMostrar
    };
    
    localStorage.setItem('panelSeleccionado', JSON.stringify(panelSeleccionado));
    
    window.location.href = `../gestionarPanel/gestionarPanel.html?appId=${cuentaAppId}&panelSerial=${serial}`;
}

// ==================== MONITOREAR MÚLTIPLES PANELES (NUEVO) ====================
async function monitorearPanelesSeleccionados() {
    const panelesAMonitorear = paneles.filter(p => panelesSeleccionados.has(p.panel_serial));
    
    if (panelesAMonitorear.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin selección',
            text: 'Selecciona al menos un panel usando los checkboxes',
            confirmButtonText: 'ENTENDIDO'
        });
        return;
    }
    
    // Solicitar código de usuario (el mismo para todos los paneles)
    const { value: userCode, isConfirmed } = await Swal.fire({
        title: 'Código de acceso',
        html: `
            <div style="text-align: left;">
                <p>Se monitorearán <strong>${panelesAMonitorear.length}</strong> panel(es):</p>
                <ul style="color: #00ffff; margin: 10px 0 10px 20px;">
                    ${panelesAMonitorear.map(p => `<li>${p.alias || p.panel_model || p.panel_serial}</li>`).join('')}
                </ul>
                <p>Ingresa el código de usuario (el mismo para todos):</p>
            </div>
        `,
        input: 'password',
        inputLabel: 'Código de usuario',
        inputPlaceholder: 'Ej: 1234',
        inputAttributes: {
            maxlength: '8',
            inputmode: 'numeric',
            pattern: '[0-9]*'
        },
        showCancelButton: true,
        confirmButtonText: 'MONITOREAR',
        cancelButtonText: 'CANCELAR',
        inputValidator: (value) => {
            if (!value) return 'El código de usuario es requerido';
            if (!/^\d{4,8}$/.test(value)) return 'El código debe tener entre 4 y 8 dígitos';
            return null;
        }
    });
    
    if (!isConfirmed || !userCode) return;
    
    mostrarProgreso('Conectando a los paneles...', 10);
    
    let exitosos = 0;
    let fallidos = 0;
    const errores = [];
    const panelesConSesion = [];
    
    for (let i = 0; i < panelesAMonitorear.length; i++) {
        const panel = panelesAMonitorear[i];
        const progreso = 10 + Math.floor((i / panelesAMonitorear.length) * 80);
        mostrarProgreso(`Conectando a ${panel.alias || panel.panel_serial}...`, progreso);
        
        try {
            const sessionToken = await loginToPanel(panel.panel_serial, userCode);
            
            if (sessionToken) {
                const nombreMostrar = panel.alias || panel.panel_model || `Panel ${panel.panel_serial.substring(0, 8)}`;
                
                panelesConSesion.push({
                    serial: panel.panel_serial,
                    alias: panel.alias || '',
                    modelo: panel.panel_model || 'Desconocido',
                    tipo: panel.type || 'No especificado',
                    nombreMostrar: nombreMostrar,
                    session_token: sessionToken
                });
                exitosos++;
            } else {
                fallidos++;
                errores.push(`${panel.alias || panel.panel_serial}: Sin sesión`);
            }
        } catch (error) {
            fallidos++;
            errores.push(`${panel.alias || panel.panel_serial}: ${error.message}`);
        }
    }
    
    ocultarProgreso();
    
    if (exitosos === 0) {
        Swal.fire({
            icon: 'error',
            title: 'Error de conexión',
            text: `No se pudo conectar a ningún panel.\n${errores.join('\n')}`,
            confirmButtonText: 'ACEPTAR'
        });
        return;
    }
    
    // Guardar en sessionStorage
    sessionStorage.setItem('panelesMonitoreo', JSON.stringify(panelesConSesion));
    console.log('💾 Guardados en sessionStorage:', panelesConSesion.length, 'paneles');
    
    let mensaje = `✅ ${exitosos} panel(es) conectado(s) correctamente`;
    if (fallidos > 0) mensaje += `\n⚠️ ${fallidos} panel(es) fallaron:\n${errores.join('\n')}`;
    
    Swal.fire({
        icon: 'success',
        title: 'Paneles conectados',
        text: mensaje,
        confirmButtonText: 'VER MONITOREO'
    }).then(() => {
        window.location.href = `../monitoreoPanel/monitoreoPanel.html?appId=${cuentaAppId}`;
    });
}

// ==================== FUNCIÓN COMÚN DE LOGIN ====================
async function loginToPanel(panelSerial, userCode) {
    const url = `${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'loginPanel',
            user_token: powerManageUserToken,
            panel_data: {
                panel_serial: panelSerial,
                user_code: userCode,
                app_id: cuentaAppId,
                app_type: 'com.visonic.neogo'
            }
        })
    });
    
    if (response.status === 401) throw new Error('Wrong user token');
    
    if (!response.ok) {
        const error = await response.json();
        if (error.error_reason_code === 'WrongCombination') throw new Error('Código incorrecto');
        if (error.error_reason_code === 'UserIsDeactivatedOnPanel') throw new Error('Usuario desactivado');
        throw new Error(error.error_message || 'Error de conexión');
    }
    
    const data = await response.json();
    return data.session_token;
}

// ==================== OTRAS FUNCIONES (sin cambios) ====================
async function editarAliasPanel(serial, aliasActual) {
    const { value: nuevoAlias } = await Swal.fire({
        title: 'Editar alias del panel',
        html: `
            <div style="text-align: left;">
                <p><strong>Panel:</strong> ${escapeHTML(serial)}</p>
                <p>Ingresa un nombre descriptivo:</p>
            </div>
        `,
        input: 'text',
        inputLabel: 'Alias',
        inputValue: aliasActual || '',
        inputPlaceholder: 'Ej: Casa Principal',
        showCancelButton: true,
        confirmButtonText: 'GUARDAR',
        cancelButtonText: 'CANCELAR',
        inputValidator: (value) => {
            if (!value || value.trim() === '') return 'El alias no puede estar vacío';
            if (value.length > 50) return 'Máximo 50 caracteres';
            return null;
        }
    });
    
    if (!nuevoAlias) return;
    
    mostrarProgreso('Guardando alias...', 30);
    
    try {
        const url = `${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'renamePanel',
                user_token: powerManageUserToken,
                panel_serial: serial,
                alias: nuevoAlias.trim()
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        mostrarProgreso('Procesando...', 70);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_message || 'Error al cambiar el alias');
        }
        
        ocultarProgreso();
        
        Swal.fire({
            icon: 'success',
            title: 'Alias actualizado',
            text: `El panel ahora se llama: ${nuevoAlias}`,
            timer: 2000,
            showConfirmButton: false
        });
        
        const panelIndex = paneles.findIndex(p => p.panel_serial === serial);
        if (panelIndex !== -1) {
            paneles[panelIndex].alias = nuevoAlias;
        }
        
        renderizarListaPaneles();
        
    } catch (error) {
        console.error('❌ Error cambiando alias:', error);
        ocultarProgreso();
        
        if (error.message === 'Wrong user token') {
            redirectToLogin('La sesión de monitoreo ha expirado');
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'No se pudo cambiar el alias'
            });
        }
    }
}

async function eliminarPanel(serial) {
    const confirm = await Swal.fire({
        title: '¿Desvincular panel?',
        text: `¿Eliminar "${serial}" de tu cuenta?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'SÍ, DESVINCULAR',
        cancelButtonText: 'CANCELAR'
    });
    
    if (!confirm.isConfirmed) return;
    
    mostrarProgreso('Desvinculando...', 50);
    
    try {
        const url = `${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'unlinkPanel',
                user_token: powerManageUserToken,
                panel_serial: serial
            })
        });
        
        if (response.status === 401) throw new Error('Wrong user token');
        
        ocultarProgreso();
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error_message || 'Error');
        }
        
        panelesSeleccionados.delete(serial);
        
        Swal.fire({ icon: 'success', title: 'Panel desvinculado', timer: 1500, showConfirmButton: false });
        
        await cargarPanelesPowerManage();
        
    } catch (error) {
        ocultarProgreso();
        if (error.message === 'Wrong user token') redirectToLogin();
        else Swal.fire({ icon: 'error', title: 'Error', text: error.message });
    }
}

function configurarEventos() {
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', async () => {
            await cargarPanelesPowerManage();
        });
    }
    
    const btnVincularNuevo = document.getElementById('btnVincularNuevo');
    if (btnVincularNuevo) {
        btnVincularNuevo.addEventListener('click', () => {
            window.location.href = `enlaceCuentaPaneles.html?appId=${cuentaAppId}`;
        });
    }
    
    const btnSelectAll = document.getElementById('btnSelectAll');
    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            paneles.forEach(panel => panelesSeleccionados.add(panel.panel_serial));
            renderizarListaPaneles();
        });
    }
    
    const btnDeselectAll = document.getElementById('btnDeselectAll');
    if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
            panelesSeleccionados.clear();
            renderizarListaPaneles();
        });
    }
    
    const btnMonitorSelected = document.getElementById('btnMonitorSelected');
    if (btnMonitorSelected) {
        btnMonitorSelected.addEventListener('click', monitorearPanelesSeleccionados);
    }
}

function mostrarProgreso(mensaje, porcentaje) {
    let container = document.getElementById('progressContainer');
    if (!container) {
        const panelesSection = document.querySelector('.paneles-section');
        if (panelesSection) {
            const div = document.createElement('div');
            div.id = 'progressContainer';
            div.style.display = 'none';
            div.innerHTML = `
                <div class="progress-info">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span id="progressMessage">Procesando...</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" id="progressBar" style="width: 0%"></div>
                </div>
            `;
            panelesSection.insertAdjacentElement('afterend', div);
            container = document.getElementById('progressContainer');
        }
    }
    
    if (!container) return;
    
    const message = document.getElementById('progressMessage');
    const bar = document.getElementById('progressBar');
    
    container.style.display = 'block';
    if (message) message.textContent = mensaje;
    if (bar) bar.style.width = `${porcentaje}%`;
}

function ocultarProgreso() {
    const container = document.getElementById('progressContainer');
    if (!container) return;
    
    setTimeout(() => {
        container.style.display = 'none';
        const bar = document.getElementById('progressBar');
        if (bar) bar.style.width = '0%';
    }, 500);
}

function mostrarError(mensaje) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: mensaje
    });
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