// autenticador.js - Componente de autenticación universal
// Importa UserManager desde user.js

import { UserManager } from '/clases/user.js';

(function() {
    'use strict';

    // ==================== VARIABLES GLOBALES ====================
    let userManager = null;
    let currentUser = null;
    let initialized = false;
    let authListeners = [];
    let initializationPromise = null;
    let redirectTimeout = null;

    // ==================== FUNCIONES INTERNAS ====================
    
    /**
     * Carga el usuario desde localStorage de manera persistente
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
        
        // También guardar para compatibilidad
        localStorage.setItem('currentUser', JSON.stringify(userInfo));
    }

    /**
     * Inicializa el sistema de autenticación
     */
    async function initialize() {
        try {
            
            // Limpiar cualquier timeout pendiente
            if (redirectTimeout) {
                clearTimeout(redirectTimeout);
                redirectTimeout = null;
            }
            
            // Obtener o crear instancia de UserManager
            if (!window.userManagerInstance) {
                window.userManagerInstance = new UserManager();
            }
            userManager = window.userManagerInstance;
            
            // PRIMERO: Intentar cargar desde localStorage directamente
            const localUser = loadUserFromLocalStorage();
            if (localUser) {
                currentUser = {
                    ...localUser,
                    // Métodos básicos para compatibilidad
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
                
                // Notificar antes de esperar a UserManager
                initialized = true;
                notifyListeners();
                updateUI();
                
                // Intentar sincronizar con UserManager en segundo plano
                setTimeout(async () => {
                    try {
                        if (userManager && userManager.currentUser) {
                            currentUser = userManager.currentUser;
                            saveUserToLocalStorage(currentUser);
                            notifyListeners();
                            updateUI();
                        }
                    } catch (e) {
                        console.warn('No se pudo sincronizar con UserManager:', e);
                    }
                }, 500);
                
                return;
            }
            
            // Si no hay usuario en localStorage, esperar a UserManager
            let attempts = 0;
            const maxAttempts = 50; // Aumentado a 50 intentos (5 segundos)
            
            while (!userManager.currentUser && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (userManager.currentUser) {
                currentUser = userManager.currentUser;
                saveUserToLocalStorage(currentUser);
            } else {
                currentUser = null;
            }
            
            initialized = true;
            
            // Notificar a los listeners
            notifyListeners();
            
            // Actualizar UI automáticamente
            updateUI();
            
            // 🔴 SI NO HAY USUARIO Y NO ESTAMOS EN PÁGINA DE LOGIN, REDIRIGIR
            if (!currentUser && !isLoginPage()) {
                // Pequeño delay para que los mensajes se muestren
                redirectTimeout = setTimeout(() => {
                    window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
                }, 500);
            }
            
        } catch (error) {
            console.error('❌ Error inicializando Autenticador:', error);
            initialized = true;
            // Solo redirigir si no estamos en página de login
            if (!isLoginPage()) {
                redirectTimeout = setTimeout(() => {
                    window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
                }, 500);
            }
        }
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
     * Actualiza elementos de UI con atributos data-auth
     */
    function updateUI() {
        const userInfo = getCurrentUserInfo();
        
        // Actualizar elementos con data-auth-user-name
        document.querySelectorAll('[data-auth-user-name]').forEach(el => {
            el.textContent = userInfo ? userInfo.nombre : '';
        });
        
        // Actualizar elementos con data-auth-user-email
        document.querySelectorAll('[data-auth-user-email]').forEach(el => {
            el.textContent = userInfo ? userInfo.email : '';
        });
        
        // Actualizar elementos con data-auth-user-rol
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
        
        // Actualizar elementos con data-auth-user-org
        document.querySelectorAll('[data-auth-user-org]').forEach(el => {
            el.textContent = userInfo ? (userInfo.organizacion || 'Sistema') : '';
        });
        
        // Actualizar avatares
        document.querySelectorAll('[data-auth-user-avatar]').forEach(el => {
            if (el.tagName === 'IMG' && userInfo) {
                el.src = userInfo.foto || 'https://via.placeholder.com/150/0a2540/ffffff?text=User';
                el.onerror = function() {
                    this.src = 'https://via.placeholder.com/150/0a2540/ffffff?text=User';
                };
            }
        });
        
        // Mostrar/ocultar elementos según rol
        if (userInfo) {
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
        
        // Disparar evento personalizado
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
            verificado: currentUser.estaVerificado ? currentUser.estaVerificado() : true,
            activo: currentUser.estaActivo ? currentUser.estaActivo() : (currentUser.status !== false),
            plan: currentUser.plan,
            areaAsignadaId: currentUser.areaAsignadaId,
            areaAsignadaNombre: currentUser.areaAsignadaNombre,
            cargo: currentUser.cargo,
            permisos: currentUser.permisosPersonalizados
        };
    }

    // ==================== API PÚBLICA ====================
    
    window.Autenticador = {
        /**
         * Inicia sesión con email y contraseña
         */
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
                currentUser = user;
                saveUserToLocalStorage(user);
                notifyListeners();
                updateUI();
                
                return {
                    success: true,
                    user: user,
                    message: 'Inicio de sesión exitoso'
                };
            } catch (error) {
                console.error('❌ Error en login:', error);
                return {
                    success: false,
                    error: error.message,
                    message: error.message
                };
            }
        },
        
        /**
         * Cierra la sesión actual
         */
        logout: async function() {
            try {
                if (userManager) {
                    await userManager.logout();
                }
                currentUser = null;
                saveUserToLocalStorage(null);
                notifyListeners();
                updateUI();
                
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
        
        /**
         * Obtiene el usuario actual (objeto User completo)
         */
        getUser: function() {
            return currentUser;
        },
        
        /**
         * Obtiene información formateada del usuario
         */
        getUserInfo: function() {
            return getCurrentUserInfo();
        },
        
        /**
         * Verifica si hay sesión activa
         */
        isAuthenticated: function() {
            return currentUser !== null;
        },
        
        /**
         * Verifica si es Master
         */
        isMaster: function() {
            return currentUser ? currentUser.rol === 'master' : false;
        },
        
        /**
         * Verifica si es Administrador
         */
        isAdmin: function() {
            return currentUser ? currentUser.rol === 'administrador' : false;
        },
        
        /**
         * Verifica si es Colaborador
         */
        isColaborador: function() {
            return currentUser ? currentUser.rol === 'colaborador' : false;
        },
        
        /**
         * Verifica si el usuario está activo
         */
        isActive: function() {
            return currentUser ? (currentUser.status !== false) : false;
        },
        
        /**
         * Verifica si el email está verificado
         */
        isVerified: function() {
            return currentUser ? true : false; // Por ahora siempre true
        },
        
        /**
         * Verifica si tiene un permiso específico
         */
        hasPermission: function(permiso) {
            return currentUser ? (currentUser.permisosPersonalizados?.[permiso] || false) : false;
        },
        
        /**
         * Obtiene el rol del usuario
         */
        getRol: function() {
            return currentUser ? currentUser.rol : null;
        },
        
        /**
         * Obtiene la organización del usuario
         */
        getOrganizacion: function() {
            return currentUser ? currentUser.organizacion : null;
        },
        
        /**
         * Obtiene el plan del usuario
         */
        getPlan: function() {
            return currentUser ? currentUser.plan : null;
        },
        
        /**
         * Registra un listener para cambios de autenticación
         */
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
        
        /**
         * Redirige según el rol del usuario
         */
        redirectByRole: function(returnUrl) {
            if (!currentUser) {
                window.location.href = '/usuarios/visitantes/inicioSesion/inicioSesion.html';
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
        
        /**
         * Actualiza manualmente la UI
         */
        refreshUI: function() {
            updateUI();
        },
        
        /**
         * Espera a que el autenticador esté listo
         */
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
         * Recarga el usuario desde localStorage
         */
        refreshUser: function() {
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
                notifyListeners();
                updateUI();
                return currentUser;
            }
            return null;
        }
    };
    
    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();