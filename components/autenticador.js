// autenticador.js - Componente de autenticación universal con validación directa a BD y Swal
// Importa UserManager desde user.js

import { UserManager } from '/clases/user.js';

(function() {
    'use strict';

    // ==================== VARIABLES GLOBALES ====================
    let userManager = null;
    let currentUser = null;
    let initialized = false;
    let authListeners = [];
    let redirectTimeout = null;
    let statusValidationInterval = null;
    let isRedirecting = false;

    // ==================== FUNCIONES INTERNAS ====================
    
    /**
     * Muestra alerta de SweetAlert antes de redirigir
     */
    function showInactiveAlert(message, redirectUrl) {
        // Verificar si SweetAlert está disponible
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Cuenta Inactiva',
                text: message || 'Tu cuenta ha sido desactivada. Serás redirigido al inicio de sesión.',
                icon: 'warning',
                confirmButtonColor: '#d33',
                confirmButtonText: 'Entendido',
                allowOutsideClick: false,
                allowEscapeKey: false,
                timer: 3000,
                timerProgressBar: true,
                didClose: () => {
                    if (redirectUrl) {
                        window.location.href = redirectUrl;
                    }
                }
            });
        } else {
            // Fallback si SweetAlert no está disponible
            console.warn('SweetAlert no disponible, usando alert nativo');
            alert(message || 'Tu cuenta ha sido inhabilitada. Serás redirigido al inicio de sesión.');
            if (redirectUrl) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 500);
            }
        }
    }

    /**
     * Carga el usuario desde localStorage (solo para cache inicial)
     */
    function loadUserFromLocalStorage() {
        try {
            // Buscar adminInfo
            const adminInfo = localStorage.getItem('adminInfo');
            if (adminInfo) {
                const data = JSON.parse(adminInfo);
                return {
                    id: data.id || data.uid,
                    uid: data.uid || data.id,
                    nombreCompleto: data.nombreCompleto || 'Usuario',
                    organizacion: data.organizacion,
                    organizacionCamelCase: data.organizacionCamelCase,
                    rol: data.rol || 'administrador',
                    correoElectronico: data.correoElectronico || '',
                    fotoUsuario: data.fotoUsuario,
                    status: data.status !== false,
                    plan: data.plan || 'gratis'
                };
            }

            // Buscar userData
            const userData = localStorage.getItem('userData');
            if (userData) {
                const data = JSON.parse(userData);
                return {
                    id: data.uid || data.id,
                    uid: data.uid || data.id,
                    nombreCompleto: data.nombreCompleto || data.nombre || 'Usuario',
                    organizacion: data.organizacion || data.empresa,
                    organizacionCamelCase: data.organizacionCamelCase,
                    rol: data.rol || 'colaborador',
                    correoElectronico: data.correo || data.email || '',
                    fotoUsuario: data.fotoUsuario,
                    status: data.status !== false,
                    plan: data.plan || 'gratis'
                };
            }

            return null;
        } catch (error) {
            console.error('Error cargando usuario de localStorage:', error);
            return null;
        }
    }

    /**
     * Guarda el usuario en localStorage
     */
    function saveUserToLocalStorage(user) {
        if (!user) {
            localStorage.removeItem('adminInfo');
            localStorage.removeItem('userData');
            localStorage.removeItem('currentUser');
            return;
        }

        const userInfo = {
            id: user.id,
            uid: user.uid || user.id,
            nombreCompleto: user.nombreCompleto,
            organizacion: user.organizacion,
            organizacionCamelCase: user.organizacionCamelCase,
            rol: user.rol,
            correoElectronico: user.correoElectronico,
            fotoUsuario: user.fotoUsuario,
            status: user.status,
            plan: user.plan
        };

        if (user.rol === 'administrador' || user.rol === 'master') {
            localStorage.setItem('adminInfo', JSON.stringify(userInfo));
        } else {
            localStorage.setItem('userData', JSON.stringify(userInfo));
        }
        
        localStorage.setItem('currentUser', JSON.stringify(userInfo));
    }

    /**
     * CONSULTA DIRECTA A LA BASE DE DATOS
     * Obtiene el usuario actualizado desde el servidor/UserManager
     */
    async function fetchUserFromDatabase() {
        if (!currentUser || !currentUser.id) return null;
        
        try {
            // Opción 1: Si UserManager tiene método para obtener usuario por ID
            if (userManager && userManager.getUserById) {
                return await userManager.getUserById(currentUser.id);
            }
            
            // Opción 2: Si UserManager tiene método para refrescar
            if (userManager && userManager.refreshCurrentUser) {
                return await userManager.refreshCurrentUser();
            }
            
            // Opción 3: Llamada directa a API
            const response = await fetch(`/api/usuarios/${currentUser.id}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                return userData;
            }
            
            // Si la API devuelve 401 o 404, el usuario no existe o no tiene acceso
            if (response.status === 401 || response.status === 404) {
                return null;
            }
            
            return null;
        } catch (error) {
            console.error('Error consultando usuario en BD:', error);
            return null;
        }
    }

    /**
     * VALIDA EL STATUS CONSULTANDO DIRECTAMENTE A LA BASE DE DATOS
     */
    async function validateUserStatus() {
        // No validar en páginas de login para evitar loops
        if (isLoginPage() || isRedirecting) return true;
        
        if (!currentUser || !currentUser.id) {
            // No hay usuario, no hay nada que validar
            return true;
        }
        
        try {
            // 🔴 CONSULTA DIRECTA A LA BASE DE DATOS
            const dbUser = await fetchUserFromDatabase();
            
            // Si no se encontró el usuario en BD (fue eliminado)
            if (dbUser === null) {
                console.warn('Usuario no encontrado en BD. Cerrando sesión...');
                await forceLogout('Tu usuario ya no existe en el sistema.');
                return false;
            }
            
            // Verificar status desde la BD
            const isActive = dbUser.status !== false && dbUser.status !== 0;
            
            if (!isActive) {
                console.warn('Usuario inactivo detectado en BD. Cerrando sesión...');
                await forceLogout('Tu cuenta ha sido inhabilitada. Contacta a tu administrador.');
                return false;
            }
            
            // Si el status cambió o hay datos nuevos, actualizar cache
            if (dbUser.status !== currentUser.status) {
                currentUser.status = dbUser.status;
                currentUser.nombreCompleto = dbUser.nombreCompleto || currentUser.nombreCompleto;
                currentUser.rol = dbUser.rol || currentUser.rol;
                // Actualizar cualquier otro campo relevante
                saveUserToLocalStorage(currentUser);
                notifyListeners();
                updateUI();
            }
            
            return true;
        } catch (error) {
            console.error('Error validando status con BD:', error);
            // En caso de error de red, no redirigir, solo fallar silenciosamente
            return true;
        }
    }

    /**
     * Inicia el intervalo de validación de status (cada 15 segundos)
     */
    function startStatusValidation() {
        if (statusValidationInterval) {
            clearInterval(statusValidationInterval);
        }
        
        // Validar cada 15 segundos para mayor seguridad
        statusValidationInterval = setInterval(() => {
            if (currentUser && !isLoginPage() && !isRedirecting) {
                validateUserStatus();
            }
        }, 15000);
        
        // Validar cuando la página recupera visibilidad
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && currentUser && !isLoginPage() && !isRedirecting) {
                validateUserStatus();
            }
        });
    }

    /**
     * Detiene el intervalo de validación
     */
    function stopStatusValidation() {
        if (statusValidationInterval) {
            clearInterval(statusValidationInterval);
            statusValidationInterval = null;
        }
    }

    /**
     * Forzar cierre de sesión con mensaje y Swal
     */
    async function forceLogout(message) {
        if (isRedirecting) return;
        isRedirecting = true;
        
        stopStatusValidation();
        
        // Guardar mensaje para mostrar en login
        if (message) {
            sessionStorage.setItem('logoutMessage', message);
        }
        
        try {
            if (userManager && userManager.logout) {
                await userManager.logout();
            }
        } catch (e) {
            console.warn('Error en logout:', e);
        }
        
        currentUser = null;
        saveUserToLocalStorage(null);
        notifyListeners();
        updateUI();
        
        if (redirectTimeout) {
            clearTimeout(redirectTimeout);
        }
        
        // Mostrar alerta con SweetAlert antes de redirigir
        const redirectUrl = '/index.html';
        showInactiveAlert(message, redirectUrl);
    }

    /**
     * Verifica si estamos en una página de login
     */
    function isLoginPage() {
        const path = window.location.pathname;
        return path.includes('inicioSesion') || 
               path.includes('login') || 
               path.includes('registro') ||
               path.includes('recuperar');
    }

    /**
     * Inicializa el sistema de autenticación
     */
    async function initialize() {
        try {
            if (redirectTimeout) {
                clearTimeout(redirectTimeout);
                redirectTimeout = null;
            }
            
            isRedirecting = false;
            
            if (!window.userManagerInstance) {
                window.userManagerInstance = new UserManager();
            }
            userManager = window.userManagerInstance;
            
            // Cargar desde localStorage como cache inicial
            const localUser = loadUserFromLocalStorage();
            
            if (localUser) {
                currentUser = {
                    ...localUser,
                    getFotoUrl: function() { return this.fotoUsuario || null; },
                    getEstadoTexto: function() { return this.status ? 'Activo' : 'Inactivo'; },
                    estaVerificado: function() { return true; },
                    estaActivo: function() { return this.status !== false; },
                    esMaster: function() { return this.rol === 'master'; },
                    esAdministrador: function() { return this.rol === 'administrador'; },
                    esColaborador: function() { return this.rol === 'colaborador'; },
                    tienePermiso: function(permiso) { 
                        return this.permisosPersonalizados?.[permiso] || false; 
                    }
                };
                
                initialized = true;
                notifyListeners();
                updateUI();
                
                // 🔴 VALIDAR CONTRA BD INMEDIATAMENTE (no confiar en localStorage)
                if (!isLoginPage()) {
                    const isValid = await validateUserStatus();
                    if (!isValid) {
                        return; // Ya redirigió validateUserStatus
                    }
                }
                
                // Iniciar validación periódica
                if (currentUser && currentUser.status !== false && !isLoginPage()) {
                    startStatusValidation();
                }
            } else {
                // Si no hay usuario en localStorage, esperar a UserManager
                let attempts = 0;
                const maxAttempts = 50;
                
                while (!userManager.currentUser && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }
                
                if (userManager.currentUser) {
                    currentUser = userManager.currentUser;
                    
                    // 🔴 VALIDAR CONTRA BD ANTES DE ACEPTAR
                    const dbUser = await fetchUserFromDatabase();
                    const isActive = dbUser ? (dbUser.status !== false) : (currentUser.status !== false);
                    
                    if (!isActive) {
                        await forceLogout('Tu cuenta ha sido inhabilitada. Contacta al administrador.');
                        return;
                    }
                    
                    // Actualizar con datos frescos de BD si es necesario
                    if (dbUser) {
                        currentUser.status = dbUser.status;
                    }
                    
                    saveUserToLocalStorage(currentUser);
                    
                    if (!isLoginPage()) {
                        startStatusValidation();
                    }
                } else {
                    currentUser = null;
                }
                
                initialized = true;
                notifyListeners();
                updateUI();
            }
            
            // Redirigir si no hay usuario y no estamos en login
            if (!currentUser && !isLoginPage() && !isRedirecting) {
                isRedirecting = true;
                // Mostrar mensaje si hay uno pendiente
                const pendingMessage = sessionStorage.getItem('logoutMessage');
                if (pendingMessage) {
                    sessionStorage.removeItem('logoutMessage');
                    showInactiveAlert(pendingMessage, '/index.html');
                } else {
                    redirectTimeout = setTimeout(() => {
                        window.location.href = '/index.html';
                    }, 500);
                }
            }
            
        } catch (error) {
            console.error('❌ Error inicializando Autenticador:', error);
            initialized = true;
            if (!isLoginPage() && !isRedirecting) {
                isRedirecting = true;
                redirectTimeout = setTimeout(() => {
                    window.location.href = '/index.html';
                }, 500);
            }
        }
    }

    /**
     * Notifica a todos los listeners
     */
    function notifyListeners() {
        authListeners.forEach(listener => {
            try {
                listener(currentUser);
            } catch (e) {
                console.error('Error en listener:', e);
            }
        });
    }

    /**
     * Actualiza elementos de UI
     */
    function updateUI() {
        const userInfo = getCurrentUserInfo();
        
        document.querySelectorAll('[data-auth-user-name]').forEach(el => {
            el.textContent = userInfo ? userInfo.nombre : '';
        });
        
        document.querySelectorAll('[data-auth-user-email]').forEach(el => {
            el.textContent = userInfo ? userInfo.email : '';
        });
        
        document.querySelectorAll('[data-auth-user-rol]').forEach(el => {
            if (userInfo) {
                let rolTexto = userInfo.rol;
                if (rolTexto === 'master') rolTexto = 'Master';
                if (rolTexto === 'administrador') rolTexto = 'Administrador';
                if (rolTexto === 'colaborador') rolTexto = 'Colaborador';
                el.textContent = rolTexto;
            } else {
                el.textContent = '';
            }
        });
        
        document.querySelectorAll('[data-auth-user-org]').forEach(el => {
            el.textContent = userInfo ? (userInfo.organizacion || 'Sistema') : '';
        });
        
        document.querySelectorAll('[data-auth-user-avatar]').forEach(el => {
            if (el.tagName === 'IMG' && userInfo) {
                el.src = userInfo.foto || 'https://via.placeholder.com/150/0a2540/ffffff?text=User';
                el.onerror = function() {
                    this.src = 'https://via.placeholder.com/150/0a2540/ffffff?text=User';
                };
            }
        });
        
        if (userInfo && userInfo.activo) {
            document.querySelectorAll('[data-auth-show-master]').forEach(el => {
                el.style.display = userInfo.rol === 'master' ? '' : 'none';
            });
            document.querySelectorAll('[data-auth-show-admin]').forEach(el => {
                el.style.display = userInfo.rol === 'administrador' ? '' : 'none';
            });
            document.querySelectorAll('[data-auth-show-colaborador]').forEach(el => {
                el.style.display = userInfo.rol === 'colaborador' ? '' : 'none';
            });
            document.querySelectorAll('[data-auth-show-authenticated]').forEach(el => {
                el.style.display = '';
            });
            document.querySelectorAll('[data-auth-show-guest]').forEach(el => {
                el.style.display = 'none';
            });
        } else {
            document.querySelectorAll('[data-auth-show-master]').forEach(el => {
                el.style.display = 'none';
            });
            document.querySelectorAll('[data-auth-show-admin]').forEach(el => {
                el.style.display = 'none';
            });
            document.querySelectorAll('[data-auth-show-colaborador]').forEach(el => {
                el.style.display = 'none';
            });
            document.querySelectorAll('[data-auth-show-authenticated]').forEach(el => {
                el.style.display = 'none';
            });
            document.querySelectorAll('[data-auth-show-guest]').forEach(el => {
                el.style.display = '';
            });
        }
        
        const authEvent = new CustomEvent('authStateChanged', { 
            detail: { user: currentUser, userInfo: userInfo } 
        });
        document.dispatchEvent(authEvent);
    }

    /**
     * Obtiene información del usuario actual
     */
    function getCurrentUserInfo() {
        if (!currentUser) return null;
        return {
            id: currentUser.id,
            nombre: currentUser.nombreCompleto,
            email: currentUser.correoElectronico,
            rol: currentUser.rol,
            organizacion: currentUser.organizacion,
            organizacionCamelCase: currentUser.organizacionCamelCase,
            foto: currentUser.getFotoUrl ? currentUser.getFotoUrl() : (currentUser.fotoUsuario || null),
            estado: currentUser.getEstadoTexto ? currentUser.getEstadoTexto() : (currentUser.status ? 'Activo' : 'Inactivo'),
            verificado: true,
            activo: currentUser.status !== false,
            plan: currentUser.plan,
            areaAsignadaId: currentUser.areaAsignadaId,
            areaAsignadaNombre: currentUser.areaAsignadaNombre,
            cargo: currentUser.cargo,
            permisos: currentUser.permisosPersonalizados
        };
    }

    // ==================== API PÚBLICA ====================
    
    window.Autenticador = {
        login: async function(email, password) {
            try {
                if (!userManager) {
                    await new Promise(resolve => {
                        const checkInterval = setInterval(() => {
                            if (userManager) {
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 100);
                    });
                }
                
                const user = await userManager.iniciarSesion(email, password);
                
                // 🔴 VERIFICAR STATUS EN BD DESPUÉS DE LOGIN
                const tempContext = { currentUser: user };
                const dbUser = await fetchUserFromDatabase.call(tempContext);
                
                if (dbUser === null || dbUser.status === false) {
                    // Mostrar alerta de usuario inactivo
                    if (typeof Swal !== 'undefined') {
                        await Swal.fire({
                            title: 'Acceso Denegado',
                            text: 'Tu cuenta ha sido inhabilitada. Contacta a tu administrador.',
                            icon: 'error',
                            confirmButtonColor: '#d33',
                            confirmButtonText: 'Aceptar'
                        });
                    }
                    return {
                        success: false,
                        error: 'Usuario inactivo',
                        message: 'Tu cuenta ha sido inhabilitada. Contacta a tu administrador.'
                    };
                }
                
                currentUser = user;
                if (dbUser) {
                    currentUser.status = dbUser.status;
                }
                saveUserToLocalStorage(currentUser);
                notifyListeners();
                updateUI();
                startStatusValidation();
                
                // Mostrar bienvenida con Swal (opcional)
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: '¡Bienvenido!',
                        text: `Has iniciado sesión como ${currentUser.nombreCompleto || currentUser.correoElectronico}`,
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
                
                return {
                    success: true,
                    user: currentUser,
                    message: 'Inicio de sesión exitoso'
                };
            } catch (error) {
                console.error('❌ Error en login:', error);
                
                // Mostrar error con Swal
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Error de inicio de sesión',
                        text: error.message || 'Credenciales incorrectas o error de conexión',
                        icon: 'error',
                        confirmButtonColor: '#3085d6'
                    });
                }
                
                return {
                    success: false,
                    error: error.message,
                    message: error.message
                };
            }
        },
        
        logout: async function() {
            stopStatusValidation();
            try {
                if (userManager) {
                    await userManager.logout();
                }
                currentUser = null;
                saveUserToLocalStorage(null);
                notifyListeners();
                updateUI();
                
                // Mostrar mensaje de cierre de sesión
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Sesión cerrada',
                        text: 'Has cerrado sesión correctamente',
                        icon: 'info',
                        timer: 1500,
                        showConfirmButton: false
                    });
                }
                
                return {
                    success: true,
                    message: 'Sesión cerrada correctamente'
                };
            } catch (error) {
                console.error('❌ Error en logout:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        },
        
        getUser: function() {
            return currentUser;
        },
        
        getUserInfo: function() {
            return getCurrentUserInfo();
        },
        
        isAuthenticated: function() {
            return currentUser !== null && currentUser.status !== false;
        },
        
        isMaster: function() {
            return currentUser ? currentUser.rol === 'master' && currentUser.status !== false : false;
        },
        
        isAdmin: function() {
            return currentUser ? currentUser.rol === 'administrador' && currentUser.status !== false : false;
        },
        
        isColaborador: function() {
            return currentUser ? currentUser.rol === 'colaborador' && currentUser.status !== false : false;
        },
        
        isActive: function() {
            return currentUser ? (currentUser.status !== false) : false;
        },
        
        isVerified: function() {
            return true;
        },
        
        hasPermission: function(permiso) {
            return currentUser && currentUser.status !== false ? (currentUser.permisosPersonalizados?.[permiso] || false) : false;
        },
        
        getRol: function() {
            return currentUser && currentUser.status !== false ? currentUser.rol : null;
        },
        
        getOrganizacion: function() {
            return currentUser && currentUser.status !== false ? currentUser.organizacion : null;
        },
        
        getPlan: function() {
            return currentUser && currentUser.status !== false ? currentUser.plan : null;
        },
        
        /**
         * Valida el status consultando directamente a la BD
         */
        validateStatus: async function() {
            return await validateUserStatus();
        },
        
        onAuthChange: function(callback) {
            authListeners.push(callback);
            if (initialized) {
                callback(currentUser);
            }
            return () => {
                const index = authListeners.indexOf(callback);
                if (index > -1) {
                    authListeners.splice(index, 1);
                }
            };
        },
        
        redirectByRole: function(returnUrl) {
            if (!currentUser || currentUser.status === false) {
                showInactiveAlert('Tu sesión ha expirado o tu cuenta está inactiva.', '/index.html');
                return;
            }
            
            if (returnUrl) {
                window.location.href = returnUrl;
                return;
            }
            
            if (currentUser.rol === 'master') {
                window.location.href = '/usuarios/administradorSistema/panelAdministrador/panelAdministrador.html';
            } else if (currentUser.rol === 'administrador') {
                window.location.href = '/usuarios/administrador/panelControl/panelControl.html';
            } else {
                window.location.href = '/usuarios/colaboradores/panelControl/panelControl.html';
            }
        },
        
        refreshUI: function() {
            updateUI();
        },
        
        ready: function() {
            return new Promise((resolve) => {
                if (initialized) {
                    resolve();
                } else {
                    const checkInterval = setInterval(() => {
                        if (initialized) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                }
            });
        },
        
        /**
         * Refresca los datos del usuario consultando directamente a BD
         */
        refreshUser: async function() {
            if (!currentUser) return null;
            
            const dbUser = await fetchUserFromDatabase();
            if (dbUser) {
                currentUser = {
                    ...currentUser,
                    ...dbUser,
                    status: dbUser.status,
                    nombreCompleto: dbUser.nombreCompleto || currentUser.nombreCompleto,
                    rol: dbUser.rol || currentUser.rol
                };
                saveUserToLocalStorage(currentUser);
                notifyListeners();
                updateUI();
            }
            
            return currentUser;
        }
    };
    
    // Inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();