// ========== navbarColaborador.js - VERSIÓN CON MENÚ MONITOREO Y PERMISOS ==========
// Se agregó nuevo menú "Monitoreo" con Mapa de Alertas y Login Monitoreo
// Se agregó opción "Permisos" dentro de Gestionar con filtro dinámico

class NavbarComplete {
    constructor() {
        this.isMenuOpen = false;
        this.isGestionarDropdownOpen = false;
        this.isIncidenciasDropdownOpen = false;
        this.isConfiguracionDropdownOpen = false;
        this.isMonitoreoDropdownOpen = false;
        this.currentUser = null;
        this.userRole = null;
        this.permisos = null;
        this.permisoManager = null;
        this.notificacionManager = null;
        this.notificacionesNoLeidas = 0;
        this.notificaciones = [];
        this.dropdownNotificacionesAbierto = false;
        this.intervalNotificaciones = null;

        // Sistema de sonidos
        this.sonidoNotificacion = null;
        this.soundEnabled = true;
        this.soundVolume = 0.7;
        this.availableSounds = [];

        this.init();
    }

    init() {
        if (window.NavbarCompleteLoaded) {
            return;
        }

        window.NavbarCompleteLoaded = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            setTimeout(() => this.setup(), 100);
        }
    }

    async setup() {
        try {
            this.removeOriginalNavbar();
            this.createNavbar();
            this.setupFunctionalities();

            this.loadUserDataFromLocalStorage();
            await this.importPermisoManager();
            await this.obtenerPermisosReales();
            this.updateNavbarWithUserData();
            this.filterMenuByPermissions();

            await this._initNotificacionManager();
            await this._initSonidoNotificacion();
            await this._cargarNotificaciones();
            this._iniciarListenerNotificaciones();

        } catch (error) {
            // Error silencioso
        }
    }

    // ========== SISTEMA DE SONIDO ==========
    async _initSonidoNotificacion() {
        try {
            const { sonidoNotificacion } = await import('/clases/sonidoNotificacion.js');
            this.sonidoNotificacion = sonidoNotificacion;

            await this.sonidoNotificacion.initialize();

            this.availableSounds = this.sonidoNotificacion.getAvailableSounds();

            if (this.currentUser) {
                const deviceId = this._getDeviceId();
                const dispositivoActual = this.currentUser.dispositivos?.find(
                    d => d.deviceId === deviceId
                );

                if (dispositivoActual) {
                    if (dispositivoActual.soundEnabled !== undefined) {
                        this.soundEnabled = dispositivoActual.soundEnabled;
                        this.sonidoNotificacion.setEnabled(this.soundEnabled);
                    }
                    if (dispositivoActual.selectedSound) {
                        localStorage.setItem('selectedSound', dispositivoActual.selectedSound);
                    }
                    if (dispositivoActual.soundVolume) {
                        this.soundVolume = dispositivoActual.soundVolume;
                        this.sonidoNotificacion.setGlobalVolume(this.soundVolume);
                        localStorage.setItem('soundVolume', this.soundVolume);
                    }
                } else {
                    const savedSoundEnabled = localStorage.getItem('soundEnabled');
                    if (savedSoundEnabled !== null) {
                        this.soundEnabled = savedSoundEnabled === 'true';
                        this.sonidoNotificacion.setEnabled(this.soundEnabled);
                    }
                    const savedVolume = localStorage.getItem('soundVolume');
                    if (savedVolume !== null) {
                        this.soundVolume = parseFloat(savedVolume);
                        this.sonidoNotificacion.setGlobalVolume(this.soundVolume);
                    }
                }
            }

        } catch (error) {
            this.sonidoNotificacion = null;
        }
    }

    _getDeviceId() {
        let deviceId = localStorage.getItem('fcm_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('fcm_device_id', deviceId);
        }
        return deviceId;
    }

    _determinarSonidoPorNotificacion(notificacion) {
        if (notificacion.nivelRiesgo === 'critico') {
            if (this.availableSounds.some(s => s.id === 'alarma-robo')) {
                return 'alarma-robo';
            }
        }

        if (notificacion.tipo === 'incidencia') {
            if (this.availableSounds.some(s => s.id === 'incidencia')) {
                return 'incidencia';
            }
        }

        if (notificacion.tipo === 'seguimiento' || notificacion.tipo === 'actualizacion') {
            if (this.availableSounds.some(s => s.id === 'actualizacion')) {
                return 'actualizacion';
            }
        }

        if (notificacion.tipo === 'canalizacion') {
            if (this.availableSounds.some(s => s.id === 'canalizacion')) {
                return 'canalizacion';
            }
        }

        if (notificacion.tipo === 'comentario') {
            if (this.availableSounds.some(s => s.id === 'comentario')) {
                return 'comentario';
            }
        }

        if (this.availableSounds.length > 0) {
            return this.availableSounds[0].id;
        }

        return null;
    }

    async _reproducirSonido(notificacion) {
        if (!this.soundEnabled || !this.sonidoNotificacion) return;

        const sonidoId = this._determinarSonidoPorNotificacion(notificacion);
        if (!sonidoId) {
            return;
        }

        try {
            await this.sonidoNotificacion.play(sonidoId, this.soundVolume);
        } catch (error) {
            // Error silencioso
        }
    }

    async _detectarYReproducirSonido(nuevasNotificaciones) {
        if (!this.soundEnabled || !this.sonidoNotificacion) return;

        const nuevasNoLeidas = nuevasNotificaciones.filter(n => !n.leida);

        if (nuevasNoLeidas.length > 0) {
            const primeraNotificacion = nuevasNoLeidas[0];
            await this._reproducirSonido(primeraNotificacion);

            if (Notification.permission === 'granted' && nuevasNoLeidas.length === 1) {
                const primera = nuevasNoLeidas[0];
                const notifUI = primera.toUI ? primera.toUI() : {
                    titulo: primera.titulo,
                    mensaje: primera.mensaje
                };

                const systemNotif = new Notification(notifUI.titulo, {
                    body: notifUI.mensaje,
                    icon: '/assets/images/logo.png',
                    badge: '/assets/images/logo.png',
                    silent: false,
                    vibrate: [200, 100, 200]
                });

                systemNotif.onclick = () => {
                    window.focus();
                    if (primera.urlDestino) {
                        window.location.href = primera.urlDestino;
                    }
                    systemNotif.close();
                };
            } else if (Notification.permission === 'granted' && nuevasNoLeidas.length > 1) {
                const systemNotif = new Notification(`📬 ${nuevasNoLeidas.length} nuevas notificaciones`, {
                    body: `Tienes ${nuevasNoLeidas.length} notificaciones sin leer`,
                    icon: '/assets/images/logo.png',
                    badge: '/assets/images/logo.png',
                    silent: false
                });

                systemNotif.onclick = () => {
                    window.focus();
                    this._mostrarModalNotificaciones();
                    systemNotif.close();
                };
            }
        }
    }

    // ========== NOTIFICACIONES ==========
    async _initNotificacionManager() {
        try {
            const { NotificacionAreaManager } = await import('/clases/notificacionArea.js');
            this.notificacionManager = new NotificacionAreaManager();
        } catch (error) {
            // Error silencioso
        }
    }

    async _cargarNotificaciones() {
        if (!this.notificacionManager || !this.currentUser?.id || !this.currentUser?.organizacionCamelCase) {
            return;
        }

        try {
            const todasNotificaciones = await this.notificacionManager.obtenerNotificaciones(
                this.currentUser.id,
                this.currentUser.organizacionCamelCase,
                false,
                50
            );

            const areaUsuario = this.currentUser.areaId;
            const sucursalUsuario = this.currentUser.sucursalAsignadaId;

            if (!areaUsuario && !sucursalUsuario) {
                this.notificaciones = [];
                this.notificacionesNoLeidas = 0;
            } else {
                const notificacionesFiltradas = todasNotificaciones.filter(notif => {
                    const sucursalesIds = notif.sucursalesIds || [];
                    const sucursalId = notif.sucursalId;
                    const areasIds = notif.areasIds || [];
                    const areasDestino = notif.areasDestino || [];
                    const sucursalesDestino = notif.sucursalesDestino || [];

                    let esParaArea = false;
                    if (areaUsuario) {
                        esParaArea = areasIds.includes(areaUsuario) ||
                            areasDestino.some(a => a.id === areaUsuario);
                    }

                    let esParaSucursal = false;
                    if (sucursalUsuario) {
                        esParaSucursal = sucursalesIds.includes(sucursalUsuario) ||
                            sucursalId === sucursalUsuario ||
                            (sucursalesDestino && sucursalesDestino.some(s => s.id === sucursalUsuario));
                    }

                    return esParaArea || esParaSucursal;
                });

                const nuevasNoLeidas = notificacionesFiltradas.filter(n => !n.leida);
                const nuevas = nuevasNoLeidas.filter(n => {
                    const existe = this.notificaciones.some(old => old.id === n.id);
                    return !existe;
                });

                if (nuevas.length > 0) {
                    await this._detectarYReproducirSonido(nuevas);
                }

                this.notificaciones = notificacionesFiltradas;
                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
            }

            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();

        } catch (error) {
            console.error('Error cargando notificaciones:', error);
        }
    }

    async _marcarTodasLeidas() {
        if (!this.notificacionManager || !this.currentUser?.id || !this.currentUser?.organizacionCamelCase) {
            return;
        }

        try {
            await this.notificacionManager.marcarTodasComoLeidas(
                this.currentUser.id,
                this.currentUser.organizacionCamelCase
            );

            this.notificacionesNoLeidas = 0;
            this.notificaciones.forEach(n => n.leida = true);
            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();

        } catch (error) {
            // Error silencioso
        }
    }

    async _limpiarNotificacionesUsuario() {
        if (!this.notificacionManager || !this.currentUser?.id || !this.currentUser?.organizacionCamelCase) {
            return;
        }

        try {
            await this.notificacionManager.limpiarNotificacionesUsuario(
                this.currentUser.id,
                this.currentUser.organizacionCamelCase
            );

            this.notificaciones = [];
            this.notificacionesNoLeidas = 0;
            this._actualizarBadgeNotificaciones();
            this._renderizarNotificaciones();

        } catch (error) {
            // Error silencioso
        }
    }

    _iniciarListenerNotificaciones() {
        if (!this.notificacionManager || !this.currentUser?.id || !this.currentUser?.organizacionCamelCase) {
            return;
        }

        if (this.intervalNotificaciones) {
            clearInterval(this.intervalNotificaciones);
        }

        this.intervalNotificaciones = setInterval(() => {
            this._cargarNotificaciones();
        }, 30000);
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
            container.innerHTML = `
                <div class="notificaciones-vacia">
                    <i class="fas fa-bell-slash"></i>
                    <p>No hay notificaciones nuevas</p>
                </div>
            `;
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
                urlDestino: notif.urlDestino || `../verIncidencias/verIncidencias.html?id=${notif.incidenciaId}`,
                leida: notif.leida || false
            };

            html += `
                <div class="notificacion-item" data-id="${notif.id}" data-url="${notifUI.urlDestino}">
                    <div class="notificacion-icono" style="background-color: ${notifUI.color}20; color: ${notifUI.color}">
                        <i class="fas ${notifUI.icono}"></i>
                    </div>
                    <div class="notificacion-contenido">
                        <div class="notificacion-titulo">${this._escapeHTML(notifUI.titulo)}</div>
                        <div class="notificacion-mensaje">${this._escapeHTML(notifUI.mensaje)}</div>
                        <div class="notificacion-detalles">
                            ${notifUI.sucursalNombre ? `<span><i class="fas fa-store"></i> ${this._escapeHTML(notifUI.sucursalNombre)}</span>` : ''}
                            ${notifUI.nivelRiesgo ? `<span class="riesgo-${notifUI.nivelRiesgo}"><i class="fas fa-exclamation-triangle"></i> ${notifUI.nivelRiesgo}</span>` : ''}
                        </div>
                        <div class="notificacion-tiempo">${this._escapeHTML(notifUI.tiempoRelativo)}</div>
                    </div>
                    <div class="notificacion-estado ${notifUI.leida ? 'leida' : 'no-leida'}"></div>
                </div>
            `;
        });

        if (this.notificaciones.length > 5) {
            html += `
                <div class="notificaciones-ver-mas">
                    <a href="#" class="ver-todas-notificaciones">Ver ${this.notificaciones.length - 5} más</a>
                </div>
            `;
        }

        container.innerHTML = html;

        container.querySelectorAll('.notificacion-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = item.dataset.id;
                const url = item.dataset.url;

                if (this.notificacionManager && id) {
                    await this.notificacionManager.marcarComoLeida(
                        this.currentUser.id,
                        id,
                        this.currentUser.organizacionCamelCase
                    );

                    const notifIndex = this.notificaciones.findIndex(n => n.id === id);
                    if (notifIndex !== -1) {
                        this.notificaciones[notifIndex].leida = true;
                    }

                    this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                    this._actualizarBadgeNotificaciones();

                    const estadoDiv = item.querySelector('.notificacion-estado');
                    if (estadoDiv) {
                        estadoDiv.classList.remove('no-leida');
                        estadoDiv.classList.add('leida');
                    }
                }

                if (url) {
                    window.location.href = url;
                }
            });
        });

        const verTodasLink = container.querySelector('.ver-todas-notificaciones');
        if (verTodasLink) {
            verTodasLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._mostrarModalNotificaciones();
            });
        }
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
                    urlDestino: notif.urlDestino || `../verIncidencias/verIncidencias.html?id=${notif.incidenciaId}`,
                    leida: notif.leida || false
                };

                notificacionesHtml += `
                    <div class="notificacion-item-modal" data-id="${notif.id}" data-url="${notifUI.urlDestino}" style="
                        display: flex;
                        align-items: flex-start;
                        gap: 12px;
                        padding: 12px;
                        border-bottom: 1px solid #333;
                        cursor: pointer;
                        background: ${notifUI.leida ? 'transparent' : 'rgba(0, 207, 255, 0.05)'};
                    ">
                        <div class="notificacion-icono" style="width: 40px; height: 40px; border-radius: 50%; background-color: ${notifUI.color}20; color: ${notifUI.color}; display: flex; align-items: center; justify-content: center;">
                            <i class="fas ${notifUI.icono}"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px;">${this._escapeHTML(notifUI.titulo)}</div>
                            <div style="font-size: 13px; color: #aaa; margin-bottom: 4px;">${this._escapeHTML(notifUI.mensaje)}</div>
                            <div style="font-size: 11px; color: #666;">${this._escapeHTML(notifUI.tiempoRelativo)}</div>
                        </div>
                        ${!notifUI.leida ? '<div style="width: 8px; height: 8px; border-radius: 50%; background-color: #007bff;"></div>' : ''}
                    </div>
                `;
            });

            notificacionesHtml += '</div>';

            Swal.fire({
                title: 'Todas las Notificaciones',
                html: notificacionesHtml,
                width: '500px',
                background: '#1a1a1a',
                color: '#fff',
                confirmButtonText: 'Cerrar',
                confirmButtonColor: '#00cfff',
                didOpen: () => {
                    document.querySelectorAll('.notificacion-item-modal').forEach(item => {
                        item.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const id = item.dataset.id;
                            const url = item.dataset.url;

                            if (this.notificacionManager && id) {
                                await this.notificacionManager.marcarComoLeida(
                                    this.currentUser.id,
                                    id,
                                    this.currentUser.organizacionCamelCase
                                );

                                const notifIndex = this.notificaciones.findIndex(n => n.id === id);
                                if (notifIndex !== -1) {
                                    this.notificaciones[notifIndex].leida = true;
                                }

                                this.notificacionesNoLeidas = this.notificaciones.filter(n => !n.leida).length;
                                this._actualizarBadgeNotificaciones();
                                this._renderizarNotificaciones();
                            }

                            if (url) {
                                window.location.href = url;
                            }

                            Swal.close();
                        });
                    });
                }
            });
        } else {
            window.location.href = '#';
        }
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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

            if (this.dropdownNotificacionesAbierto && this.notificacionesNoLeidas > 0) {
                this._cargarNotificaciones();
            }
        });

        document.addEventListener('click', (e) => {
            if (!notificacionesBtn.contains(e.target) && !notificacionesDropdown.contains(e.target)) {
                this.dropdownNotificacionesAbierto = false;
                notificacionesDropdown.classList.remove('active');
            }
        });

        if (marcarTodasBtn) {
            marcarTodasBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._marcarTodasLeidas();
            });
        }
    }

    // ========== NAVBAR HTML Y ESTILOS ==========
    removeOriginalNavbar() {
        const originalHeader = document.getElementById('main-header');
        originalHeader?.remove();
    }

    createNavbar() {
        this.addStyles();
        this.insertHTML();
        this.adjustBodyPadding();
    }

    addStyles() {
        if (document.getElementById('navbar-complete-styles')) return;

        const styles = /*css*/`
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
            
            .navbar-left-container {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 10px;
                flex: 0 0 auto;
                margin-right: auto;
            }
            
            .navbar-logo-link {
                display: flex;
                align-items: center;
                text-decoration: none;
                z-index: 1003;
                height: 70px;
                flex: 0 0 auto;
            }

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
            
            .navbar-right-container {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                flex: 0 0 auto;
                margin-left: auto;
                gap: 15px;
            }

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
            
            .notificaciones-footer, .notificaciones-ver-mas {
                padding: 12px 15px;
                border-top: 1px solid var(--color-border-light);
                text-align: center;
            }
            
            .notificaciones-footer a, .notificaciones-ver-mas a {
                color: var(--color-accent-primary);
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
            }
            
            .notificaciones-footer a:hover, .notificaciones-ver-mas a:hover {
                text-decoration: underline;
            }
            
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
            
            .gestionar-dropdown-btn,
            .incidencias-dropdown-btn,
            .configuracion-dropdown-btn,
            .monitoreo-dropdown-btn {
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
            
            .gestionar-dropdown-btn:hover,
            .incidencias-dropdown-btn:hover,
            .configuracion-dropdown-btn:hover,
            .monitoreo-dropdown-btn:hover {
                background-color: var(--color-bg-secondary);
                transform: translateY(-2px);
                box-shadow: 0 5px 12px rgba(0, 0, 0, 0.15);
            }
            
            .gestionar-dropdown-btn i,
            .incidencias-dropdown-btn i,
            .configuracion-dropdown-btn i,
            .monitoreo-dropdown-btn i {
                transition: transform 0.3s ease;
                font-size: 14px;
            }
            
            .gestionar-dropdown-btn.active i,
            .incidencias-dropdown-btn.active i,
            .configuracion-dropdown-btn.active i,
            .monitoreo-dropdown-btn.active i {
                transform: rotate(180deg);
            }
            
            .gestionar-dropdown-options,
            .incidencias-dropdown-options,
            .configuracion-dropdown-options,
            .monitoreo-dropdown-options {
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
            
            .gestionar-dropdown-options.active,
            .incidencias-dropdown-options.active,
            .configuracion-dropdown-options.active,
            .monitoreo-dropdown-options.active {
                display: flex;
                opacity: 1;
                overflow: clip;
                margin-bottom: 15px;
                position: static;
                height: auto;
                flex-direction: column;
            }
            
            .gestionar-dropdown-option,
            .incidencias-dropdown-option,
            .configuracion-dropdown-option,
            .monitoreo-dropdown-option {
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
            
            .gestionar-dropdown-option:hover,
            .incidencias-dropdown-option:hover,
            .configuracion-dropdown-option:hover,
            .monitoreo-dropdown-option:hover {
                background-color: var(--color-bg-secondary);
                transform: translateX(5px);
                box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
            }
            
            .gestionar-dropdown-option i,
            .incidencias-dropdown-option i,
            .configuracion-dropdown-option i,
            .monitoreo-dropdown-option i {
                width: 20px;
                text-align: center;
                font-size: 16px;
                color: var(--color-accent-primary);
                flex-shrink: 0;
            }
            
            .gestionar-dropdown-option span,
            .incidencias-dropdown-option span,
            .configuracion-dropdown-option span,
            .monitoreo-dropdown-option span {
                flex: 1;
                white-space: normal;
                word-break: break-word;
                line-height: 1.4;
            }
            
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
            
            .configuracion-options-section {
                padding: 20px 25px;
                border-top: 1px solid var(--color-border-light);
                margin-top: 0;
                flex-shrink: 0;
            }
            
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
                overflow: clip !important;
            }

            .gestionar-dropdown-options,
            .incidencias-dropdown-options,
            .configuracion-dropdown-options,
            .monitoreo-dropdown-options {
                overflow: clip !important;
                max-height: none !important;
                height: auto !important;
            }

            .gestionar-dropdown-options.active,
            .incidencias-dropdown-options.active,
            .configuracion-dropdown-options.active,
            .monitoreo-dropdown-options.active {
                overflow: clip !important;
                max-height: none !important;
                height: auto !important;
            }

            .navbar-main-menu {
                overflow-y: auto !important;
            }

            .navbar-main-menu * {
                overflow-y: visible !important;
            }
            
            @media (max-width: 992px) {
                .navbar-main-menu {
                    width: 85%;
                }
                
                .logo-circle-container {
                    width: 50px;
                    height: 50px;
                }

                .org-text-logo {
                    width: 50px;
                    height: 50px;
                    font-size: 12px;
                }

                .logo-separator {
                    height: 35px;
                }
                
                .navbar-title {
                    font-size: 22px;
                }

                body.menu-open {
                    overflow: hidden;
                }
                
                .notificaciones-dropdown {
                    width: 300px;
                    right: -50px;
                }
            }
            
            @media (max-width: 768px) {
                .navbar-top-section {
                    padding: 5px 15px;
                }
                
                .navbar-main-menu {
                    width: 100%;
                }

                .logo-circle-container {
                    width: 40px;
                    height: 40px;
                }

                .org-text-logo {
                    width: 40px;
                    height: 40px;
                    font-size: 10px;
                }
                
                .logo-separator {
                    height: 30px;
                    margin: 0 3px;
                }
                
                .navbar-title {
                    font-size: 18px;
                    white-space: normal;
                    max-width: 150px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .profile-photo-container {
                    width: 100px;
                    height: 100px;
                }
                
                .edit-profile-icon {
                    width: 30px;
                    height: 30px;
                }
                
                .gestionar-dropdown-btn,
                .incidencias-dropdown-btn,
                .configuracion-dropdown-btn,
                .monitoreo-dropdown-btn {
                    padding: 12px 14px;
                    font-size: 15px;
                }
                
                .navbar-hamburger-btn {
                    width: 36px;
                    height: 36px;
                }
                
                .hamburger-line {
                    width: 22px;
                    height: 2.5px;
                }
                
                .gestionar-dropdown-options,
                .incidencias-dropdown-options,
                .configuracion-dropdown-options,
                .monitoreo-dropdown-options {
                    padding: 12px;
                }
                
                .gestionar-dropdown-options.active,
                .incidencias-dropdown-options.active,
                .configuracion-dropdown-options.active,
                .monitoreo-dropdown-options.active {
                    max-height: 1500px;
                }
                
                .gestionar-dropdown-option,
                .incidencias-dropdown-option,
                .configuracion-dropdown-option,
                .monitoreo-dropdown-option {
                    padding: 14px 12px;
                    gap: 12px;
                }
                
                .gestionar-dropdown-option i,
                .incidencias-dropdown-option i,
                .configuracion-dropdown-option i,
                .monitoreo-dropdown-option i {
                    font-size: 16px;
                    width: 24px;
                }
                
                .gestionar-dropdown-option span,
                .incidencias-dropdown-option span,
                .configuracion-dropdown-option span,
                .monitoreo-dropdown-option span {
                    font-size: 15px;
                    line-height: 1.4;
                }
                
                .nav-section-title {
                    font-size: 15px;
                }
                
                .notificaciones-dropdown {
                    width: 280px;
                    right: -70px;
                }
            }
            
            @media (max-width: 480px) {
                .navbar-top-section {
                    padding: 5px 10px;
                }
                
                .navbar-title {
                    font-size: 16px;
                    max-width: 120px;
                }
                
                .logo-circle-container {
                    width: 36px;
                    height: 36px;
                }
                
                .org-text-logo {
                    width: 36px;
                    height: 36px;
                    font-size: 9px;
                }
                
                .logo-separator {
                    height: 28px;
                    margin: 0 2px;
                }
                
                .navbar-hamburger-btn {
                    width: 32px;
                    height: 32px;
                }
                
                .hamburger-line {
                    width: 20px;
                    height: 2px;
                }
                
                .gestionar-dropdown-option,
                .incidencias-dropdown-option,
                .configuracion-dropdown-option,
                .monitoreo-dropdown-option {
                    padding: 12px 10px;
                }
                
                .gestionar-dropdown-option span,
                .incidencias-dropdown-option span,
                .configuracion-dropdown-option span,
                .monitoreo-dropdown-option span {
                    font-size: 14px;
                }
                
                .notificaciones-dropdown {
                    width: 260px;
                    right: -80px;
                }
            }
            
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
        navbar.innerHTML = /*html*/`
            <div class="navbar-top-section">
                <div class="navbar-left-container">
                    <a href="../panelControl/panelControl.html" class="navbar-logo-link">
                        <div class="logo-circle-container">
                            <img src="/assets/images/logo.png" alt="Centinela Logo" class="navbar-logo-img">
                        </div>
                    </a>

                    <div class="logo-separator"></div>

                    <a href="../panelControl/panelControl.html" class="navbar-logo-link" id="orgLogoLink">
                        <div class="logo-circle-container" id="orgLogoContainer">
                            <img src="/assets/images/logo.png" alt="Logo Organización" 
                                 class="navbar-logo-img" id="orgLogoImg">
                            <div class="org-text-logo" id="orgTextLogo" style="display: none;">ORG</div>
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
                            <img src="/assets/images/logo.png" alt="Usuario" class="admin-profile-img" id="userProfileImg">
                            <div class="profile-placeholder" id="profilePlaceholder" style="display: none;">
                                <i class="fas fa-user"></i>
                                <span>Usuario</span>
                            </div>
                        </div>
                       
                    </div>

                    <div class="admin-info">
                        <div class="admin-name" id="userName">Cargando...</div>
                        <div class="admin-role" id="userRole"></div>
                        <div class="admin-email" id="userEmail">cargando@email.com</div>
                        <div class="admin-organization" id="userOrganization"></div>
                    </div>
                </div>

                <!-- SECCIÓN GESTIONAR -->
                <div class="nav-section">
                    <button class="gestionar-dropdown-btn" id="gestionarDropdownBtn">
                        <span>Gestionar</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="gestionar-dropdown-options" id="gestionarDropdownOptions">
                        <a href="../areas/areas.html" class="gestionar-dropdown-option" id="areasBtn">
                            <i class="fa-solid fa-sitemap"></i>
                            <span>Áreas</span>
                        </a>
                        <a href="../categorias/categorias.html" class="gestionar-dropdown-option" id="categoriasBtn">
                            <i class="fa-solid fa-tags"></i>
                            <span>Categorías</span>
                        </a>
                        <a href="../sucursales/sucursales.html" class="gestionar-dropdown-option" id="sucursalesBtn">
                            <i class="fa-solid fa-store"></i>
                            <span>Sucursales</span>
                        </a>
                        <a href="../regiones/regiones.html" class="gestionar-dropdown-option" id="regionesBtn">
                            <i class="fa-solid fa-map-marked-alt"></i>
                            <span>Regiones</span>
                        </a>
                        <a href="../permisos/permisos.html" class="gestionar-dropdown-option" id="permisosBtn">
                            <i class="fa-solid fa-user-shield"></i>
                            <span>Permisos</span>
                        </a>
                        <a href="../usuarios/usuarios.html" class="gestionar-dropdown-option" id="usuariosBtn">
                            <i class="fa-solid fa-users"></i>
                            <span>Usuarios</span>
                        </a>
                        <a href="../tareas/tareas.html" class="gestionar-dropdown-option" id="tareasBtn">
                            <i class="fa-solid fa-tasks"></i>
                            <span>Tareas</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN INCIDENCIAS -->
                <div class="nav-section" id="incidenciasNavSection">
                    <button class="incidencias-dropdown-btn" id="incidenciasDropdownBtn">
                        <span>Incidencias</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="incidencias-dropdown-options" id="incidenciasDropdownOptions">
                        <a href="../incidencias/incidencias.html" class="incidencias-dropdown-option" id="incidenciasBtn">
                            <i class="fa-solid fa-list"></i>
                            <span>Lista de Incidencias</span>
                        </a>
                        <a href="../crearIncidencias/crearIncidencias.html" class="incidencias-dropdown-option" id="crearIncidenciasBtn">
                            <i class="fa-solid fa-plus-circle"></i>
                            <span>Crear Incidencia</span>
                        </a>
                        <a href="../incidenciasCanalizadas/incidenciasCanalizadas.html" class="incidencias-dropdown-option" id="incidenciasCanalizadasBtn">
                            <i class="fa-solid fa-check-circle"></i>
                            <span>Incidencias Canalizadas</span>
                        </a>
                        <a href="../MercanciaPerdida/MercanciaPerdida.html" class="incidencias-dropdown-option" id="incidenciasBtn">
                            <i class="fa-solid fa-list"></i>
                            <span>Lista de Extravios</span>
                        </a>
                        <a href="../crearIncidenciasRecuperacion/crearIncidenciasRecuperacion.html" class="incidencias-dropdown-option" id="crearIncidenciasBtn">
                            <i class="fa-solid fa-plus-circle"></i>
                            <span>Crear Extravio</span>
                        </a>
                        <a href="../estadisticasExtravios/estadisticasExtravios.html" class="incidencias-dropdown-option" id="incidenciasCanalizadasBtn">
                            <i class="fa-solid fa-check-circle"></i>
                            <span>Estadísticas Extravios</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN MONITOREO (NUEVO) -->
                <div class="nav-section" id="monitoreoNavSection">
                    <button class="monitoreo-dropdown-btn" id="monitoreoDropdownBtn">
                        <span>Monitoreo</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="monitoreo-dropdown-options" id="monitoreoDropdownOptions">
                        <a href="../mapaAlertas/mapaAlertas.html" class="monitoreo-dropdown-option" id="mapaAlertasBtn">
                            <i class="fa-solid fa-map-location-dot"></i>
                            <span>Mapa de Alertas</span>
                        </a>
                        <a href="../loginMonitoreo/loginMonitoreo.html" class="monitoreo-dropdown-option" id="loginMonitoreoBtn">
                            <i class="fa-solid fa-sign-in-alt"></i>
                            <span>Login Monitoreo</span>
                        </a>
                    </div>
                </div>

                <!-- SECCIÓN ESTADÍSTICAS -->
                <div class="nav-section">
                    <div class="nav-section-title">
                        <i class="fa-solid fa-chart-line"></i>
                        <span>Estadísticas</span>
                    </div>
                    <a href="../estadisticas/estadisticas.html" class="gestionar-dropdown-option" id="estadisticasBtn" style="width: 100%;">
                        <i class="fa-solid fa-chart-simple"></i>
                        <span>Ver Estadísticas</span>
                    </a>
                </div>

                <!-- SECCIÓN BITÁCORA -->
                <div class="nav-section">
                    <div class="nav-section-title">
                        <i class="fa-solid fa-book"></i>
                        <span>Bitácora</span>
                    </div>
                    <a href="../bitacoraActividades/bitacoraActividades.html" class="gestionar-dropdown-option" style="width: 100%;">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        <span>Bitácora de Actividades</span>
                    </a>
                </div>

                <!-- SECCIÓN CONFIGURACIÓN -->
                <div class="configuracion-options-section">
                    <button class="configuracion-dropdown-btn" id="configuracionDropdownBtn">
                        <span>Configuración</span>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>

                    <div class="configuracion-dropdown-options" id="configuracionDropdownOptions">
                        <a href="#" class="configuracion-dropdown-option logout-option" id="logoutOption">
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

        const updatePadding = () => {
            document.body.style.paddingTop = `${navbar.offsetHeight}px`;
        };

        updatePadding();

        const resizeObserver = new ResizeObserver(updatePadding);
        resizeObserver.observe(navbar);
    }

    // ========== CARGA DE USUARIO ==========
    loadUserDataFromLocalStorage() {
        try {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

            if (!isLoggedIn) {
                return false;
            }

            const userDataString = localStorage.getItem('userData');

            if (userDataString) {
                const userData = JSON.parse(userDataString);

                let fotoUsuario = null;
                let fotoOrganizacion = null;

                if (userData.fotoUsuario && userData.fotoUsuario.length > 10) {
                    fotoUsuario = userData.fotoUsuario;
                } else {
                    const userFotoKey = localStorage.getItem('userFoto');
                    if (userFotoKey && userFotoKey.length > 10) {
                        fotoUsuario = userFotoKey;
                    }
                }

                if (userData.fotoOrganizacion && userData.fotoOrganizacion.length > 10) {
                    fotoOrganizacion = userData.fotoOrganizacion;
                } else {
                    const orgLogoKey = localStorage.getItem('organizacionLogo');
                    if (orgLogoKey && orgLogoKey.length > 10) {
                        fotoOrganizacion = orgLogoKey;
                    }
                }

                this.currentUser = {
                    id: userData.id || localStorage.getItem('userId'),
                    uid: userData.id,
                    correoElectronico: userData.email || localStorage.getItem('userEmail'),
                    nombreCompleto: userData.nombreCompleto || localStorage.getItem('userNombre'),
                    rol: userData.rol || localStorage.getItem('userRole'),
                    organizacion: userData.organizacion || localStorage.getItem('userOrganizacion'),
                    organizacionCamelCase: userData.organizacionCamelCase || localStorage.getItem('userOrganizacionCamelCase'),
                    fotoUsuario: fotoUsuario,
                    fotoOrganizacion: fotoOrganizacion,
                    areaId: userData.areaAsignadaId || userData.areaId || localStorage.getItem('userAreaId') || '',
                    areaAsignadaId: userData.areaAsignadaId || userData.areaId || localStorage.getItem('userAreaId') || '',
                    cargoId: userData.cargoId || localStorage.getItem('userCargoId') || '',
                    sucursalAsignadaId: userData.sucursalAsignadaId || localStorage.getItem('userSucursalId') || '',
                    sucursalAsignadaNombre: userData.sucursalAsignadaNombre || localStorage.getItem('userSucursalNombre') || '',
                    status: userData.status || 'activo',
                    verificado: userData.verificado || true,
                    ultimoAcceso: userData.ultimoAcceso || userData.sessionStart,
                    dispositivos: userData.dispositivos || []
                };

                this.userRole = this.currentUser.rol?.toLowerCase() || 'colaborador';

                return true;
            }

            this.currentUser = {
                id: localStorage.getItem('userId'),
                correoElectronico: localStorage.getItem('userEmail'),
                nombreCompleto: localStorage.getItem('userNombre'),
                rol: localStorage.getItem('userRole'),
                organizacion: localStorage.getItem('userOrganizacion'),
                organizacionCamelCase: localStorage.getItem('userOrganizacionCamelCase'),
                fotoUsuario: localStorage.getItem('userFoto') || null,
                fotoOrganizacion: localStorage.getItem('organizacionLogo') || null,
                areaId: localStorage.getItem('userAreaId') || '',
                cargoId: localStorage.getItem('userCargoId') || '',
                sucursalAsignadaId: localStorage.getItem('userSucursalId') || '',
                sucursalAsignadaNombre: localStorage.getItem('userSucursalNombre') || '',
                dispositivos: []
            };

            if (this.currentUser.nombreCompleto && this.currentUser.rol) {
                this.userRole = this.currentUser.rol?.toLowerCase() || 'colaborador';
                return true;
            }

            return false;

        } catch (error) {
            return false;
        }
    }

    async importPermisoManager() {
        try {
            const { PermisoManager } = await import('/clases/permiso.js');
            this.permisoManager = new PermisoManager();

            if (this.currentUser?.organizacionCamelCase) {
                this.permisoManager.organizacionCamelCase = this.currentUser.organizacionCamelCase;
            }
        } catch (error) {
            // Error silencioso
        }
    }

    // ========== OBTENER PERMISOS REALES DESDE FIRESTORE ==========
    async obtenerPermisosReales() {
        try {
            const esAdmin = this.userRole === 'administrador' || this.userRole === 'master';

            if (esAdmin) {
                this.permisos = {
                    areas: true,
                    categorias: true,
                    sucursales: true,
                    regiones: true,
                    incidencias: true,
                    usuarios: true,
                    estadisticas: true,
                    tareas: true,
                    monitoreo: true,
                    permisos: true,
                    loginMonitoreo: true,
                    crearIncidencias: true,
                    incidenciasCanalizadas: true,
                    verIncidencias: true,
                    bitacora: true,
                    perfil: true,
                    configuracion: true,
                    ayuda: true
                };
                return;
            }

            // Para colaboradores, verificar si tienen área y cargo
            if (!this.currentUser?.areaId || !this.currentUser?.cargoId) {
                this.permisos = {
                    areas: false,
                    categorias: false,
                    sucursales: false,
                    regiones: false,
                    incidencias: false,
                    usuarios: false,
                    estadisticas: false,
                    tareas: false,
                    monitoreo: false,
                    permisos: false,
                    loginMonitoreo: false,
                    crearIncidencias: false,
                    incidenciasCanalizadas: false,
                    verIncidencias: false,
                    bitacora: false,
                    perfil: true,
                    configuracion: true,
                    ayuda: true
                };
                return;
            }

            // Buscar permiso en Firebase usando el PermisoManager
            if (this.permisoManager) {
                try {
                    const permiso = await this.permisoManager.obtenerPorCargoYArea(
                        this.currentUser.cargoId,
                        this.currentUser.areaId,
                        this.currentUser.organizacionCamelCase
                    );

                    if (permiso) {
                        const tieneIncidencias = permiso.puedeAcceder('incidencias');
                        const tieneMonitoreo = permiso.puedeAcceder('monitoreo');
                        const tieneLoginMonitoreo = permiso.puedeAcceder('loginMonitoreo');

                        this.permisos = {
                            areas: permiso.puedeAcceder('areas'),
                            categorias: permiso.puedeAcceder('categorias'),
                            sucursales: permiso.puedeAcceder('sucursales'),
                            regiones: permiso.puedeAcceder('regiones'),
                            incidencias: tieneIncidencias,
                            usuarios: permiso.puedeAcceder('usuarios'),
                            estadisticas: permiso.puedeAcceder('estadisticas'),
                            tareas: permiso.puedeAcceder('tareas'),
                            monitoreo: tieneMonitoreo,
                            permisos: permiso.puedeAcceder('permisos'),
                            loginMonitoreo: tieneLoginMonitoreo,
                            crearIncidencias: tieneIncidencias,
                            incidenciasCanalizadas: tieneIncidencias,
                            verIncidencias: tieneIncidencias,
                            bitacora: true,
                            perfil: true,
                            configuracion: true,
                            ayuda: true
                        };
                        return;
                    }
                } catch (error) {
                    // Error silencioso
                }
            }

            // Permisos por defecto
            this.permisos = {
                areas: false,
                categorias: false,
                sucursales: false,
                regiones: false,
                incidencias: false,
                usuarios: false,
                estadisticas: false,
                tareas: false,
                monitoreo: false,
                permisos: false,
                loginMonitoreo: false,
                crearIncidencias: false,
                incidenciasCanalizadas: false,
                verIncidencias: false,
                bitacora: false,
                perfil: true,
                configuracion: true,
                ayuda: true
            };

        } catch (error) {
            this.permisos = {
                areas: false,
                categorias: false,
                sucursales: false,
                regiones: false,
                incidencias: false,
                usuarios: false,
                estadisticas: false,
                tareas: false,
                monitoreo: false,
                permisos: false,
                loginMonitoreo: false,
                crearIncidencias: false,
                incidenciasCanalizadas: false,
                verIncidencias: false,
                bitacora: false,
                perfil: true,
                configuracion: true,
                ayuda: true
            };
        }
    }

    // ========== FILTRAR MENÚ POR PERMISOS ==========
    filterMenuByPermissions() {
        if (!this.permisos) {
            return;
        }

        // Elementos dentro de Gestionar
        const gestionarItems = [
            { id: 'areasBtn', modulo: 'areas', elemento: document.getElementById('areasBtn') },
            { id: 'categoriasBtn', modulo: 'categorias', elemento: document.getElementById('categoriasBtn') },
            { id: 'sucursalesBtn', modulo: 'sucursales', elemento: document.getElementById('sucursalesBtn') },
            { id: 'regionesBtn', modulo: 'regiones', elemento: document.getElementById('regionesBtn') },
            { id: 'permisosBtn', modulo: 'permisos', elemento: document.getElementById('permisosBtn') },
            { id: 'usuariosBtn', modulo: 'usuarios', elemento: document.getElementById('usuariosBtn') },
            { id: 'tareasBtn', modulo: 'tareas', elemento: document.getElementById('tareasBtn') }
        ];

        gestionarItems.forEach(item => {
            if (!item.elemento) return;
            const debeMostrarse = this.permisos[item.modulo] === true;
            item.elemento.style.display = debeMostrarse ? 'flex' : 'none';
        });

        // Elementos dentro de Incidencias
        const incidenciasItems = [
            { id: 'incidenciasBtn', modulo: 'incidencias', elemento: document.getElementById('incidenciasBtn') },
            { id: 'crearIncidenciasBtn', modulo: 'incidencias', elemento: document.getElementById('crearIncidenciasBtn') },
            { id: 'incidenciasCanalizadasBtn', modulo: 'incidencias', elemento: document.getElementById('incidenciasCanalizadasBtn') }
        ];

        incidenciasItems.forEach(item => {
            if (!item.elemento) return;
            const debeMostrarse = this.permisos.incidencias === true;
            item.elemento.style.display = debeMostrarse ? 'flex' : 'none';
        });

        // Elementos dentro de Monitoreo
        const monitoreoItems = [
            { id: 'mapaAlertasBtn', modulo: 'monitoreo', elemento: document.getElementById('mapaAlertasBtn') },
            { id: 'loginMonitoreoBtn', modulo: 'loginMonitoreo', elemento: document.getElementById('loginMonitoreoBtn') }
        ];

        monitoreoItems.forEach(item => {
            if (!item.elemento) return;
            let debeMostrarse = false;
            if (item.modulo === 'monitoreo') {
                debeMostrarse = this.permisos.monitoreo === true;
            } else if (item.modulo === 'loginMonitoreo') {
                debeMostrarse = this.permisos.loginMonitoreo === true;
            }
            item.elemento.style.display = debeMostrarse ? 'flex' : 'none';
        });

        // Elementos individuales
        const estadisticasBtn = document.getElementById('estadisticasBtn');
        if (estadisticasBtn) {
            estadisticasBtn.style.display = this.permisos.estadisticas === true ? 'flex' : 'none';
        }

        // Ocultar sección Monitoreo si no hay permisos
        this.ocultarSeccionMonitoreo();
        this.ocultarSeccionIncidencias();
    }

    ocultarSeccionMonitoreo() {
        const tieneMonitoreo = this.permisos?.monitoreo === true || this.permisos?.loginMonitoreo === true;
        const monitoreoSection = document.getElementById('monitoreoNavSection');

        if (monitoreoSection) {
            monitoreoSection.style.display = tieneMonitoreo ? 'block' : 'none';
        }
    }

    ocultarSeccionIncidencias() {
        const tienePermisoIncidencias = this.permisos?.incidencias === true;
        const incidenciasSection = document.getElementById('incidenciasNavSection');

        if (incidenciasSection) {
            incidenciasSection.style.display = tienePermisoIncidencias ? 'block' : 'none';
        }
    }

    updateNavbarWithUserData() {
        if (!this.currentUser) {
            const userName = document.getElementById('userName');
            const userRole = document.getElementById('userRole');
            const userEmail = document.getElementById('userEmail');
            const userOrganization = document.getElementById('userOrganization');

            if (userName) userName.textContent = 'No autenticado';
            if (userRole) userRole.textContent = 'Visitante';
            if (userEmail) userEmail.textContent = 'Inicia sesión para continuar';
            if (userOrganization) userOrganization.textContent = '';

            return;
        }

        this.updateOrganizationLogo();
        this.updateUserMenuInfo();
    }

    updateOrganizationLogo() {
        const organizationLogoImg = document.getElementById('orgLogoImg');
        const orgTextLogo = document.getElementById('orgTextLogo');
        const orgLogoLink = document.getElementById('orgLogoLink');
        const orgLogoContainer = document.getElementById('orgLogoContainer');

        if (!organizationLogoImg || !orgTextLogo || !orgLogoLink || !orgLogoContainer) return;

        if (this.currentUser.fotoOrganizacion && this.currentUser.fotoOrganizacion.length > 10) {
            organizationLogoImg.src = this.currentUser.fotoOrganizacion;
            organizationLogoImg.alt = `Logo de ${this.currentUser.organizacion}`;
            organizationLogoImg.style.display = 'block';
            orgTextLogo.style.display = 'none';
            organizationLogoImg.title = this.currentUser.organizacion;
        } else {
            this.showOrgTextLogo();
        }

        orgLogoLink.href = '../panelControl/panelControl.html';
    }

    showOrgTextLogo() {
        const organizationLogoImg = document.getElementById('orgLogoImg');
        const orgTextLogo = document.getElementById('orgTextLogo');

        if (!organizationLogoImg || !orgTextLogo) return;

        organizationLogoImg.style.display = 'none';
        orgTextLogo.style.display = 'flex';

        const orgName = this.currentUser?.organizacion || 'Organización';
        const initials = orgName
            .split(' ')
            .map(word => word.charAt(0))
            .join('')
            .toUpperCase()
            .substring(0, 3);

        orgTextLogo.textContent = initials;
        orgTextLogo.title = orgName;
    }

    updateUserMenuInfo() {
        const userName = document.getElementById('userName');
        if (userName) userName.textContent = this.currentUser.nombreCompleto || 'Usuario';

        const userRole = document.getElementById('userRole');
        if (userRole) {
            this.cargarAreaYCargo().then(info => {
                if (info.cargoNombre) {
                    userRole.textContent = `${info.cargoNombre}`;
                } else {
                    const rol = this.currentUser.rol || 'colaborador';
                    userRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1).toLowerCase();
                }
            }).catch(() => {
                const rol = this.currentUser.rol || 'colaborador';
                userRole.textContent = rol.charAt(0).toUpperCase() + rol.slice(1).toLowerCase();
            });
        }

        const userEmail = document.getElementById('userEmail');
        if (userEmail) userEmail.textContent = this.currentUser.correoElectronico || 'No especificado';

        const userOrganization = document.getElementById('userOrganization');
        if (userOrganization) userOrganization.textContent = this.currentUser.organizacion || 'Sin organización';

        const userProfileImg = document.getElementById('userProfileImg');
        const profilePlaceholder = document.getElementById('profilePlaceholder');

        if (userProfileImg && profilePlaceholder) {
            if (this.currentUser.fotoUsuario && this.currentUser.fotoUsuario.length > 10) {
                userProfileImg.src = this.currentUser.fotoUsuario;
                userProfileImg.style.display = 'block';
                profilePlaceholder.style.display = 'none';
                userProfileImg.alt = `Foto de ${this.currentUser.nombreCompleto}`;
            } else {
                this.showProfilePlaceholder();
            }
        }
    }

    async cargarAreaYCargo() {
        try {
            const areaId = this.currentUser.areaAsignadaId || this.currentUser.areaId || '';
            const cargoId = this.currentUser.cargoId || '';

            let areaNombre = '';
            let cargoNombre = '';

            if (areaId && this.currentUser.organizacionCamelCase) {
                const { AreaManager } = await import('/clases/area.js');
                const areaManager = new AreaManager();
                const area = await areaManager.getAreaById(areaId, this.currentUser.organizacionCamelCase);
                if (area) {
                    areaNombre = area.nombreArea;

                    if (cargoId && area.cargos && area.cargos[cargoId]) {
                        cargoNombre = area.cargos[cargoId].nombre;
                    }
                }
            }

            return { areaNombre, cargoNombre };
        } catch (error) {
            return { areaNombre: '', cargoNombre: '' };
        }
    }

    showProfilePlaceholder() {
        const userProfileImg = document.getElementById('userProfileImg');
        const profilePlaceholder = document.getElementById('profilePlaceholder');

        if (!userProfileImg || !profilePlaceholder) return;

        userProfileImg.style.display = 'none';
        profilePlaceholder.style.display = 'flex';

        const placeholderText = profilePlaceholder.querySelector('span');
        if (placeholderText && this.currentUser?.nombreCompleto) {
            const initials = this.currentUser.nombreCompleto
                .split(' ')
                .map(word => word.charAt(0))
                .join('')
                .toUpperCase()
                .substring(0, 2);
            placeholderText.textContent = initials;
        }
    }

    // ========== CONFIGURACIÓN DE DROPDOWNS Y FUNCIONALIDADES ==========
    setupFunctionalities() {
        this.setupMenu();
        this.setupScroll();
        this.loadFontAwesome();
        this.setupGestionarDropdown();
        this.setupIncidenciasDropdown();
        this.setupMonitoreoDropdown();
        this.setupConfiguracionDropdown();
        this.loadOrbitronFont();
        this.setupLogout();
        this._configurarNotificacionesDropdown();

        const verTodasFooter = document.querySelector('.ver-todas-notificaciones-footer');
        if (verTodasFooter) {
            verTodasFooter.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._mostrarModalNotificaciones();
            });
        }
    }

    setupMenu() {
        const hamburgerBtn = document.getElementById('navbarHamburger');
        const mainMenu = document.getElementById('navbarMainMenu');
        const overlay = document.getElementById('navbarMobileOverlay');

        if (!hamburgerBtn || !mainMenu || !overlay) return;

        const toggleMenu = () => {
            this.isMenuOpen = !this.isMenuOpen;

            mainMenu.classList.toggle('active', this.isMenuOpen);
            hamburgerBtn.classList.toggle('active', this.isMenuOpen);
            overlay.classList.toggle('active', this.isMenuOpen);
            document.body.classList.toggle('menu-open', this.isMenuOpen);

            if (!this.isMenuOpen) {
                if (this.isGestionarDropdownOpen) {
                    this.toggleGestionarDropdown(false);
                }
                if (this.isIncidenciasDropdownOpen) {
                    this.toggleIncidenciasDropdown(false);
                }
                if (this.isMonitoreoDropdownOpen) {
                    this.toggleMonitoreoDropdown(false);
                }
                if (this.isConfiguracionDropdownOpen) {
                    this.toggleConfiguracionDropdown(false);
                }
            }
        };

        const closeMenu = () => {
            if (this.isMenuOpen) {
                this.isMenuOpen = false;
                mainMenu.classList.remove('active');
                hamburgerBtn.classList.remove('active');
                overlay.classList.remove('active');
                document.body.classList.remove('menu-open');

                if (this.isGestionarDropdownOpen) {
                    this.toggleGestionarDropdown(false);
                }
                if (this.isIncidenciasDropdownOpen) {
                    this.toggleIncidenciasDropdown(false);
                }
                if (this.isMonitoreoDropdownOpen) {
                    this.toggleMonitoreoDropdown(false);
                }
                if (this.isConfiguracionDropdownOpen) {
                    this.toggleConfiguracionDropdown(false);
                }
            }
        };

        hamburgerBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', closeMenu);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMenuOpen) closeMenu();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 992 && this.isMenuOpen) closeMenu();
        });
    }

    setupGestionarDropdown() {
        const dropdownBtn = document.getElementById('gestionarDropdownBtn');
        const dropdownOptions = document.getElementById('gestionarDropdownOptions');

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
            if (this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
            if (this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }

            this.isGestionarDropdownOpen = !this.isGestionarDropdownOpen;
            this.toggleGestionarDropdown(this.isGestionarDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll('.gestionar-dropdown-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                setTimeout(() => {
                    this.toggleGestionarDropdown(false);
                }, 100);
            });
        });
    }

    setupIncidenciasDropdown() {
        const dropdownBtn = document.getElementById('incidenciasDropdownBtn');
        const dropdownOptions = document.getElementById('incidenciasDropdownOptions');

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
            if (this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
            if (this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }

            this.isIncidenciasDropdownOpen = !this.isIncidenciasDropdownOpen;
            this.toggleIncidenciasDropdown(this.isIncidenciasDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll('.incidencias-dropdown-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                setTimeout(() => {
                    this.toggleIncidenciasDropdown(false);
                }, 100);
            });
        });
    }

    setupMonitoreoDropdown() {
        const dropdownBtn = document.getElementById('monitoreoDropdownBtn');
        const dropdownOptions = document.getElementById('monitoreoDropdownOptions');

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
            if (this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
            if (this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }

            this.isMonitoreoDropdownOpen = !this.isMonitoreoDropdownOpen;
            this.toggleMonitoreoDropdown(this.isMonitoreoDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll('.monitoreo-dropdown-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                setTimeout(() => {
                    this.toggleMonitoreoDropdown(false);
                }, 100);
            });
        });
    }

    setupConfiguracionDropdown() {
        const dropdownBtn = document.getElementById('configuracionDropdownBtn');
        const dropdownOptions = document.getElementById('configuracionDropdownOptions');

        if (!dropdownBtn || !dropdownOptions) return;

        const toggleDropdown = () => {
            if (this.isGestionarDropdownOpen) {
                this.toggleGestionarDropdown(false);
            }
            if (this.isIncidenciasDropdownOpen) {
                this.toggleIncidenciasDropdown(false);
            }
            if (this.isMonitoreoDropdownOpen) {
                this.toggleMonitoreoDropdown(false);
            }

            this.isConfiguracionDropdownOpen = !this.isConfiguracionDropdownOpen;
            this.toggleConfiguracionDropdown(this.isConfiguracionDropdownOpen);
        };

        dropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!dropdownBtn.contains(e.target) &&
                !dropdownOptions.contains(e.target) &&
                this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isConfiguracionDropdownOpen) {
                this.toggleConfiguracionDropdown(false);
            }
        });

        const options = dropdownOptions.querySelectorAll('.configuracion-dropdown-option');
        options.forEach(option => {
            option.addEventListener('click', () => {
                setTimeout(() => {
                    this.toggleConfiguracionDropdown(false);
                }, 100);
            });
        });
    }

    setupLogout() {
        const logoutOption = document.getElementById('logoutOption');

        if (!logoutOption) return;

        logoutOption.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const confirmLogout = await this.showLogoutConfirmation();

            if (confirmLogout) {
                await this.performLogout();
            }
        });
    }

    async showLogoutConfirmation() {
        return new Promise((resolve) => {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: '¿Cerrar sesión?',
                    text: '¿Estás seguro de que deseas salir del sistema?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, cerrar sesión',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    reverseButtons: true
                }).then((result) => {
                    resolve(result.isConfirmed);
                });
            } else {
                const confirmed = confirm('¿Estás seguro de que deseas cerrar sesión?');
                resolve(confirmed);
            }
        });
    }

    async performLogout() {
        try {
            if (this.intervalNotificaciones) {
                clearInterval(this.intervalNotificaciones);
                this.intervalNotificaciones = null;
            }

            this.clearAllStorage();
            await this.showLogoutSuccessMessage();
            this.redirectToLogin();

        } catch (error) {
            this.clearAllStorage();
            this.redirectToLogin();
        }
    }

    clearAllStorage() {
        try {
            localStorage.clear();
            sessionStorage.clear();
            this.clearSessionCookies();
            this.clearIndexedDB();
        } catch (error) {
            // Error silencioso
        }
    }

    clearSessionCookies() {
        try {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const eqPos = cookie.indexOf('=');
                const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();

                if (name.includes('session') || name.includes('auth') || name.includes('firebase')) {
                    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
                }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    async clearIndexedDB() {
        try {
            const databases = ['firebaseLocalStorageDb', 'firestore', 'centinela-db'];

            for (const dbName of databases) {
                try {
                    await indexedDB.deleteDatabase(dbName);
                } catch (e) { }
            }
        } catch (error) {
            // Error silencioso
        }
    }

    async showLogoutSuccessMessage() {
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'success',
                title: 'Sesión cerrada',
                text: 'Has cerrado sesión exitosamente. Redirigiendo...',
                timer: 2000,
                showConfirmButton: false,
                timerProgressBar: true
            });
        }
    }

    redirectToLogin() {
        const timestamp = new Date().getTime();
        window.location.href = `/index.html?logout=true&timestamp=${timestamp}&nocache=1`;
        setTimeout(() => window.location.replace(`/index.html`), 1000);
    }

    toggleGestionarDropdown(show) {
        const dropdownBtn = document.getElementById('gestionarDropdownBtn');
        const dropdownOptions = document.getElementById('gestionarDropdownOptions');

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isGestionarDropdownOpen = show;
        }
    }

    toggleIncidenciasDropdown(show) {
        const dropdownBtn = document.getElementById('incidenciasDropdownBtn');
        const dropdownOptions = document.getElementById('incidenciasDropdownOptions');

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isIncidenciasDropdownOpen = show;
        }
    }

    toggleMonitoreoDropdown(show) {
        const dropdownBtn = document.getElementById('monitoreoDropdownBtn');
        const dropdownOptions = document.getElementById('monitoreoDropdownOptions');

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isMonitoreoDropdownOpen = show;
        }
    }

    toggleConfiguracionDropdown(show) {
        const dropdownBtn = document.getElementById('configuracionDropdownBtn');
        const dropdownOptions = document.getElementById('configuracionDropdownOptions');

        if (dropdownBtn && dropdownOptions) {
            dropdownBtn.classList.toggle('active', show);
            dropdownOptions.classList.toggle('active', show);
            this.isConfiguracionDropdownOpen = show;
        }
    }

    setupScroll() {
        const navbar = document.getElementById('complete-navbar');
        if (!navbar) return;

        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 50);
        });
    }

    loadFontAwesome() {
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(faLink);
        }
    }

    loadOrbitronFont() {
        if (!document.querySelector('link[href*="orbitron"]')) {
            const orbitronLink = document.createElement('link');
            orbitronLink.rel = 'stylesheet';
            orbitronLink.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap';
            document.head.appendChild(orbitronLink);
        }
    }
}

new NavbarComplete();