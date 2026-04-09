// login.js - Sistema completo de inicio de sesión
// Maneja autenticación, almacenamiento de sesión y redirección
// ===============================================================

// IMPORTACIÓN DE MÓDULOS
import { UserManager } from '/clases/user.js';
import { fcmInitializer } from '/components/fcm-initializer.js';

// FUNCIÓN AUXILIAR: Convertir texto a camelCase
function toCamelCase(text) {
    if (!text || typeof text !== 'string') return '';

    return text
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^(.)/, (match) => match.toLowerCase());
}

// FUNCIÓN: Obtener valores CSS de las variables personalizadas
function getCSSVariable(variableName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(variableName)
        .trim();
}

// FUNCIÓN: Configurar estilos base de SweetAlert según variables CSS
function configurarSweetAlertEstilos() {
    const colors = {
        primary: getCSSVariable('--color-text-primary') || '#ffffff',
        secondary: getCSSVariable('--color-text-secondary') || 'rgba(255, 255, 255, 0.8)',
        accentPrimary: getCSSVariable('--color-accent-primary') || '#c0c0c0',
        accentSecondary: getCSSVariable('--color-accent-secondary') || '#ffffff',
        bgPrimary: getCSSVariable('--color-bg-primary') || '#000000',
        bgSecondary: getCSSVariable('--color-bg-secondary') || '#00000000',
        bgTertiary: getCSSVariable('--color-bg-tertiary') || '#0000007a',
        bgLight: getCSSVariable('--color-bg-light') || '#ffffff',
        borderLight: getCSSVariable('--color-border-light') || 'rgba(255, 255, 255, 0.1)',
        textDark: getCSSVariable('--color-text-dark') || '#000000',
        hover: getCSSVariable('--color-hover') || 'rgba(245, 215, 66, 0)',
        active: getCSSVariable('--color-active') || '#c0c0c0'
    };

    return {
        colors: colors,
        fontFamily: getCSSVariable('--font-family-primary') || "'Orbitron', sans-serif",
        borderRadius: getCSSVariable('--border-radius-medium') || '8px',
        transition: getCSSVariable('--transition-default') || 'all 0.3s ease-in-out'
    };
}

// 🔥 NUEVA FUNCIÓN: Detectar si estamos en producción (HTTPS) o local
function isProduction() {
    return window.location.protocol === 'https:' ||
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';
}

// INICIALIZACIÓN PRINCIPAL - Se ejecuta cuando el DOM está completamente cargado
document.addEventListener('DOMContentLoaded', function () {
    const estilos = configurarSweetAlertEstilos();
    const entorno = isProduction() ? 'PRODUCCIÓN' : 'DESARROLLO';
    // console.log(`🌐 Entorno detectado: ${entorno} (${window.location.protocol}//${window.location.hostname})`); // COMENTADO

    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    const loginMessage = document.getElementById('loginMessage');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const forgotPasswordLink = document.getElementById('forgotPassword');
    const registerBtn = document.getElementById('registerBtn');

    if (!loginForm || !emailInput || !passwordInput) {
        console.error('Elementos del formulario no encontrados');
        mostrarSweetAlertErrorCritico('Error de Configuración',
            'El formulario de login no está configurado correctamente.', estilos);
        return;
    }

    let userManager;
    try {
        userManager = new UserManager();
    } catch (error) {
        console.error('Error al crear UserManager:', error);
        mostrarSweetAlertErrorCritico('Sistema No Disponible',
            'Error al inicializar el sistema de autenticación.', estilos);
        return;
    }

    // FUNCIÓN: Mostrar SweetAlert para error crítico
    function mostrarSweetAlertErrorCritico(titulo, mensaje, estilos) {
        Swal.fire({
            title: titulo,
            html: `
                <div>
                    <p>${mensaje}</p>
                    <p><strong>Recomendación:</strong></p>
                    <ul>
                        <li>Recarga la página</li>
                        <li>Verifica tu conexión a internet</li>
                        <li>Contacta al administrador si el problema persiste</li>
                    </ul>
                </div>
            `,
            confirmButtonText: 'Recargar Página',
            allowOutsideClick: false
        }).then(() => {
            location.reload();
        });
    }

    function clearMessage() {
        if (loginMessage) {
            loginMessage.innerHTML = '';
            loginMessage.style.display = 'none';
        }
    }

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    function toggleButtonState(enabled = true, text = null) {
        if (!loginSubmitBtn) return;

        if (enabled) {
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> INICIAR SESIÓN';
            loginSubmitBtn.style.opacity = '1';
            loginSubmitBtn.style.cursor = 'pointer';
        } else {
            loginSubmitBtn.disabled = true;
            loginSubmitBtn.innerHTML = text || '<i class="fas fa-spinner fa-spin"></i> PROCESANDO...';
            loginSubmitBtn.style.opacity = '0.7';
            loginSubmitBtn.style.cursor = 'not-allowed';
        }
    }

    // ===============================================================
    // 🔥 FUNCIÓN CORREGIDA - Guarda usuario en localStorage con área, cargo y PLAN
    // ===============================================================
    function saveUserToLocalStorage(user) {
        try {
            const organizacionCamelCase = toCamelCase(user.organizacion);

            // ✅ EXTRAER FOTOS DE TODAS LAS POSIBLES UBICACIONES
            let fotoUsuario = null;
            let fotoOrganizacion = null;

            // Buscar foto de usuario en TODAS las propiedades posibles
            if (user.fotoUsuario) fotoUsuario = user.fotoUsuario;
            else if (user.fotoURL) fotoUsuario = user.fotoURL;
            else if (user.foto) fotoUsuario = user.foto;
            else if (user.photoURL) fotoUsuario = user.photoURL;
            else if (user.avatar) fotoUsuario = user.avatar;
            else if (user.imagenPerfil) fotoUsuario = user.imagenPerfil;

            // Buscar foto de organización en TODAS las propiedades posibles
            if (user.fotoOrganizacion) fotoOrganizacion = user.fotoOrganizacion;
            else if (user.logoOrganizacion) fotoOrganizacion = user.logoOrganizacion;
            else if (user.logo) fotoOrganizacion = user.logo;
            else if (user.organizacionLogo) fotoOrganizacion = user.organizacionLogo;
            else if (user.logoUrl) fotoOrganizacion = user.logoUrl;

            // ✅ ✅ ✅ NUEVO: OBTENER EL PLAN DEL USUARIO
            // El plan puede venir en user.plan (ID del documento en colección 'planes')
            const planId = user.plan || user.planId || null;
            // console.log(`📋 Plan del usuario: ${planId || 'No asignado'}`); // COMENTADO

            // ✅ GUARDAR TODOS LOS DATOS DEL USUARIO INCLUYENDO ÁREA, CARGO, PLAN Y SUCURSAL
            const userData = {
                id: user.id,
                email: user.email || user.correoElectronico,
                correoElectronico: user.email || user.correoElectronico,
                nombreCompleto: user.nombreCompleto,
                nombre: user.nombreCompleto,
                rol: user.rol,

                // ✅ GUARDAR ORGANIZACIÓN
                organizacion: user.organizacion,
                organizacionCamelCase: organizacionCamelCase,

                // ✅ GUARDAR ÁREA Y CARGO (SEGÚN LA CLASE USER)
                areaAsignadaId: user.areaAsignadaId || '',
                cargoId: user.cargoId || '',

                // ✅ ✅ ✅ NUEVO: GUARDAR SUCURSAL ASIGNADA
                sucursalAsignadaId: user.sucursalAsignadaId || '',
                sucursalAsignadaNombre: user.sucursalAsignadaNombre || '',
                sucursalAsignadaCiudad: user.sucursalAsignadaCiudad || '',

                // ✅ GUARDAR EL PLAN (ID del documento en colección 'planes')
                plan: planId,
                planId: planId, // Por compatibilidad

                // ✅ GUARDAR ESTADO
                status: user.status,
                verificado: user.verificado,

                // ✅ GUARDAR IMÁGENES
                fotoUsuario: fotoUsuario || '',
                fotoOrganizacion: fotoOrganizacion || '',

                // ✅ METADATOS DE SESIÓN
                ultimoAcceso: new Date().toISOString(),
                sessionStart: new Date().toISOString(),
                fechaLogin: new Date().toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            };

            // Guardar en localStorage
            localStorage.setItem('userData', JSON.stringify(userData));

            // ✅ También guardar en localStorage individualmente para fácil acceso
            if (user.sucursalAsignadaId) {
                localStorage.setItem('userSucursalId', user.sucursalAsignadaId);
            }
            if (user.sucursalAsignadaNombre) {
                localStorage.setItem('userSucursalNombre', user.sucursalAsignadaNombre);
            }
            if (user.areaAsignadaId) {
                localStorage.setItem('userAreaId', user.areaAsignadaId);
            }
            if (user.cargoId) {
                localStorage.setItem('userCargoId', user.cargoId);
            }
            if (user.nombreCompleto) {
                localStorage.setItem('userNombre', user.nombreCompleto);
            }
            if (user.email || user.correoElectronico) {
                localStorage.setItem('userEmail', user.email || user.correoElectronico);
            }
            if (user.rol) {
                localStorage.setItem('userRole', user.rol);
            }
            if (organizacionCamelCase) {
                localStorage.setItem('userOrganizacionCamelCase', organizacionCamelCase);
            }
            if (user.organizacion) {
                localStorage.setItem('userOrganizacion', user.organizacion);
            }
            if (planId) {
                localStorage.setItem('userPlan', planId);
            }
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userRole', user.rol);
            localStorage.setItem('userOrganizacion', user.organizacion);
            localStorage.setItem('userOrganizacionCamelCase', organizacionCamelCase);
            localStorage.setItem('userNombre', user.nombreCompleto);
            localStorage.setItem('userEmail', user.email || user.correoElectronico || '');

            // ✅ ✅ ✅ NUEVO: Guardar el plan en localStorage para acceso rápido
            if (planId) {
                localStorage.setItem('userPlan', planId);
                localStorage.setItem('plan', planId); // Por compatibilidad con navbar
                // console.log(`✅ Plan guardado en localStorage: ${planId}`); // COMENTADO
            } else {
                localStorage.removeItem('userPlan');
                localStorage.removeItem('plan');
                // console.log('⚠️ No se encontró plan para este usuario'); // COMENTADO
            }

            // Guardar fotos si existen
            if (fotoUsuario) {
                localStorage.setItem('userFoto', fotoUsuario);
            } else {
                localStorage.removeItem('userFoto');
            }

            if (fotoOrganizacion) {
                localStorage.setItem('organizacionLogo', fotoOrganizacion);
            } else {
                localStorage.removeItem('organizacionLogo');
            }

            // console.log('✅ Usuario guardado en localStorage:', { // COMENTADO
            //     nombre: user.nombreCompleto,
            //     areaAsignadaId: user.areaAsignadaId || 'NO ASIGNADA',
            //     cargoId: user.cargoId || 'NO ASIGNADO',
            //     rol: user.rol,
            //     plan: planId || 'NO ASIGNADO'
            // });

            return true;
        } catch (error) {
            console.error('❌ Error al guardar en localStorage:', error);
            return false;
        }
    }

    // ===============================================================
    // FUNCIÓN MEJORADA - Guardar en sessionStorage con área, cargo y PLAN
    // ===============================================================
    function saveUserToSessionStorage(user) {
        try {
            const organizacionCamelCase = toCamelCase(user.organizacion);

            // ✅ ✅ ✅ OBTENER EL PLAN
            const planId = user.plan || user.planId || null;

            const sessionData = {
                id: user.id,
                email: user.email,
                correoElectronico: user.email,
                nombreCompleto: user.nombreCompleto,
                nombre: user.nombreCompleto,
                rol: user.rol,
                organizacion: user.organizacion,
                organizacionCamelCase: organizacionCamelCase,

                //  GUARDAR ÁREA Y CARGO EN SESSION TAMBIÉN
                areaAsignadaId: user.areaAsignadaId || '',
                cargoId: user.cargoId || '',

                // NUEVO: GUARDAR PLAN EN SESSION TAMBIÉN
                plan: planId,
                planId: planId,

                sessionId: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                sessionStart: new Date().toISOString(),
                sessionStartFormatted: new Date().toLocaleTimeString('es-ES'),
                token: 'auth_token_' + Date.now(),
                userAgent: navigator.userAgent,
                screenResolution: `${window.screen.width}x${window.screen.height}`
            };

            sessionStorage.setItem('currentSession', JSON.stringify(sessionData));
            sessionStorage.setItem('isAuthenticated', 'true');
            sessionStorage.setItem('sessionStart', new Date().toISOString());
            sessionStorage.setItem('sessionOrganizacion', user.organizacion);
            sessionStorage.setItem('sessionOrganizacionCamelCase', organizacionCamelCase);
            sessionStorage.setItem('sessionUser', user.nombreCompleto);
            sessionStorage.setItem('sessionRole', user.rol);

            // Guardar plan en sessionStorage
            if (planId) {
                sessionStorage.setItem('sessionPlan', planId);
            }

            return true;
        } catch (error) {
            console.error('Error al guardar en sessionStorage:', error);
            return false;
        }
    }

    function checkExistingSession() {
        try {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            const hasSession = sessionStorage.getItem('isAuthenticated') === 'true';

            if (isLoggedIn && hasSession) {
                const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                const sessionData = JSON.parse(sessionStorage.getItem('currentSession') || '{}');

                // console.log('Sesión existente encontrada:', { // COMENTADO
                //     usuario: userData.nombreCompleto,
                //     organizacion: userData.organizacion,
                //     rol: userData.rol,
                //     areaAsignadaId: userData.areaAsignadaId || 'NO ASIGNADA',
                //     cargoId: userData.cargoId || 'NO ASIGNADO',
                //     plan: userData.plan || 'NO ASIGNADO',
                //     tieneFotoUsuario: !!userData.fotoUsuario,
                //     tieneFotoOrganizacion: !!userData.fotoOrganizacion
                // });
            }

            return false;
        } catch (error) {
            console.error('Error al verificar sesión:', error);
            return false;
        }
    }

    function logOrganizationInfo(organizacion, organizacionCamelCase) {
        // console.log('INFORMACIÓN DE ORGANIZACIÓN:', organizacion, organizacionCamelCase); // COMENTADO
    }

    // FUNCIÓN: Mostrar SweetAlert2 de éxito en login
    function mostrarSweetAlertExito(user) {
        const organizacionCamelCase = toCamelCase(user.organizacion);
        const planId = user.plan || user.planId || 'No asignado';

        Swal.fire({
            title: '¡Bienvenido!',
            html: `
                <div style="text-align: center;">
                    <h3> Bienvenido: ${user.nombreCompleto}</h3>
                    <p>Sesión iniciada correctamente</p>
                </div>
            `,
            showConfirmButton: false,
            timer: 2500,
            timerProgressBar: true
        });
    }

    // FUNCIÓN: Mostrar SweetAlert2 para correo inválido
    function mostrarSweetAlertCorreoInvalido() {
        Swal.fire({
            title: 'Correo Inválido',
            html: `
                <div>
                    <p>El formato del correo electrónico no es válido.</p>
                    <p><strong>Formato correcto:</strong> usuario@dominio.com</p>
                    <p><i class="fas fa-check-circle"></i> Válido: usuario@empresa.com</p>
                    <p><i class="fas fa-times-circle"></i> Inválido: usuario@dominio</p>
                </div>
            `,
            confirmButtonText: 'Corregir'
        }).then(() => {
            emailInput.focus();
            emailInput.select();
        });
    }

    // FUNCIÓN: Mostrar SweetAlert2 para contraseña incorrecta
    function mostrarSweetAlertContraseñaIncorrecta() {
        Swal.fire({
            title: 'Contraseña Incorrecta',
            html: `
                <div>
                    <p>La contraseña ingresada no es correcta.</p>
                    <p><strong>¿Olvidaste tu contraseña?</strong></p>
                    <p>Usa el botón "Recuperar" para restablecerla.</p>
                </div>
            `,
            showConfirmButton: true,
            showCancelButton: true,
            confirmButtonText: 'REINTENTAR',
            cancelButtonText: 'RECUPERAR'
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.cancel) {
                mostrarRecuperacionContraseña();
            } else if (result.isConfirmed) {
                passwordInput.focus();
                passwordInput.select();
            }
        });
    }

    // FUNCIÓN: Mostrar SweetAlert2 para usuario no encontrado
    function mostrarSweetAlertUsuarioNoEncontrado(email) {
        Swal.fire({
            title: 'Usuario No Encontrado',
            html: `
                <div>
                    <p>No existe una cuenta registrada con:</p>
                    <p><strong>${email}</strong></p>
                    
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="swal2-confirm swal2-styled" onclick="window.irARegistro()">
                            <i class="fas fa-user-plus"></i> Registrarse
                        </button>
                        <button class="swal2-cancel swal2-styled" onclick="window.mostrarRecuperacionContraseña()">
                            <i class="fas fa-key"></i> Recuperar
                        </button>
                    </div>
                    
                    <p><strong>Posibles causas:</strong></p>
                    <ul>
                        <li>El correo fue escrito incorrectamente</li>
                        <li>La cuenta fue eliminada o desactivada</li>
                        <li>Debes registrarte primero en el sistema</li>
                    </ul>
                </div>
            `,
            showConfirmButton: false,
            showCloseButton: true
        });
    }

    // ===== FUNCIÓN DE RECUPERACIÓN DE CONTRASEÑA CON SWEETALERT2 =====
    async function mostrarRecuperacionContraseña() {
        const { value: email } = await Swal.fire({
            title: 'Recuperar Contraseña',
            html: `
                <div>
                    <p>Ingresa tu correo electrónico para recibir un enlace de recuperación:</p>
                    <input type="email" id="swal-input-email" class="swal2-input" placeholder="tu@correo.com" value="${emailInput.value || ''}">
                    
                    <div style="text-align: left; margin-top: 15px; padding: 10px; background: var(--color-bg-tertiary); border-radius: 5px;">
                        <p><strong>Proceso de recuperación:</strong></p>
                        <ol>
                            <li>Recibirás un correo con un enlace seguro</li>
                            <li>Revisa tu bandeja de entrada y SPAM</li>
                            <li>Haz clic en el enlace para restablecer</li>
                            <li>Crea una nueva contraseña segura</li>
                            <li>Inicia sesión con tus nuevas credenciales</li>
                        </ol>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'CONFIRMAR',
            cancelButtonText: 'CANCELAR',
            focusConfirm: false,
            allowOutsideClick: false,
            didOpen: () => {
                const input = document.getElementById('swal-input-email');
                if (input) {
                    input.focus();
                    input.select();
                }
            },
            preConfirm: () => {
                const input = document.getElementById('swal-input-email');
                const email = input ? input.value.trim() : '';

                if (!email) {
                    Swal.showValidationMessage('Por favor ingresa tu correo electrónico');
                    return false;
                }

                if (!validateEmail(email)) {
                    Swal.showValidationMessage('El formato del correo no es válido');
                    return false;
                }

                return email;
            }
        });

        if (!email) return;

        // Mostrar loader
        Swal.fire({
            title: 'Enviando correo...',
            html: 'Por favor espera mientras procesamos tu solicitud.',
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const resultado = await userManager.enviarCorreoRecuperacion(email);

            Swal.close();

            if (resultado.success) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Correo enviado!',
                    html: `
                        <div>
                            <p>${resultado.message}</p>
                            <p><strong>Destinatario:</strong> ${email}</p>
                            <p>Revisa tu bandeja de entrada y la carpeta de SPAM.</p>
                        </div>
                    `,
                    confirmButtonText: 'ENTENDIDO',
                    timer: 5000
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    html: `
                        <div>
                            <p>${resultado.message}</p>
                            <p>Por favor, intenta nuevamente más tarde.</p>
                        </div>
                    `,
                    confirmButtonText: 'ENTENDIDO'
                });
            }
        } catch (error) {
            console.error('Error inesperado:', error);
            Swal.close();
            Swal.fire({
                icon: 'error',
                title: 'Error',
                html: `
                    <div>
                        <p>Error inesperado. Intenta nuevamente.</p>
                        <p>${error.message || ''}</p>
                    </div>
                `,
                confirmButtonText: 'ENTENDIDO'
            });
        }
    }

    // Exponer funciones globalmente
    window.irARegistro = function () {
        window.location.href = '/usuarios/visitantes/registro/registro.html';
    };

    window.mostrarRecuperacionContraseña = function () {
        mostrarRecuperacionContraseña();
    };

    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', function () {
            const icon = this.querySelector('i');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
                this.setAttribute('aria-label', 'Ocultar contraseña');
            } else {
                passwordInput.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
                this.setAttribute('aria-label', 'Mostrar contraseña');
            }

            passwordInput.focus();
        });
    }

    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        clearMessage();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            Swal.fire({
                title: 'Campos incompletos',
                text: 'Por favor completa todos los campos',
                confirmButtonText: 'ENTENDIDO'
            });
            emailInput.focus();
            return;
        }

        if (!validateEmail(email)) {
            mostrarSweetAlertCorreoInvalido();
            return;
        }

        if (password.length < 6) {
            Swal.fire({
                title: 'Contraseña muy corta',
                html: `
                    <div>
                        <p>La contraseña debe tener al menos 6 caracteres.</p>
                        <p><strong>Recomendaciones de seguridad:</strong></p>
                        <ul>
                            <li>Usa al menos 8 caracteres</li>
                            <li>Combina letras, números y símbolos</li>
                            <li>Evita información personal</li>
                        </ul>
                    </div>
                `,
                confirmButtonText: 'ENTENDIDO'
            });
            passwordInput.focus();
            passwordInput.select();
            return;
        }

        toggleButtonState(false, '<i class="fas fa-spinner fa-spin"></i> VERIFICANDO...');

        try {
            const user = await userManager.iniciarSesion(email, password);

            // console.log('✅ Login exitoso:', { // COMENTADO
            //     id: user.id,
            //     nombre: user.nombreCompleto,
            //     rol: user.rol,
            //     organizacion: user.organizacion,
            //     areaAsignadaId: user.areaAsignadaId || 'NO ASIGNADA',
            //     cargoId: user.cargoId || 'NO ASIGNADO',
            //     plan: user.plan || 'NO ASIGNADO',
            //     tieneFotoUsuario: !!(user.fotoUsuario || user.fotoURL),
            //     tieneFotoOrganizacion: !!user.fotoOrganizacion
            // });

            const organizacionCamelCase = toCamelCase(user.organizacion);
            logOrganizationInfo(user.organizacion, organizacionCamelCase);

            const savedToLocal = saveUserToLocalStorage(user);
            const savedToSession = saveUserToSessionStorage(user);

            toggleButtonState(false, '<i class="fas fa-check"></i> SESIÓN INICIADA');

            mostrarSweetAlertExito(user);

            // ===========================================================
            // 🔥 SOLO PREGUNTAR POR NOTIFICACIONES SI ESTAMOS EN PRODUCCIÓN
            // ===========================================================
            if (isProduction()) {
                try {
                    // Inicializar FCM después del login exitoso
                    await fcmInitializer.init(userManager);

                    // Verificar si el usuario ya había tomado una decisión
                    if (fcmInitializer.isEnabled()) {
                        // console.log('Notificaciones ya estaban activadas para este dispositivo.'); // COMENTADO
                    } else {
                        // Preguntar solo si el permiso del navegador aún no ha sido concedido
                        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                            const result = await Swal.fire({
                                title: '¿Recibir notificaciones?',
                                text: '¿Deseas activar las notificaciones push para estar al tanto de las incidencias?',
                                icon: 'question',
                                showCancelButton: true,
                                confirmButtonText: 'Sí, activar',
                                cancelButtonText: 'No, ahora no',
                                reverseButtons: true,
                                allowOutsideClick: false
                            });

                            if (result.isConfirmed) {
                                try {
                                    await fcmInitializer.enableNotifications();
                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Notificaciones activadas',
                                        text: 'Ahora recibirás alertas importantes en este dispositivo.',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } catch (error) {
                                    if (error.message.includes('denegado')) {
                                        Swal.fire({
                                            icon: 'info',
                                            title: 'Notificaciones desactivadas',
                                            text: 'Puedes activarlas más tarde desde tu perfil o panel de control.',
                                            timer: 3000,
                                            showConfirmButton: false
                                        });
                                    } else {
                                        console.error('Error al activar notificaciones:', error);
                                    }
                                }
                            } else {
                                await fcmInitializer.disableNotifications();
                            }
                        } else if (Notification.permission === 'denied') {
                            // console.log('Notificaciones bloqueadas por el navegador.'); // COMENTADO
                        }
                    }
                } catch (fcmError) {
                    console.error('Error al inicializar FCM:', fcmError);
                }
            } else {
                // console.log('🔔 Entorno de desarrollo: no se activan notificaciones push'); // COMENTADO
            }

            // ===========================================================
            // Redirigir según el rol
            // ===========================================================
            setTimeout(() => {
                if (user.esAdministrador()) {
                    window.location.href = '/usuarios/administrador/panelControl/panelControl.html';
                } else if (user.esColaborador()) {
                    window.location.href = '/usuarios/colaboradores/panelControl/panelControl.html';
                } else if (user.esMaster()) {
                    window.location.href = '/usuarios/administradorSistema/panelAdministrador/panelAdministrador.html';
                } else {
                    window.location.href = '/index.html';
                }
            }, 2500);

        } catch (error) {
            console.error('❌ Error en login:', error);

            toggleButtonState(true);

            if (error.message.includes('auth/invalid-credential') ||
                error.message.includes('auth/wrong-password')) {
                mostrarSweetAlertContraseñaIncorrecta();

            } else if (error.message.includes('auth/user-not-found') ||
                error.message.includes('no encontrado')) {
                mostrarSweetAlertUsuarioNoEncontrado(email);

            } else if (error.message.includes('auth/too-many-requests')) {
                Swal.fire({
                    title: 'Demasiados intentos',
                    html: `
                        <div>
                            <p>Has excedido el número máximo de intentos permitidos.</p>
                            <p><strong>Debes esperar 15 minutos antes de intentar nuevamente.</strong></p>
                            <button class="swal2-confirm swal2-styled" onclick="window.mostrarRecuperacionContraseña()">
                                <i class="fas fa-unlock-alt"></i> Recuperar Contraseña Ahora
                            </button>
                        </div>
                    `,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: 'Entendido'
                });

            } else if (error.message.includes('auth/network-request-failed')) {
                Swal.fire({
                    title: 'Error de conexión',
                    text: 'Verifica tu conexión a internet e intenta nuevamente',
                    confirmButtonText: 'ENTENDIDO'
                });
                emailInput.focus();

            } else if (error.message.includes('desactivada') || error.message.includes('inhabilitada')) {
                Swal.fire({
                    title: 'Cuenta desactivada',
                    text: 'Tu cuenta está desactivada. Contacta al administrador del sistema.',
                    confirmButtonText: 'ENTENDIDO'
                });

            } else if (error.message.includes('no está verificado')) {
                Swal.fire({
                    title: 'Email no verificado',
                    html: `
                        <div>
                            <p>Debes verificar tu correo electrónico antes de iniciar sesión.</p>
                            <p><strong>Revisa tu bandeja de entrada (y spam) para el enlace de verificación.</strong></p>
                        </div>
                    `,
                    confirmButtonText: 'ENTENDIDO'
                });

            } else {
                Swal.fire({
                    title: 'Error en el login',
                    text: error.message || 'Ha ocurrido un error inesperado. Intenta nuevamente.',
                    confirmButtonText: 'ENTENDIDO'
                });
                emailInput.focus();
            }
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && document.activeElement === passwordInput) {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function (e) {
            e.preventDefault();
            window.mostrarRecuperacionContraseña();
        });
    }

    checkExistingSession();

    setTimeout(() => {
        if (emailInput) {
            emailInput.focus();
        }
    }, 300);
});