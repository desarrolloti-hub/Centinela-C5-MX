// protector-administrador.js
// Módulo de protección para administradores - Centinela
// Valida que el usuario tenga rol de administrador o master
// Uso: <script src="/components/protector-administrador.js"></script>

(async function() {
    'use strict';

    // =============================================
    // CLASE PROTECTOR ADMINISTRADOR
    // =============================================
    class ProtectorAdministrador {
        constructor() {
            this.userRole = null;
            this.redirigiendo = false;
        }

        async iniciar() {
            try {
                // Cargar rol del usuario
                this._cargarRol();
                
                // Validar que sea administrador o master
                if (this.userRole !== 'administrador' && this.userRole !== 'master') {
                    await this._mostrarAlerta();
                    return;
                }
                
                // Si es admin o master, deja pasar sin problemas
                
            } catch (error) {
                console.error('Error en protector administrador:', error);
                await this._mostrarAlerta('Error al validar permisos.');
            }
        }

        _obtenerUrlRedireccion() {
            // Redirigir al dashboard de colaboradores si no es admin
            return '/usuarios/colaboradores/panelControl/panelControl.html';
        }

        async _mostrarAlerta(mensajePersonalizado = null) {
            if (this.redirigiendo) return;
            this.redirigiendo = true;
            
            if (typeof Swal === 'undefined') {
                await this._cargarSweetAlert();
            }
            
            const mensaje = mensajePersonalizado || 'No tienes permisos de administrador para acceder a esta página.';
            const urlRedireccion = this._obtenerUrlRedireccion();
            
            await Swal.fire({
                icon: 'warning',
                title: 'Acceso Denegado',
                html: `
                    <p>${mensaje}</p>
                    <div class="mt-3">
                        <div class="progress" style="height: 5px;">
                            <div id="swal-progress-bar" class="progress-bar bg-warning" role="progressbar" style="width: 0%; transition: width 0.1s linear;"></div>
                        </div>
                        <p class="mt-2 text-muted small">Redirigiendo al panel de colaboradores...</p>
                    </div>
                `,
                allowOutsideClick: false,
                allowEscapeKey: false,
                allowEnterKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    let progress = 0;
                    const interval = setInterval(() => {
                        progress += 2;
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (progressBar) {
                            progressBar.style.width = `${Math.min(progress, 100)}%`;
                        }
                        if (progress >= 100) {
                            clearInterval(interval);
                            window.location.replace(urlRedireccion);
                        }
                    }, 60);
                    this._progressInterval = interval;
                },
                willClose: () => {
                    if (this._progressInterval) {
                        clearInterval(this._progressInterval);
                    }
                }
            });
        }
        
        async _cargarSweetAlert() {
            return new Promise((resolve) => {
                if (typeof Swal !== 'undefined') {
                    resolve();
                    return;
                }
                
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
                document.head.appendChild(link);
                
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
                script.onload = () => resolve();
                document.head.appendChild(script);
            });
        }

        _cargarRol() {
            try {
                // Intentar obtener de localStorage (userData)
                const userDataStr = localStorage.getItem('userData');
                if (userDataStr) {
                    const userData = JSON.parse(userDataStr);
                    this.userRole = userData.rol?.toLowerCase() || 'colaborador';
                    return;
                }
                
                // Intentar obtener de adminInfo
                const adminInfoStr = localStorage.getItem('adminInfo');
                if (adminInfoStr) {
                    const adminData = JSON.parse(adminInfoStr);
                    this.userRole = adminData.rol?.toLowerCase() || 'colaborador';
                    return;
                }
                
                // Por defecto, colaborador
                this.userRole = 'colaborador';
                
            } catch (error) {
                console.error('Error cargando rol:', error);
                this.userRole = 'colaborador';
            }
        }
    }

    // =============================================
    // INICIALIZACIÓN
    // =============================================
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new ProtectorAdministrador().iniciar();
        });
    } else {
        new ProtectorAdministrador().iniciar();
    }
})();