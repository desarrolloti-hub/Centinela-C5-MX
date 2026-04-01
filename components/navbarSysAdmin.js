// [file name]: navbarAdministrador.js
// [file path]: /components/navbarAdministrador.js

class NavbarComplete {
    constructor() {
        this.isMenuOpen = false;
        this.isAdminDropdownOpen = false;
        this.isGestionDropdownOpen = false;
        this.currentAdmin = null;
        this.userManager = null;
        this.notificacionManager = null;
        this.notificacionesNoLeidas = 0;
        this.notificaciones = [];
        this.dropdownNotificacionesAbierto = false;
        this.intervalNotificaciones = null;
        this.init();
    }

    init() {
        if (window.NavbarCompleteLoaded) return;
        window.NavbarCompleteLoaded = true;
        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => this.setup()) : setTimeout(() => this.setup(), 100);
    }

    async setup() {
        try {
            this.removeOriginalNavbar();
            this.createNavbar();
            this.setupFunctionalities();
            this.loadAdminDataFromLocalStorage();
            this.updateNavbarWithAdminData();
            await this.loadAdminDataFromFirebase();
            await this._initNotificacionManager();
            await this._cargarNotificaciones();
            this._iniciarListenerNotificaciones();
        } catch (error) {
            console.error('❌ Error en inicialización:', error);
        }
    }

    async _initNotificacionManager() {
        try {
            const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
            this.notificacionManager = new NotificacionAreaManager();
        } catch (error) {
            console.error('Error inicializando notificacionManager:', error);
        }
    }

    async _cargarNotificaciones() {
        if (!this.notificacionManager || !this.currentAdmin?.id || !this.currentAdmin?.organizacionCamelCase) return;
        try {
            const todasNotificaciones = await this.notificacionManager.obtenerNotificaciones(
                this.currentAdmin.id,
                this.currentAdmin.organizacionCamelCase,
                false,
                20
            );
            this.notificaciones = todasNotificaciones;
            this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();
        } catch (error) {
            console.error('Error cargando notificaciones:', error);
        }
    }

    _iniciarListenerNotificaciones() {
        if (!this.notificacionManager || !this.currentAdmin?.id || !this.currentAdmin?.organizacionCamelCase) return;
        if (this.intervalNotificaciones) clearInterval(this.intervalNotificaciones);
        this.intervalNotificaciones = setInterval(() => this._cargarNotificaciones(), 30000);
    }

    _actualizarBadgeNotificaciones() {
        const badge = document.getElementById('notificacionesBadge');
        if (!badge) return;
        if (this.notificacionesNoLeidas > 0) {
            badge.textContent = this.notificacionesNoLeidas > 99 ? '99+' : this.notificacionesNoLeidas;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    _renderizarNotificaciones() {
        const container = document.getElementById('notificacionesLista');
        if (!container) return;
        if (this.notificaciones.length === 0) {
            container.innerHTML = `<div class="notificaciones-vacia"><i class="fas fa-bell-slash"></i><p>No hay notificaciones nuevas</p></div>`;
            return;
        }
        let html = '';
        this.notificaciones.slice(0, 5).forEach(notif => {
            const notifUI = notif.toUI ? notif.toUI() : {
                titulo: notif.titulo,
                mensaje: notif.mensaje,
                icono: notif.getIcono ? notif.getIcono() : 'fa-bell',
                color: notif.getColor ? notif.getColor() : '#007bff',
                sucursalNombre: notif.sucursalNombre,
                nivelRiesgo: notif.nivelRiesgo,
                tiempoRelativo: notif.getTiempoRelativo ? notif.getTiempoRelativo() : '',
                urlDestino: notif.urlDestino || `/usuarios/administradorSistema/verIncidencias/verIncidencias.html?id=${notif.incidenciaId}`,
                leida: notif.leida || false
            };
            html += `<div class="notificacion-item" data-id="${notif.id}" data-url="${notifUI.urlDestino}"><div class="notificacion-icono" style="background-color: ${notifUI.color}20; color: ${notifUI.color}"><i class="fas ${notifUI.icono}"></i></div><div class="notificacion-contenido"><div class="notificacion-titulo">${this._escapeHTML(notifUI.titulo)}</div><div class="notificacion-mensaje">${this._escapeHTML(notifUI.mensaje)}</div><div class="notificacion-detalles">${notifUI.sucursalNombre ? `<span><i class="fas fa-store"></i> ${this._escapeHTML(notifUI.sucursalNombre)}</span>` : ''}${notifUI.nivelRiesgo ? `<span class="riesgo-${notifUI.nivelRiesgo}"><i class="fas fa-exclamation-triangle"></i> ${notifUI.nivelRiesgo}</span>` : ''}</div><div class="notificacion-tiempo">${this._escapeHTML(notifUI.tiempoRelativo)}</div></div><div class="notificacion-estado ${notifUI.leida ? 'leida' : 'no-leida'}"></div></div>`;
        });
        if (this.notificaciones.length > 5) html += `<div class="notificaciones-ver-mas"><a href="#" class="ver-todas-notificaciones">Ver ${this.notificaciones.length - 5} más</a></div>`;
        container.innerHTML = html;
        container.querySelectorAll('.notificacion-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = item.dataset.id, url = item.dataset.url;
                if (this.notificacionManager && id) {
                    await this.notificacionManager.marcarComoLeida(this.currentAdmin.id, id, this.currentAdmin.organizacionCamelCase);
                    const notifIndex = this.notificaciones.findIndex(n => n.id === id);
                    if (notifIndex !== -1) this.notificaciones[notifIndex].leida = true;
                    this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                    this._actualizarBadgeNotificaciones();
                    const estadoDiv = item.querySelector('.notificacion-estado');
                    if (estadoDiv) estadoDiv.classList.remove('no-leida'), estadoDiv.classList.add('leida');
                }
                if (url) window.location.href = url;
            });
        });
        const verTodasLink = container.querySelector('.ver-todas-notificaciones');
        if (verTodasLink) verTodasLink.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._mostrarModalNotificaciones(); });
    }

    _mostrarModalNotificaciones() {
        if (typeof Swal !== 'undefined') {
            let notificacionesHtml = '<div style="max-height: 400px; overflow-y: auto;">';
            this.notificaciones.forEach(notif => {
                const notifUI = notif.toUI ? notif.toUI() : {
                    titulo: notif.titulo,
                    mensaje: notif.mensaje,
                    icono: notif.getIcono ? notif.getIcono() : 'fa-bell',
                    color: notif.getColor ? notif.getColor() : '#007bff',
                    tiempoRelativo: notif.getTiempoRelativo ? notif.getTiempoRelativo() : '',
                    urlDestino: notif.urlDestino || `/usuarios/administradorSistema/verIncidencias/verIncidencias.html?id=${notif.incidenciaId}`,
                    leida: notif.leida || false
                };
                notificacionesHtml += `<div class="notificacion-item-modal" data-id="${notif.id}" data-url="${notifUI.urlDestino}" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-bottom: 1px solid #333; cursor: pointer; background: ${notifUI.leida ? 'transparent' : 'rgba(0, 207, 255, 0.05)'};"><div class="notificacion-icono" style="width: 40px; height: 40px; border-radius: 50%; background-color: ${notifUI.color}20; color: ${notifUI.color}; display: flex; align-items: center; justify-content: center;"><i class="fas ${notifUI.icono}"></i></div><div style="flex: 1;"><div style="font-weight: 600; margin-bottom: 4px;">${this._escapeHTML(notifUI.titulo)}</div><div style="font-size: 13px; color: #aaa; margin-bottom: 4px;">${this._escapeHTML(notifUI.mensaje)}</div><div style="font-size: 11px; color: #666;">${this._escapeHTML(notifUI.tiempoRelativo)}</div></div>${!notifUI.leida ? '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: #007bff;"></div>' : ''}</div>`;
            });
            notificacionesHtml += '</div>';
            Swal.fire({ title: 'Todas las Notificaciones', html: notificacionesHtml, width: '500px', background: '#1a1a1a', color: '#fff', confirmButtonText: 'Cerrar', confirmButtonColor: '#00cfff', didOpen: () => {
                document.querySelectorAll('.notificacion-item-modal').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const id = item.dataset.id, url = item.dataset.url;
                        if (this.notificacionManager && id) {
                            await this.notificacionManager.marcarComoLeida(this.currentAdmin.id, id, this.currentAdmin.organizacionCamelCase);
                            const notifIndex = this.notificaciones.findIndex(n => n.id === id);
                            if (notifIndex !== -1) this.notificaciones[notifIndex].leida = true;
                            this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                            this._actualizarBadgeNotificaciones();
                            this._renderizarNotificaciones();
                        }
                        if (url) window.location.href = url;
                        Swal.close();
                    });
                });
            } });
        } else {
            window.location.href = '#';
        }
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async _marcarTodasLeidas() {
        if (!this.notificacionManager || !this.currentAdmin?.id || !this.currentAdmin?.organizacionCamelCase) return;
        try {
            await this.notificacionManager.marcarTodasComoLeidas(this.currentAdmin.id, this.currentAdmin.organizacionCamelCase);
            this.notificacionesNoLeidas = 0;
            this.notificaciones.forEach(n => n.leida = true);
            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();
        } catch (error) {
            console.error('Error marcando todas como leídas:', error);
        }
    }

    _configurarNotificacionesDropdown() {
        const notificacionesBtn = document.getElementById('notificacionesBtn');
        const notificacionesDropdown = document.getElementById('notificacionesDropdown');
        const marcarTodasBtn = document.getElementById('marcarTodasBtn');
        if (!notificacionesBtn || !notificacionesDropdown) return;
        notificacionesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dropdownNotificacionesAbierto = !this.dropdownNotificacionesAbierto;
            notificacionesDropdown.classList.toggle('active', this.dropdownNotificacionesAbierto);
            if (this.dropdownNotificacionesAbierto && this.notificacionesNoLeidas > 0) this._cargarNotificaciones();
        });
        document.addEventListener('click', (e) => {
            if (!notificacionesBtn.contains(e.target) && !notificacionesDropdown.contains(e.target)) {
                this.dropdownNotificacionesAbierto = false;
                notificacionesDropdown.classList.remove('active');
            }
        });
        if (marcarTodasBtn) marcarTodasBtn.addEventListener('click', (e) => { e.stopPropagation(); this._marcarTodasLeidas(); });
    }

    removeOriginalNavbar() { document.getElementById('main-header')?.remove(); }

    createNavbar() { this.addStyles(); this.insertHTML(); this.adjustBodyPadding(); }

    addStyles() {
        if (document.getElementById('navbar-complete-styles')) return;
        
        const styles = `
            /* Estilos base del navbar */
            #complete-navbar {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                z-index: 1000;
                background-color: var(--navbar-bg);
                box-shadow: 0 2px 10px transparent;
                transition: var(--transition-default);
                font-family: var(--font-family-primary);
            }
            
            #complete-navbar.scrolled {
                background-color: var(--navbar-scrolled-bg);
                box-shadow: var(--navbar-scrolled-shadow);
            }
            
            /* Top section - estructura principal */
            .navbar-top-section {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px 20px;
                min-height: 50px;
                margin: 0;
                position: relative;
                width: 100%;
                box-sizing: border-box;
            }
            
            /* Contenedor izquierdo - logos */
            .navbar-left-container {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 10px;
                flex: 0 0 auto;
                margin-right: auto;
            }
            
            /* Enlaces de logos */
            .navbar-logo-link {
                display: flex;
                align-items: center;
                text-decoration: none;
                z-index: 1003;
                height: 70px;
                flex: 0 0 auto;
            }
            
            /* Contenedor circular del logo */
            .logo-circle-container {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                overflow: hidden;
                border: 3px solid var(--color-accent-primary);
                background-color: var(--color-bg-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                flex-shrink: 0;
            }
            
            .navbar-logo-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform var(--transition-default);
                display: block;
            }
            
            .navbar-logo-link:hover .logo-circle-container {
                transform: scale(1.05);
                border-color: var(--color-accent-secondary);
            }
            
            /* Separador entre logos */
            .logo-separator {
                width: 2px;
                height: 45px;
                background: linear-gradient(
                    to bottom,
                    var(--color-accent-primary) 0%,
                    var(--color-accent-primary) 20%,
                    var(--color-accent-primary) 80%,
                    var(--color-accent-primary) 100%
                );
                margin: 0 5px;
                border-radius: 1px;
                flex-shrink: 0;
            }
            
            /* Logo de texto/organización */
            .org-text-logo {
                display: none;
                align-items: center;
                justify-content: center;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background-color: var(--color-accent-primary);
                color: white;
                font-weight: bold;
                font-size: 14px;
                text-align: center;
                border: 3px solid var(--color-accent-primary);
                flex-shrink: 0;
            }
            
            .org-text-logo img {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
            }
            
            /* Título CENTINELA */
            .navbar-title {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                font-weight: 700;
                font-size: 24px;
                color: var(--navbar-logo-text);
                text-shadow: var(--text-shadow-effect);
                margin: 0;
                white-space: nowrap;
                pointer-events: none;
                z-index: 1;
                font-family: 'Orbitron', sans-serif;
                text-align: center;
                width: max-content;
            }
            
            /* Contenedor derecho - notificaciones y menú hamburguesa */
            .navbar-right-container {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                flex: 0 0 auto;
                margin-left: auto;
                gap: 15px;
            }
            
            /* Notificaciones */
            .navbar-notificaciones-container {
                position: relative;
            }
            
            .navbar-notificaciones-btn {
                background: none;
                border: none;
                color: var(--navbar-text);
                font-size: 20px;
                cursor: pointer;
                position: relative;
                padding: 8px;
                border-radius: 50%;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .navbar-notificaciones-btn:hover {
                background-color: var(--color-bg-secondary);
                transform: scale(1.1);
            }
            
            .notificaciones-badge {
                position: absolute;
                top: 0;
                right: 0;
                background-color: #dc3545;
                color: white;
                font-size: 11px;
                font-weight: bold;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid var(--navbar-bg);
            }
            
            /* Dropdown de notificaciones */
            .notificaciones-dropdown {
                position: absolute;
                top: 100%;
                right: 0;
                width: 350px;
                background-color: var(--color-bg-primary);
                border-radius: var(--border-radius-medium);
                box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                border: 1px solid var(--color-border-light);
                z-index: 1004;
                display: none;
                margin-top: 10px;
            }
            
            .notificaciones-dropdown.active {
                display: block;
            }
            
            .notificaciones-header {
                padding: 15px;
                border-bottom: 1px solid var(--color-border-light);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .notificaciones-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--color-text-primary);
            }
            
            .notificaciones-marcar-todas {
                background: none;
                border: none;
                color: var(--color-accent-primary);
                font-size: 12px;
                cursor: pointer;
                padding: 5px 10px;
                border-radius: var(--border-radius-small);
                transition: all 0.3s ease;
            }
            
            .notificaciones-marcar-todas:hover {
                background-color: var(--color-bg-secondary);
            }
            
            .notificaciones-lista {
                max-height: 400px;
                overflow-y: auto;
                padding: 10px;
            }
            
            .notificacion-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 12px;
                border-radius: var(--border-radius-small);
                cursor: pointer;
                transition: all 0.3s ease;
                border: 1px solid transparent;
                margin-bottom: 5px;
            }
            
            .notificacion-item:hover {
                background-color: var(--color-bg-secondary);
                border-color: var(--color-border-light);
                transform: translateX(-2px);
            }
            
            .notificacion-icono {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                flex-shrink: 0;
            }
            
            .notificacion-contenido {
                flex: 1;
            }
            
            .notificacion-titulo {
                font-weight: 600;
                font-size: 14px;
                color: var(--color-text-primary);
                margin-bottom: 4px;
            }
            
            .notificacion-mensaje {
                font-size: 13px;
                color: var(--color-text-secondary);
                margin-bottom: 4px;
                line-height: 1.4;
            }
            
            .notificacion-detalles {
                display: flex;
                gap: 10px;
                font-size: 11px;
                color: var(--color-text-tertiary);
                margin-bottom: 4px;
                flex-wrap: wrap;
            }
            
            .notificacion-detalles span {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .riesgo-bajo { color: #28a745; }
            .riesgo-medio { color: #ffc107; }
            .riesgo-alto { color: #fd7e14; }
            .riesgo-critico { color: #dc3545; }
            
            .notificacion-tiempo {
                font-size: 10px;
                color: var(--color-text-tertiary);
            }
            
            .notificacion-estado {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-top: 5px;
            }
            
            .notificacion-estado.no-leida {
                background-color: #007bff;
                box-shadow: 0 0 5px #007bff;
            }
            
            .notificacion-estado.leida {
                background-color: transparent;
            }
            
            .notificaciones-vacia,
            .notificaciones-cargando {
                padding: 30px;
                text-align: center;
                color: var(--color-text-secondary);
            }
            
            .notificaciones-vacia i,
            .notificaciones-cargando i {
                font-size: 40px;
                margin-bottom: 10px;
                opacity: 0.5;
            }
            
            .notificaciones-footer,
            .notificaciones-ver-mas {
                padding: 12px 15px;
                border-top: 1px solid var(--color-border-light);
                text-align: center;
            }
            
            .notificaciones-footer a,
            .notificaciones-ver-mas a {
                color: var(--color-accent-primary);
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
            }
            
            .notificaciones-footer a:hover,
            .notificaciones-ver-mas a:hover {
                text-decoration: underline;
            }
            
            /* Botón hamburguesa */
            .navbar-hamburger-btn {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                background: none;
                border: none;
                cursor: pointer;
                width: 40px;
                height: 40px;
                padding: 0;
                position: relative;
                z-index: 1002;
                transition: var(--transition-default);
                flex-shrink: 0;
            }
            
            .hamburger-line {
                display: block;
                width: 25px;
                height: 3px;
                background-color: var(--navbar-text);
                margin: 3px 0;
                border-radius: var(--border-radius-small);
                transition: var(--transition-default);
            }
            
            .navbar-hamburger-btn.active .hamburger-line:nth-child(1) {
                transform: rotate(45deg) translate(6.3px, 6.3px);
            }
            
            .navbar-hamburger-btn.active .hamburger-line:nth-child(2) {
                opacity: 0;
            }
            
            .navbar-hamburger-btn.active .hamburger-line:nth-child(3) {
                transform: rotate(-45deg) translate(6.3px, -6.3px);
            }
            
            /* Menú lateral */
            .navbar-main-menu {
                position: fixed;
                top: 0;
                right: -100%;
                width: 25%;
                height: 100vh;
                background-color: var(--navbar-scrolled-bg);
                margin: 0;
                padding: 0 0 30px 0;
                display: flex;
                flex-direction: column;
                transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 1001;
                overflow-y: auto;
                box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);
                visibility: hidden;
                opacity: 0;
                overflow-x: hidden;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }
            
            .navbar-main-menu::-webkit-scrollbar {
                display: none;
                width: 0;
                background: transparent;
            }
            
            .navbar-main-menu.active {
                right: 0;
                visibility: visible;
                opacity: 1;
            }
            
            /* Perfil del administrador */
            .admin-profile-section {
                padding: 30px 25px 20px;
                background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-primary) 100%);
                color: var(--color-text-primary);
                border-bottom: 1px solid var(--color-border-light);
                text-align: center;
                position: relative;
            }
            
            .profile-photo-container {
                position: relative;
                width: 120px;
                height: 120px;
                margin: 0 auto 20px;
                display: inline-block;
            }
            
            .admin-profile-circle {
                width: 100%;
                height: 100%;
                border-radius: var(--border-radius-circle);
                overflow: hidden;
                border: 3px solid var(--color-accent-primary);
                background-color: var(--color-bg-secondary);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .admin-profile-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .profile-placeholder {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: var(--color-accent-primary);
                font-size: 40px;
            }
            
            .profile-placeholder span {
                font-size: 12px;
                margin-top: 5px;
                font-weight: bold;
            }
            
            .edit-profile-icon {
                position: absolute;
                bottom: 5px;
                right: 5px;
                background-color: var(--color-accent-primary);
                width: 35px;
                height: 35px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
                cursor: pointer;
                transition: all 0.3s ease;
                border: 2px solid white;
                z-index: 10;
                text-decoration: none;
                color: white;
            }
            
            .edit-profile-icon:hover {
                background-color: var(--color-accent-secondary);
                transform: scale(1.1) rotate(10deg);
                color: white;
            }
            
            .edit-profile-icon i {
                font-size: 14px;
            }
            
            .admin-info {
                margin-bottom: 20px;
            }
            
            .admin-name {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 5px;
                color: var(--color-text-primary);
                font-family: 'Orbitron', sans-serif;
                min-height: 25px;
            }
            
            .admin-role {
                font-size: 14px;
                color: var(--color-text-secondary);
                margin-bottom: 10px;
                font-family: 'Orbitron', sans-serif;
            }
            
            .admin-email {
                font-size: 13px;
                color: var(--color-text-tertiary);
                min-height: 20px;
            }
            
            .admin-organization {
                font-size: 13px;
                color: var(--color-accent-primary);
                margin-top: 5px;
                font-weight: 600;
            }
            
            /* Secciones del menú */
            .nav-section {
                padding: 10px 15px;
                border-bottom: 1px solid var(--color-border-light);
                overflow-x: hidden;
                max-width: 100%;
                box-sizing: border-box;
            }
            
            .nav-section:last-of-type {
                border-bottom: none;
            }
            
            .nav-section-title {
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 15px;
                color: var(--color-text-secondary);
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: 'Orbitron', sans-serif;
            }
            
            /* Botones desplegables */
            .gestion-dropdown-btn,
            .admin-dropdown-btn {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                padding: 14px 16px;
                background-color: var(--color-bg-primary);
                border: 2px solid var(--color-border-medium);
                border-radius: var(--border-radius-medium);
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 16px;
                font-weight: 600;
                color: var(--color-text-primary);
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
                font-family: 'Orbitron', sans-serif;
                margin-bottom: 15px;
            }
            
            .gestion-dropdown-btn:hover,
            .admin-dropdown-btn:hover {
                background-color: var(--color-bg-secondary);
                transform: translateY(-2px);
                box-shadow: 0 5px 12px rgba(0, 0, 0, 0.15);
            }
            
            .gestion-dropdown-btn i,
            .admin-dropdown-btn i {
                transition: transform 0.3s ease;
                font-size: 14px;
            }
            
            .gestion-dropdown-btn.active i,
            .admin-dropdown-btn.active i {
                transform: rotate(180deg);
            }
            
            /* Opciones desplegables */
            .gestion-dropdown-options,
            .admin-dropdown-options {
                display: none;
                flex-direction: column;
                gap: 10px;
                padding: 15px;
                background-color: var(--color-bg-tertiary);
                border-radius: var(--border-radius-medium);
                border: 1px solid var(--color-border-light);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                margin-bottom: 0;
                width: 100%;
                box-sizing: border-box;
            }
            
            .gestion-dropdown-options.active,
            .admin-dropdown-options.active {
                display: flex;
                opacity: 1;
                overflow: visible;
                margin-bottom: 15px;
                position: static;
                height: auto;
                flex-direction: column;
            }
            
            /* Items de opciones */
            .gestion-dropdown-option,
            .admin-dropdown-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 15px;
                background-color: var(--color-bg-primary);
                border: 1px solid var(--color-border-light);
                border-radius: var(--border-radius-small);
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                color: var(--color-text-primary);
                font-weight: 500;
                font-family: 'Orbitron', sans-serif;
                word-break: break-word;
                white-space: normal;
                width: 100%;
                box-sizing: border-box;
            }
            
            .gestion-dropdown-option:hover,
            .admin-dropdown-option:hover {
                background-color: var(--color-bg-secondary);
                transform: translateX(5px);
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
            }
            
            .gestion-dropdown-option i,
            .admin-dropdown-option i {
                width: 20px;
                text-align: center;
                font-size: 16px;
                color: var(--color-accent-primary);
                flex-shrink: 0;
            }
            
            .gestion-dropdown-option span,
            .admin-dropdown-option span {
                flex: 1;
                white-space: normal;
                word-break: break-word;
                line-height: 1.4;
            }
            
            /* Botón cerrar sesión */
            .logout-option {
                background: linear-gradient(135deg, #ff6b6b, #ff5252);
                border-color: #ff5252;
                color: white;
            }
            
            .logout-option:hover {
                background: linear-gradient(135deg, #ff5252, #ff3838);
                border-color: #ff3838;
            }
            
            .logout-option i {
                color: white;
            }
            
            .menu-section {
                padding: 20px 25px;
                border-bottom: 1px solid var(--color-border-light);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .empty-menu-item {
                padding: 10px 15px;
                border-radius: var(--border-radius-small);
                transition: var(--transition-default);
                height: 40px;
                background-color: transparent;
                border: none;
                cursor: default;
            }
            
            .admin-options-section {
                padding: 20px 25px;
                border-top: 1px solid var(--color-border-light);
                margin-top: 0;
                flex-shrink: 0;
            }
            
            /* Overlay móvil */
            .navbar-mobile-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                display: none;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            
            .navbar-mobile-overlay.active {
                display: block;
                opacity: 1;
            }
            
            .nav-section {
                flex-shrink: 0;
                overflow: visible !important;
            }
            
            .gestion-dropdown-options,
            .admin-dropdown-options {
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
            }
            
            .gestion-dropdown-options.active,
            .admin-dropdown-options.active {
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
            }
            
            .navbar-main-menu {
                overflow-y: auto !important;
            }
            
            .navbar-main-menu * {
                overflow-y: visible !important;
            }
            
            /* ============================================ */
            /* MEDIA QUERIES - RESPONSIVE DESIGN */
            /* ============================================ */
            
            /* Tablets y pantallas medianas */
            @media (max-width: 992px) {
                .navbar-top-section {
                    padding: 5px 15px;
                }
                
                .navbar-left-container {
                    gap: 8px;
                    max-width: 35%;
                    overflow: hidden;
                }
                
                .navbar-logo-link {
                    height: 55px;
                }
                
                .logo-circle-container {
                    width: 45px;
                    height: 45px;
                }
                
                .org-text-logo {
                    width: 45px;
                    height: 45px;
                    font-size: 12px;
                }
                
                .logo-separator {
                    height: 35px;
                    margin: 0 4px;
                }
                
                .navbar-title {
                    position: relative;
                    left: auto;
                    top: auto;
                    transform: none;
                    font-size: 20px;
                    white-space: nowrap;
                    margin: 0 auto;
                    text-align: center;
                    flex: 1;
                    pointer-events: auto;
                }
                
                .navbar-right-container {
                    gap: 10px;
                }
                
                .navbar-main-menu {
                    width: 85%;
                }
                
                body.menu-open {
                    overflow: hidden;
                }
                
                .notificaciones-dropdown {
                    width: 320px;
                    right: -40px;
                }
            }
                .navbar-left-container {
                    gap: 6px;
                    max-width: 30%;
                }
                
                .navbar-logo-link {
                    height: 45px;
                }
                
                .logo-circle-container {
                    width: 38px;
                    height: 38px;
                }
                
                .org-text-logo {
                    width: 38px;
                    height: 38px;
                    font-size: 11px;
                }
                
                .logo-separator {
                    height: 30px;
                    margin: 0 3px;
                }
                
                .navbar-title {
                    font-size: 16px;
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 35%;
                }
                
                .navbar-right-container {
                    gap: 8px;
                }
                
                .navbar-notificaciones-btn {
                    padding: 6px;
                    font-size: 18px;
                }
                
                .navbar-hamburger-btn {
                    width: 36px;
                    height: 36px;
                }
                .profile-photo-container {
                    width: 100px;
                    height: 100px;
                }
                
                .edit-profile-icon {
                    width: 30px;
                    height: 30px;
                }
                
                .gestion-dropdown-btn,
                .admin-dropdown-btn {
                    padding: 12px 14px;
                    font-size: 15px;
                }
                
                .gestion-dropdown-options,
                .admin-dropdown-options {
                    padding: 12px;
                }
                
                .gestion-dropdown-options.active,
                .admin-dropdown-options.active {
                    max-height: 1500px;
                }
                
                .gestion-dropdown-option,
                .admin-dropdown-option {
                    padding: 14px 12px;
                    gap: 12px;
                }
                
                .gestion-dropdown-option i,
                .admin-dropdown-option i {
                    font-size: 16px;
                    width: 24px;
                }
                
                .gestion-dropdown-option span,
                .admin-dropdown-option span {
                    font-size: 15px;
                    line-height: 1.4;
                }
                
                .nav-section-title {
                    font-size: 15px;
                }
                
                .notificaciones-dropdown {
                    width: 300px;
                    right: -50px;
                }
            }
            
            /* Móviles pequeños */
            @media (max-width: 480px) {
                .navbar-top-section {
                    padding: 5px 8px;
                }
                
                .navbar-left-container {
                    gap: 4px;
                    max-width: 28%;
                }
                
                .navbar-logo-link {
                    height: 38px;
                }
                
                .logo-circle-container {
                    width: 32px;
                    height: 32px;
                    border-width: 2px;
                }
                
                .org-text-logo {
                    width: 32px;
                    height: 32px;
                    font-size: 9px;
                    border-width: 2px;
                }
                
                .logo-separator {
                    height: 24px;
                    margin: 0 2px;
                }
                
                .navbar-title {
                    font-size: 13px;
                    font-weight: 600;
                    max-width: 32%;
                }
                
                .navbar-right-container {
                    gap: 5px;
                }
                
                .navbar-notificaciones-btn {
                    padding: 5px;
                    font-size: 16px;
                }
                
                .notificaciones-badge {
                    font-size: 9px;
                    min-width: 15px;
                    height: 15px;
                }
                
                .navbar-hamburger-btn {
                    width: 32px;
                    height: 32px;
                }
                
           
                
                .gestion-dropdown-option,
                .admin-dropdown-option {
                    padding: 12px 10px;
                }
                
                .gestion-dropdown-option span,
                .admin-dropdown-option span {
                    font-size: 14px;
                }
                
                .notificaciones-dropdown {
                    width: 280px;
                    right: -60px;
                }
            }
            
 
                .logo-circle-container {
                    width: 28px;
                    height: 28px;
                }
                
                .org-text-logo {
                    width: 28px;
                    height: 28px;
                    font-size: 8px;
                }
                
                .logo-separator {
                    height: 20px;
                }
                
                .navbar-title {
                    font-size: 11px;
                    max-width: 30%;
                }
                
                .navbar-notificaciones-btn {
                    padding: 4px;
                    font-size: 14px;
                }
                
                .notificaciones-badge {
                    font-size: 8px;
                    min-width: 13px;
                    height: 13px;
                }
                
                .navbar-hamburger-btn {
                    width: 28px;
                    height: 28px;
                }
                
           
            }
            
            /* Pantallas muy grandes */
            @media (min-width: 1600px) {
                .navbar-top-section {
                    padding: 5px 40px;
                }
                
                .navbar-title {
                    font-size: 28px;
                }
                
                .logo-circle-container {
                    width: 55px;
                    height: 55px;
                }
                
                .org-text-logo {
                    width: 55px;
                    height: 55px;
                    font-size: 16px;
                }
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'navbar-complete-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }

    insertHTML() {
        const navbar = document.createElement('header');
        navbar.id = 'complete-navbar';
        navbar.innerHTML = `
            <div class="navbar-top-section">
                <div class="navbar-left-container">
                    <a href="/usuarios/administradorSistema/panelAdministrador/panelAdministrador.html" class="navbar-logo-link">
                        <div class="logo-circle-container">
                            <img src="/assets/images/logo.png" alt="Centinela Logo" class="navbar-logo-img">
                        </div>
                    </a>
                    <div class="logo-separator"></div>
                    <a href="/usuarios/administradorSistema/panelAdministrador/panelAdministrador.html" class="navbar-logo-link" id="orgLogoLink">
                        <div class="logo-circle-container" id="orgLogoContainer">
                            <img src="/assets/images/logo.png" alt="Logo Organización" class="navbar-logo-img" id="orgLogoImg">
                            <div class="org-text-logo" id="orgTextLogo" style="display: none;"></div>
                        </div>
                    </a>
                </div>
                <h1 class="navbar-title">CENTINELA</h1>
                <div class="navbar-right-container">
                    <div class="navbar-notificaciones-container">
                        <button class="navbar-notificaciones-btn" id="notificacionesBtn">
                            <i class="fas fa-bell"></i>
                            <span class="notificaciones-badge" id="notificacionesBadge" style="display: none;">0</span>
                        </button>
                        <div class="notificaciones-dropdown" id="notificacionesDropdown">
                            <div class="notificaciones-header">
                                <h3>Notificaciones</h3>
                                <button class="notificaciones-marcar-todas" id="marcarTodasBtn">
                                    <i class="fas fa-check-double"></i> Marcar todas
                                </button>
                            </div>
                            <div class="notificaciones-lista" id="notificacionesLista">
                                <div class="notificaciones-cargando">
                                    <i class="fas fa-spinner fa-spin"></i>
                                    <p>Cargando notificaciones...</p>
                                </div>
                            </div>
                            <div class="notificaciones-footer">
                                <a href="#" class="ver-todas-notificaciones-footer">Ver todas</a>
                            </div>
                        </div>
                    </div>
                    <button class="navbar-hamburger-btn" id="navbarHamburger" aria-label="Toggle menu">
                        <span class="hamburger-line"></span>
                        <span class="hamburger-line"></span>
                        <span class="hamburger-line"></span>
                    </button>
                </div>
            </div>
            <div class="navbar-mobile-overlay" id="navbarMobileOverlay"></div>
            <div class="navbar-main-menu" id="navbarMainMenu">
                <div class="admin-profile-section">
                    <div class="profile-photo-container">
                        <div class="admin-profile-circle">
                            <img src="/assets/images/logo.png" alt="Administrador" class="admin-profile-img" id="adminProfileImg">
                            <div class="profile-placeholder" id="profilePlaceholder" style="display: none;">
                                <i class="fas fa-user"></i>
                                <span>Admin</span>
                            </div>
                        </div>
                        <a href="/usuarios/administradorSistema/editarAdministrador/editarAdministrador.html" class="edit-profile-icon" id="editProfileIcon">
                            <i class="fas fa-pencil-alt"></i>
                        </a>
                    </div>
                    <div class="admin-info">
                        <div class="admin-name" id="adminName">Cargando...</div>
                        <div class="admin-role">Administrador</div>
                        <div class="admin-email" id="adminEmail">cargando@email.com</div>
                        <div class="admin-organization" id="adminOrganization"></div>
                    </div>
                </div>
                <div class="nav-section">
                    <button class="gestion-dropdown-btn" id="gestionDropdownBtn">
                        <span>Gestionar</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <div class="gestion-dropdown-options" id="gestionDropdownOptions">
                        <a href="/usuarios/administradorSistema/consumoGlobal/consumoGlobal.html" class="gestion-dropdown-option">
                            <i class="fa-solid fa-chart-line"></i>
                            <span>Consumo Global</span>
                        </a>
                        <a href="/usuarios/administradorSistema/cuentasPM/cuentasPM.html" class="gestion-dropdown-option">
                            <i class="fa-solid fa-chart-pie"></i>
                            <span>Cuentas PM</span>
                        </a>
                        <a href="/usuarios/administradorSistema/registroPM/registroPM.html" class="gestion-dropdown-option">
                            <i class="fa-solid fa-user-plus"></i>
                            <span>Registro PM</span>
                        </a>
                        <a href="/usuarios/administradorSistema/temporalCreacionAS/temporalCreacionAS.html" class="gestion-dropdown-option">
                            <i class="fa-solid fa-clock"></i>
                            <span>Temporal Creación AS</span>
                        </a>
                    </div>
                </div>
                <div class="admin-options-section">
                    <button class="admin-dropdown-btn" id="adminDropdownBtn">
                        <span>Configuración</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <div class="admin-dropdown-options" id="adminDropdownOptions">
                        <a href="/usuarios/administradorSistema/administradorTemas/administradorTemas.html" class="admin-dropdown-option">
                            <i class="fa-solid fa-palette"></i>
                            <span>Personalización</span>
                        </a>
                        <a href="#" class="admin-dropdown-option logout-option" id="logoutOption">
                            <i class="fa-solid fa-right-from-bracket"></i>
                            <span>Cerrar Sesión</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
        document.body.prepend(navbar);
    }

    adjustBodyPadding() {
        const navbar = document.getElementById('complete-navbar');
        if (!navbar) return;
        const updatePadding = () => document.body.style.paddingTop = `${navbar.offsetHeight}px`;
        updatePadding();
        new ResizeObserver(updatePadding).observe(navbar);
    }

    loadAdminDataFromLocalStorage() {
        try {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            if (!isLoggedIn) return false;
            const userDataString = localStorage.getItem('userData');
            if (userDataString) {
                const userData = JSON.parse(userDataString);
                let fotoUsuario = null, fotoOrganizacion = null;
                if (userData.fotoUsuario && userData.fotoUsuario.length > 10) fotoUsuario = userData.fotoUsuario;
                else { const userFotoKey = localStorage.getItem('userFoto'); if (userFotoKey && userFotoKey.length > 10) fotoUsuario = userFotoKey; }
                if (userData.fotoOrganizacion && userData.fotoOrganizacion.length > 10) fotoOrganizacion = userData.fotoOrganizacion;
                else { const orgLogoKey = localStorage.getItem('organizacionLogo'); if (orgLogoKey && orgLogoKey.length > 10) fotoOrganizacion = orgLogoKey; }
                this.currentAdmin = { id: userData.id || localStorage.getItem('userId'), uid: userData.id, correoElectronico: userData.email || localStorage.getItem('userEmail'), nombreCompleto: userData.nombreCompleto || localStorage.getItem('userNombre'), rol: userData.rol || localStorage.getItem('userRole'), organizacion: userData.organizacion || localStorage.getItem('userOrganizacion'), organizacionCamelCase: userData.organizacionCamelCase || localStorage.getItem('userOrganizacionCamelCase'), fotoUsuario, fotoOrganizacion, status: userData.status || 'activo', verificado: userData.verificado || true, ultimoAcceso: userData.ultimoAcceso || userData.sessionStart };
                return true;
            }
            this.currentAdmin = { id: localStorage.getItem('userId'), correoElectronico: localStorage.getItem('userEmail'), nombreCompleto: localStorage.getItem('userNombre'), rol: localStorage.getItem('userRole'), organizacion: localStorage.getItem('userOrganizacion'), organizacionCamelCase: localStorage.getItem('userOrganizacionCamelCase'), fotoUsuario: localStorage.getItem('userFoto') || null, fotoOrganizacion: localStorage.getItem('organizacionLogo') || null };
            return !!(this.currentAdmin.nombreCompleto && this.currentAdmin.rol);
        } catch (error) { return false; }
    }

    async loadAdminDataFromFirebase() {
        try {
            const { UserManager } = await import('/clases/user.js');
            this.userManager = new UserManager();
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (this.userManager.currentUser) {
                const firebaseUser = this.userManager.currentUser;
                let needsUpdate = false;
                if (!this.currentAdmin) needsUpdate = true;
                else if (firebaseUser.nombreCompleto !== this.currentAdmin.nombreCompleto) needsUpdate = true;
                else if (firebaseUser.fotoUsuario !== this.currentAdmin.fotoUsuario) needsUpdate = true;
                else if (firebaseUser.fotoOrganizacion !== this.currentAdmin.fotoOrganizacion) needsUpdate = true;
                else if (firebaseUser.organizacion !== this.currentAdmin.organizacion) needsUpdate = true;
                else if (firebaseUser.correoElectronico !== this.currentAdmin.correoElectronico) needsUpdate = true;
                else if (firebaseUser.rol !== this.currentAdmin.rol) needsUpdate = true;
                if (needsUpdate) {
                    this.currentAdmin = { ...this.currentAdmin, ...firebaseUser, rol: firebaseUser.rol };
                    this.updateNavbarWithAdminData();
                    this.updateLocalStorageFromFirebase(firebaseUser);
                }
            }
        } catch (error) {}
    }

    updateLocalStorageFromFirebase(userData) {
        try {
            const currentUserData = JSON.parse(localStorage.getItem('userData') || '{}');
            const updatedUserData = { ...currentUserData, id: userData.id, uid: userData.id, email: userData.correoElectronico, nombreCompleto: userData.nombreCompleto, rol: userData.rol, organizacion: userData.organizacion, organizacionCamelCase: userData.organizacionCamelCase, fotoUsuario: userData.fotoUsuario, fotoOrganizacion: userData.fotoOrganizacion, status: userData.status, verificado: userData.verificado, ultimoAcceso: userData.ultimoAcceso };
            localStorage.setItem('userData', JSON.stringify(updatedUserData));
            if (userData.fotoUsuario) localStorage.setItem('userFoto', userData.fotoUsuario);
            if (userData.fotoOrganizacion) localStorage.setItem('organizacionLogo', userData.fotoOrganizacion);
            if (userData.nombreCompleto) localStorage.setItem('userNombre', userData.nombreCompleto);
            if (userData.correoElectronico) localStorage.setItem('userEmail', userData.correoElectronico);
            if (userData.rol) localStorage.setItem('userRole', userData.rol);
            if (userData.organizacion) localStorage.setItem('userOrganizacion', userData.organizacion);
            if (userData.organizacionCamelCase) localStorage.setItem('userOrganizacionCamelCase', userData.organizacionCamelCase);
        } catch (error) {}
    }

    updateNavbarWithAdminData() {
        if (!this.currentAdmin) {
            const adminName = document.getElementById('adminName'), adminEmail = document.getElementById('adminEmail'), adminOrganization = document.getElementById('adminOrganization');
            if (adminName) adminName.textContent = 'No autenticado';
            if (adminEmail) adminEmail.textContent = 'Inicia sesión para continuar';
            if (adminOrganization) adminOrganization.textContent = '';
            return;
        }
        this.updateOrganizationLogo();
        this.updateAdminMenuInfo();
        this.setupAdminButtons();
    }

    setupAdminButtons() {}

    updateOrganizationLogo() {
        const organizationLogoImg = document.getElementById('orgLogoImg');
        const orgTextLogo = document.getElementById('orgTextLogo');
        const orgLogoLink = document.getElementById('orgLogoLink');
        const orgLogoContainer = document.getElementById('orgLogoContainer');
        
        if (!organizationLogoImg || !orgTextLogo || !orgLogoLink || !orgLogoContainer) return;
        
        const fotoAdmin = this.currentAdmin?.fotoUsuario;
        
        if (fotoAdmin && fotoAdmin.length > 10) {
            orgTextLogo.innerHTML = '';
            const imgElement = document.createElement('img');
            imgElement.src = fotoAdmin;
            imgElement.alt = `Foto de ${this.currentAdmin?.nombreCompleto || 'Administrador'}`;
            imgElement.style.width = '100%';
            imgElement.style.height = '100%';
            imgElement.style.borderRadius = '50%';
            imgElement.style.objectFit = 'cover';
            orgTextLogo.appendChild(imgElement);
            orgTextLogo.style.display = 'flex';
            organizationLogoImg.style.display = 'none';
            orgTextLogo.style.backgroundColor = 'transparent';
            orgTextLogo.style.border = '3px solid var(--color-accent-primary)';
        } else {
            orgTextLogo.innerHTML = '';
            const orgName = this.currentAdmin?.organizacion || 'Organización';
            const initials = orgName.split(' ').map(word => word.charAt(0)).join('').toUpperCase().substring(0, 3);
            orgTextLogo.textContent = initials;
            orgTextLogo.style.display = 'flex';
            organizationLogoImg.style.display = 'none';
            orgTextLogo.style.backgroundColor = 'var(--color-accent-primary)';
            orgTextLogo.style.color = 'white';
        }
        
        orgLogoLink.href = '/usuarios/administradorSistema/panelAdministrador/panelAdministrador.html';
        orgLogoContainer.style.borderRadius = '50%';
        orgLogoContainer.style.overflow = 'hidden';
    }

    showOrgTextLogo() {
        const organizationLogoImg = document.getElementById('orgLogoImg');
        const orgTextLogo = document.getElementById('orgTextLogo');
        if (!organizationLogoImg || !orgTextLogo) return;
        
        const fotoAdmin = this.currentAdmin?.fotoUsuario;
        
        if (fotoAdmin && fotoAdmin.length > 10) {
            orgTextLogo.innerHTML = '';
            const imgElement = document.createElement('img');
            imgElement.src = fotoAdmin;
            imgElement.alt = `Foto de ${this.currentAdmin?.nombreCompleto || 'Administrador'}`;
            imgElement.style.width = '100%';
            imgElement.style.height = '100%';
            imgElement.style.borderRadius = '50%';
            imgElement.style.objectFit = 'cover';
            orgTextLogo.appendChild(imgElement);
            orgTextLogo.style.backgroundColor = 'transparent';
        } else {
            orgTextLogo.innerHTML = '';
            const orgName = this.currentAdmin?.organizacion || 'Organización';
            const initials = orgName.split(' ').map(word => word.charAt(0)).join('').toUpperCase().substring(0, 3);
            orgTextLogo.textContent = initials;
            orgTextLogo.style.backgroundColor = 'var(--color-accent-primary)';
            orgTextLogo.style.color = 'white';
        }
        
        orgTextLogo.style.display = 'flex';
        organizationLogoImg.style.display = 'none';
    }

    updateAdminMenuInfo() {
        const adminName = document.getElementById('adminName');
        if (adminName) adminName.textContent = this.currentAdmin?.nombreCompleto || 'Administrador';
        const adminEmail = document.getElementById('adminEmail');
        if (adminEmail) adminEmail.textContent = this.currentAdmin?.correoElectronico || 'No especificado';
        const adminOrganization = document.getElementById('adminOrganization');
        if (adminOrganization) adminOrganization.textContent = this.currentAdmin?.organizacion || 'Sin organización';
        const adminProfileImg = document.getElementById('adminProfileImg'), profilePlaceholder = document.getElementById('profilePlaceholder');
        if (adminProfileImg && profilePlaceholder) {
            if (this.currentAdmin?.fotoUsuario && this.currentAdmin.fotoUsuario.length > 10) {
                adminProfileImg.src = this.currentAdmin.fotoUsuario;
                adminProfileImg.style.display = 'block';
                profilePlaceholder.style.display = 'none';
                adminProfileImg.alt = `Foto de ${this.currentAdmin.nombreCompleto || 'Administrador'}`;
            } else this.showProfilePlaceholder();
        }
    }

    showProfilePlaceholder() {
        const adminProfileImg = document.getElementById('adminProfileImg'), profilePlaceholder = document.getElementById('profilePlaceholder');
        if (!adminProfileImg || !profilePlaceholder) return;
        adminProfileImg.style.display = 'none';
        profilePlaceholder.style.display = 'flex';
        const placeholderText = profilePlaceholder.querySelector('span');
        if (placeholderText && this.currentAdmin?.nombreCompleto) {
            const initials = this.currentAdmin.nombreCompleto.split(' ').map(word => word.charAt(0)).join('').toUpperCase().substring(0, 2);
            placeholderText.textContent = initials;
        }
    }

    setupFunctionalities() {
        this.setupMenu();
        this.setupScroll();
        this.loadFontAwesome();
        this.setupAdminDropdown();
        this.setupGestionDropdown();
        this.loadOrbitronFont();
        this.setupLogout();
        this._configurarNotificacionesDropdown();
        const verTodasFooter = document.querySelector('.ver-todas-notificaciones-footer');
        if (verTodasFooter) verTodasFooter.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._mostrarModalNotificaciones(); });
    }

    setupMenu() {
        const hamburgerBtn = document.getElementById('navbarHamburger'), mainMenu = document.getElementById('navbarMainMenu'), overlay = document.getElementById('navbarMobileOverlay');
        if (!hamburgerBtn || !mainMenu || !overlay) return;
        const toggleMenu = () => {
            this.isMenuOpen = !this.isMenuOpen;
            mainMenu.classList.toggle('active', this.isMenuOpen);
            hamburgerBtn.classList.toggle('active', this.isMenuOpen);
            overlay.classList.toggle('active', this.isMenuOpen);
            document.body.classList.toggle('menu-open', this.isMenuOpen);
            if (!this.isMenuOpen) {
                if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
                if (this.isGestionDropdownOpen) this.toggleGestionDropdown(false);
            }
        };
        const closeMenu = () => {
            if (this.isMenuOpen) {
                this.isMenuOpen = false;
                mainMenu.classList.remove('active');
                hamburgerBtn.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('menu-open');
                if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
                if (this.isGestionDropdownOpen) this.toggleGestionDropdown(false);
            }
        };
        hamburgerBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', closeMenu);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isMenuOpen) closeMenu(); });
        window.addEventListener('resize', () => { if (window.innerWidth > 992 && this.isMenuOpen) closeMenu(); });
    }

    setupGestionDropdown() {
        const dropdownBtn = document.getElementById('gestionDropdownBtn'), dropdownOptions = document.getElementById('gestionDropdownOptions');
        if (!dropdownBtn || !dropdownOptions) return;
        const toggleDropdown = () => {
            if (this.isAdminDropdownOpen) this.toggleAdminDropdown(false);
            this.isGestionDropdownOpen = !this.isGestionDropdownOpen;
            this.toggleGestionDropdown(this.isGestionDropdownOpen);
        };
        dropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
        document.addEventListener('click', (e) => { if (!dropdownBtn.contains(e.target) && !dropdownOptions.contains(e.target) && this.isGestionDropdownOpen) this.toggleGestionDropdown(false); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isGestionDropdownOpen) this.toggleGestionDropdown(false); });
        dropdownOptions.querySelectorAll('.gestion-dropdown-option').forEach(option => { option.addEventListener('click', () => setTimeout(() => this.toggleGestionDropdown(false), 100)); });
    }

    setupAdminDropdown() {
        const dropdownBtn = document.getElementById('adminDropdownBtn'), dropdownOptions = document.getElementById('adminDropdownOptions');
        if (!dropdownBtn || !dropdownOptions) return;
        const toggleDropdown = () => {
            if (this.isGestionDropdownOpen) this.toggleGestionDropdown(false);
            this.isAdminDropdownOpen = !this.isAdminDropdownOpen;
            this.toggleAdminDropdown(this.isAdminDropdownOpen);
        };
        dropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
        document.addEventListener('click', (e) => { if (!dropdownBtn.contains(e.target) && !dropdownOptions.contains(e.target) && this.isAdminDropdownOpen) this.toggleAdminDropdown(false); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isAdminDropdownOpen) this.toggleAdminDropdown(false); });
    }

    setupLogout() {
        const logoutOption = document.getElementById('logoutOption');
        if (!logoutOption) return;
        logoutOption.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); (await this.showLogoutConfirmation()) && await this.performLogout(); });
    }

    async showLogoutConfirmation() {
        return new Promise((resolve) => {
            if (typeof Swal !== 'undefined') Swal.fire({ title: '¿Cerrar sesión?', text: '¿Estás seguro de que deseas salir del sistema?', icon: 'warning', showCancelButton: true, confirmButtonText: 'CONFIRMAR', cancelButtonText: 'CANCELAR' }).then(result => resolve(result.isConfirmed));
            else resolve(confirm('¿Estás seguro de que deseas cerrar sesión?'));
        });
    }

    async performLogout() {
        try {
            if (this.intervalNotificaciones) clearInterval(this.intervalNotificaciones), this.intervalNotificaciones = null;
            if (this.userManager && typeof this.userManager.logout === 'function') await this.userManager.logout();
            else await this.signOutFirebaseDirectly();
            this.clearAllStorage();
            await this.showLogoutSuccessMessage();
            this.redirectToLogin();
        } catch (error) { this.clearAllStorage(); this.redirectToLogin(); }
    }

    async signOutFirebaseDirectly() {
        try {
            if (typeof firebase !== 'undefined' && firebase.auth) { await firebase.auth().signOut(); return; }
            const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js');
            const firebaseApps = typeof firebase !== 'undefined' ? firebase.apps : [];
            if (firebaseApps && firebaseApps.length > 0) await signOut(getAuth(firebaseApps[0]));
        } catch (error) {}
    }

    clearAllStorage() {
        try { localStorage.clear(); sessionStorage.clear(); this.clearSessionCookies(); this.clearIndexedDB(); } catch (error) {}
    }

    clearSessionCookies() {
        try {
            document.cookie.split(';').forEach(cookie => {
                const name = cookie.indexOf('=') > -1 ? cookie.substr(0, cookie.indexOf('=')).trim() : cookie.trim();
                if (name.includes('session') || name.includes('auth') || name.includes('firebase')) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            });
        } catch (error) {}
    }

    async clearIndexedDB() {
        try { for (const dbName of ['firebaseLocalStorageDb', 'firestore', 'centinela-db']) await indexedDB.deleteDatabase(dbName); } catch (error) {}
    }

    async showLogoutSuccessMessage() {
        if (typeof Swal !== 'undefined') await Swal.fire({ icon: 'success', title: 'Sesión cerrada', text: 'Has cerrado sesión exitosamente. Redirigiendo...', timer: 2000, showConfirmButton: false, timerProgressBar: true, willClose: () => this.redirectToLogin() });
        else alert('Sesión cerrada exitosamente. Redirigiendo...');
    }

    redirectToLogin() {
        const timestamp = new Date().getTime();
        window.location.href = `/index.html?logout=true&timestamp=${timestamp}&nocache=1`;
        setTimeout(() => window.location.replace(`/index.html?logout=true&timestamp=${timestamp}&nocache=1`), 1000);
    }

    toggleAdminDropdown(show) {
        const dropdownBtn = document.getElementById('adminDropdownBtn'), dropdownOptions = document.getElementById('adminDropdownOptions');
        if (dropdownBtn && dropdownOptions) dropdownBtn.classList.toggle('active', show), dropdownOptions.classList.toggle('active', show), this.isAdminDropdownOpen = show;
    }

    toggleGestionDropdown(show) {
        const dropdownBtn = document.getElementById('gestionDropdownBtn'), dropdownOptions = document.getElementById('gestionDropdownOptions');
        if (dropdownBtn && dropdownOptions) dropdownBtn.classList.toggle('active', show), dropdownOptions.classList.toggle('active', show), this.isGestionDropdownOpen = show;
    }

    setupScroll() {
        const navbar = document.getElementById('complete-navbar');
        if (!navbar) return;
        window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));
    }

    loadFontAwesome() { if (!document.querySelector('link[href*="font-awesome"]')) { const faLink = document.createElement('link'); faLink.rel = 'stylesheet'; faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'; document.head.appendChild(faLink); } }

    loadOrbitronFont() { if (!document.querySelector('link[href*="orbitron"]')) { const orbitronLink = document.createElement('link'); orbitronLink.rel = 'stylesheet'; orbitronLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap'; document.head.appendChild(orbitronLink); } }
}

new NavbarComplete();