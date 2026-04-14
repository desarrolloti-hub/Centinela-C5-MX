// ==================== IMPORTS ====================
import { CuentaPM } from '/clases/cuentaPM.js';
import { CLOUD_FUNCTION_BASE_URL } from '/config/urlCloudFunction.js';

// ==================== CONSTANTES ====================
const POWER_MANAGE_FUNCTION = 'proxyPowerManage';

// ==================== VARIABLES GLOBALES ====================
let cuentaPM = null;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof Swal === 'undefined') {
        console.error('❌ SweetAlert2 no está cargado.');
        return;
    }
    
    await initLoginMonitoreo();
});

async function initLoginMonitoreo() {
    // Obtener el valor directo de userOrganizacionCamelCase desde localStorage
    const orgCamelCase = localStorage.getItem('userOrganizacionCamelCase');
    
    console.log('🔍 userOrganizacionCamelCase desde localStorage:', orgCamelCase);
    
    if (!orgCamelCase) {
        Swal.fire({
            icon: 'warning',
            title: 'Organización no encontrada',
            text: 'No se encontró la organización del usuario. Por favor inicia sesión nuevamente.',
            confirmButtonText: 'VOLVER'
        }).then(() => {
            window.location.href = '../panelControl/panelControl.html';
        });
        return;
    }
    
    try {
        console.log('🏢 Buscando cuenta de monitoreo para organización:', orgCamelCase);
        
        // Buscar cuenta de monitoreo por organizacionCamelCase
        const cuentas = await CuentaPM.obtenerPorOrganizacion(orgCamelCase);
        
        console.log('📊 Cuentas encontradas:', cuentas.length);
        
        if (!cuentas || cuentas.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Cuenta de monitoreo no configurada',
                html: `
                    <div style="text-align: center;">
                        <p>La organización no tiene una cuenta de monitoreo Power Manage configurada.</p>
                        <p style="margin-top: 15px;">Para gestionar paneles, primero debes crear una cuenta de monitoreo.</p>
                    </div>
                `,
                confirmButtonText: 'CREAR CUENTA DE MONITOREO',
                showCancelButton: true,
                cancelButtonText: 'VOLVER'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = '../panelControl/panelControl.html';
                } else {
                    window.location.href = '../panelControl/panelControl.html';
                }
            });
            return;
        }
        
        // Tomar la primera cuenta (debería haber solo una por organización)
        cuentaPM = cuentas[0];
        const data = cuentaPM.toJSON();
        
        console.log('✅ Cuenta encontrada:', {
            email: data.email,
            appId: data.appId,
            status: data.status,
            organizacion: data.organizacion
        });
        
        // Verificar que la cuenta esté activa
        if (data.status !== 'activa') {
            Swal.fire({
                icon: 'warning',
                title: 'Cuenta no activa',
                html: `
                    <div style="text-align: center;">
                        <p>La cuenta de monitoreo está en estado <strong>${data.status}</strong>.</p>
                        <p style="margin-top: 15px;">Debes completar el registro para poder acceder a los paneles.</p>
                    </div>
                `,
                confirmButtonText: 'COMPLETAR REGISTRO'
            }).then(() => {
                window.location.href = `/usuarios/administrador/registroPM/registroPM.html?email=${data.email}`;
            });
            return;
        }
        
        // Mostrar información de la cuenta
        mostrarInfoCuenta(data);
        
        // Configurar eventos
        configurarEventos();
        
    } catch (error) {
        console.error('❌ Error inicializando:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message,
            confirmButtonText: 'VOLVER'
        }).then(() => {
            window.location.href = '../panelControl/panelControl.html';
        });
    }
}

function mostrarInfoCuenta(data) {
    // Verificar que los elementos existan antes de asignar
    const emailElement = document.getElementById('emailPowerManage');
    const estadoElement = document.getElementById('estado');
    
    if (emailElement) {
        emailElement.textContent = data.email;
    }
    
    if (estadoElement) {
        let statusClass = '';
        let statusText = '';
        
        switch(data.status) {
            case 'activa':
                statusClass = 'activa';
                statusText = 'Activa';
                break;
            case 'pendiente':
                statusClass = 'pendiente';
                statusText = 'Pendiente';
                break;
            case 'inactiva':
                statusClass = 'inactiva';
                statusText = 'Inactiva';
                break;
            default:
                statusClass = 'pendiente';
                statusText = data.status || 'Pendiente';
        }
        
        estadoElement.textContent = statusText;
        estadoElement.className = `status-badge ${statusClass}`;
    }
}

async function autenticarPowerManage(password) {
    if (!cuentaPM) {
        throw new Error('No hay cuenta de monitoreo seleccionada');
    }
    
    const email = cuentaPM.email;
    const appId = cuentaPM.appId;
    
    console.log('🔐 Autenticando en Power Manage:', { email, appId });
    
    mostrarProgreso('Autenticando en Power Manage...', 30);
    
    try {
        const url = `${CLOUD_FUNCTION_BASE_URL}${POWER_MANAGE_FUNCTION}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'autenticar',
                email: email,
                password: password,
                app_id: appId
            })
        });
        
        mostrarProgreso('Verificando credenciales...', 70);
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error_message || 'Error al autenticar');
        }
        
        // Guardar el user_token en localStorage
        const powerManageData = {
            user_token: result.user_token,
            email: email,
            app_id: appId,
            organizacionCamelCase: localStorage.getItem('userOrganizacionCamelCase'),
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('powerManageToken', JSON.stringify(powerManageData));
        console.log('💾 Token guardado en localStorage');
        
        mostrarProgreso('Autenticación exitosa', 100);
        
        setTimeout(() => {
            ocultarProgreso();
        }, 500);
        
        return true;
        
    } catch (error) {
        console.error('❌ Error en autenticación:', error);
        throw error;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const password = document.getElementById('password').value.trim();
    
    if (!password) {
        Swal.fire({
            icon: 'warning',
            title: 'Contraseña requerida',
            text: 'Ingresa la contraseña de tu cuenta Power Manage',
            confirmButtonText: 'ENTENDIDO'
        });
        return;
    }
    
    const btnLogin = document.getElementById('btnLogin');
    const originalText = btnLogin.innerHTML;
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AUTENTICANDO...';
    
    try {
        await autenticarPowerManage(password);
        
        await Swal.fire({
            icon: 'success',
            title: '¡Autenticación exitosa!',
            text: 'Redirigiendo a la lista de paneles...',
            timer: 2000,
            showConfirmButton: false
        });
        
        // Redirigir a la lista de paneles
        window.location.href = `../listarPaneles/listarPaneles.html?appId=${cuentaPM.appId}`;
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        
        Swal.fire({
            icon: 'error',
            title: 'Error de autenticación',
            text: error.message || 'No se pudo autenticar en Power Manage. Verifica tu contraseña.',
            confirmButtonText: 'REINTENTAR'
        });
        
        btnLogin.disabled = false;
        btnLogin.innerHTML = originalText;
        
        // Limpiar campo de contraseña
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
    }
}

function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.getElementById('togglePassword');
    const icon = toggleBtn.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function configurarEventos() {
    const form = document.getElementById('loginForm');
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (form) form.addEventListener('submit', handleLogin);
    if (toggleBtn) toggleBtn.addEventListener('click', togglePasswordVisibility);
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin(e);
            }
        });
    }
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